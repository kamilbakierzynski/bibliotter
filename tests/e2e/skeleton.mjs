// Szkielety i wysuwanie panelu: co widać, zanim dane przyjdą, i czy wiersze wychodzą razem z liną.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/skeleton.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

/** Ładowane przed apką. Trzyma odpowiedzi, które w prawdziwym użyciu mogą się spóźnić. */
const HOLD = `
const { app, ipcMain } = require('electron')
const held = new Set(['library', 'thumbs', 'search'])
const waiting = []
const later = []
globalThis.hold = (name) => held.add(name)
globalThis.release = (name) => {
  held.delete(name)
  for (const wake of waiting.splice(0)) wake()
  if (name === 'thumbs') for (const send of later.splice(0)) send()
}
const open = async (name) => {
  while (held.has(name)) await new Promise((wake) => waiting.push(wake))
}
const gates = { 'library:get': 'library', 'library:search': 'search', 'library:search-content': 'search' }
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) =>
  handle(channel, gates[channel] ? async (...args) => (await open(gates[channel]), listener(...args)) : listener)
app.on('web-contents-created', (_event, contents) => {
  const send = contents.send.bind(contents)
  contents.send = (channel, ...args) => {
    if (channel === 'library:changed' && held.has('library')) return
    if (channel === 'viewer:state' && args[0]?.status === 'ready' && held.has('viewer')) return
    if (channel === 'thumbs:ready' && held.has('thumbs')) return void later.push(() => send(channel, ...args))
    send(channel, ...args)
  }
})
`

const note = (title) =>
  `# ${title}\n\n## Cel\n\n${'Zdanie o tym, co postanowiliśmy i dlaczego. '.repeat(30)}\n\n## Ryzyka\n\n${'Kolejne zdanie o planie. '.repeat(30)}\n`

/** Główna strona powłoki. Warstwa doku bywa gotowa pierwsza, a `firstWindow` zwróciłoby ją. */
async function pageNamed(app, test) {
  await app.firstWindow()
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const page = app.windows().find(test)
    if (page) return page
    await delay(50)
  }
  throw new Error('Nie znaleziono strony')
}

const settled = (shell) => shell.waitForFunction(() => !document.getElementById('nav').classList.contains('moving'))

/** Klatka po klatce: ile wierszy stało pod maską, kiedy lina już je wysuwała. */
const openViewWatchingRows = (shell, view) =>
  shell.evaluate(
    (name) =>
      new Promise((done) => {
        const nav = document.getElementById('nav')
        const seen = { frames: 0, hidden: 0 }
        let settle = 2
        document.querySelector(`.rb[data-view="${name}"]`).click()
        const frame = () => {
          const rows = [...document.querySelectorAll('#panelItems .row')]
          if (nav.classList.contains('moving') && rows.length > 0 && settle-- <= 0) {
            seen.frames += 1
            seen.hidden += rows.filter((row) => !row.style.getPropertyValue('--e')).length
          }
          if (nav.classList.contains('is-open')) done(seen)
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    view
  )

export async function skeletonFlow(workspace, { check }) {
  const home = join(workspace, 'skeleton-home')
  const docs = join(workspace, 'skeleton-docs')
  const holdScript = join(workspace, 'skeleton-hold.cjs')
  await mkdir(home, { recursive: true })
  await mkdir(join(docs, 'projekt', 'docs'), { recursive: true })
  await writeFile(holdScript, HOLD)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await Promise.all(['alfa', 'beta', 'gamma', 'delta'].map((name) => writeFile(join(docs, 'projekt', 'docs', `${name}.md`), note(name))))

  const launch = (args) =>
    electron.launch({
      args: [...args, projectRoot, `--user-data-dir=${join(workspace, 'skeleton-profile')}`],
      env: { ...process.env, BIBLIOTTER_HOME: home }
    })

  // Pierwsze uruchomienie zbiera dokumenty, żeby kolejne mogło je wczytać z pamięci.
  let app = await launch([])
  try {
    const shell = await app.firstWindow()
    await shell.locator('.hs[data-doc]').first().waitFor()
  } finally {
    await app.close()
  }

  app = await launch(['-r', holdScript])
  try {
    const shell = await pageNamed(app, (page) => page.url().endsWith('renderer/index.html'))
    const layer = await pageNamed(app, (page) => page.url() === 'about:blank')
    const release = (name) => app.evaluate((_electron, gate) => globalThis.release(gate), name)
    const hold = (name) => app.evaluate((_electron, gate) => globalThis.hold(gate), name)
    const firstCard = () =>
      shell.evaluate(() => {
        const box = document.querySelector('#homeBody .hs').getBoundingClientRect()
        return { width: Math.round(box.width), height: Math.round(box.height) }
      })

    await check('ściana pokazuje szkielet, zanim przyjdzie biblioteka', async () => {
      await shell.locator('.sk-wall .sk-card').first().waitFor({ state: 'visible' })
      assert.equal((await shell.locator('.h-head > span').innerText()).trim(), '')
      assert.equal(await shell.locator('.spis').count(), 0)
    })

    await check('widok panelu nie mówi, że jest pusty, zanim przyjdzie biblioteka', async () => {
      await shell.locator('.rb[data-view="inbox"]').click()
      await shell.locator('#panelItems .sk-row').first().waitFor()
      assert.equal(await shell.locator('#panelItems .empty').count(), 0)
      await settled(shell)
      await shell.locator('.rb[data-view="library"]').click()
      await shell.locator('.nav-chev').click()
      await settled(shell)
    })

    const skeleton = await firstCard()
    await release('library')
    await shell.locator('.hs[data-doc]').first().waitFor({ state: 'attached' })

    await check('kartki stają tam, gdzie stał szkielet, i nie wieszają się drugi raz', async () => {
      assert.deepEqual(await firstCard(), skeleton)
      assert.equal(await shell.locator('#home.fresh').count(), 0)
      assert.equal(await shell.locator('.sk-wall').count(), 0)
    })

    await check('wiersze wychodzą razem z liną, a nie po jej zatrzymaniu', async () => {
      await settled(shell)
      if (await shell.locator('.nav.is-open').count()) {
        await shell.locator('.nav-chev').click()
        await settled(shell)
      }
      const seen = await openViewWatchingRows(shell, 'inbox')
      assert.ok(seen.frames > 0, 'lina nie wysunęła żadnego wiersza')
      assert.equal(seen.hidden, 0)
    })

    await check('kartka czeka na miniaturę ze szkieletem, a miniatura go przykrywa', async () => {
      const cards = await shell.locator('.hs[data-doc]').count()
      assert.equal(await shell.locator('.hs[data-doc] .sk-sheet').count(), cards)
      assert.equal(await shell.locator('.hs-sheet img').count(), 0)
      await release('thumbs')
      await shell.locator('.hs-sheet img').first().waitFor({ state: 'attached' })
      const light = await shell.evaluate(() => getComputedStyle(document.querySelector('.hs-sheet img ~ .sk-sheet'), '::after').animationName)
      assert.equal(light, 'none')
    })

    await check('otwierany dokument stoi jako kartka ze szkieletem, aż będzie gotowy', async () => {
      await hold('viewer')
      await shell.locator('.hs[data-doc]').first().click()
      await shell.locator('.pane.focused .sk-sheet').first().waitFor({ state: 'attached' }).catch(async () => {
        // Miniatura sama jest podglądem, więc szkielet jest wtedy niepotrzebny.
        assert.ok(await shell.locator('.pane.focused .sheet-thumb').count(), 'pusta kartka bez miniatury i szkieletu')
      })
      await release('viewer')
      await shell.locator('.pane.focused [data-act="refresh"]').click()
      await shell.waitForFunction(() => document.querySelector('.pane.focused .sk-sheet') === null)
      await shell.keyboard.press('h')
      await shell.locator('#home.on').waitFor({ state: 'attached' })
    })

    await check('szukanie w treści pokazuje szkielet, a brak wyników dopiero po odpowiedzi', async () => {
      await shell.locator('.rb[data-view="search"]').click()
      await shell.locator('#searchInput').fill('frazaktorejniema')
      await shell.locator('#panelItems .sk-list.hits').waitFor()
      assert.equal(await shell.locator('#panelItems .empty').count(), 0)
      await release('search')
      await shell.locator('#panelItems .empty').waitFor()
      await hold('search')
    })

    await check('paleta nie mówi „nic nie pasuje”, dopóki szuka w treści', async () => {
      await shell.locator('[data-open-cmd]').click()
      await layer.locator('#cmdInput').fill('frazaktorejniema')
      await layer.locator('.sk-row').first().waitFor({ state: 'attached' })
      assert.equal(await layer.locator('.cmd-none').count(), 0)
      await release('search')
      await layer.locator('.cmd-none').waitFor({ state: 'attached' })
    })
  } finally {
    await app.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-skeleton-'))
  const failed = []
  const check = async (name, run) => {
    try {
      await run()
      console.log('OK  ', name)
    } catch (error) {
      failed.push(name)
      console.log('BŁĄD', name, error.message)
    }
  }
  try {
    await skeletonFlow(workspace, { check })
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = failed.length > 0 ? 1 : 0
}
