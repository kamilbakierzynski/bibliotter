// Kształty tuszem: narzędzie A, równy kształt z przeciągnięcia, zapis z kotwicami, gumka, cofanie
// i przełącznik rysunków D, który apka pamięta po restarcie.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/shapes.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const TITLE = 'Rysunki w dokumencie'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

/** Skaner bierze do biblioteki tylko plik z treścią i nagłówkami. */
const prose = 'Akapit opisujący decyzje projektowe dokumentu i jego strukturę. '.repeat(20)

const shapesDoc = `<!doctype html><title>${TITLE}</title>
<style>
  body { margin: 16px; font: 16px/1.5 sans-serif; color: #222; background: #fff }
  #pole { width: 600px; height: 260px }
  #rzad { display: flex; justify-content: space-between; align-items: flex-start; width: 600px }
  #a, #b { width: 90px; height: 50px; background: #eee }
</style>
<body><h1>${TITLE}</h1><div id="pole"></div><div id="rzad"><div id="a"></div><div id="b"></div></div>
<h2>Cel</h2><h2>Ryzyka</h2><p>${prose}</p>
<div style="height: 1600px"></div>
<script>for (const type of ['mousedown', 'click']) {
  window.addEventListener(type, () => { window.klikniecia = (window.klikniecia ?? 0) + 1 }, true)
}</script>
</body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const documentIsLive = (shell) => shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))

function attachDocument(app) {
  return async (title) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await page.title().catch(() => '')).includes(title)) return page
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${title}”`)
  }
}

async function dockLayer(app, shell) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
    if (layer) return layer
    await delay(50)
  }
  throw new Error('Nie znaleziono warstwy doku')
}

/** Piksele niebieskiego tuszu w prostokącie widoku. Zrzut robi proces główny wprost z widoku dokumentu. */
const inkIn = (app, url, box) =>
  app.evaluate(
    async ({ webContents }, { url, box }) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
      const image = await contents.capturePage()
      const data = image.toBitmap()
      const size = image.getSize()
      const scale = Math.sqrt(data.length / 4 / (size.width * size.height))
      const width = Math.round(size.width * scale)
      const x0 = Math.max(0, Math.round(box.x * scale))
      const y0 = Math.max(0, Math.round(box.y * scale))
      const x1 = Math.min(width, Math.round((box.x + box.width) * scale))
      const y1 = Math.min(Math.round(size.height * scale), Math.round((box.y + box.height) * scale))
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          const [b, g, r] = [data[i], data[i + 1], data[i + 2]]
          if (r < 150 && b > r + 50 && b > g + 30) count++
        }
      }
      // Wynik w pikselach CSS, żeby progi nie zależały od gęstości ekranu.
      return count / (scale * scale)
    },
    { url, box }
  )

/** Prostokąt wokół punktu. */
const around = ({ x, y }, width, height) => ({ x: x - width / 2, y: y - height / 2, width, height })

export async function shapesFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'shapes-home')
  const docs = join(workspace, 'shapes-docs')
  const profile = join(workspace, 'shapes-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'rysunki.html'), shapesDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const shapes = async () => {
    const library = join(home, 'library')
    const found = []
    for (const doc of await readdir(library).catch(() => [])) {
      const folder = join(library, doc, 'annotations')
      for (const file of await readdir(folder).catch(() => [])) {
        // Zapis idzie przez plik tymczasowy, którego nie wolno czytać w połowie.
        if (!file.endsWith('.json')) continue
        const item = JSON.parse(await readFile(join(folder, file), 'utf8'))
        if (item.kind === 'shape') found.push(item)
      }
    }
    return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  const until = async (test, ms = 4000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const value = await test()
      if (value) return value
      await delay(60)
    }
    throw new Error('Nie doczekano się zapisu')
  }
  const count = (wanted) => until(async () => (await shapes()).length === wanted)

  const launch = async () => {
    const app = await electron.launch({
      args: [entry, `--user-data-dir=${profile}`],
      env: { ...process.env, BIBLIOTTER_HOME: home }
    })
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const layer = await dockLayer(app, shell)
    layer.setDefaultTimeout(8000)
    // Pierwszy skan bywa wolny, gdy maszyna pracuje nad czymś innym.
    await shell.locator('.row[data-doc]', { hasText: TITLE }).waitFor({ timeout: 30000 })
    await shell.locator('.row[data-doc]', { hasText: TITLE }).click()
    const page = await attachDocument(app)(TITLE)
    await page.waitForLoadState('load')
    await documentIsLive(shell)
    await delay(400)
    return { app, shell, layer, page }
  }

  const errors = []
  let { app, shell, layer, page } = await launch()
  try {
    for (const surface of [shell, layer, page]) surface.on('pageerror', (error) => errors.push(String(error)))
    const url = page.url()
    const tool = (name) => shell.locator(`#app[data-tool="${name}"]`).waitFor({ state: 'attached' })
    const box = (selector) => page.locator(selector).boundingBox()
    const drag = async (from, to, { shift = false } = {}) => {
      await page.mouse.move(from.x, from.y)
      if (shift) await page.keyboard.down('Shift')
      await page.mouse.down()
      await delay(60)
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await delay(80)
      await page.mouse.up()
      if (shift) await page.keyboard.up('Shift')
    }
    const toggle = () => shell.locator('.pane.focused [data-moved="drawings"]')
    const pole = await box('#pole')
    const a = await box('#a')
    const b = await box('#b')
    const middle = { x: (a.x + a.width / 2 + b.x + b.width / 2) / 2, y: a.y + a.height / 2 }
    const rectFrom = { x: pole.x + 100, y: pole.y + 60 }
    const rectTo = { x: pole.x + 400, y: pole.y + 200 }
    const rectEdge = { x: pole.x + 150, y: rectFrom.y - 8, width: 200, height: 16 }

    await check('skrót A włącza narzędzie kształtu, a taca pokazuje rodzaje i kolory', async () => {
      await page.keyboard.press('a')
      await tool('shape')
      await layer.locator('.tb[data-tool="shape"].on').waitFor()
      await layer.locator('#trayIn[data-tray="shape"] .tray-k [data-shape="arrow"]').waitFor({ state: 'visible' })
      await layer.locator('#trayIn[data-tray="shape"] .swatch.blue').waitFor({ state: 'visible' })
      await page.waitForFunction(() => getComputedStyle(document.body).cursor === 'crosshair')
    })

    await check('przeciągnięcie rysuje prostokąt zakotwiczony w elemencie pod środkiem', async () => {
      await layer.locator('.tray-k [data-shape="rect"]').click()
      await layer.locator('.tray-k [data-shape="rect"].on').waitFor()
      await layer.locator('.swatch.blue').click()
      await layer.locator('.swatch.blue.on').waitFor()
      await drag(rectFrom, rectTo)
      await count(1)
      const [saved] = await shapes()
      assert.equal(saved.color, 'blue')
      assert.equal(saved.audience, 'me')
      assert.deepEqual(saved.messages, [])
      assert.equal(saved.anchor.selector, '#pole')
      assert.equal(saved.shape.type, 'rect')
      const expected = { x: 100 / pole.width, y: 60 / pole.height, width: 300 / pole.width, height: 140 / pole.height }
      for (const key of Object.keys(expected)) {
        assert.ok(Math.abs(saved.shape.box[key] - expected[key]) < 0.01, `${key}: ${saved.shape.box[key]} ≠ ${expected[key]}`)
      }
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('tusz prostokąta widać na krawędzi, a nie w środku', async () => {
      await delay(300)
      const edge = await inkIn(app, url, rectEdge)
      const inside = await inkIn(app, url, around({ x: pole.x + 250, y: pole.y + 130 }, 120, 60))
      assert.ok(edge > 250, `tuszu na krawędzi: ${edge}`)
      assert.equal(inside, 0)
    })

    await check('kliknięcie bez przeciągnięcia nic nie rysuje i nie trafia do dokumentu', async () => {
      await page.mouse.click(pole.x + 500, pole.y + 230)
      await delay(400)
      assert.equal((await shapes()).length, 1)
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('Shift wyrównuje prostokąt do kwadratu, a Ctrl+Z go cofa', async () => {
      await drag({ x: pole.x + 440, y: pole.y + 20 }, { x: pole.x + 540, y: pole.y + 70 }, { shift: true })
      await count(2)
      const square = (await shapes())[1]
      assert.ok(Math.abs(square.shape.box.width * pole.width - 100) < 2, `szerokość ${square.shape.box.width * pole.width}`)
      assert.ok(Math.abs(square.shape.box.height * pole.height - 100) < 2, `wysokość ${square.shape.box.height * pole.height}`)
      await page.keyboard.press('Control+z')
      await count(1)
      await layer.locator('#tip.on', { hasText: 'Cofnięto: dodanie kształtu' }).waitFor()
    })

    await check('Escape w trakcie przeciągania niczego nie zapisuje', async () => {
      await page.mouse.move(pole.x + 20, pole.y + 20)
      await page.mouse.down()
      await page.mouse.move(pole.x + 80, pole.y + 90, { steps: 6 })
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await delay(400)
      assert.equal((await shapes()).length, 1)
      await tool('move')
      await page.keyboard.press('a')
      await tool('shape')
    })

    await check('strzałka łączy dwa elementy i idzie za nimi, gdy strona się zmienia', async () => {
      await layer.locator('.tray-k [data-shape="arrow"]').click()
      await layer.locator('.tray-k [data-shape="arrow"].on').waitFor()
      await drag({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
      await count(2)
      const arrow = (await shapes())[1]
      assert.equal(arrow.shape.type, 'arrow')
      assert.equal(arrow.anchor.selector, '#a')
      assert.equal(arrow.shape.end.selector, '#b')
      await delay(300)
      assert.ok((await inkIn(app, url, around(middle, 80, 44))) > 60, 'brak tuszu w połowie strzałki')
      await page.evaluate(() => {
        document.getElementById('b').style.marginTop = '120px'
      })
      await delay(600)
      const lower = { x: middle.x, y: middle.y + 60 }
      assert.ok((await inkIn(app, url, around(lower, 80, 44))) > 60, 'strzałka nie poszła za elementem')
      assert.equal(await inkIn(app, url, around(middle, 80, 20)), 0)
      await writeFile(join(artifacts, 'shapes.png'), await page.screenshot())
    })

    await check('prawy przycisk przy linii usuwa kształt', async () => {
      await page.mouse.click(pole.x + 250, rectFrom.y, { button: 'right' })
      await count(1)
      assert.equal((await shapes())[0].shape.type, 'arrow')
      await delay(300)
      assert.equal(await inkIn(app, url, rectEdge), 0)
    })

    await check('kształty nie trafiają na listę uwag', async () => {
      await page.keyboard.press('v')
      await tool('move')
      await shell.locator('.rb[data-view="notes"]').click()
      await delay(500)
      assert.equal(await shell.locator('.row[data-open-note]').count(), 0)
      await shell.locator('.rb[data-view="library"]').click()
      await documentIsLive(shell)
    })

    const lower = { x: middle.x, y: middle.y + 60 }
    await check('D chowa rysunki dokumentu, a przycisk nad arkuszem mówi, jak je pokazać', async () => {
      await toggle().waitFor()
      assert.equal(await toggle().getAttribute('aria-label'), 'Schowaj rysunki')
      await page.keyboard.press('d')
      await shell.locator('.pane.focused [data-moved="drawings"][aria-label="Pokaż rysunki"]').waitFor()
      await delay(300)
      assert.equal(await inkIn(app, url, around(lower, 80, 44)), 0)
    })

    await check('schowane rysunki zostają schowane po przeładowaniu dokumentu', async () => {
      await page.reload()
      await page.waitForLoadState('load')
      await delay(600)
      assert.equal(await inkIn(app, url, around(middle, 80, 44)), 0)
    })

    await check('apka pamięta schowane rysunki po restarcie, a D je pokazuje', async () => {
      await app.close()
      ;({ app, shell, layer, page } = await launch())
      for (const surface of [shell, layer, page]) surface.on('pageerror', (error) => errors.push(String(error)))
      await delay(300)
      await shell.locator('.pane.focused [data-moved="drawings"][aria-label="Pokaż rysunki"]').waitFor()
      assert.equal(await inkIn(app, page.url(), around(middle, 80, 44)), 0)
      await page.keyboard.press('d')
      await shell.locator('.pane.focused [data-moved="drawings"][aria-label="Schowaj rysunki"]').waitFor()
      await delay(300)
      assert.ok((await inkIn(app, page.url(), around(middle, 80, 44))) > 60, 'rysunki nie wróciły')
    })

    await check('kształty nie zgłaszają błędów', async () => assert.deepEqual(errors, []))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-shapes-'))
  try {
    await shapesFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
