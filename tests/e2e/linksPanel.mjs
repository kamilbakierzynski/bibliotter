// Panel Linki: link zwrotny po przejściu linkiem i karta z podglądem miejsca przy wierszu.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/linksPanel.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

const SOURCE = 'Źródło linków'
const TARGET = 'Cel linków'
const OTHER = 'Drugie źródło'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const prose = (topic) => `${`Zdanie o ${topic}, które opisuje decyzję projektową i jej skutki dla całego zespołu. `.repeat(18)}\n\n`
const section = (title, topic) => `## ${title}\n\n${prose(topic)}${prose(topic)}`

const sourceDoc = `# ${SOURCE}\n\n${section('Wstęp', 'wstępie')}Szczegóły opisuje [druga sekcja celu](cel.md#druga-sekcja) w dalszej części.\n\n${section('Koniec', 'końcu')}`
const targetDoc = `# ${TARGET}\n\n${section('Pierwsza sekcja', 'pierwszej sekcji')}${section('Druga sekcja', 'drugiej sekcji')}${section('Trzecia sekcja', 'trzeciej sekcji')}`
const otherDoc = `# ${OTHER}\n\n${section('Opis', 'opisie')}Zajrzyj też do [[cel]], gdzie stoją sekcje.\n\n${section('Wnioski', 'wnioskach')}`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * `waitForFunction` nie czeka na obietnice, więc warunek z `evaluate` sprawdza pętla w Node.
 * Zwraca czas oczekiwania, żeby test mógł go zgłosić.
 */
async function until(page, test, argument, what, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await page.evaluate(test, argument).catch(() => false)) return Date.now() - start
    await delay(50)
  }
  throw new Error(`Nie doczekano się: ${what}`)
}

function attachDocument(app) {
  return async (marker) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
        if (width !== THUMB_WIDTH && text.startsWith(marker)) return page
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${marker}”`)
  }
}

/** Prawdziwe kliknięcie: przechodzi przez przeglądarkę, więc `isTrusted` jest prawdą. */
async function press(view, selector) {
  const { x, y } = await view.evaluate((target) => {
    const element = document.querySelector(target)
    element.scrollIntoView({ block: 'center' })
    const { x, y, width, height } = element.getClientRects()[0]
    return { x: x + width / 2, y: y + height / 2 }
  }, selector)
  await view.mouse.click(x, y)
}

export async function linksPanelFlow(workspace, { check, entry = projectRoot, shots = null }) {
  const home = join(workspace, 'links-panel-home')
  const repo = join(workspace, 'links-panel-repo')
  const docs = join(repo, 'docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(docs, 'zrodlo.md'), sourceDoc)
  await writeFile(join(docs, 'cel.md'), targetDoc)
  await writeFile(join(docs, 'drugie.md'), otherDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'links-panel-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const findDocument = attachDocument(app)
    const isLive = () => until(shell, () => !document.querySelector('canvas.sheet-frame'), undefined, 'żywy arkusz')
    const rowsIn = (section) =>
      shell.evaluate(
        (at) => [...document.querySelectorAll('#linksList section')[at].querySelectorAll('.lr-title')].map((row) => row.textContent),
        section
      )
    /** Karta z gotowym zrzutem, a nie z samą miniaturą czy migotaniem oczekiwania. */
    const cardShot = () =>
      until(
        shell,
        () => {
          const card = document.querySelector('#hoverCard.on')
          const img = card?.querySelector('.hc-shot img:not(.hc-top)')
          return Boolean(img?.getAttribute('src')?.startsWith('data:image') && img.complete && img.naturalWidth > 0)
        },
        undefined,
        'zrzut na karcie',
        15000
      )

    await shell.locator('.row[data-doc]', { hasText: SOURCE }).click()
    const source = await findDocument(SOURCE)
    await until(source, () => document.readyState === 'complete', undefined, 'wczytane źródło')
    await isLive()
    await shell.locator('button[data-moved="links"]').click()

    await check('panel Linki pokazuje link wychodzący do celu', async () => {
      await until(shell, (title) => document.querySelector('#linksList')?.textContent.includes(title), TARGET, 'wiersz celu')
      assert.deepEqual(await rowsIn(0), [TARGET])
    })

    await check('karta linku wychodzącego pokazuje cel ustawiony na kotwicy', async () => {
      const row = shell.locator('#linksList .link-row', { hasText: TARGET })
      assert.equal(await row.getAttribute('title'), null)
      await row.hover()
      const waited = await cardShot()
      const text = await shell.locator('#hoverCard').textContent()
      assert.match(text, /#druga-sekcja/)
      // Karta stoi po lewej stronie panelu, bo panel jest przy prawej krawędzi.
      const [cardBox, panelBox] = await Promise.all([shell.locator('#hoverCard').boundingBox(), shell.locator('#linksList').boundingBox()])
      assert.ok(cardBox.width >= 400, `karta jest za wąska: ${cardBox.width}`)
      assert.ok(cardBox.x + cardBox.width <= panelBox.x, `karta zachodzi na panel: ${JSON.stringify({ cardBox, panelBox })}`)
      if (shots) await shell.screenshot({ path: join(shots, 'karta-wychodzacy.png') })
      if (process.env.E2E_TRACE) console.log('zrzut celu po', waited, 'ms')
      await shell.mouse.move(10, 10)
      await until(shell, () => !document.querySelector('#hoverCard.on'), undefined, 'zgaszona karta')
    })

    await check('po przejściu linkiem cel od razu widzi źródło w linkach zwrotnych', async () => {
      await press(source, 'a[href^="cel.md"]')
      await until(shell, (title) => document.querySelector('.pane.focused .pl-title')?.textContent === title, TARGET, 'cel w arkuszu')
      const waited = await until(
        shell,
        ([a, b]) => {
          const titles = [...(document.querySelectorAll('#linksList section')[1]?.querySelectorAll('.lr-title') ?? [])].map((row) => row.textContent)
          return titles.includes(a) && titles.includes(b)
        },
        [SOURCE, OTHER],
        'oba linki zwrotne'
      )
      if (process.env.E2E_TRACE) console.log('linki zwrotne po', waited, 'ms')
      assert.deepEqual((await rowsIn(1)).sort(), [OTHER, SOURCE].sort())
      assert.ok(waited < 3000, `linki zwrotne przyszły po ${waited} ms`)
    })

    await check('karta linku zwrotnego pokazuje miejsce, z którego dokument linkuje', async () => {
      await isLive()
      await shell.locator('#linksList .link-row', { hasText: SOURCE }).hover()
      await cardShot()
      assert.match(await shell.locator('#hoverCard').textContent(), new RegExp(SOURCE))
      if (shots) await shell.screenshot({ path: join(shots, 'karta-zwrotny.png') })
    })

    await check('karta jedzie na sąsiedni wiersz bez czekania', async () => {
      await shell.locator('#linksList .link-row', { hasText: OTHER }).hover()
      await until(shell, (title) => document.querySelector('#hoverCard.on .hc-title')?.textContent === title, OTHER, 'karta drugiego źródła', 2000)
      await cardShot()
      if (shots) await shell.screenshot({ path: join(shots, 'karta-wiki.png') })
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-links-panel-'))
  try {
    await linksPanelFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot, shots: process.env.E2E_SHOTS ?? null })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
