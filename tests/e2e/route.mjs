// Trasa prezentacji: formularz w panelu, kadr wskazany w dokumencie, zapis obok uwag, podgląd
// kamerą, ostrzeżenie o zgubionym kadrze i zmiana zapisana przez agenta.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/route.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const TITLE = 'Trasa przez dokument'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const prose = 'Akapit opisujący decyzje projektowe dokumentu i jego strukturę. '.repeat(20)

const routeDoc = `<!doctype html><title>${TITLE}</title>
<style>
  body { margin: 16px; font: 16px/1.5 sans-serif; color: #222; background: #fff }
  #diagram { width: 300px; height: 180px; margin: 24px auto; background: rgb(30 120 200) }
</style>
<body><h1>${TITLE}</h1><h2>Cel</h2><h2>Ryzyka</h2><p>${prose}</p>
<div id="diagram"></div>
<p>${prose}</p>
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

/** Ciemne piksele przerywanej ramki w prostokącie widoku dokumentu. */
const frameInk = (app, url, box) =>
  app.evaluate(
    async ({ webContents }, { url, box }) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
      const image = await contents.capturePage()
      const data = image.toBitmap()
      const size = image.getSize()
      const scale = Math.sqrt(data.length / 4 / (size.width * size.height))
      const width = Math.round(size.width * scale)
      let count = 0
      for (let y = Math.max(0, Math.round(box.y * scale)); y < Math.round((box.y + box.height) * scale); y++) {
        for (let x = Math.max(0, Math.round(box.x * scale)); x < Math.min(width, Math.round((box.x + box.width) * scale)); x++) {
          const i = (y * width + x) * 4
          const [b, g, r] = [data[i], data[i + 1], data[i + 2]]
          // Kreska ramki na bieli i na niebieskim polu wykresu. Sam wykres ma zielony powyżej 100.
          if (r < 100 && g < 100 && b < 125) count++
        }
      }
      return count / (scale * scale)
    },
    { url, box }
  )

export async function routeFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'route-home')
  const docs = join(workspace, 'route-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'trasa.html'), routeDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const until = async (test, ms = 5000) => {
    const start = Date.now()
    let last
    while (Date.now() - start < ms) {
      last = await test()
      if (last) return last
      await delay(80)
    }
    throw new Error('Nie doczekano się zmiany')
  }
  let docId = null
  const routeFile = () => join(home, 'library', docId, 'presentation.json')
  const stored = async () => {
    try {
      return JSON.parse(await readFile(routeFile(), 'utf8'))
    } catch {
      return null
    }
  }
  const storedWhen = (test) => until(async () => {
    const value = await stored()
    return value && test(value) ? value : null
  })

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'route-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    await shell.locator('.row[data-doc]', { hasText: TITLE }).waitFor({ timeout: 30000 })
    await shell.locator('.row[data-doc]', { hasText: TITLE }).click()
    const page = await attachDocument(app)(TITLE)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.waitForLoadState('load')
    await documentIsLive(shell)
    const url = page.url()
    docId = await shell.evaluate(async (title) => {
      const library = JSON.parse(await window.api.getLibrary())
      return library.projects.flatMap((project) => project.docs).find((doc) => doc.title === title)?.id
    }, TITLE)
    assert.ok(docId, 'brak dokumentu w bibliotece')

    // Karteczka i kształt, które krok może pokazać.
    await shell.evaluate(async (docId) => {
      await window.api.createAnnotation(docId, {
        kind: 'sticky',
        audience: 'me',
        color: 'yellow',
        anchor: { selector: '#diagram', offsetX: 0.9, offsetY: 0.1, quote: '', heading: 'Ryzyka' },
        text: 'Karteczka przy wykresie'
      })
      await window.api.createAnnotation(docId, {
        kind: 'shape',
        audience: 'me',
        color: 'blue',
        anchor: { selector: '#diagram', offsetX: 0.5, offsetY: 0.5, quote: '', heading: 'Ryzyka' },
        text: '',
        shape: { type: 'ellipse', box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }
      })
    }, docId)
    await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
    await delay(400)

    const form = shell.locator('#routeForm')
    const steps = shell.locator('.rt-step')
    const hint = shell.locator('.rt-hint')
    let diagram = null

    await check('Shift+P otwiera trasę w panelu, a pusta trasa mówi, od czego zacząć', async () => {
      await page.keyboard.press('Shift+P')
      await form.waitFor({ state: 'visible' })
      await form.locator('.empty', { hasText: 'krok po kroku' }).waitFor()
      // Panel zwęża arkusz, więc układ dokumentu trzeba zmierzyć od nowa.
      await delay(700)
      diagram = await page.locator('#diagram').boundingBox()
    })

    await check('Dodaj krok zapisuje trasę obok uwag', async () => {
      await shell.locator('#rtAdd').click()
      await steps.first().waitFor()
      const value = await storedWhen((route) => route.steps.length === 1)
      assert.deepEqual(value.steps[0].camera, { kind: 'hold' })
      assert.equal(value.steps[0].rest, 'normal')
      await hint.filter({ hasText: 'cały dokument' }).waitFor()
    })

    await check('nazwa kroku zapisuje się w trakcie pisania i stoi na liście', async () => {
      await shell.locator('#rtTitle').fill('Wykres ryzyk')
      await storedWhen((route) => route.steps[0].title === 'Wykres ryzyk')
      await steps.first().filter({ hasText: 'Wykres ryzyk' }).waitFor()
    })

    await check('Miejsce czeka na kliknięcie, a kliknięcie bierze element i nie trafia do dokumentu', async () => {
      await shell.locator('[data-camera="place"]').click()
      await shell.locator('.rt-hint.live', { hasText: 'Kliknij element' }).waitFor()
      await page.waitForFunction(() => getComputedStyle(document.body).cursor === 'crosshair')
      await page.mouse.move(diagram.x + 150, diagram.y + 90)
      await page.mouse.click(diagram.x + 150, diagram.y + 90)
      const value = await storedWhen((route) => route.steps[0].camera.kind === 'place')
      assert.equal(value.steps[0].camera.anchor.selector, '#diagram')
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
      await hint.filter({ hasText: 'Kamera pokaże' }).waitFor()
      await page.waitForFunction(() => getComputedStyle(document.body).cursor !== 'crosshair')
    })

    await check('dokument pokazuje przerywaną ramką kadr wybranego kroku', async () => {
      await delay(500)
      const edge = await frameInk(app, url, { x: diagram.x + 20, y: diagram.y - 1, width: 260, height: 4 })
      assert.ok(edge > 120, `pikseli ramki: ${edge}`)
    })

    await check('nowy krok to kopia poprzedniego z kamerą bez ruchu', async () => {
      await shell.locator('#rtAdd').click()
      await until(async () => (await steps.count()) === 2)
      const value = await storedWhen((route) => route.steps.length === 2)
      assert.deepEqual(value.steps[1].camera, { kind: 'hold' })
      await hint.filter({ hasText: 'jak w kroku 1' }).waitFor()
    })

    await check('Obszar to przeciągnięcie, zapisane w ułamkach elementu pod środkiem', async () => {
      await shell.locator('[data-camera="area"]').click()
      await shell.locator('.rt-hint.live', { hasText: 'Przeciągnij' }).waitFor()
      await page.mouse.move(diagram.x + 30, diagram.y + 20)
      await page.mouse.down()
      await page.mouse.move(diagram.x + 180, diagram.y + 110, { steps: 8 })
      await page.mouse.up()
      const value = await storedWhen((route) => route.steps[1].camera.kind === 'area')
      const { anchor, box } = value.steps[1].camera
      assert.equal(anchor.selector, '#diagram')
      const expected = { x: 30 / diagram.width, y: 20 / diagram.height, width: 150 / diagram.width, height: 90 / diagram.height }
      for (const key of Object.keys(expected)) {
        assert.ok(Math.abs(box[key] - expected[key]) < 0.02, `${key}: ${box[key]} ≠ ${expected[key]}`)
      }
    })

    await check('reszta dokumentu i uwagi do pokazania zapisują się w kroku', async () => {
      await shell.locator('[data-rest="dim"]').click()
      const items = shell.locator('.rt-item')
      assert.equal(await items.count(), 2)
      await items.nth(0).click()
      await items.nth(1).click()
      const value = await storedWhen((route) => route.steps[1].show.length === 2 && route.steps[1].rest === 'dim')
      const notes = await shell.evaluate(() => window.api.listAnnotations())
      assert.deepEqual(new Set(value.steps[1].show), new Set(notes.map(({ id }) => id)))
      assert.equal(await items.nth(0).getAttribute('aria-checked'), 'true')
      await writeFile(join(artifacts, 'route-form.png'), await shell.screenshot())
    })

    await check('krok przesuwa się w górę i w dół', async () => {
      const [first, second] = (await stored()).steps.map(({ id }) => id)
      await shell.getByRole('button', { name: 'Przesuń krok wyżej' }).click()
      await storedWhen((route) => route.steps[0].id === second)
      await shell.getByRole('button', { name: 'Przesuń krok niżej' }).click()
      await storedWhen((route) => route.steps[0].id === first)
      // Na liście kroków przesuwa też `Alt` ze strzałką.
      await shell.locator(`.rt-step[data-step="${second}"]`).focus()
      await shell.keyboard.press('Alt+ArrowUp')
      await storedWhen((route) => route.steps[0].id === second)
      await shell.keyboard.press('Alt+ArrowDown')
      await storedWhen((route) => route.steps[0].id === first)
    })

    await check('podgląd ustawia kamerę na kadrze kroku i wraca do całej strony', async () => {
      await shell.locator('#rtPreview').click()
      await page.waitForFunction(() => visualViewport.scale > 1.5, null, { timeout: 8000 })
      const area = await page.evaluate(() => visualViewport.scale)
      await steps.first().click()
      await page.waitForFunction((before) => Math.abs(visualViewport.scale - before) > 0.2, area, { timeout: 8000 })
      await writeFile(join(artifacts, 'route-preview.png'), await page.screenshot())
      await shell.locator('#rtPreview').click()
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
    })

    await check('Esc przerywa wskazywanie i niczego nie zmienia', async () => {
      const before = JSON.stringify(await stored())
      await shell.locator('[data-camera="area"]').click()
      await shell.locator('.rt-hint.live').waitFor()
      await page.keyboard.press('Escape')
      await until(async () => (await shell.locator('.rt-hint.live').count()) === 0)
      await delay(300)
      assert.equal(JSON.stringify(await stored()), before)
    })

    await check('krok, którego kadru nie ma w dokumencie, dostaje ostrzeżenie', async () => {
      await page.evaluate(() => document.getElementById('diagram').remove())
      await until(async () => (await shell.locator('.rt-step .rt-warn').count()) === 2).catch(async () => {
        const rows = await shell.locator('.rt-step').evaluateAll((list) => list.map((row) => row.outerHTML))
        throw new Error(`ostrzeżeń brak: ${rows.join(' ')}`)
      })
      await shell.locator('.rt-hint.warn', { hasText: 'pominie ten krok' }).waitFor()
      await page.reload()
      await page.waitForLoadState('load')
      await until(async () => (await shell.locator('.rt-step .rt-warn').count()) === 0)
    })

    await check('usunięty krok wraca przyciskiem', async () => {
      await steps.nth(1).click()
      await shell.getByRole('button', { name: 'Usuń krok' }).click()
      await storedWhen((route) => route.steps.length === 1)
      await shell.locator('#rtRestore').click()
      const value = await storedWhen((route) => route.steps.length === 2)
      assert.equal(value.steps[1].camera.kind, 'area')
    })

    await check('zmiana zapisana przez agenta wraca do formularza', async () => {
      const value = await stored()
      value.steps[0].title = 'Od agenta'
      await writeFile(routeFile(), JSON.stringify(value, null, 2))
      await mkdir(join(home, 'state', 'signals'), { recursive: true })
      await writeFile(join(home, 'state', 'signals', 'presentation'), new Date().toISOString())
      await steps.first().filter({ hasText: 'Od agenta' }).waitFor({ timeout: 6000 })
    })

    await check('zamknięcie panelu chowa ramkę, a trasa czeka po ponownym otwarciu', async () => {
      await shell.getByRole('button', { name: 'Zamknij trasę' }).click()
      await delay(800)
      const box = await page.locator('#diagram').boundingBox()
      assert.ok((await frameInk(app, url, { x: box.x + 20, y: box.y - 1, width: 260, height: 4 })) < 20)
      await page.keyboard.press('Shift+P')
      await until(async () => (await steps.count()) === 2)
    })

    await check('trasa nie zgłasza błędów', async () => assert.deepEqual(errors, []))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-route-'))
  try {
    await routeFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
