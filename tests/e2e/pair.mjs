// Para planu w Markdownie i jego objaśnienia z explain-plan: przycisk w nagłówku arkusza i Shift O.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/pair.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const PLAN = 'Plan skoku do nagłówka'
const EXPLAINED = 'Objaśnienie skoku do nagłówka'
const PLAIN = 'Notatka bez pary'

const paragraph = (topic) =>
  `${topic} opisuje, które pliki zmieniamy, w jakiej kolejności i co sprawdzi test po każdym kroku. `.repeat(6)

const planMd = `# ${PLAN}

${paragraph('Wstęp')}

## Kontekst

${paragraph('Kontekst')}

## Krok 1. Indeks nagłówków

${paragraph('Pierwszy krok')}

## Krok 2. Paleta

${paragraph('Drugi krok')}

## Ryzyka

${paragraph('Ryzyko')}
`

const prose = (title) =>
  `<style>body { margin: 16px; font: 16px/1.6 serif }</style><h1>${title}</h1>` +
  ['Streszczenie', 'Jak jest dziś', 'Kroki', 'Decyzje', 'Ryzyka'].map((head) => `<h2>${head}</h2><p>${paragraph(head)}</p>`).join('')

// Meta jak z kitu explain-plan: plan leży w repozytorium, a objaśnienie w folderze `explain`.
const explanationHtml = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="bibliotter-kind" content="plan">
<meta name="bibliotter-plan" content="../../docs/plan-skoku.md">
<title>${EXPLAINED}</title></head><body>${prose(EXPLAINED)}<p><a href="../../docs/plan-skoku.md#krok-1-indeks-nagłówków">Krok 1 w planie</a></p></body></html>`

const plainHtml = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${PLAIN}</title></head><body>${prose(PLAIN)}</body></html>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

/** Odpytuje zegarem, bo okno poza ekranem może nie dostawać klatek animacji. */
const until = (view, test, argument, what = 'warunek') =>
  view.waitForFunction(test, argument, { polling: 100, timeout: 10000 }).catch((error) => {
    throw new Error(`${what}: ${error.message.split('\n')[0]}`)
  })

/** Dok, paleta i wskazówka żyją na osobnej stronie nad dokumentami. */
async function dockLayer(app, shell) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
    if (layer) return layer
    await delay(50)
  }
  throw new Error('Nie znaleziono warstwy doku')
}

export async function pairFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'pair-home')
  const repo = join(workspace, 'pair-repo')
  await mkdir(home, { recursive: true })
  await mkdir(join(repo, 'docs'), { recursive: true })
  await mkdir(join(repo, 'explain', 'main'), { recursive: true })
  await writeFile(join(repo, 'docs', 'plan-skoku.md'), planMd)
  await writeFile(join(repo, 'explain', 'main', 'plan-skoku.html'), explanationHtml)
  await writeFile(join(repo, 'docs', 'notatka.html'), plainHtml)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo], language: 'pl' }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'pair-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(10000)
    const title = (name) => until(shell, (expected) => document.querySelector('.pane.focused .pl-title')?.textContent === expected, name, `tytuł arkusza „${name}”`)
    const isLive = () => until(shell, () => !document.querySelector('canvas.sheet-frame'), undefined, 'żywy dokument')
    const pair = (role) => shell.locator(`.pane.focused .pl-pair[data-pair="${role}"]`)
    const open = async (name) => {
      await shell.locator('.row[data-doc]', { hasText: name }).click()
      await title(name)
      await isLive()
      await delay(300)
    }

    await check('objaśnienie planu ma w nagłówku przycisk do planu', async () => {
      await open(EXPLAINED)
      await pair('plan').waitFor({ state: 'visible' })
      assert.equal((await pair('plan').textContent())?.trim(), 'Plan')
      assert.equal(await pair('plan').getAttribute('title'), PLAN)
      await shell.locator('.pane.focused .placard').screenshot({ path: join(artifacts, 'pair-explanation.png') })
    })

    await check('przycisk otwiera plan na miejscu arkusza, a plan prowadzi z powrotem', async () => {
      await pair('plan').click()
      await title(PLAN)
      await pair('explanation').waitFor({ state: 'visible' })
      assert.equal((await pair('explanation').textContent())?.trim(), 'Objaśnienie planu')
      assert.equal(await shell.locator('.pane.peek').count(), 0)
      await shell.locator('.pane.focused .placard').screenshot({ path: join(artifacts, 'pair-plan.png') })
    })

    await check('Shift O przeskakuje w obie strony', async () => {
      await isLive()
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('Shift+O')
      await title(EXPLAINED)
      await isLive()
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('Shift+O')
      await title(PLAN)
    })

    await check('Ctrl i klik zerka na drugi dokument pary', async () => {
      await isLive()
      await shell.keyboard.down('Control')
      await pair('explanation').click()
      await shell.keyboard.up('Control')
      await shell.locator('.pane.peek').waitFor({ state: 'attached' })
      await title(EXPLAINED)
      await shell.keyboard.press('Escape')
      await until(shell, () => !document.querySelector('.pane.peek'))
      await title(PLAN)
    })

    await check('dokument bez pary nie ma przycisku, a Shift O mówi, że nie ma dokąd iść', async () => {
      await open(PLAIN)
      await delay(400)
      assert.equal(await shell.locator('.pane.focused .pl-pair').count(), 0)
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('Shift+O')
      const layer = await dockLayer(app, shell)
      await until(layer, () => document.getElementById('tip')?.classList.contains('say'), undefined, 'komunikat na miejscu wskazówki')
      assert.match(await layer.locator('#tip').textContent(), /nie ma planu ani objaśnienia/)
      await title(PLAIN)
    })
  } finally {
    await app.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = []
  const check = async (name, run) => {
    try {
      await run()
      results.push(`OK    ${name}`)
    } catch (error) {
      results.push(`BŁĄD  ${name}: ${error.message.split('\n')[0]}`)
    }
  }
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-pair-'))
  try {
    await mkdir(artifacts, { recursive: true })
    await pairFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
