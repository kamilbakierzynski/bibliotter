// Etykiety od Haiku i ich kolory: zakładka AI, nowe pliki, przyciski i awarie. Zamiast Claude Code
// działa atrapa `.cmd`, bo instalacja z npm uruchamia się przez powłokę, a to tam psują się cudzysłowy.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/autoLabel.mjs
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

const FAKE_CLAUDE = `import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const folder = dirname(fileURLToPath(import.meta.url))
const input = readFileSync(0, 'utf8')
appendFileSync(join(folder, 'calls.jsonl'), JSON.stringify({ args: process.argv.slice(2), input }) + '\\n')
await new Promise((done) => setTimeout(done, 400))
if (existsSync(join(folder, 'broken'))) {
  console.log(JSON.stringify({ is_error: true, result: 'Not logged in' }))
  process.exit(1)
}
console.log(JSON.stringify({ is_error: false, structured_output: { labels: ['Plan'], tickets: ['PAY-1482', 'NIE-1'] } }))
`

export async function autoLabelFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'auto-home')
  const docs = join(workspace, 'auto-docs')
  const tools = join(workspace, 'auto narzędzia')
  const profile = join(workspace, 'auto-profile')
  for (const folder of [home, docs, tools]) await mkdir(folder, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'stary.html'), documentNamed('Stary dokument'))
  await writeFile(join(tools, 'fake.mjs'), FAKE_CLAUDE)
  await writeFile(join(tools, 'claude.cmd'), '@echo off\r\nnode "%~dp0fake.mjs" %*\r\n')

  const calls = async () => {
    const log = await readFile(join(tools, 'calls.jsonl'), 'utf8').catch(() => '')
    return log.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  }
  const readConfig = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${profile}`],
    env: { ...process.env, BIBLIOTTER_HOME: home, BIBLIOTTER_CLAUDE: join(tools, 'claude.cmd') }
  })
  try {
    const shell = await app.firstWindow()
    const row = (name) => shell.locator('.row[data-doc]', { hasText: name })
    const tab = (view) => shell.locator(`.rb[data-view="${view}"]`)
    const toggle = (name) => shell.getByRole('switch', { name })
    // Panel pamięta podstronę, więc przy kolejnym wejściu zakładka AI może już być otwarta.
    const openAi = async () => {
      await tab('options').click()
      await delay(250)
      const page = shell.locator('.o-page', { hasText: 'AI' })
      if ((await page.count()) > 0) await page.click()
      await toggle('Etykietuj nowe pliki').waitFor()
    }
    shell.setDefaultTimeout(8000)
    await row('stary').waitFor()

    await check('bez włączenia w ustawieniach nowy plik nie idzie do Haiku', async () => {
      await writeFile(join(docs, 'cichy.html'), documentNamed('Cichy dokument'))
      await row('cichy').waitFor({ timeout: 8000 })
      await delay(1200)
      assert.equal((await calls()).length, 0)
    })

    await check('zakładka AI włącza etykietowanie nowych plików', async () => {
      await openAi()
      assert.equal(await toggle('Etykietuj nowe pliki').getAttribute('aria-checked'), 'false')
      await toggle('Etykietuj nowe pliki').click()
      await shell.locator('[role="switch"][aria-checked="true"]', { hasText: 'Etykietuj nowe pliki' }).waitFor()
      assert.equal((await readConfig()).autoLabelNew, true)
      await tab('library').click()
    })

    await check('nowy plik dostaje etykiety sam, a powłoka cytuje argumenty', async () => {
      await writeFile(join(docs, 'nowy.html'), documentNamed('Nowy dokument z PAY-1482'))
      await row('nowy').locator('.tag.label', { hasText: 'Plan' }).waitFor({ timeout: 10000 })
      const [call, ...rest] = await calls()
      assert.equal(rest.length, 0)
      assert.ok(call.input.includes('Nowy dokument z PAY-1482'))
      assert.ok(call.input.includes('- Explainer'))
      const flag = (name) => call.args[call.args.indexOf(name) + 1]
      assert.equal(flag('--model'), 'claude-haiku-5-5')
      assert.equal(flag('--tools'), '')
      assert.equal(JSON.parse(flag('--json-schema')).type, 'object')
      assert.ok(call.args.includes('--safe-mode'))
    })

    const labelsOf = (name) =>
      shell.evaluate(async (fileName) => {
        const library = JSON.parse(await window.api.getLibrary())
        return library.projects.flatMap((project) => project.docs).find((doc) => doc.name === fileName).labels
      }, name)

    await check('z odpowiedzi zostają tylko kody obecne w dokumencie', async () => {
      await row('nowy').locator('.tag', { hasText: '+1' }).waitFor()
      assert.deepEqual(await labelsOf('nowy.html'), ['Plan', 'PAY-1482'])
    })

    await check('wyłączone kody zgłoszeń nie trafiają na dokument', async () => {
      await openAi()
      await toggle('Dodawaj kody zgłoszeń').click()
      await shell.locator('[role="switch"][aria-checked="false"]', { hasText: 'Dodawaj kody zgłoszeń' }).waitFor()
      await tab('library').click()
      await writeFile(join(docs, 'bez-kodu.html'), documentNamed('Dokument z PAY-1482 bez kodu'))
      await row('bez kodu').locator('.tag.label', { hasText: 'Plan' }).waitFor({ timeout: 10000 })
      assert.deepEqual(await labelsOf('bez-kodu.html'), ['Plan'])
    })

    await check('dopisana etykieta do wyboru trafia do pytania', async () => {
      await openAi()
      const field = shell.getByLabel('Nowa etykieta do wyboru')
      await field.fill('Postmortem')
      await field.press('Enter')
      await shell.locator('.options .f-row', { hasText: 'Postmortem' }).waitFor()
      assert.ok((await readConfig()).labelStarters.includes('Postmortem'))
    })

    await check('przycisk etykietuje tylko widoczne dokumenty bez etykiet', async () => {
      await shell.locator('#autoLabelAll .num', { hasText: '2' }).waitFor()
      await shell.locator('#autoLabelAll').click()
      await shell.locator('#autoLabelAll .num', { hasText: '0' }).waitFor({ timeout: 10000 })
      assert.equal(await shell.locator('#autoLabelAll').isDisabled(), true)
      assert.ok((await calls()).at(-1).input.includes('- Postmortem'))
      await tab('library').click()
    })

    await check('w wybieraku przycisk pokazuje, że nie było czego dodać', async () => {
      await row('stary').click()
      const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
      await layer.locator('#labelBtn').click()
      await shell.locator('#labelPop.on').waitFor()
      await shell.locator('#autoLabelBtn').click()
      await shell.locator('#labelPop [role="status"]', { hasText: 'Nic tu nie pasuje' }).waitFor({ timeout: 8000 })
    })

    await check('awaria Claude Code trafia do wybieraka i panelu', async () => {
      await writeFile(join(tools, 'broken'), '')
      await shell.locator('#autoLabelBtn').click()
      await shell.locator('#labelPop [role="status"]', { hasText: 'Not logged in' }).waitFor({ timeout: 8000 })
      await shell.locator('#labelInput').press('Escape')
      await tab('labels').click()
      await shell.locator('#panelItems .label-hint', { hasText: 'Not logged in' }).waitFor()
      await rm(join(tools, 'broken'))
    })

    const planRow = () => shell.locator('#panelItems .row', { hasText: 'Plan' })

    await check('etykieta od razu ma kolor z palety', async () => {
      const tone = await planRow().getAttribute('data-color')
      assert.ok(['yellow', 'sand', 'pink', 'lilac', 'blue', 'mint', 'green'].includes(tone))
      const placard = await shell.locator('.placard .tag.label', { hasText: 'Plan' }).first().getAttribute('data-color')
      assert.equal(placard, tone)
    })

    await check('wybrany kolor obowiązuje wszędzie i zostaje w konfiguracji', async () => {
      await planRow().click()
      await shell.getByRole('radio', { name: 'Niebieski' }).click()
      await shell.locator('.placard .tag.label[data-color="blue"]', { hasText: 'Plan' }).waitFor()
      assert.equal((await readConfig()).labelColors.plan, 'blue')
    })

    await check('kolor można zdjąć, a zmiana nazwy go zachowuje', async () => {
      await shell.getByRole('radio', { name: 'Bez koloru' }).click()
      await shell.locator('.placard .tag.label:not([data-color])', { hasText: 'Plan' }).waitFor()
      await shell.getByRole('radio', { name: 'Zielony' }).click()
      await shell.locator('.placard .tag.label[data-color="green"]', { hasText: 'Plan' }).waitFor()
      await shell.evaluate(() => window.api.renameLabel('Plan', 'Roadmapa'))
      await shell.locator('.placard .tag.label[data-color="green"]', { hasText: 'Roadmapa' }).waitFor()
      const config = await readConfig()
      assert.equal(config.labelColors.roadmapa, 'green')
      assert.equal(config.labelColors.plan, undefined)
    })

    await check('usunięta etykieta nie wraca od Haiku', async () => {
      await shell.evaluate(() => window.api.deleteLabel('Roadmapa'))
      const config = await readConfig()
      assert.ok(!config.labelStarters.includes('Plan'))
      assert.ok(!config.labelStarters.includes('Roadmapa'))
      assert.equal(config.labelColors.roadmapa, undefined)
      await shell.evaluate(async () => {
        const library = JSON.parse(await window.api.getLibrary())
        await window.api.autoLabel([library.projects[0].docs[0].id])
      })
      assert.ok(!(await calls()).at(-1).input.includes('- Roadmapa'))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-auto-'))
  try {
    await autoLabelFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
