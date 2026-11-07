// Kamera arkusza: zbliżenie na kadr, skok w odległe miejsce i powrót, z warstwą uwag pod powiększeniem.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/camera.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const TITLE = 'Kamera prezentacji'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040
/** Tak jak w `overlay.ts` i `shared/camera.ts`. */
const DOC_FOOT = 84
const FILL = 0.9
const MAX_SCALE = 4
const NOTE_RGB = [247, 231, 160]

const prose = 'Akapit opisujący decyzje projektowe dokumentu i jego strukturę. '.repeat(30)
const gap = '<div class="gap"></div>'

const cameraDoc = `<!doctype html><title>${TITLE}</title>
<style>
  body { margin: 16px; font: 16px/1.5 sans-serif; color: #222; background: #fff }
  .gap { height: 760px }
  #diagram { position: relative; width: 300px; height: 180px; margin: 0 auto; background: rgb(30 120 200) }
  #przycisk { position: absolute; right: 18px; bottom: 18px; width: 96px; height: 40px }
  #daleko { width: 240px; height: 120px; margin: 0 auto; background: rgb(40 160 90) }
</style>
<body><h1>${TITLE}</h1><h2>Cel</h2><h2>Ryzyka</h2><p>${prose}</p>
${gap}<div id="diagram"><button id="przycisk">Pokaż</button></div>${gap}
<p>${prose}</p>${gap}${gap}<div id="daleko"></div>${gap}
<script>
  window.klik = []
  document.getElementById('przycisk').addEventListener('click', () => klik.push('przycisk'))
  window.resizes = 0
  addEventListener('resize', () => resizes++)
  window.ticks = 0
  setInterval(() => ticks++, 50)
</script>
</body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const until = (view, test, argument) => view.waitForFunction(test, argument, { polling: 100 })
const documentIsLive = (shell) => until(shell, () => !document.querySelector('canvas.sheet-frame'))

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

/** Co widać w dokumencie: skala strony, widoczny kawałek i układ, który nie może się zmienić. */
const metrics = (page) =>
  page.evaluate(() => {
    const view = visualViewport
    const box = (id) => {
      const { left, top, width, height } = document.getElementById(id).getBoundingClientRect()
      return { x: left + width / 2, y: top + height / 2, left, top, width, height }
    }
    const root = document.documentElement
    return {
      scale: view.scale,
      left: view.offsetLeft,
      top: view.offsetTop,
      width: view.width,
      height: view.height,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      diagram: box('diagram'),
      button: box('przycisk'),
      far: box('daleko'),
      resizes: window.resizes,
      ticks: window.ticks
    }
  })

/** Punkt z układu okna strony na ekranie widoku, tak jak go widzi użytkownik. */
const onScreen = (m, x, y) => ({ x: (x - m.left) * m.scale, y: (y - m.top) * m.scale })

/** Ruch i kliknięcie jak od użytkownika: w pikselach ekranu widoku, a nie w układzie strony. */
const input = (app, url, events) =>
  app.evaluate(({ webContents }, { url, events }) => {
    const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
    for (const event of events) contents.sendInputEvent(event)
  }, { url, events })
const moveTo = (app, url, { x, y }) => input(app, url, [{ type: 'mouseMove', x: Math.round(x), y: Math.round(y) }])
const clickAt = (app, url, { x, y }) => {
  const at = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }
  return input(app, url, [{ type: 'mouseMove', ...at }, { type: 'mouseDown', ...at }, { type: 'mouseUp', ...at }])
}

/**
 * Piksele tego, co widać w widoku dokumentu. Zrzut robi proces główny wprost z widoku, bo zrzut
 * apki chowa rękę prezentera. Zwraca liczbę pasujących pikseli i ich obrys w pikselach CSS.
 * `box` ogranicza szukanie do prostokąta na ekranie widoku.
 */
const scan = (app, url, kind, box = null) =>
  app.evaluate(
    async ({ webContents }, { url, kind, box, note }) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
      const image = await contents.capturePage()
      const data = image.toBitmap()
      // Rozmiar jest w pikselach CSS, a mapa bitowa w pikselach urządzenia.
      const size = image.getSize()
      const scale = Math.sqrt(data.length / 4 / (size.width * size.height))
      const width = Math.round(size.width * scale)
      const height = Math.round(size.height * scale)
      const x0 = box ? Math.max(0, Math.round(box.x * scale)) : 0
      const y0 = box ? Math.max(0, Math.round(box.y * scale)) : 0
      const x1 = box ? Math.min(width, Math.round((box.x + box.width) * scale)) : width
      const y1 = box ? Math.min(height, Math.round((box.y + box.height) * scale)) : height
      let count = 0
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          const [b, g, r] = [data[i], data[i + 1], data[i + 2]]
          const match =
            kind === 'note'
              ? Math.abs(r - note[0]) <= 6 && Math.abs(g - note[1]) <= 6 && Math.abs(b - note[2]) <= 8
              : r < 60 && g < 60 && b < 60
          if (!match) continue
          count++
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
      return count === 0
        ? { count, width: 0, height: 0 }
        : { count, width: (maxX - minX + 1) / scale, height: (maxY - minY + 1) / scale }
    },
    { url, kind, box, note: NOTE_RGB }
  )

/** Zapisuje zrzut dokumentu do artefaktów, żeby było widać, co pokazała kamera. */
const saveFrame = async (shell, docId, name) => {
  const png = await shell.evaluate(async (docId) => {
    const { width, height, data } = await window.api.captureDoc(docId)
    const pixels = new Uint8ClampedArray(data.length)
    for (let i = 0; i < data.length; i += 4) {
      pixels[i] = data[i + 2]
      pixels[i + 1] = data[i + 1]
      pixels[i + 2] = data[i]
      pixels[i + 3] = 255
    }
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(text)
  }, docId)
  await writeFile(join(artifacts, name), Buffer.from(png, 'base64'))
}

/** Kamera rusza, a powłoka w każdej klatce zapisuje, jak stoją zrzuty w arkuszu. */
const aim = (shell, docId, shot) =>
  shell.evaluate(
    async ({ docId, shot }) => {
      const frames = []
      let recording = true
      const sample = () => {
        frames.push(
          [...document.querySelectorAll('.sheet-stack canvas.sheet-frame')].map((canvas) => {
            const style = getComputedStyle(canvas)
            const matrix = new DOMMatrix(style.transform)
            return { scale: matrix.a, x: matrix.e, y: matrix.f, opacity: Number(style.opacity) }
          })
        )
        if (recording) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
      const moved = await window.bibliotterCamera.aim(docId, shot)
      recording = false
      return { moved, frames: frames.filter((list) => list.length === 2) }
    },
    { docId, shot }
  )

const expectedScale = (m, target) => {
  const fit = Math.min(m.clientWidth / target.width, (m.clientHeight - DOC_FOOT) / target.height) * FILL
  return Math.min(MAX_SCALE, Math.max(1, fit))
}

/** Chromium zaokrągla przewinięcie do całych pikseli strony, więc kadr może zejść o ok. 2 px strony. */
const centered = (value, wanted, scale) => Math.abs(value - wanted) <= 2 * scale

const anchorOf = (selector) => ({ selector, offsetX: 0.5, offsetY: 0.5, quote: '', heading: null })

/** W każdej klatce ruchu jeden zrzut zakrywa cały arkusz, więc nie ma pustej klatki. */
function assertCovered(frames) {
  assert.ok(frames.length >= 8, `za mało klatek ruchu: ${frames.length}`)
  for (const [index, list] of frames.entries()) {
    assert.ok(list.some(({ opacity }) => opacity >= 0.99), `pusta klatka ${index}: ${JSON.stringify(list)}`)
  }
}

/** Wartość idzie w jedną stronę, z tolerancją na zaokrąglenia i maleńki przestrzał sprężyny. */
function assertMonotonic(values, direction, label) {
  for (let i = 1; i < values.length; i++) {
    const step = (values[i] - values[i - 1]) * direction
    assert.ok(step > -0.003, `${label} cofa się w klatce ${i}: ${values[i - 1]} → ${values[i]}`)
  }
}

export async function cameraFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'camera-home')
  const docs = join(workspace, 'camera-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'kamera.html'), cameraDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'camera-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const layer = await dockLayer(app, shell)
    layer.setDefaultTimeout(8000)
    const errors = []
    for (const surface of [shell, layer]) surface.on('pageerror', (error) => errors.push(String(error)))

    await shell.locator('.row[data-doc]', { hasText: TITLE }).click()
    const page = await attachDocument(app)(TITLE)
    page.on('pageerror', (error) => errors.push(String(error)))
    await until(page, () => document.readyState === 'complete')
    await documentIsLive(shell)
    const url = page.url()
    const docId = await shell.evaluate(async (title) => {
      const library = JSON.parse(await window.api.getLibrary())
      return library.projects.flatMap((project) => project.docs).find((doc) => doc.title === title)?.id
    }, TITLE)
    assert.ok(docId, 'brak dokumentu w bibliotece')

    await shell.evaluate(
      (docId) =>
        window.api.createAnnotation(docId, {
          kind: 'sticky',
          audience: 'me',
          color: 'yellow',
          anchor: { selector: '#diagram', offsetX: 0.04, offsetY: 0.08, quote: '', heading: 'Ryzyka' },
          text: 'Karteczka przy wykresie'
        }),
      docId
    )
    await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
    await delay(600)

    const flat = await metrics(page)
    const noteFlat = await scan(app, url, 'note')
    // Ręka stoi na pustym marginesie z prawej, więc w okienku wokół niej liczy się tylko ona.
    const handPoint = { x: flat.clientWidth * 0.9, y: flat.clientHeight * 0.3 }
    const handBox = { x: handPoint.x - 200, y: handPoint.y - 30, width: 400, height: 300 }
    const handPixels = async () => {
      const without = await scan(app, url, 'dark', handBox)
      await page.keyboard.press('p')
      await moveTo(app, url, handPoint)
      await delay(250)
      await moveTo(app, url, { x: handPoint.x + 1, y: handPoint.y })
      await delay(900)
      const withHand = await scan(app, url, 'dark', handBox)
      await page.keyboard.press('v')
      await delay(700)
      return withHand.count - without.count
    }
    const handFlat = await handPixels()

    await check('przed zoomem karteczka i ręka są widoczne na zrzucie apki', async () => {
      assert.ok(noteFlat.width > 100 && noteFlat.width < 200, JSON.stringify(noteFlat))
      assert.ok(handFlat > 200, String(handFlat))
    })

    let zoomed = null
    await check('zbliżenie przejeżdża kamerą bez pustej klatki, a skala rośnie w jedną stronę', async () => {
      const { moved, frames } = await aim(shell, docId, { anchor: anchorOf('#diagram') })
      assert.equal(moved, true)
      assertCovered(frames)
      // Przy zbliżeniu zrzut startowy leży pod spodem i rośnie aż do skali kadru.
      assertMonotonic(frames.map(([start]) => start.scale), 1, 'skala zrzutu')
      assert.ok(frames.at(-1)[0].scale > 1.5, JSON.stringify(frames.at(-1)))
      await documentIsLive(shell)
      await delay(300)
      zoomed = await metrics(page)
      await saveFrame(shell, docId, 'camera-zoom.png')
    })

    await check('kadr wypełnia widok nad dokiem i stoi na środku', async () => {
      const scale = expectedScale(flat, flat.diagram)
      assert.ok(Math.abs(zoomed.scale - scale) < 0.01, `${zoomed.scale} zamiast ${scale}`)
      const center = onScreen(zoomed, zoomed.diagram.x, zoomed.diagram.y)
      const screenWidth = zoomed.width * zoomed.scale
      const screenHeight = zoomed.height * zoomed.scale
      assert.ok(centered(center.x, screenWidth / 2, zoomed.scale), `x ${center.x} zamiast ${screenWidth / 2}`)
      const middle = (screenHeight - DOC_FOOT) / 2
      assert.ok(centered(center.y, middle, zoomed.scale), `y ${center.y} zamiast ${middle}`)
    })

    await check('zoom nie zmienia układu dokumentu', async () => {
      assert.equal(zoomed.scrollHeight, flat.scrollHeight)
      assert.equal(zoomed.diagram.width, flat.diagram.width)
      assert.equal(zoomed.clientWidth, flat.clientWidth)
      assert.equal(zoomed.resizes, flat.resizes)
    })

    await check('karteczka zostaje w swoim rozmiarze na ekranie', async () => {
      const note = await scan(app, url, 'note')
      assert.ok(Math.abs(note.width - noteFlat.width) <= 3, `${note.width} zamiast ${noteFlat.width}`)
      assert.ok(Math.abs(note.height - noteFlat.height) <= 3, `${note.height} zamiast ${noteFlat.height}`)
    })

    await check('ręka prezentera zostaje w swoim rozmiarze', async () => {
      const hand = await handPixels()
      const ratio = hand / handFlat
      assert.ok(ratio > 0.7 && ratio < 1.4, `${hand} pikseli zamiast ok. ${handFlat}`)
    })

    await check('powiększony dokument żyje, a klik trafia w to, co widać', async () => {
      const now = await metrics(page)
      assert.ok(now.ticks > zoomed.ticks, 'skrypty dokumentu stoją')
      await clickAt(app, url, onScreen(now, now.button.x, now.button.y))
      await until(page, () => window.klik.includes('przycisk'))
    })

    await check('komentarz pod zoomem trafia w miejsce kliknięcia', async () => {
      const now = await metrics(page)
      const target = { x: now.diagram.left + now.diagram.width * 0.25, y: now.diagram.top + now.diagram.height * 0.3 }
      const point = onScreen(now, target.x, target.y)
      await layer.locator('.tb[data-tool="comment"]').click()
      await until(
        page,
        ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'BIBLIOTTER-OVERLAY',
        target
      )
      await clickAt(app, url, point)
      await shell.locator('.draft .bubble').waitFor()
      // Szkic w powłoce stoi tam, gdzie pinezka na ekranie widoku: róg pinezki to czubek minus jej wymiary.
      const draft = await shell.evaluate(() => {
        const sheet = document.querySelector('.draft').closest('.sheet').getBoundingClientRect()
        const at = document.querySelector('.draft').getBoundingClientRect()
        return { x: at.left - sheet.left, y: at.top - sheet.top }
      })
      assert.ok(Math.abs(draft.x - (point.x - 1)) < 4 && Math.abs(draft.y - (point.y - 24)) < 4, JSON.stringify({ draft, point }))
      await shell.getByLabel('Treść uwagi').fill('Komentarz pod zoomem')
      await shell.getByRole('button', { name: 'Zapisz' }).click()
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      const anchor = await shell.evaluate(async () => {
        const list = await window.api.listAnnotations()
        return list.find((item) => item.messages?.[0]?.text === 'Komentarz pod zoomem')?.anchor
      })
      assert.ok(anchor, 'komentarz nie zapisał się')
      assert.equal(await page.evaluate((selector) => document.querySelector(selector)?.id, anchor.selector), 'diagram')
      assert.ok(Math.abs(anchor.offsetX - 0.25) < 0.02 && Math.abs(anchor.offsetY - 0.3) < 0.02, JSON.stringify(anchor))
      await page.keyboard.press('Escape')
      await page.keyboard.press('v')
      await delay(300)
    })

    await check('skok w odległe miejsce jedzie kamerą po stronie bez pustej klatki', async () => {
      const start = await page.evaluate(() => {
        const trail = []
        window.__trail = trail
        const tick = () => {
          if (window.__trail !== trail) return
          trail.push([visualViewport.pageTop, visualViewport.scale])
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        return visualViewport.pageTop
      })
      const { moved, frames } = await aim(shell, docId, { anchor: anchorOf('#daleko') })
      const trail = await page.evaluate(() => {
        const list = window.__trail
        window.__trail = null
        return list
      })
      assert.equal(moved, true)
      // Oddalenie i zbliżenie idą na zrzutach, a przejazd po żywej stronie, więc zrzutów jest mniej.
      assert.ok(frames.length >= 4, `za mało klatek ruchu: ${frames.length}`)
      for (const [index, list] of frames.entries()) {
        assert.ok(list.some(({ opacity }) => opacity >= 0.99), `pusta klatka ${index}: ${JSON.stringify(list)}`)
      }
      // W przejeździe widok przesuwa się co klatkę w jedną stronę, w stałej skali.
      const end = trail[trail.length - 1][0]
      const between = trail.filter(([top]) => (top - start) * (end - top) > 0)
      const tops = [...new Set(between.map(([top]) => Math.round(top)))]
      assert.ok(tops.length >= 10, `za mało klatek przejazdu: ${tops.length} (${start} → ${end})`)
      assertMonotonic(
        between.map(([top]) => top * Math.sign(end - start)),
        1,
        'przejazd'
      )
      await documentIsLive(shell)
      const now = await metrics(page)
      const center = onScreen(now, now.far.x, now.far.y)
      const facts = JSON.stringify({ center, now })
      assert.ok(centered(center.x, (now.width * now.scale) / 2, now.scale), facts)
      assert.ok(centered(center.y, (now.height * now.scale - DOC_FOOT) / 2, now.scale), facts)
      assert.ok(now.scale > 1.5, String(now.scale))
    })

    await check('powrót oddala kamerę do całej strony bez zmiany układu', async () => {
      const before = await metrics(page)
      const { moved, frames } = await aim(shell, docId, null)
      assert.equal(moved, true)
      assertCovered(frames)
      // Przy oddaleniu szerszy zrzut leży pod spodem, a zbliżenie maleje na wierzchu.
      assertMonotonic(frames.map(([, start]) => start.scale), -1, 'skala zbliżenia')
      await documentIsLive(shell)
      await delay(300)
      const after = await metrics(page)
      assert.equal(after.scale, 1)
      assert.equal(after.scrollHeight, flat.scrollHeight)
      assert.equal(after.resizes, flat.resizes)
      // Oddalenie zostawia stronę tam, gdzie był kadr.
      const far = onScreen(after, after.far.x, after.far.y)
      assert.ok(far.y > 0 && far.y < after.clientHeight, JSON.stringify({ far, before: before.scale }))
      const note = await scan(app, url, 'note')
      assert.equal(note.count, 0)
    })

    await check('karteczka po powrocie ma ten sam rozmiar co przed zoomem', async () => {
      await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
      await delay(500)
      const note = await scan(app, url, 'note')
      assert.ok(Math.abs(note.width - noteFlat.width) <= 1, `${note.width} zamiast ${noteFlat.width}`)
    })

    await check('kamera nie zgłasza błędów', async () => assert.deepEqual(errors, []))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-camera-'))
  try {
    await cameraFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
