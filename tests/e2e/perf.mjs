// Pomiar szybkości na prawdziwym Electronie. Mierzy to, co czuje użytkownik: od kliknięcia do
// reakcji ekranu. Dane apki lądują w katalogu tymczasowym, a folder z dokumentami jest tylko czytany.
//
//   node tests/e2e/perf.mjs                  własny zestaw dokumentów
//   node tests/e2e/perf.mjs --root C:\docs   prawdziwy folder
//   node tests/e2e/perf.mjs --docs 3000      większy zestaw
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { _electron as electron } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { values: options } = parseArgs({
  options: {
    root: { type: 'string' },
    docs: { type: 'string', default: '1200' },
    switches: { type: 'string', default: '10' },
    keep: { type: 'boolean', default: false },
    /** Inny katalog ze zbudowaną apką, np. wersja do porównania. */
    app: { type: 'string', default: projectRoot },
    /** Ładowane przed apką, żeby okno nie zabierało ekranu. */
    preload: { type: 'string' }
  }
})

const appArgs = (profile) => [
  ...(options.preload ? ['-r', options.preload] : []),
  options.app,
  `--user-data-dir=${profile}`
]

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const round = (ms) => (ms === null || ms === undefined ? '—' : `${Math.round(ms)} ms`)
const sorted = (list) => [...list].sort((a, b) => a - b)
const median = (list) => (list.length ? sorted(list)[list.length >> 1] : null)
const worst = (list) => (list.length ? Math.max(...list) : null)

async function makeCorpus(directory, count) {
  const section = (i) => `## Sekcja ${i}\n\n${'Zdanie opisujące decyzję projektową i jej skutki dla całego zespołu. '.repeat(24)}\n\n`
  const projects = Math.max(1, Math.round(count / 40))
  for (let project = 0; project < projects; project++) {
    const folder = join(directory, `projekt-${project}`, 'docs')
    await mkdir(folder, { recursive: true })
    const files = Array.from({ length: Math.ceil(count / projects) }, async (_, i) => {
      const body = `# Dokument ${project}.${i}\n\n${Array.from({ length: 6 }, (_, s) => section(s)).join('')}`
      if (i % 4 === 0) {
        const html = body.replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/m, '<title>$1</title><h1>$1</h1>')
        await writeFile(join(folder, `raport-${i}.html`), `<!doctype html><style>body{font:16px system-ui}</style>${html}`)
      } else {
        await writeFile(join(folder, `notatka-${i}.md`), body)
      }
    })
    await Promise.all(files)
  }
}

/** Mierzy z wnętrza procesu głównego: przerwy w pętli zdarzeń i chwilę wejścia widoku na ekran. */
const instrumentMain = (app) =>
  app.evaluate(({ WebContentsView }) => {
    const trace = { placed: [], gaps: [], last: performance.now() }
    globalThis.perfTrace = trace
    setInterval(() => {
      const now = performance.now()
      const gap = now - trace.last - 4
      if (gap > 16) trace.gaps.push(Math.round(gap))
      trace.last = now
    }, 4)
    const parent = Object.getPrototypeOf(WebContentsView.prototype)
    WebContentsView.prototype.setBounds = function (bounds) {
      const url = this.webContents?.getURL?.() ?? ''
      if (url.startsWith('htmldoc://')) {
        trace.placed.push({ at: Date.now(), docId: new URL(url).hostname, live: bounds.x >= 0 })
      }
      return parent.setBounds.call(this, bounds)
    }
  })

const mainTrace = (app) =>
  app.evaluate(() => {
    const { placed, gaps } = globalThis.perfTrace
    return { placed, gaps }
  })

const resetMainTrace = (app) =>
  app.evaluate(() => {
    globalThis.perfTrace.placed = []
    globalThis.perfTrace.gaps = []
    globalThis.perfTrace.last = performance.now()
  })

/** W powłoce: co się zmieniło na ekranie po kliknięciu i co blokowało jej wątek. */
const instrumentShell = (shell) =>
  shell.evaluate(() => {
    const perf = { clickAt: null, sign: null, firstDoc: null, snapshots: [], progress: [], longTasks: [], title: null, titleWas: null }
    window.perf = perf
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.longTasks.push(Math.round(entry.duration))
    }).observe({ type: 'longtask' })
    const count = (snapshot) => snapshot.projects.reduce((sum, project) => sum + project.docs.length, 0)
    window.api.onLibraryChanged((message) => {
      // Starsze wersje apki wysyłały obiekt, więc porównanie działa z obiema.
      const snapshot = typeof message === 'string' ? JSON.parse(message) : message
      perf.snapshots.push({ at: Date.now(), docs: count(snapshot) })
    })
    window.api.onScanProgress?.((progress) => perf.progress.push({ at: Date.now(), ...progress }))
    const home = document.getElementById('home')
    new MutationObserver(() => {
      if (perf.clickAt === null) return
      perf.sign ??= Date.now()
      if (perf.firstDoc === null && home.querySelector('.hs[data-doc]')) perf.firstDoc = Date.now()
    }).observe(home, { subtree: true, childList: true, characterData: true, attributes: false })
    addEventListener(
      'click',
      () => {
        perf.clickAt = Date.now()
        perf.sign = null
        perf.firstDoc = null
        perf.title = null
        const focusedTitle = () => document.querySelector('.pane.focused .pl-title')?.textContent ?? null
        const before = focusedTitle()
        const started = perf.clickAt
        const watch = () => {
          if (perf.clickAt !== started) return
          if (focusedTitle() !== before) {
            perf.title = Date.now()
            return
          }
          if (Date.now() - started < 3000) requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)
      },
      true
    )
  })

async function launch(home, profile) {
  const started = Date.now()
  const app = await electron.launch({
    args: appArgs(profile),
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  const shell = await app.firstWindow()
  await shell.locator('#home').waitFor({ state: 'attached' })
  await instrumentMain(app)
  await instrumentShell(shell)
  return { app, shell, started }
}

async function firstRun(root, home, profile) {
  const { app, shell } = await launch(home, profile)
  await shell.locator('.h-setup').waitFor()
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  }, root)
  await resetMainTrace(app)
  await shell.getByRole('button', { name: 'Dodaj foldery' }).click()

  // Koniec skanu to chwila, gdy biblioteka przestaje się zmieniać.
  await shell.waitForFunction(() => window.perf.snapshots.length > 0, null, { timeout: 180000 })
  let seen = 0
  let quietSince = Date.now()
  while (Date.now() - quietSince < 4000) {
    const now = await shell.evaluate(() => window.perf.snapshots.length)
    if (now !== seen) {
      seen = now
      quietSince = Date.now()
    }
    await delay(150)
  }
  const perf = await shell.evaluate(() => window.perf)
  const { gaps } = await mainTrace(app)
  const last = perf.snapshots.at(-1)
  const report = {
    'pierwsza zmiana na ekranie': perf.sign === null ? null : perf.sign - perf.clickAt,
    'pierwszy dokument na ścianie': perf.firstDoc === null ? null : perf.firstDoc - perf.clickAt,
    'pełna biblioteka': last.at - perf.clickAt,
    'dokumentów': last.docs,
    'porcji danych': perf.snapshots.length,
    'najdłuższa blokada głównego wątku': worst(gaps) ?? 0,
    'blokady głównego wątku razem': gaps.reduce((sum, gap) => sum + gap, 0),
    'najdłuższe zadanie powłoki': worst(perf.longTasks) ?? 0
  }
  return { app, shell, report }
}

async function restart(home, profile) {
  const started = Date.now()
  const app = await electron.launch({
    args: appArgs(profile),
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  const shell = await app.firstWindow()
  const windowAt = Date.now()
  await shell.locator('.hs[data-doc]').first().waitFor({ timeout: 120000 })
  const docsAt = Date.now()
  return { app, shell, report: { okno: windowAt - started, 'dokumenty na ścianie': docsAt - started } }
}

async function rowsToVisit(shell, count) {
  return shell.evaluate((limit) => {
    const ids = [...document.querySelectorAll('#panelScroll .row[data-doc]')].map((row) => row.dataset.doc)
    return ids.slice(0, limit)
  }, count)
}

/** Otwiera dokument jak człowiek: najazd, chwila zawahania, kliknięcie. */
async function visit(app, shell, docId, hoverMs) {
  const row = shell.locator(`#panelScroll .row[data-doc="${docId}"]`)
  await row.scrollIntoViewIfNeeded()
  await resetMainTrace(app)
  await row.hover()
  if (hoverMs) await delay(hoverMs)
  await row.click()
  const deadline = Date.now() + 15000
  for (;;) {
    const { placed } = await mainTrace(app)
    const live = placed.find((item) => item.docId === docId && item.live)
    if (live) {
      const perf = await shell.evaluate(() => ({ clickAt: window.perf.clickAt, title: window.perf.title }))
      await delay(60)
      return { live: live.at - perf.clickAt, title: perf.title === null ? null : perf.title - perf.clickAt }
    }
    if (Date.now() > deadline) return { live: null, title: null }
    await delay(10)
  }
}

async function switching(app, shell, count) {
  await shell.locator('#panelScroll .row[data-doc]').first().waitFor()
  const ids = await rowsToVisit(shell, Math.max(4, Math.min(count, 12)))
  if (ids.length < 2) return { 'za mało wierszy': ids.length }

  const opened = await visit(app, shell, ids[0], 0)
  await delay(1500)

  const measure = async (list, hoverMs, settleMs = 300) => {
    const live = []
    const titles = []
    for (const id of list) {
      const result = await visit(app, shell, id, hoverMs)
      if (result.live !== null) live.push(result.live)
      if (result.title !== null) titles.push(result.title)
      await delay(settleMs)
    }
    return { live, titles }
  }

  const fresh = await measure(ids.slice(1, 1 + Math.floor((ids.length - 1) / 2)), 0)
  const freshHover = await measure(ids.slice(1 + Math.floor((ids.length - 1) / 2)), 140)
  const back = await measure([...ids.slice(-3)].reverse(), 0, 150)
  const { gaps } = await mainTrace(app)

  return {
    'wejście z ekranu startowego': opened.live,
    'tytuł po kliknięciu (mediana)': median([...fresh.titles, ...freshHover.titles]),
    'nowy dokument bez najazdu (mediana)': median(fresh.live),
    'nowy dokument bez najazdu (najgorszy)': worst(fresh.live),
    'nowy dokument z najazdem 140 ms (mediana)': median(freshHover.live),
    'nowy dokument z najazdem 140 ms (najgorszy)': worst(freshHover.live),
    'powrót do niedawnego (mediana)': median(back.live),
    'powrót do niedawnego (najgorszy)': worst(back.live),
    'najdłuższa blokada głównego wątku na końcu': worst(gaps) ?? 0,
    ...(await documentProcesses(app))
  }
}

async function documentProcesses(app) {
  const tabs = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().filter((metric) => metric.type === 'Tab').map((metric) => metric.memory.privateBytes ?? metric.memory.workingSetSize)
  )
  return { 'procesów powłoki i dokumentów': tabs.length, 'pamięć własna procesu, mediana (MB)': Math.round(median(tabs) / 1024) }
}

function print(title, report) {
  console.log(`\n${title}`)
  for (const [name, value] of Object.entries(report)) {
    const unit = /dokumentów|porcji|wierszy|\(MB\)/.test(name) ? String(value) : round(value)
    console.log(`  ${name.padEnd(46)} ${unit}`)
  }
}

async function main() {
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-perf-'))
  const home = join(workspace, 'home')
  const profile = join(workspace, 'profile')
  await mkdir(home, { recursive: true })
  let root = options.root
  if (!root) {
    root = join(workspace, 'dokumenty')
    await makeCorpus(root, Number(options.docs))
  }
  console.log(`Folder: ${options.root ? root : `${options.docs} wygenerowanych dokumentów`}`)

  try {
    const run = await firstRun(root, home, profile)
    print('Wybór folderu (od zamknięcia okna wyboru)', run.report)
    await delay(500)
    print('Przechodzenie między dokumentami', await switching(run.app, run.shell, Number(options.switches)))
    await run.app.close()

    const again = await restart(home, profile)
    print('Ponowne uruchomienie', again.report)
    await again.app.close()
  } finally {
    if (options.keep) console.log(`Dane zostały w ${workspace}`)
    else await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
