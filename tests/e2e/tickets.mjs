// Kody zgłoszeń: grupa Jira w panelu etykiet, wyszukiwanie i linki do przeglądarki.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/tickets.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

const BODY = `<style>body { margin: 16px }</style><h1>Temat</h1><h2>Cel</h2><h2>Ryzyka</h2>
<p>${'Akapit opisujący łamigłówki i decyzje projektowe. '.repeat(30)}</p>`
const documentNamed = (title) => `<!doctype html><title>${title}</title><body>${BODY}<p>${title}</p></body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const DOCS = {
  'platnosci.html': ['Migracja płatności', ['Plan', 'PAY-1482']],
  'koszyk.html': ['Review koszyka', ['PR review', 'PAY-1490']],
  'logowanie.html': ['Logowanie w aplikacji', ['MOB-77', 'PAY-1482']],
  'raport.html': ['Raport kwartalny', ['Idea']]
}

export async function ticketsFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'ticket-home')
  const docs = join(workspace, 'ticket-docs')
  const profile = join(workspace, 'ticket-profile')
  for (const folder of [home, docs]) await mkdir(folder, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  for (const [name, [title]] of Object.entries(DOCS)) await writeFile(join(docs, name), documentNamed(title))
  const readConfig = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${profile}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    await app.evaluate(({ shell: electronShell }) => {
      globalThis.opened = []
      electronShell.openExternal = async (url) => void globalThis.opened.push(url)
    })
    const opened = () => app.evaluate(() => globalThis.opened)
    const tab = (view) => shell.locator(`.rb[data-view="${view}"]`)
    const rows = shell.locator('#panelItems .row')
    const texts = () => rows.locator('.lbl').allTextContents()
    const search = shell.locator('#ticketSearch')

    // Skan publikuje dokumenty po kawałku, a etykiety trzeba nadać wszystkim.
    const labelled = Object.fromEntries(Object.entries(DOCS).map(([name, [, labels]]) => [name, labels]))
    const labelAll = () =>
      shell.evaluate(async (wanted) => {
        if (!window.api) return false
        const library = JSON.parse(await window.api.getLibrary())
        const docs = library.projects.flatMap((project) => project.docs)
        for (const doc of docs) if (doc.labels.length === 0) await window.api.setDocLabels(doc.id, wanted[doc.name])
        return docs.length === Object.keys(wanted).length && docs.every((doc) => doc.labels.length > 0)
      }, labelled)
    // `waitForFunction` nie czeka na obietnicę, więc funkcja async zwróciłaby „gotowe” od razu.
    for (let tries = 0; !(await labelAll()); tries += 1) {
      assert.ok(tries < 100, 'skan nie pokazał wszystkich dokumentów')
      await delay(200)
    }

    await check('kody są zebrane w jednym wierszu Jira', async () => {
      await tab('labels').click()
      await shell.locator('#ticketsRow .num', { hasText: '3' }).waitFor()
      assert.deepEqual(await texts(), ['Idea', 'Plan', 'PR review', 'Jira'])
    })

    await check('spis kodów pokazuje tytuł dokumentu i ma pole wyszukiwania', async () => {
      await shell.locator('#ticketsRow').click()
      await search.waitFor()
      assert.equal(await search.evaluate((field) => field === document.activeElement), true)
      assert.equal(await shell.locator('.panel-head strong').textContent(), 'Jira')
      assert.deepEqual((await texts()).sort(), ['MOB-77', 'PAY-1482', 'PAY-1490'])
      await shell.locator('.ticket', { hasText: 'PAY-1490' }).locator('.sub', { hasText: 'Review koszyka' }).waitFor()
    })

    await check('wyszukiwanie zawęża po kodzie i po temacie dokumentu', async () => {
      await search.fill('pay')
      await shell.locator('.ticket').nth(1).waitFor()
      assert.deepEqual((await texts()).sort(), ['PAY-1482', 'PAY-1490'])
      await search.fill('platnosci')
      await shell.locator('.ticket', { hasText: 'PAY-1490' }).waitFor({ state: 'detached' })
      assert.deepEqual(await texts(), ['PAY-1482'])
      await search.fill('nie ma takiego')
      await shell.locator('#panelItems .label-hint', { hasText: 'Nic nie pasuje' }).waitFor()
    })

    await check('Escape czyści pole, a drugi wraca do etykiet', async () => {
      await search.press('Escape')
      await shell.locator('.ticket').nth(2).waitFor()
      await search.press('Escape')
      await shell.locator('#ticketsRow').waitFor()
    })

    await check('bez adresu kod prowadzi do ustawień', async () => {
      await shell.locator('#ticketsRow').click()
      assert.equal(await shell.locator('.ticket .mini').count(), 0)
      await search.fill('MOB')
      await search.press('Enter')
      await shell.locator('#ticketSetup').click()
      await shell.locator('#ticketUrl').waitFor()
    })

    await check('zły adres zostaje w polu i nie trafia do konfiguracji', async () => {
      await shell.locator('#ticketUrl').fill('javascript:alert(1)')
      await shell.locator('#ticketUrl').press('Enter')
      await shell.locator('#ticketUrl[aria-invalid="true"]').waitFor()
      assert.equal((await readConfig()).ticketUrl, undefined)
    })

    await check('adres zgłoszenia staje się szablonem', async () => {
      await shell.locator('#ticketUrl').fill('https://firma.atlassian.net/browse/ABC-1?focusedCommentId=7')
      await shell.locator('#ticketUrl').press('Enter')
      await shell.locator('.o-sample', { hasText: 'https://firma.atlassian.net/browse/PROJ-123' }).waitFor()
      assert.equal((await readConfig()).ticketUrl, 'https://firma.atlassian.net/browse/{code}')
    })

    await check('wiersz spisu otwiera zgłoszenie w przeglądarce', async () => {
      await tab('labels').click()
      await shell.getByRole('button', { name: 'Wszystkie kody' }).click()
      // Powrót z kodu zostawia wyniki wyszukiwania, żeby przejść do następnego.
      assert.equal(await search.inputValue(), 'MOB')
      await search.fill('')
      await shell.getByRole('button', { name: 'Otwórz PAY-1490 w Jira' }).click()
      await delay(150)
      assert.deepEqual(await opened(), ['https://firma.atlassian.net/browse/PAY-1490'])
    })

    await check('widok kodu ma link do zgłoszenia', async () => {
      await shell.locator('.ticket .row', { hasText: 'MOB-77' }).click()
      await shell.locator('#ticketOpen').click()
      await delay(150)
      assert.equal((await opened()).at(-1), 'https://firma.atlassian.net/browse/MOB-77')
    })

    await check('kod na tabliczce dokumentu jest linkiem, a zwykła etykieta nie', async () => {
      await tab('library').click()
      await shell.locator('.row[data-doc]', { hasText: 'Migracja' }).click()
      const before = (await opened()).length
      await shell.locator('.placard .tag.label', { hasText: 'PAY-1482' }).first().click()
      await delay(150)
      assert.equal((await opened()).at(-1), 'https://firma.atlassian.net/browse/PAY-1482')
      await shell.locator('.placard .tag.label', { hasText: 'Plan' }).first().click()
      await shell.locator('.panel-head strong', { hasText: 'Plan' }).waitFor()
      assert.equal((await opened()).length, before + 1)
    })

    await check('wybierak chowa cudze kody, dopóki ich nie wpiszesz', async () => {
      const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
      await layer.locator('#labelBtn').click()
      await shell.locator('#labelPop.on').waitFor()
      const names = () => shell.locator('#labelRows button span').allTextContents()
      assert.ok((await names()).includes('PAY-1482'))
      assert.ok(!(await names()).includes('MOB-77'))
      await shell.locator('#labelInput').fill('mob')
      await shell.locator('#labelRows button', { hasText: 'MOB-77' }).waitFor()
      await shell.locator('#labelInput').press('Escape')
    })

    await check('długi spis kodów zatrzymuje się na limicie', async () => {
      const codes = Array.from({ length: 205 }, (_, i) => `DUZO-${i + 1}`)
      await shell.evaluate(async (labels) => {
        const library = JSON.parse(await window.api.getLibrary())
        const doc = library.projects.flatMap((project) => project.docs).find((item) => item.name === 'raport.html')
        await window.api.setDocLabels(doc.id, labels)
      }, codes)
      await shell.locator('.panel-head strong', { hasText: 'Plan' }).waitFor()
      await shell.getByRole('button', { name: 'Wszystkie etykiety' }).click()
      await shell.locator('#ticketsRow .num', { hasText: '208' }).waitFor()
      await shell.locator('#ticketsRow').click()
      await shell.locator('#panelItems .label-hint', { hasText: '200 z 208' }).waitFor()
      assert.equal(await shell.locator('.ticket').count(), 200)
      await search.fill('DUZO-204')
      await shell.locator('.ticket', { hasText: 'DUZO-204' }).waitFor()
      assert.equal(await shell.locator('.ticket').count(), 1)
    })
  } finally {
    await app.close().catch(() => undefined)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = []
  const check = async (name, run) => {
    try {
      await run()
      results.push(`OK    ${name}`)
    } catch (error) {
      results.push(`BŁĄD  ${name}: ${error.message.split('\n')[0]}`)
    }
  }
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-tickets-'))
  try {
    await ticketsFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
