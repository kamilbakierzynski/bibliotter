// Test końcowy na prawdziwym Electronie: izolacja dokumentu oraz działanie JS.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron } from 'playwright-core'
import { autoLabelFlow } from './autoLabel.mjs'
import { cameraFlow } from './camera.mjs'
import { ticketsFlow } from './tickets.mjs'
import { findFlow } from './find.mjs'
import { htmlLinkFlow } from './htmlLinks.mjs'
import { pairFlow } from './pair.mjs'
import { languageFlow } from './language.mjs'
import { mathFlow } from './math.mjs'
import { optionsFlow } from './options.mjs'
import { outlineFlow } from './outline.mjs'
import { rowMenuFlow } from './rowMenu.mjs'
import { presentFlow } from './present.mjs'
import { routeFlow } from './route.mjs'
import { shapesFlow } from './shapes.mjs'
import { skeletonFlow } from './skeleton.mjs'
import { undoFlow } from './undo.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')
const silosDoc = 'C:/Users/bakie/projects/silos/Silos-pivot-lamiglowki-v2.html'

const results = []
async function check(name, run) {
  try {
    await run()
    results.push(['OK', name])
    if (process.env.E2E_TRACE) console.log('OK   ', name)
  } catch (error) {
    results.push(['BŁĄD', `${name}: ${error.message.split('\n')[0]}`])
    if (process.env.E2E_TRACE) console.log('BLAD ', name, error.message)
  }
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function startLeakSink() {
  const hits = []
  const server = createServer((request, response) => {
    hits.push(`http ${request.method} ${request.url}`)
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.end('ok')
  })
  server.on('upgrade', (request, socket) => {
    hits.push(`ws ${request.url}`)
    socket.destroy()
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))

  const udp = createSocket('udp4')
  udp.on('message', () => hits.push('udp stun'))
  await new Promise((done) => udp.bind(0, '0.0.0.0', done))

  return {
    hits,
    httpPort: server.address().port,
    udpPort: udp.address().port,
    stop() {
      server.closeAllConnections()
      server.close()
      udp.close()
    }
  }
}

// Chromium nie wysyła STUN na adres pętli zwrotnej, więc próba WebRTC idzie przez adres LAN.
const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((address) => address.family === 'IPv4' && !address.internal)?.address

const leakDoc = (httpPort, udpPort) => `<!doctype html><title>Napastnik</title>
<body><p id="status">start</p><a id="link" href="https://example.com/klik">link</a>
<form id="form" action="http://127.0.0.1:${httpPort}/form" method="post" target="ramka"><input name="a" value="1"></form>
<iframe name="ramka" src="http://127.0.0.1:${httpPort}/iframe"></iframe>
<link rel="stylesheet" href="http://127.0.0.1:${httpPort}/css">
<script src="http://127.0.0.1:${httpPort}/script.js"></script>
<script>
const base = 'http://127.0.0.1:${httpPort}'
window.probes = {}
const note = (name, run) => { try { run() } catch (error) { window.probes[name] = String(error) } }
fetch(base + '/fetch').catch(() => {})
fetch(base + '/no-cors', { mode: 'no-cors' }).catch(() => {})
new Image().src = base + '/img'
note('beacon', () => navigator.sendBeacon(base + '/beacon', 'dane'))
note('ws', () => new WebSocket('ws://127.0.0.1:${httpPort}/ws'))
note('rtc', () => {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:${lanAddress()}:${udpPort}' }] })
  pc.createDataChannel('x')
  pc.createOffer().then((offer) => pc.setLocalDescription(offer))
})
setTimeout(() => document.getElementById('form').submit(), 800)
window.open(base + '/popup')
setTimeout(() => { location.href = base + '/navigate' }, 2400)
setTimeout(() => { const m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=' + base + '/meta'; document.head.append(m) }, 1800)
fetch('htmldoc://dinnydokument/').then(() => { window.probes.crossDoc = 'odczytano' }).catch(() => { window.probes.crossDoc = 'zablokowano' })
window.probes.globals = [typeof require, typeof process, typeof window.api, typeof ipcRenderer].join(',')
document.getElementById('status').textContent = 'gotowe'
</script></body>`

const interactiveDoc = `<!doctype html><title>Interaktywny</title>
<body><h1 id="top">Quiz</h1><img id="obraz" src="pixel.svg" alt="">
<button id="plus">Dodaj</button><output id="wynik"></output>
<a id="kotwica" href="#dol">w dół</a><div style="height:3000px"></div><h2 id="dol">Dół</h2>
<script>
const key = 'licznik'
const show = () => { document.getElementById('wynik').textContent = localStorage.getItem(key) ?? '0' }
document.getElementById('plus').addEventListener('click', () => {
  localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1)); show()
})
show()
</script></body>`

/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

function attachDocument(app) {
  return async (fragment) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await page.title().catch(() => '')).includes(fragment)) return page
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${fragment}”`)
  }
}

/** Otwarty przed chwilą arkusz jest najpierw zrzutem, a dopiero potem żywym widokiem. */
const documentIsLive = (shell) => shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))

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

const docRow = (shell, name) => shell.locator('.row[data-doc]', { hasText: name })
const railTab = (shell, view) => shell.locator(`.rb[data-view="${view}"]`)

/** Arkusz na scenie. Pozostałe sloty czekają zwinięte. */
const stageSheet = (shell) =>
  shell.evaluate(() => {
    const { top, width, height } = [...document.querySelectorAll('.sheet')]
      .map((sheet) => sheet.getBoundingClientRect())
      .sort((a, b) => b.width - a.width)[0]
    return { top, width, height }
  })

/**
 * Przyciski na górnym pasku, które zamiast kliknięcia chwytają okno. Chromium składa obszar chwytu
 * z prostokątów elementów z drag i no-drag po kolei w DOM, więc w danym punkcie wygrywa ostatni z nich.
 * Ten model zgadzał się z WM_NCHITTEST w każdym zbadanym punkcie, a kosztuje jedno evaluate.
 * Otwarty flyout staje przy przycisku widoku, poniżej paska, więc tu go nie ma.
 */
function topEdgeGrabs() {
  const bar = document.querySelector('.titlebar').getBoundingClientRect()
  const regions = []
  for (const element of document.querySelectorAll('*')) {
    const style = getComputedStyle(element)
    const region = style.webkitAppRegion
    if (style.visibility === 'visible' && (region === 'drag' || region === 'no-drag')) {
      regions.push({ rect: element.getBoundingClientRect(), drag: region === 'drag' })
    }
  }
  const dragsAt = (x, y) =>
    regions.findLast(({ rect }) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom)?.drag ?? false
  const name = (element) => (element.id ? `#${element.id}` : `${element.localName}.${[...element.classList].join('.')}`)

  const onBar = []
  const grabbing = []
  const controls = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"]), .nav-grip'
  for (const element of document.querySelectorAll(controls)) {
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const r = element.getBoundingClientRect()
    const left = Math.max(r.left, bar.left)
    const right = Math.min(r.right, bar.right)
    const top = Math.max(r.top, bar.top)
    const bottom = Math.min(r.bottom, bar.bottom)
    if (right - left < 1 || bottom - top < 1) continue
    // Siatka punktów na części paska, w którą trafia kliknięcie w ten element, a nie w coś nad nim.
    const points = [0.2, 0.5, 0.8]
      .flatMap((fx) => [0.2, 0.5, 0.8].map((fy) => [left + (right - left) * fx, top + (bottom - top) * fy]))
      .filter(([x, y]) => element.contains(document.elementFromPoint(x, y)))
    if (points.length === 0) continue
    onBar.push(element)
    if (points.some(([x, y]) => dragsAt(x, y))) grabbing.push(name(element))
  }
  const missing = ['.logo', '.nav-chev', '.nav-grip'].filter((selector) => !onBar.some((element) => element.matches(selector)))
  return { missing, grabbing }
}

const DOCUMENT_BODY =`<style>body { margin: 16px }</style><h1>Temat</h1><h2>Cel</h2><h2>Ryzyka</h2>
<p>${'Akapit opisujący łamigłówki i decyzje projektowe. '.repeat(30)}</p>`

/** Dopisuje treść, dzięki której plik testowy zostanie rozpoznany jako dokument. */
const asDocument = (html) => html.replace('<body>', `<body>${DOCUMENT_BODY}`)

const documentNamed = (title, marker = '') =>
  `<!doctype html><title>${title}</title><body>${DOCUMENT_BODY}<p id="marker">${marker}</p></body>`

async function libraryFlow(workspace) {
  const home = join(workspace, 'flow-home')
  const docs = join(workspace, 'flow-docs')
  const profile = join(workspace, 'flow-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'stary.html'), documentNamed('Stary dokument'))

  const launch = () =>
    electron.launch({
      args: [projectRoot, `--user-data-dir=${profile}`],
      env: { ...process.env, BIBLIOTTER_HOME: home }
    })

  let app = await launch()
  try {
    const shell = await app.firstWindow()
    const layer = await dockLayer(app, shell)
    const findDocument = attachDocument(app)
    const row = (name) => docRow(shell, name)
    await row('stary').waitFor()

    await check('górną krawędź okna da się chwycić na całej szerokości', async () => {
      const bar = await shell.evaluate(() => {
        const element = document.querySelector('.titlebar')
        const { top, width } = element.getBoundingClientRect()
        return {
          top,
          missing: width < innerWidth,
          region: getComputedStyle(element).webkitAppRegion,
          closedFlyout: getComputedStyle(document.getElementById('flyout')).webkitAppRegion,
          // Wycięcia działają po kolei, więc pasek stoi w DOM przed tym, co na nim leży.
          beforeControls: Boolean(element.compareDocumentPosition(document.getElementById('homeBtn')) & Node.DOCUMENT_POSITION_FOLLOWING)
        }
      })
      assert.deepEqual(bar, { top: 0, missing: false, region: 'drag', closedFlyout: 'none', beforeControls: true })
    })

    await check('przyciski na górnym pasku przyjmują kliknięcia, a nie chwytają okna', async () => {
      const { missing, grabbing } = await shell.evaluate(topEdgeGrabs)
      assert.deepEqual(missing, [], `nie leżą na pasku: ${missing.join(', ')}`)
      assert.deepEqual(grabbing, [], `chwytają okno: ${grabbing.join(', ')}`)
    })

    await check('nowy plik pojawia się bez ręcznego skanowania', async () => {
      await writeFile(join(docs, 'nowy.html'), documentNamed('Nowy dokument', 'pierwsza'))
      await row('nowy').waitFor({ timeout: 8000 })
    })

    await check('otwarcie oznacza dokument jako przeczytany', async () => {
      await row('nowy').click()
      await findDocument('Nowy dokument')
      await layer.locator('#statusBtn', { hasText: 'Przeczytane' }).waitFor()
    })

    await check('R w dokumencie kopiuje odnośnik, a przycisk to potwierdza', async () => {
      const saved = await app.evaluate(({ clipboard }) => clipboard.readText())
      try {
        const page = await findDocument('Nowy dokument')
        await page.keyboard.press('r')
        await layer.locator('#refBtn[data-tip="Skopiowano odnośnik"]').waitFor()
        const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
        assert.match(copied, /^\[Nowy dokument\]\(bibliotter:[0-9a-z]{10}\)$/)
      } finally {
        await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), saved)
      }
    })

    const labelInput = shell.locator('#labelInput')
    await check('L w dokumencie otwiera wybierak etykiet z pustym polem', async () => {
      const page = await findDocument('Nowy dokument')
      await page.keyboard.press('l')
      await shell.locator('#labelPop.on').waitFor()
      assert.equal(await labelInput.inputValue(), '')
    })

    await check('nowa etykieta powstaje z pola, a wybierak zostaje otwarty', async () => {
      await labelInput.fill('PR review')
      await labelInput.press('Enter')
      await shell.locator('.placard .tag.label', { hasText: 'PR review' }).waitFor()
      await layer.locator('#labelBtn em', { hasText: '1' }).waitFor()
      assert.equal(await labelInput.inputValue(), '')
      await shell.locator('#labelPop.on [role="menuitemcheckbox"][aria-checked="true"]', { hasText: 'PR review' }).waitFor()
    })

    await check('Esc zamyka wybierak i nie zamyka arkusza', async () => {
      await labelInput.press('Escape')
      await shell.locator('#labelPop.on').waitFor({ state: 'detached' })
      await shell.locator('.placard .tag.label', { hasText: 'PR review' }).waitFor()
    })

    await check('widok Etykiety pokazuje dokumenty z etykietą z każdego projektu', async () => {
      await railTab(shell, 'labels').click()
      await shell.locator('#panelItems .row', { hasText: 'PR review' }).click()
      await docRow(shell, 'nowy').waitFor()
      await railTab(shell, 'library').click()
    })

    await check('paleta filtruje po etykiecie także pod nazwą label:', async () => {
      await layer.locator('#cmdBtn').click()
      await layer.locator('#cmdInput').fill('label:')
      await layer.locator('.cr', { hasText: 'PR review' }).waitFor()
      await layer.locator('#cmdInput').press('Enter')
      await layer.locator('.f-chip', { hasText: 'PR review' }).waitFor()
      await layer.locator('.cr', { hasText: 'Nowy dokument' }).waitFor()
      assert.equal(await layer.locator('.cr', { hasText: 'Stary dokument' }).count(), 0)
      await layer.locator('#cmdInput').press('Escape')
    })

    await check('zmiana otwartego pliku proponuje nową wersję', async () => {
      await writeFile(join(docs, 'nowy.html'), documentNamed('Nowy dokument', 'druga'))
      const button = shell.getByRole('button', { name: 'Pokaż nową wersję' })
      await button.waitFor({ timeout: 8000 })
      await button.click()
      const page = await findDocument('Nowy dokument')
      await page.waitForFunction(() => document.getElementById('marker')?.textContent === 'druga')
    })

    await check('zmieniony dokument wraca do przeczytania i do skrzynki', async () => {
      await railTab(shell, 'inbox').click()
      await row('Nowy dokument').waitFor()
      await railTab(shell, 'library').click()
    })

    await check('wyszukiwanie znajduje treść bez polskich znaków', async () => {
      await layer.locator('#cmdBtn').click()
      await layer.locator('#cmdInput').fill('lamiglowki')
      const mark = layer.locator('.cr .snippet mark').first()
      await mark.waitFor()
      assert.equal(await mark.textContent(), 'łamigłówki')
      await layer.keyboard.press('Escape')
      await layer.locator('.dock.wide').waitFor({ state: 'detached' })
    })

    await check('status można zmienić ręcznie', async () => {
      await layer.locator('#statusBtn').click()
      await shell.locator('[data-status="to-decide"]').click()
      await shell.locator('.row[data-doc] .dot.decide').waitFor()
    })

    await check('niepewny plik można dodać do biblioteki', async () => {
      const prose = 'Długi tekst bez nagłówków, który nie wygląda na pełny dokument. '.repeat(20)
      await writeFile(join(docs, 'prawie.html'), `<title>Prawie</title><style>p{}</style><p>${prose}</p>`)
      await railTab(shell, 'review').locator('i').waitFor({ timeout: 8000 })
      await railTab(shell, 'review').click()
      await row('Prawie').click()
      await shell.getByRole('button', { name: 'Dodaj do biblioteki' }).click()
      await railTab(shell, 'library').click()
      await row('prawie').waitFor()
    })

    await check('po usunięciu oryginału zostaje zachowana kopia', async () => {
      await rm(join(docs, 'stary.html'))
      await row('stary').locator('.tag').waitFor({ timeout: 8000 })
      await row('stary').click()
      await findDocument('Stary dokument')
      await shell.locator('.notice', { hasText: 'zachowana kopia' }).waitFor()
    })
  } finally {
    await app.close()
  }

  app = await launch()
  try {
    const shell = await app.firstWindow()
    await check('status i kopia przetrwają ponowne uruchomienie', async () => {
      await shell.locator('.row[data-doc] .dot.decide').waitFor()
      await docRow(shell, 'stary').locator('.tag').waitFor()
    })
    await docRow(shell, 'nowy').click()
    await delay(500)
    await shell.screenshot({ path: join(artifacts, 'library.png') })
  } finally {
    await app.close()
  }

  const metaFolders = await readdir(join(home, 'library'))
  await check('dane dokumentów są zwykłymi plikami w folderze użytkownika', async () => {
    assert.ok(metaFolders.length >= 3, metaFolders.join())
    const meta = JSON.parse(await readFile(join(home, 'library', metaFolders[0], 'meta.json'), 'utf8'))
    assert.ok(meta.versions.length >= 1)
    assert.equal(await readFile(join(home, '.gitignore'), 'utf8'), 'cache/\nstate/\n')
  })
}

const annotatedDoc = (extra) => `<!doctype html><title>Dokument z uwagami</title><body>${DOCUMENT_BODY}
${extra}
<h2>Dalszy ciąg</h2><p id="cel">Tu ma trafić karteczka na spotkanie.</p>
<script>for (const type of ['mousedown', 'click']) {
  window.addEventListener(type, () => { window.klikniecia = (window.klikniecia ?? 0) + 1 }, true)
}</script>
</body>`

/** Środek elementu w dokumencie. Pinezki są w zamkniętym Shadow DOM, więc trafiamy w nie myszą. */
const centerOf = (page, selector) =>
  page.locator(selector).evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  })

const overlayCovers = (page, point) =>
  page.waitForFunction(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'BIBLIOTTER-OVERLAY',
    point,
    { timeout: 5000 }
  )

/** Ręka leży w zamkniętym Shadow DOM, więc jej obecność widać tylko na obrazie strony. */
const handOn = async (page, baseline) => !(await page.screenshot()).equals(baseline)

const leaveDocument = (app, url) =>
  app.evaluate(({ webContents }, target) => {
    webContents.getAllWebContents().find((item) => item.getURL() === target).sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 })
  }, url)

/** Liczba kolorów w prostokącie zrzutu arkusza. Pusty fragment dokumentu ma jeden kolor. */
const frameColors = (shell, x, y, width, height) =>
  shell.evaluate(
    (box) => {
      const canvas = document.querySelector('canvas.sheet-frame')
      const scale = canvas.width / canvas.getBoundingClientRect().width
      const pixels = canvas
        .getContext('2d')
        .getImageData(box.x * scale, box.y * scale, box.width * scale, box.height * scale).data
      const colors = new Set()
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`)
      return colors.size
    },
    { x, y, width, height }
  )

async function pointerFlow(workspace) {
  const home = join(workspace, 'pointer-home')
  const docs = join(workspace, 'pointer-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(
    join(docs, 'wskaznik.html'),
    annotatedDoc('<button id="akcja">Zatwierdź wariant</button><div style="height: 2400px"></div>')
  )
  await writeFile(join(docs, 'drugi.html'), documentNamed('Drugi dokument'))

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'pointer-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    const layer = await dockLayer(app, shell)
    shell.setDefaultTimeout(6000)
    layer.setDefaultTimeout(6000)
    const findDocument = attachDocument(app)
    const errors = []
    const cursorOf = (page, selector) =>
      page.locator(selector).evaluate((element) => getComputedStyle(element).cursor)
    const tool = (name) => shell.locator(`#app[data-tool="${name}"]`).waitFor({ state: 'attached' })

    await docRow(shell, 'Dokument z uwagami').click()
    const page = await findDocument('Dokument z uwagami')
    await page.waitForLoadState('load')
    await documentIsLive(shell)
    await delay(400)
    page.on('pageerror', (error) => errors.push(String(error)))
    const target = await centerOf(page, '#akcja')
    const baseline = await page.screenshot()

    await check('skrót P włącza wskaźnik i chowa kursor tylko w dokumencie', async () => {
      await page.keyboard.press('p')
      await tool('pointer')
      await layer.locator('.tb[data-tool="pointer"].on').waitFor()
      assert.equal(await cursorOf(page, '#akcja'), 'none')
      assert.notEqual(await cursorOf(shell, 'body'), 'none')
    })

    await check('ręka pojawia się dopiero nad dokumentem', async () => {
      assert.equal(await handOn(page, baseline), false)
      await page.mouse.move(target.x, target.y)
      await delay(700)
      assert.equal(await handOn(page, baseline), true)
    })

    await check('kliknięcie uderza w ekran zamiast uruchamiać dokument', async () => {
      const before = await page.screenshot()
      await page.mouse.down()
      await delay(120)
      const struck = await page.screenshot()
      await page.mouse.up()
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
      assert.ok(!struck.equals(before))
    })

    await check('ręka znika, gdy mysz wychodzi z dokumentu', async () => {
      await delay(900)
      await leaveDocument(app, page.url())
      await delay(700)
      assert.equal(await handOn(page, baseline), false)
    })

    await check('przytrzymany przycisk zostawia linię, a prawy ją kasuje', async () => {
      const line = async (x, y) => {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await delay(120)
        await page.mouse.move(x + 160, y + 40, { steps: 8 })
        await page.mouse.up()
      }
      await line(target.x - 200, target.y - 120)
      await delay(900)
      await leaveDocument(app, page.url())
      await delay(700)
      assert.equal(await handOn(page, baseline), true)
      await page.mouse.click(target.x, target.y, { button: 'right' })
      await delay(400)
      await leaveDocument(app, page.url())
      await delay(700)
      assert.equal(await handOn(page, baseline), false)
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('linia chowa się z narzędziem i wraca z nim', async () => {
      await page.mouse.move(target.x, target.y)
      await page.mouse.down()
      await page.mouse.move(target.x + 120, target.y, { steps: 6 })
      await page.mouse.up()
      await delay(1000)
      await leaveDocument(app, page.url())
      await page.keyboard.press('v')
      await tool('move')
      await delay(700)
      assert.equal(await handOn(page, baseline), false)
      await page.keyboard.press('p')
      await tool('pointer')
      await delay(300)
      assert.equal(await handOn(page, baseline), true)
      await page.mouse.click(target.x, target.y, { button: 'right' })
      await delay(400)
    })

    await check('kółko przewija dokument pod ręką', async () => {
      await page.mouse.move(target.x, target.y)
      await page.mouse.wheel(0, 320)
      await page.waitForFunction(() => scrollY > 0)
      await page.evaluate(() => scrollTo(0, 0))
    })

    await check('wskaźnik obejmuje też arkusz otwarty obok', async () => {
      await layer.keyboard.press('Control+\\')
      const second = await findDocument('Drugi dokument')
      await second.waitForLoadState('load')
      await documentIsLive(shell)
      await second.waitForFunction(() => getComputedStyle(document.body).cursor === 'none')
      assert.equal(await cursorOf(page, '#akcja'), 'none')
      await tool('pointer')
      // Złożenie zostawia arkusz z fokusem, a ten należy do drugiego dokumentu.
      await layer.keyboard.press('Control+ArrowLeft')
      await layer.keyboard.press('Control+\\')
      await documentIsLive(shell)
    })

    await check('ręka nie zostaje na zrzucie arkusza', async () => {
      await page.evaluate(() => scrollTo(0, 2000))
      await page.mouse.move(420, 300)
      await delay(700)
      await layer.keyboard.press('Control+k')
      await layer.locator('.dock.wide').waitFor()
      await shell.locator('canvas.sheet-frame').first().waitFor()
      assert.equal(await frameColors(shell, 400, 300, 80, 200), 1)
      await layer.keyboard.press('Escape')
      await layer.locator('.dock.wide').waitFor({ state: 'detached' })
      await documentIsLive(shell)
      await page.evaluate(() => scrollTo(0, 0))
    })

    await check('V oddaje dokumentowi mysz i kursor', async () => {
      await page.keyboard.press('v')
      await tool('move')
      await page.waitForFunction(() => getComputedStyle(document.getElementById('akcja')).cursor !== 'none')
      await page.mouse.click(target.x, target.y)
      assert.equal(await page.evaluate(() => window.klikniecia), 2)
    })

    await check('wskaźnik jest w doku i wyłącza się na ekranie startowym', async () => {
      await layer.locator('.tb[data-tool="pointer"]').click()
      await tool('pointer')
      await page.keyboard.press('h')
      await tool('move')
      await page.waitForFunction(() => getComputedStyle(document.body).cursor !== 'none')
    })

    await check('wskaźnik nie zgłasza błędów w dokumencie', async () => assert.deepEqual(errors, []))
  } finally {
    await app.close()
  }
}

/** Kolory wycinka zrzutu. Dekoduje go powłoka, bo test nie ma własnego czytnika PNG. */
const pixelsOf = (shell, png, x, y, width, height) =>
  shell.evaluate(
    async ({ data, x, y, width, height }) => {
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))]))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      context.drawImage(image, -x, -y)
      const { data: bytes } = context.getImageData(0, 0, width, height)
      const list = []
      for (let i = 0; i < bytes.length; i += 4) list.push([bytes[i], bytes[i + 1], bytes[i + 2]])
      return list
    },
    { data: png.toString('base64'), x, y, width, height }
  )

async function markerFlow(workspace) {
  const home = join(workspace, 'marker-home')
  const docs = join(workspace, 'marker-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(
    join(docs, 'zakreslacz.html'),
    annotatedDoc(
      '<p id="temat" style="font: 16px/28px sans-serif; max-width: 680px">Ten fragment trzeba poruszyć na spotkaniu z zespołem, bo zmienia termin wdrożenia.</p><p id="drugi" style="font: 16px/28px sans-serif">Drugi akapit też warto zakreślić innym kolorem.</p><div style="height: 1600px"></div>'
    )
  )
  await writeFile(join(docs, 'drugi.html'), documentNamed('Drugi dokument'))

  const highlights = async () => {
    const library = join(home, 'library')
    const found = []
    for (const doc of await readdir(library).catch(() => [])) {
      const folder = join(library, doc, 'annotations')
      for (const file of await readdir(folder).catch(() => [])) {
        // Zapis idzie przez plik tymczasowy, którego nie wolno czytać w połowie.
        if (!file.endsWith('.json')) continue
        const item = JSON.parse(await readFile(join(folder, file), 'utf8'))
        if (item.kind === 'highlight') found.push(item)
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

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'marker-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    const layer = await dockLayer(app, shell)
    shell.setDefaultTimeout(6000)
    layer.setDefaultTimeout(6000)
    const findDocument = attachDocument(app)
    const errors = []
    const tool = (name) => shell.locator(`#app[data-tool="${name}"]`).waitFor({ state: 'attached' })
    const swipe = async (from, to, steps = 12) => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await delay(80)
      await page.mouse.move(to.x, to.y, { steps })
      await delay(120)
      await page.mouse.up()
    }

    await docRow(shell, 'Dokument z uwagami').click()
    const page = await findDocument('Dokument z uwagami')
    await page.waitForLoadState('load')
    await documentIsLive(shell)
    await delay(400)
    page.on('pageerror', (error) => errors.push(String(error)))
    const box = await page.locator('#temat').boundingBox()
    const line = box.y + 14
    const wide = await page.evaluate(() => innerWidth)
    const clean = await page.screenshot()

    await check('skrót M włącza zakreślacz, kolory w tacy i chowa kursor', async () => {
      await page.keyboard.press('m')
      await tool('highlight')
      await layer.locator('.tb[data-tool="highlight"].on').waitFor()
      await layer.locator('#trayIn[data-tray="highlight"] .swatch.yellow.on').waitFor()
      assert.equal(await page.locator('#temat').evaluate((element) => getComputedStyle(element).cursor), 'none')
    })

    await check('przy kursorze stoi model, a znika po wyjściu z dokumentu', async () => {
      await page.mouse.move(box.x + 300, box.y + 120)
      await delay(600)
      assert.equal(await handOn(page, clean), true)
      await leaveDocument(app, page.url())
      await delay(600)
      assert.equal(await handOn(page, clean), false)
    })

    await check('przeciągnięcie zapisuje zakreślenie z cytatem', async () => {
      await swipe({ x: box.x + 4, y: line }, { x: box.x + 340, y: line + 1 })
      await page.mouse.down()
      await page.mouse.up()
      const [saved] = await until(async () => {
        const list = await highlights()
        return list.length > 0 && list
      })
      assert.equal(saved.color, 'yellow')
      assert.equal(saved.audience, 'me')
      assert.equal(saved.status, 'open')
      assert.equal(saved.anchor.selector, '#temat')
      assert.match(saved.anchor.quote, /fragment trzeba/)
      assert.equal(saved.anchorWidth, box.width)
      assert.equal(saved.strokes.length, 1)
      assert.deepEqual(saved.messages, [])
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('tusz barwi papier i nie przykrywa tekstu', async () => {
      await page.mouse.move(box.x + 500, box.y + 300)
      await leaveDocument(app, page.url())
      await delay(1100)
      const shot = await page.screenshot()
      const pixels = await pixelsOf(shell, shot, Math.round(box.x + 20), Math.round(line - 8), 300, 16)
      const paper = pixels.filter(([r, g, b]) => r > 220 && g > 200 && b < 170)
      const text = pixels.filter(([r, g, b]) => r < 90 && g < 90 && b < 90)
      assert.ok(paper.length > 300, `żółtych pikseli: ${paper.length}`)
      assert.ok(text.length > 80, `ciemnych pikseli: ${text.length}`)
    })

    await check('linie położone jedna po drugiej to jedno zakreślenie', async () => {
      const before = (await highlights()).length
      const second = await page.locator('#drugi').boundingBox()
      await swipe({ x: second.x + 4, y: second.y + 8 }, { x: second.x + 160, y: second.y + 8 }, 6)
      await delay(200)
      await swipe({ x: second.x + 4, y: second.y + 20 }, { x: second.x + 160, y: second.y + 20 }, 6)
      await until(async () => (await highlights()).length === before + 1)
      assert.equal((await highlights()).at(-1).strokes.length, 2)
    })

    await check('kolor z tacy zmienia model i zapisane zakreślenie', async () => {
      await layer.locator('.swatch.pink').click()
      await layer.locator('.swatch.pink.on').waitFor()
      await page.mouse.move(box.x + 300, box.y + 150)
      await delay(600)
      const before = (await highlights()).length
      await swipe({ x: box.x + 4, y: line + 28 }, { x: box.x + 200, y: line + 28 }, 6)
      await until(async () => (await highlights()).length === before + 1)
      assert.equal((await highlights()).at(-1).color, 'pink')
    })

    await check('prawy przycisk usuwa zakreślenie', async () => {
      // Plik jest już na dysku, a lista uwag dopiero jedzie do dokumentu.
      await delay(400)
      const before = (await highlights()).length
      await page.mouse.click(box.x + 100, line + 28, { button: 'right' })
      await until(async () => (await highlights()).length === before - 1)
    })

    await check('kod dokumentu nie widzi tuszu', async () => {
      const seen = await page.evaluate(() => document.querySelector('bibliotter-ink')?.shadowRoot)
      assert.equal(seen, null)
    })

    await check('V oddaje dokumentowi mysz i kursor', async () => {
      await page.keyboard.press('v')
      await tool('move')
      await page.waitForFunction(() => getComputedStyle(document.body).cursor !== 'none')
    })

    await check('zakreślenie jest na liście tematów dla mnie', async () => {
      await railTab(shell, 'notes').click()
      await shell.locator('.row[data-open-note]', { hasText: 'fragment trzeba' }).waitFor()
      await railTab(shell, 'library').click()
      await documentIsLive(shell)
    })

    await check('znacznik prowadzi do wątku, a notatka zostaje przy zakreśleniu', async () => {
      const saved = (await highlights())[0]
      const dot = { x: box.x + saved.anchor.offsetX * box.width, y: box.y + saved.anchor.offsetY * box.height }
      // Znacznik stoi nad końcem linii.
      await page.mouse.click(dot.x + 3, dot.y - 14)
      const thread = shell.locator('.th-pop .thread')
      await thread.waitFor()
      assert.match(await thread.locator('.th-text').innerText(), /fragment trzeba/)
      await thread.locator('.reply input').fill('Zapytać o termin')
      await thread.locator('.reply input').press('Enter')
      await until(async () => (await highlights())[0].messages[0]?.text === 'Zapytać o termin')
      await shell.locator('.th-pop .thread .reply input').press('Escape')
      await documentIsLive(shell)
    })

    await check('zakreślenia z notatką nie usuwa prawy przycisk', async () => {
      await page.keyboard.press('m')
      await tool('highlight')
      await page.mouse.click(box.x + 100, line, { button: 'right' })
      await delay(400)
      assert.equal((await highlights())[0].messages.length, 1)
      await page.keyboard.press('Escape')
      await tool('move')
    })

    await check('zakreślenia wracają po przeładowaniu dokumentu', async () => {
      await page.reload()
      await page.waitForLoadState('load')
      await delay(500)
      const shot = await page.screenshot()
      const pixels = await pixelsOf(shell, shot, Math.round(box.x + 20), Math.round(line - 8), 300, 16)
      assert.ok(pixels.filter(([r, g, b]) => r > 220 && g > 200 && b < 170).length > 300)
    })

    await check('zakreślacz obejmuje arkusz otwarty obok i idzie za szerokością tekstu', async () => {
      await page.keyboard.press('m')
      await tool('highlight')
      await layer.keyboard.press('Control+\\')
      const second = await findDocument('Drugi dokument')
      await second.waitForLoadState('load')
      await documentIsLive(shell)
      await second.waitForFunction(() => getComputedStyle(document.body).cursor === 'none')
      await delay(500)
      // Akapit ma teraz inne wiersze, a tusz ma leżeć na jego pierwszym wierszu, nie między nimi.
      const narrow = await page.locator('#temat').boundingBox()
      const shot = await page.screenshot()
      const row = await pixelsOf(shell, shot, Math.round(narrow.x + 20), Math.round(narrow.y + 6), 200, 16)
      assert.ok(row.filter(([r, g, b]) => r > 220 && g > 200 && b < 170).length > 300)
      await layer.keyboard.press('Control+ArrowLeft')
      await layer.keyboard.press('Control+\\')
      await documentIsLive(shell)
    })

    await check('na ciemnym dokumencie tusz świeci zamiast znikać', async () => {
      // Złożony podział może jeszcze rozciągać arkusz, a linia poza tekstem skaluje się z elementem.
      await page.waitForFunction((width) => innerWidth === width, wide)
      await delay(400)
      await page.evaluate(() => {
        document.body.style.cssText = 'background: #151517; color: #f4f4f5'
      })
      await page.mouse.move(box.x + 4, line + 60)
      await swipe({ x: box.x + 4, y: line + 100 }, { x: box.x + 300, y: line + 100 }, 6)
      await delay(1500)
      await page.mouse.move(box.x + 420, line + 240)
      await leaveDocument(app, page.url())
      await delay(600)
      const shot = await page.screenshot()
      const pixels = await pixelsOf(shell, shot, Math.round(box.x + 20), Math.round(line + 92), 260, 16)
      assert.ok(pixels.filter(([r, g, b]) => r > 60 && r > b + 12).length > 2000)
      await page.evaluate(() => {
        document.body.style.cssText = ''
      })
    })

    await check('zakreślacz wyłącza się na ekranie startowym', async () => {
      await page.keyboard.press('h')
      await tool('move')
      await page.waitForFunction(() => getComputedStyle(document.body).cursor !== 'none')
    })

    await check('zakreślacz nie zgłasza błędów w dokumencie', async () => assert.deepEqual(errors, []))
  } finally {
    await app.close()
  }
}

async function annotationFlow(workspace) {
  const home = join(workspace, 'notes-home')
  const docs = join(workspace, 'notes-docs')
  const profile = join(workspace, 'notes-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  const docPath = join(docs, 'uwagi.html')
  await writeFile(docPath, annotatedDoc('<button id="akcja">Zatwierdź wariant</button>'))

  const env = { ...process.env, BIBLIOTTER_HOME: home }
  const run = promisify(execFile)
  // Celowo systemowy Node, a nie ten z Electrona: agent uruchamia CLI i MCP bez apki.
  const cli = async (...args) => (await run(process.execPath, [join(projectRoot, 'out/main/cli.js'), ...args], { env })).stdout
  const launch = () => electron.launch({ args: [projectRoot, `--user-data-dir=${profile}`], env })

  const mcp = new Client({ name: 'test', version: '1.0.0' })
  await mcp.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(projectRoot, 'out/main/mcp.js')], env })
  )
  const tool = async (name, args = {}) => {
    const result = await mcp.callTool({ name, arguments: args })
    return JSON.parse(result.content[0].text)
  }

  let app = await launch()
  let commentId
  try {
    const shell = await app.firstWindow()
    const layer = await dockLayer(app, shell)
    shell.setDefaultTimeout(6000)
    layer.setDefaultTimeout(6000)
    const findDocument = attachDocument(app)
    const errors = []
    for (const surface of [shell, layer]) surface.on('pageerror', (error) => errors.push(String(error)))
    const thread = (text) => shell.locator('#threads .thread', { hasText: text })
    const save = async () => {
      await shell.getByRole('button', { name: 'Zapisz' }).click()
      await shell.locator('.bubble').waitFor({ state: 'detached' })
    }
    await docRow(shell, 'Dokument z uwagami').click()
    const page = await findDocument('Dokument z uwagami')
    await page.waitForLoadState('load')
    const target = await centerOf(page, '#akcja')

    await check('kliknięcie w trybie komentarza stawia pinezkę, a nie uruchamia dokumentu', async () => {
      await layer.locator('.tb[data-tool="comment"]').click()
      await overlayCovers(page, target)
      await page.mouse.click(target.x, target.y)
      await shell.locator('.draft .bubble').waitFor()
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('po wskazaniu miejsca klawiatura przechodzi do dymka', async () => {
      const focused = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => window.isVisible()).webContents.isFocused()
      )
      assert.equal(focused, true)
      assert.equal(await shell.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
    })

    await check('komentarz zapisuje się w dymku i w pliku', async () => {
      await shell.getByLabel('Treść uwagi').fill('Zmień nazwę tego przycisku')
      await save()
      await shell.locator('[data-moved="insp"] em', { hasText: '1' }).waitFor()
    })

    const pin = { x: target.x + 13, y: target.y - 13 }

    await check('kliknięcie pinezki otwiera wątek i nie trafia w dokument', async () => {
      await overlayCovers(page, pin)
      await page.mouse.click(pin.x, pin.y)
      await shell.locator('.th-pop .thread.on', { hasText: 'Zmień nazwę' }).waitFor()
      assert.equal(await page.evaluate(() => window.klikniecia), undefined)
    })

    await check('wątek przy pinezce ma własną wysokość', async () => {
      const box = await shell.locator('.th-pop').boundingBox()
      assert.ok(box.height > 60, String(box.height))
    })

    await check('agent widzi otwarty dokument i uwagę bez apki w tle (CLI)', async () => {
      const current = JSON.parse(await cli('current', '--json'))
      assert.equal(current.title, 'Dokument z uwagami')
      assert.match(await cli('read', 'current'), /Zatwierdź wariant/)
      const [comment] = JSON.parse(await cli('comments', 'current', '--json'))
      commentId = comment.id
      assert.equal(comment.heading, 'Ryzyka')
      assert.equal(comment.quote, 'Zatwierdź wariant')
      assert.equal(comment.messages[0].text, 'Zmień nazwę tego przycisku')
    })

    await check('prawdziwy klient MCP czyta dokument i odpowiada w wątku', async () => {
      const { tools } = await mcp.listTools()
      assert.equal(tools.length, 9)
      assert.equal((await tool('current_document')).title, 'Dokument z uwagami')
      const read = await tool('read_document', { document: 'current', limit: 20 })
      assert.equal(read.content.length, 20)
      assert.ok(read.nextOffset === 20 && read.totalLength > 20)
      assert.equal((await tool('list_comments', { document: 'current' }))[0].id, commentId)
      await tool('reply_comment', { id: commentId, text: 'Czy nazwa „Wybierz” będzie dobra?' })
    })

    await check('odpowiedź agenta pojawia się w otwartym wątku', async () => {
      await shell.locator('.th-pop .msg.agent', { hasText: 'Czy nazwa' }).waitFor({ timeout: 5000 })
      await shell.locator('.th-pop .th-flag', { hasText: 'Agent odpisał' }).waitFor()
    })

    await check('etykieta od agenta pojawia się w otwartej apce', async () => {
      assert.deepEqual(await tool('label_document', { document: 'current', add: ['Plan'] }), { labels: ['Plan'] })
      await shell.locator('.placard .tag.label', { hasText: 'Plan' }).waitFor({ timeout: 5000 })
    })

    await check('karteczka dla mnie jest ukryta przed agentem', async () => {
      await page.keyboard.press('Escape')
      await shell.locator('.th-pop').waitFor({ state: 'detached' })
      await page.locator('#cel').scrollIntoViewIfNeeded()
      const visible = await centerOf(page, '#cel')
      await layer.locator('.tb[data-tool="sticky"]').click()
      await layer.getByRole('button', { name: 'Niebieska' }).click()
      await overlayCovers(page, visible)
      await page.mouse.click(visible.x, visible.y)
      await shell.getByLabel('Treść uwagi').fill('Poruszyć na spotkaniu')
      await save()
      await page.keyboard.press('i')
      await thread('Poruszyć').locator('.th-mark.sticky.blue').waitFor()

      assert.doesNotMatch(await cli('comments'), /Poruszyć/)
      assert.match(await cli('comments', '--personal'), /Poruszyć/)
      assert.equal((await tool('list_comments')).length, 1)
    })

    await check('zbiorcza lista pokazuje tematy na spotkanie', async () => {
      await railTab(shell, 'notes').click()
      await shell.locator('[data-open-note]', { hasText: 'Poruszyć' }).click()
      await shell.locator('#threads .thread.on', { hasText: 'Poruszyć' }).waitFor()
      await railTab(shell, 'library').click()
    })

    await check('kod dokumentu nie widzi uwag ani mostu do apki', async () => {
      const probe = await page.evaluate(() => ({
        html: document.documentElement.outerHTML.includes('Poruszyć'),
        text: document.documentElement.textContent.includes('Zmień nazwę'),
        shadow: document.querySelector('bibliotter-overlay')?.shadowRoot ?? null,
        bridge: typeof window.api + typeof window.require + typeof window.ipcRenderer
      }))
      assert.deepEqual(probe, {
        html: false,
        text: false,
        shadow: null,
        bridge: 'undefinedundefinedundefined'
      })
    })

    await check('zaznaczony tekst od razu tworzy komentarz z cytatem', async () => {
      await page.evaluate(() => {
        const range = document.createRange()
        range.selectNodeContents(document.getElementById('cel'))
        getSelection().addRange(range)
      })
      await layer.locator('.tray-s .ask', { hasText: 'Skomentuj' }).click()
      await shell.locator('.draft .bubble').waitFor()
      await shell.getByLabel('Treść uwagi').fill('Cytat zostaje przy uwadze')
      await save()
      const comment = (await tool('list_comments')).find((item) => item.messages[0].text === 'Cytat zostaje przy uwadze')
      assert.match(comment.quote, /karteczka na spotkanie/)
    })

    await check('skrót C w dokumencie włącza tryb komentarza, a Escape go wyłącza', async () => {
      await page.mouse.click(5, 5)
      await page.keyboard.press('c')
      await layer.locator('.tb.on[data-tool="comment"]').waitFor()
      await page.keyboard.press('Escape')
      await layer.locator('.tb.on[data-tool="move"]').waitFor()
    })

    await check('uwaga do całego dokumentu nie ma kotwicy', async () => {
      await shell.getByRole('button', { name: 'Uwaga do całego dokumentu' }).click()
      await shell.getByLabel('Treść uwagi').fill('Skróć całość')
      await save()
      await thread('Skróć całość').waitFor()
      const comment = (await tool('list_comments')).find((item) => item.messages[0].text === 'Skróć całość')
      assert.equal(comment.heading, null)
    })

    await check('panel nie zgłasza błędów', async () => assert.deepEqual(errors, []))
    await shell.screenshot({ path: join(artifacts, 'notes.png') })
  } finally {
    await app.close()
  }

  await check('po zamknięciu apki żaden dokument nie jest bieżący', async () => {
    assert.equal(JSON.parse(await cli('current', '--json')), null)
    assert.equal(await tool('current_document'), null)
    await assert.rejects(cli('read', 'current'), /No document is open/)
  })

  await check('agent odpowiada także przy zamkniętej apce', async () => {
    await cli('reply', commentId, 'Zmienię po Twojej decyzji')
  })

  await writeFile(docPath, annotatedDoc('<p>Sekcja bez przycisku.</p>'))

  app = await launch()
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(6000)
    const thread = (text) => shell.locator('#threads .thread', { hasText: text })

    await check('uwagi i odpowiedź agenta przetrwają ponowne uruchomienie', async () => {
      await docRow(shell, 'Dokument z uwagami').click()
      await shell.locator('[data-moved="insp"]').click()
      await thread('Zmień nazwę').waitFor()
      await thread('Poruszyć').waitFor()
      await thread('Zmień nazwę').locator('.th-head').click()
      await shell.locator('.msg.agent', { hasText: 'Zmienię po Twojej decyzji' }).waitFor()
    })

    await check('uwaga z usuniętego miejsca jest oznaczona, a nie gubiona', async () => {
      await thread('Zmień nazwę').locator('.th-flag', { hasText: 'Nie ma tego miejsca' }).waitFor()
      const [comment] = await tool('list_comments', { document: 'current' })
      assert.equal(comment.outdated, true)
    })

    await check('uwaga zamknięta przez agenta znika z listy', async () => {
      await tool('resolve_comment', { id: commentId, text: 'Przycisk usunięty' })
      await thread('Zmień nazwę').waitFor({ state: 'detached', timeout: 5000 })
      await shell.getByRole('button', { name: 'Zamknięte: 1' }).click()
      await shell.locator('.thread.resolved', { hasText: 'Zmień nazwę' }).waitFor()
    })

    await check('usunięcie uwagi wymaga potwierdzenia', async () => {
      const entry = thread('Skróć całość')
      await entry.locator('.th-head').click()
      await entry.getByRole('button', { name: 'Usuń' }).click()
      await entry.getByRole('button', { name: 'Na pewno?' }).click()
      await entry.waitFor({ state: 'detached' })
    })
  } finally {
    await app.close()
    await mcp.close()
  }
}

const markdownDoc = `# Plan prac

Pierwszy akapit z [linkiem](https://example.com), \`kodem\` oraz klawiszem <kbd>T</kbd>.

## Cel

${'Zdanie opisujące decyzję w dokumencie. '.repeat(30)}

> Cytat, który ma zostać czytelny w obu motywach.

- [x] gotowe
- [ ] do zrobienia

| Motyw | Tło |
|-------|-----|
| jasny | białe |

\`\`\`ts
const motyw = 'ciemny'
\`\`\`

## Ryzyka

${'Zdanie opisujące decyzję w dokumencie. '.repeat(30)}
`

const SHEET_COLORS = {
  light: { paper: 'rgb(255, 255, 255)', ink: 'rgb(23, 24, 26)', tint: 'rgb(245, 245, 246)' },
  dark: { paper: 'rgb(21, 21, 23)', ink: 'rgb(244, 244, 245)', tint: 'rgb(32, 32, 35)' }
}

async function markdownTheme(workspace) {
  const home = join(workspace, 'markdown-theme')
  const docs = join(workspace, 'markdown-theme-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(docs, 'plan.md'), markdownDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'markdown-theme-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home },
    // Playwright domyślnie udaje jasny motyw, a tu liczy się ten z `nativeTheme`.
    colorScheme: null
  })
  try {
    const shell = await app.firstWindow()
    await docRow(shell, 'Plan prac').click()
    const page = await attachDocument(app)('Plan prac')
    await documentIsLive(shell)

    const paint = () =>
      page.evaluate(() => {
        const color = (selector, property) => getComputedStyle(document.querySelector(selector))[property]
        return { paper: color('body', 'backgroundColor'), ink: color('p', 'color'), tint: color('pre', 'backgroundColor') }
      })
    const toMode = async (mode) => {
      const current = await shell.evaluate(() => document.documentElement.dataset.mode)
      if (current !== mode) await page.keyboard.press('t')
      await page.waitForFunction((paper) => getComputedStyle(document.body).backgroundColor === paper, SHEET_COLORS[mode].paper)
      await delay(500)
    }
    const thumbs = async () => readdir(join(home, 'cache', 'thumbs')).catch(() => [])

    for (const mode of ['dark', 'light', 'dark']) {
      await check(`arkusz Markdownu idzie za motywem: ${mode}`, async () => {
        await toMode(mode)
        assert.deepEqual(await paint(), SHEET_COLORS[mode])
        await shell.waitForFunction(
          (paper) => getComputedStyle(document.querySelector('.hs-sheet[data-format="markdown"]')).backgroundColor === paper,
          SHEET_COLORS[mode].paper
        )
      })
    }
    await page.screenshot({ path: join(artifacts, 'markdown-dark.png') })

    await check('ciemna i jasna miniatura Markdownu leżą obok siebie', async () => {
      const deadline = Date.now() + 10000
      while (Date.now() < deadline && (await thumbs()).length < 2) await delay(100)
      const names = await thumbs()
      assert.equal(names.filter((name) => name.endsWith('-dark.jpg')).length, 1, names.join())
      assert.equal(names.length, 2, names.join())
      const brightness = (name) =>
        app.evaluate(({ nativeImage }, file) => nativeImage.createFromPath(file).toBitmap()[0], join(home, 'cache', 'thumbs', name))
      for (const name of names) {
        const bright = (await brightness(name)) > 128
        assert.equal(bright, !name.endsWith('-dark.jpg'), name)
      }
    })

    await check('przeładowany arkusz zostaje w motywie', async () => {
      await page.reload()
      assert.deepEqual(await paint(), SHEET_COLORS.dark)
    })
  } finally {
    await app.close()
  }
}

const linkProse = 'Zdanie opisujące decyzję w dokumencie, które ma tu robić objętość. '.repeat(30)
const linkSection = Array.from({ length: 12 }, () => linkProse).join('\n\n')
const linkDoc = (title, links) =>
  `# ${title}\n\nWstęp do dokumentu ${title}.\n\n${links}\n\n## Cel\n\n${linkSection}\n\n## Ryzyka\n\n${linkSection}\n\n## Sekcja dalej\n\n${linkSection}\n`

/** Link w arkuszu Markdownu: plik względem dokumentu, a nie adresu strony. */
async function linkFlow(workspace) {
  const home = join(workspace, 'links-home')
  const repo = join(workspace, 'links-repo')
  const docs = join(repo, 'docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  const absolute = join(repo, 'absolutny.md').replace(/\\/g, '/')
  const planLinks = [
    '[do celu](cel.md#sekcja-dalej)',
    '[wyżej](../wyzej.md)',
    `[bezwzględny](${absolute})`,
    '[martwy](nie-ma.md)',
    '[sieć](https://example.com/z-arkusza)',
    '[tutaj](#ryzyka)',
    '[kod](../kod.ts:12)',
    '[readme](../README.md)',
    '[ta sama strona](plan.md#ryzyka)',
    '[poczta](mailto:ktos@example.com)',
    '[[wiki-cel#Żółta sekcja|z Obsidiana]]',
    '![[wykres.png]]'
  ].join(' · ')
  await writeFile(join(docs, 'plan.md'), linkDoc('Plan linków', planLinks))
  await writeFile(join(docs, 'cel.md'), linkDoc('Cel linków', '[z powrotem](plan.md)'))
  await writeFile(join(repo, 'wyzej.md'), linkDoc('Wyżej linków', 'bez linków'))
  await writeFile(join(repo, 'absolutny.md'), linkDoc('Bezwzględny linków', 'bez linków'))
  await writeFile(join(repo, 'README.md'), '# Opis repozytorium\n\nKrótki wstęp.\n')
  await mkdir(join(repo, 'notatki', 'gleboko'), { recursive: true })
  await mkdir(join(repo, 'zasoby'), { recursive: true })
  await writeFile(join(repo, 'zasoby', 'wykres.png'), '')
  await writeFile(join(repo, 'notatki', 'gleboko', 'wiki-cel.md'), `${linkDoc('Wiki cel', 'bez linków')}\n## Żółta sekcja\n\nKoniec.\n`)
  await writeFile(join(repo, 'kod.ts'), 'export {}\n')
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo] }))

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'links-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    await app.evaluate(({ shell: electronShell }) => {
      globalThis.outside = []
      electronShell.openExternal = async (url) => void globalThis.outside.push(url)
      electronShell.showItemInFolder = (path) => void globalThis.outside.push(path)
    })
    const outside = () => app.evaluate(() => globalThis.outside)
    const shell = await app.firstWindow()
    const layer = await dockLayer(app, shell)
    const findDocument = attachDocument(app)
    shell.setDefaultTimeout(6000)
    const link = (href) => `a[href="${href}"]`

    const openPlan = async () => {
      await docRow(shell, 'Plan linków').click()
      const page = await findDocument('Plan linków')
      await page.waitForLoadState('load')
      await documentIsLive(shell)
      await delay(300)
      return page
    }
    const page = await openPlan()

    await check('link pokazuje, czy prowadzi do sieci, czy do pliku', async () => {
      const mark = (href) =>
        page.evaluate((target) => {
          const after = getComputedStyle(document.querySelector(target), '::after')
          return { content: after.content, mask: after.maskImage }
        }, link(href))
      const web = await mark('https://example.com/z-arkusza')
      const file = await mark('cel.md#sekcja-dalej')
      assert.match(web.mask, /^url\("data:image/)
      assert.match(file.mask, /^url\("data:image/)
      assert.notEqual(web.mask, file.mask)
      assert.equal((await mark('#ryzyka')).content, 'none')
      assert.equal((await mark('mailto:ktos@example.com')).content, 'none')
    })

    await check('najechanie na link do dokumentu pokazuje kartę', async () => {
      const baseline = await page.screenshot()
      await page.hover(link('cel.md#sekcja-dalej'))
      await delay(800)
      const shot = await page.screenshot({ path: join(artifacts, 'link-preview.png') })
      assert.ok(!shot.equals(baseline))
      await page.mouse.move(4, 400)
      await delay(200)
    })

    await check('kotwica przewija ten sam dokument', async () => {
      await page.click(link('#ryzyka'))
      await page.waitForFunction(() => scrollY > 100 && location.hash === '#ryzyka')
      await page.evaluate(() => scrollTo(0, 0))
    })

    await check('martwy link zostaje w dokumencie', async () => {
      const url = page.url()
      await page.click(link('nie-ma.md'))
      await delay(400)
      assert.equal(page.url(), url)
      assert.equal(await page.title(), 'Plan linków')
    })

    await check('plik, który nie jest dokumentem, otwiera Eksplorator bez numeru linii', async () => {
      await page.click(link('../kod.ts:12'))
      await page.click(link('../README.md'))
      await delay(300)
      assert.deepEqual(await outside(), [join(repo, 'kod.ts'), join(repo, 'README.md')])
      assert.equal(await page.title(), 'Plan linków')
    })

    await check('link z `..` trafia do pliku wyżej', async () => {
      await page.click(link('../wyzej.md'))
      await findDocument('Wyżej linków')
      await documentIsLive(shell)
    })

    const again = await openPlan()

    await check('link Obsidiana znajduje notatkę po nazwie i przewija do nagłówka', async () => {
      await again.click('a:text("z Obsidiana")')
      const target = await findDocument('Wiki cel')
      await target.waitForFunction(() => decodeURIComponent(location.hash) === '#żółta-sekcja' && scrollY > 300)
      await documentIsLive(shell)
    })

    await check('osadzenie Obsidiana prowadzi do pliku w innym folderze', async () => {
      const before = (await outside()).length
      const plan = await openPlan()
      await plan.click('a:text("wykres.png")')
      await delay(300)
      assert.deepEqual((await outside()).slice(before), [join(repo, 'zasoby', 'wykres.png')])
    })

    const fifth = await openPlan()

    await check('link ze ścieżką bezwzględną otwiera dokument', async () => {
      await fifth.click(link(absolute))
      await findDocument('Bezwzględny linków')
      await documentIsLive(shell)
    })

    const third = await openPlan()

    await check('Ctrl + klik zerka na dokument, a układ zostaje', async () => {
      await third.click(link('cel.md#sekcja-dalej'), { modifiers: ['Control'] })
      await shell.locator('.pane.peek').waitFor({ state: 'attached' })
      const target = await findDocument('Cel linków')
      await target.waitForFunction(() => location.hash === '#sekcja-dalej' && scrollY > 300)
      await target.keyboard.press('Escape')
      await shell.waitForFunction(() => !document.querySelector('.pane.peek'))
    })

    await check('link do tego samego pliku przewija otwarty dokument bez przeładowania', async () => {
      await documentIsLive(shell)
      await third.evaluate(() => {
        scrollTo(0, 0)
        window.bezPrzeladowania = true
      })
      await third.click(link('plan.md#ryzyka'))
      await third.waitForFunction(() => location.hash === '#ryzyka' && scrollY > 100 && window.bezPrzeladowania)
    })

    await check('klik otwiera dokument na miejscu arkusza, przy kotwicy', async () => {
      await third.evaluate(() => scrollTo(0, 0))
      await third.click(link('cel.md#sekcja-dalej'))
      const target = await findDocument('Cel linków')
      await target.waitForFunction(() => location.hash === '#sekcja-dalej' && scrollY > 300)
      assert.equal(await shell.locator('.pane.focused .pl-title').textContent(), 'Cel linków')
    })

    const fourth = await openPlan()

    await check('narzędzia nad dokumentem nie przechodzą przez link', async () => {
      const box = await fourth.locator(link('https://example.com/z-arkusza')).boundingBox()
      const file = await fourth.locator(link('../wyzej.md')).boundingBox()
      const before = (await outside()).length
      await fourth.keyboard.press('p')
      await shell.locator('#app[data-tool="pointer"]').waitFor({ state: 'attached' })
      await fourth.mouse.click(box.x + 4, box.y + 6)
      await fourth.mouse.click(file.x + 4, file.y + 6)
      await delay(400)
      assert.equal(await fourth.title(), 'Plan linków')
      assert.equal((await outside()).length, before)
      await fourth.keyboard.press('v')
      await shell.locator('#app[data-tool="move"]').waitFor({ state: 'attached' })
    })

    await check('O pokazuje linki z dokumentu i do niego', async () => {
      await fourth.keyboard.press('o')
      const rows = shell.locator('.link-row')
      await rows.first().waitFor()
      const titles = await shell.locator('.lr-title').allTextContents()
      assert.deepEqual(titles, [
        'Cel linków',
        'Wyżej linków',
        'Bezwzględny linków',
        'Wiki cel',
        'kod',
        'readme',
        'wykres.png',
        'sieć',
        'martwy',
        'Cel linków'
      ])
      assert.deepEqual(await shell.locator('.links-head').allTextContents(), ['Z tego dokumentu 9', 'Do tego dokumentu 1'])
      assert.ok(await shell.locator('.link-row', { hasText: 'martwy' }).isDisabled())
      await delay(500)
      const image = await app.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((window) => window.isVisible())
        return (await main.webContents.capturePage()).toPNG().toString('base64')
      })
      await writeFile(join(artifacts, 'links-panel-shell.png'), Buffer.from(image, 'base64'))
    })

    await check('I i O przełączają panel, a drugie naciśnięcie go zamyka', async () => {
      await fourth.keyboard.press('i')
      await shell.locator('.insp-head strong', { hasText: 'Uwagi' }).waitFor()
      assert.ok(await shell.locator('.insp.open').count())
      await fourth.keyboard.press('o')
      await shell.locator('.insp-head strong', { hasText: 'Linki' }).waitFor()
      await fourth.keyboard.press('o')
      await shell.waitForFunction(() => !document.querySelector('.insp.open'))
    })

    await check('wiersz panelu otwiera dokument', async () => {
      await fourth.keyboard.press('o')
      await shell.locator('.link-row', { hasText: 'Wyżej linków' }).click()
      await findDocument('Wyżej linków')
      await shell.locator('.insp-head strong', { hasText: 'Linki' }).waitFor()
      await shell.locator('.links-head', { hasText: 'Do tego dokumentu 1' }).waitFor()
    })

    void layer
  } finally {
    await app.close()
  }
}

async function firstRun(workspace, docs) {
  const home = join(workspace, 'first-run')
  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'first-run-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    const setup = shell.locator('.h-setup', { hasText: 'Wskaż foldery' })
    await check('pierwszy start pokazuje wybór folderów', async () => {
      await setup.waitFor()
    })
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
    }, docs)
    await check('dodany folder trafia do drzewa i konfiguracji', async () => {
      await shell.getByRole('button', { name: 'Dodaj foldery' }).click()
      await docRow(shell, 'interaktywny').waitFor()
      const saved = JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
      assert.deepEqual(saved.roots, [docs])
    })
    await check('usunięcie folderu czyści drzewo', async () => {
      await railTab(shell, 'folders').click()
      await shell.locator('.folders [aria-label^="Usuń"]').click()
      await setup.waitFor()
      assert.equal(await shell.locator('.row[data-doc]').count(), 0)
    })
  } finally {
    await app.close()
  }
}

async function main() {
  const sink = await startLeakSink()
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-e2e-'))
  const home = join(workspace, 'home')
  const docs = join(workspace, 'docs')
  await mkdir(home, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await mkdir(join(docs, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(docs, 'node_modules', 'pkg', 'pomijany.html'), '<title>Pomijany</title>')
  await writeFile(join(docs, 'napastnik.html'), asDocument(leakDoc(sink.httpPort, sink.udpPort)))
  await writeFile(join(docs, 'interaktywny.html'), asDocument(interactiveDoc))
  await writeFile(join(docs, 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
  await writeFile(join(docs, 'sekret.txt'), 'tajne')
  await writeFile(
    join(docs, 'link.html'),
    asDocument('<!doctype html><title>Link</title><body><a id="link" href="https://example.com/klik">link</a></body>')
  )
  const control = join(workspace, 'kontrola.html')
  await writeFile(control, leakDoc(sink.httpPort, sink.udpPort))

  const hasSilos = !process.env.E2E_SKIP_WORK_DOCS && existsSync(silosDoc)
  if (hasSilos) await copyFile(silosDoc, join(docs, 'silos-v2.html'))

  await firstRun(workspace, docs)
  await libraryFlow(workspace)
  await check('scenariusz uwag dobiega końca', () => annotationFlow(workspace))
  await check('scenariusz wskaźnika dobiega końca', () => pointerFlow(workspace))
  await check('scenariusz zakreślacza dobiega końca', () => markerFlow(workspace))
  await check('scenariusz motywu Markdownu dobiega końca', () => markdownTheme(workspace))
  await check('scenariusz cofania dobiega końca', () => undoFlow(workspace, { check }))
  await check('scenariusz menu wiersza dobiega końca', () => rowMenuFlow(workspace, { check }))
  await check('scenariusz szkieletów dobiega końca', () => skeletonFlow(workspace, { check }))
  await check('scenariusz opcji dobiega końca', () => optionsFlow(workspace, { check }))
  await check('scenariusz języka dobiega końca', () => languageFlow(workspace, { check }))
  await check('scenariusz auto-etykiet dobiega końca', () => autoLabelFlow(workspace, { check }))
  await check('scenariusz kodów zgłoszeń dobiega końca', () => ticketsFlow(workspace, { check }))
  await check('scenariusz wzorów dobiega końca', () => mathFlow(workspace, { check }))
  await check('scenariusz kamery dobiega końca', () => cameraFlow(workspace, { check }))
  await check('scenariusz kształtów dobiega końca', () => shapesFlow(workspace, { check }))
  await check('scenariusz trasy dobiega końca', () => routeFlow(workspace, { check }))
  await check('scenariusz prezentacji dobiega końca', () => presentFlow(workspace, { check }))
  await check('scenariusz szukania dobiega końca', () => findFlow(workspace, { check }))
  await check('scenariusz minimapy i spisu treści dobiega końca', () => outlineFlow(workspace, { check }))
  await check('scenariusz linków dobiega końca', () => linkFlow(workspace))
  await check('scenariusz linków HTML dobiega końca', () => htmlLinkFlow(workspace, { check }))
  await check('scenariusz pary planu i objaśnienia dobiega końca', () => pairFlow(workspace, { check }))
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  const consoleErrors = []
  const shell = await app.firstWindow()
  const layer = await dockLayer(app, shell)
  for (const surface of [shell, layer]) {
    surface.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    surface.on('pageerror', (error) => consoleErrors.push(String(error)))
  }
  const findDocument = attachDocument(app)
  const openDoc = (name) => docRow(shell, name).click()

  try {
    await shell.waitForSelector('.row[data-doc]')

    await check('skan pomija node_modules i pokazuje dokumenty', async () => {
      const names = await shell.locator('.row[data-doc] .lbl').allTextContents()
      assert.ok(names.includes('Napastnik'), names.join())
      assert.ok(!names.includes('Pomijany'), names.join())
    })

    await check('kontrola: bez ochrony te same próby docierają do serwera', async () => {
      const url = pathToFileURL(control).href
      await app.evaluate(({ BrowserWindow }, target) => {
        globalThis.controlWindow = new BrowserWindow({ show: false })
        void globalThis.controlWindow.loadURL(target).catch(() => {})
      }, url)
      await delay(3500)
      await app.evaluate(() => globalThis.controlWindow.destroy())
      await delay(300)
      const channels = new Set(sink.hits.map((hit) => hit.split(' ').slice(-1)[0]))
      sink.hits.length = 0
      console.log('Kontrola:', [...channels].join(' '))
      for (const channel of ['/fetch', '/img', '/ws', 'stun', '/iframe', '/beacon', '/form', '/popup', '/meta']) {
        assert.ok(channels.has(channel), `brak kanału ${channel}`)
      }
    })

    await app.evaluate(({ shell: electronShell }) => {
      globalThis.opened = []
      electronShell.openExternal = async (url) => void globalThis.opened.push(url)
    })
    const opened = () => app.evaluate(() => globalThis.opened)

    await openDoc('napastnik')
    const attacker = await findDocument('Napastnik')
    await attacker.waitForFunction(() => document.getElementById('status')?.textContent === 'gotowe')
    await delay(4000)

    await check('żaden kanał nie dotarł do serwera nasłuchującego', async () => {
      assert.deepEqual(sink.hits, [])
    })
    await check('dokument nie opuścił swojego adresu', async () => {
      assert.ok(attacker.url().startsWith('htmldoc://'), attacker.url())
    })
    await check('dokument nie ma dostępu do Node ani API apki', async () => {
      const probes = await attacker.evaluate(() => window.probes)
      assert.equal(probes.globals, 'undefined,undefined,undefined,undefined')
      assert.equal(probes.crossDoc, 'zablokowano')
    })
    await check('apka pokazuje liczbę zablokowanych żądań', async () => {
      const notice = await shell.locator('.notice').first().textContent()
      assert.match(notice, /Zablokowano \d+/)
    })
    await check('dokument nie czyta sąsiednich plików spoza listy', async () => {
      const status = await attacker.evaluate(() => fetch('sekret.txt').then((r) => r.status))
      assert.equal(status, 404)
    })
    await check('skrypt nie otwiera linku zewnętrznego bez kliknięcia', async () => {
      await attacker.evaluate(() => {
        document.getElementById('link').click()
        location.href = 'https://example.com/skrypt'
      })
      await delay(400)
      assert.deepEqual(await opened(), [])
    })
    await check('prawdziwe kliknięcie otwiera link w przeglądarce', async () => {
      await openDoc('link')
      const page = await findDocument('Link')
      await page.click('#link')
      await delay(300)
      assert.deepEqual(await opened(), ['https://example.com/klik'])
      assert.ok(page.url().startsWith('htmldoc://'))
    })

    await openDoc('interaktywny')
    let interactive = await findDocument('Interaktywny')
    await check('JS działa, a localStorage przetrwa ponowne otwarcie', async () => {
      await interactive.waitForSelector('#plus')
      const before = Number(await interactive.locator('#wynik').textContent())
      await interactive.click('#plus')
      await interactive.click('#plus')
      await openDoc('napastnik')
      await delay(300)
      await openDoc('interaktywny')
      interactive = await findDocument('Interaktywny')
      await interactive.waitForSelector('#plus')
      assert.equal(await interactive.locator('#wynik').textContent(), String(before + 2))
    })
    await check('obraz obok dokumentu się ładuje', async () => {
      await interactive.waitForFunction(() => document.getElementById('obraz').naturalWidth === 4)
    })
    await check('kotwica przewija dokument bez blokady', async () => {
      await interactive.click('#kotwica')
      await interactive.waitForFunction(() => window.scrollY > 500)
      assert.ok(interactive.url().endsWith('#dol'), interactive.url())
    })

    await check('widok dokumentu dopasowuje się do okna', async () => {
      const size = await interactive.evaluate(() => [innerWidth, innerHeight])
      const box = await stageSheet(shell)
      assert.deepEqual(size, [Math.round(box.width), Math.round(box.height)])
    })

    await check('koniec dokumentu wychodzi spod doku', async () => {
      const end = await interactive.evaluate(() => {
        scrollTo(0, document.documentElement.scrollHeight)
        return document.getElementById('dol').getBoundingClientRect().bottom
      })
      const bottom = end + (await stageSheet(shell)).top
      const dockTop = (await layer.locator('#dock').boundingBox()).y
      assert.ok(bottom <= dockTop, `${bottom} > ${dockTop}`)
    })

    await check('podmieniony dokument nie zostaje pod nowym', async () => {
      await documentIsLive(shell)
      const titles = await app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((item) => item.isVisible())
        // Poprzedni dokument czeka odstawiony poza oknem, żeby powrót do niego był natychmiastowy.
        const views = main.contentView.children.filter(
          (view) => view.webContents?.getURL().startsWith('htmldoc://') && view.getBounds().x >= 0
        )
        return views.map((view) => view.webContents.getTitle())
      })
      assert.deepEqual(titles, ['Interaktywny'])
    })

    await check('powrót do niedawnego dokumentu nie wczytuje go od nowa', async () => {
      await interactive.evaluate(() => {
        window.zostalWPamieci = true
      })
      await openDoc('link')
      await delay(300)
      await openDoc('interaktywny')
      await delay(300)
      assert.equal(await interactive.evaluate(() => window.zostalWPamieci), true)
    })

    await check('kliknięcie w dok oddaje klawiaturę dokumentowi', async () => {
      await app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().find((item) => item.getURL() === 'about:blank').focus()
      )
      await layer.locator('.tb[data-tool="move"]').click()
      await delay(300)
      const url = await app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.getURL())
      assert.ok(url?.startsWith('htmldoc://'), url)
    })

    await check('powłoki i doku nie da się przewinąć z kodu', async () => {
      const moved = (page, selectors) =>
        page.evaluate((list) => {
          const elements = list.flatMap((selector) => [...document.querySelectorAll(selector)])
          for (const element of elements) element.scrollTop = element.scrollLeft = 90
          return elements.filter((element) => element.scrollTop || element.scrollLeft).map((element) => element.className)
        }, selectors)
      assert.deepEqual(await moved(shell, ['.app', '.sheet', '.sheet-stack']), [])
      assert.deepEqual(await moved(layer, ['.dock-room', '.dock', '.tray']), [])
    })

    await check('powłoka nie otwiera innych okien niż warstwa doku', async () => {
      const windows = app.windows().length
      assert.equal(await shell.evaluate(() => window.open('https://example.com/okno', 'inne')), null)
      assert.equal(app.windows().length, windows)
    })

    if (hasSilos) {
      await openDoc('Silos')
      const silos = await findDocument('Silos')
      await check('Silos: treść i generator działają', async () => {
        await silos.waitForLoadState('load')
        const sections = await silos.locator('section').count()
        assert.equal(sections, 20)
        const output = silos.locator('#gen-out')
        const button = silos.locator('#generator button').first()
        await button.scrollIntoViewIfNeeded()
        await button.click()
        const first = await output.innerText()
        await button.click()
        assert.ok(first.length > 50, 'generator nic nie wypisał')
        assert.notEqual(await output.innerText(), first)
      })
      await check('Silos: fonty są dozwolone, a dokument nie ma błędów', async () => {
        assert.equal(await shell.locator('.notice').count(), 0)
        await silos.evaluate(() => document.fonts.ready)
        const loaded = await silos.evaluate(() =>
          [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family)
        )
        console.log('Fonty:', [...new Set(loaded)].join(', '))
        assert.ok(loaded.length > 0, 'żaden font nie został załadowany')
      })
      await silos.locator('#werdykt').scrollIntoViewIfNeeded()
      await silos.screenshot({ path: join(artifacts, 'silos-doc.png') })
    }

    await shell.screenshot({ path: join(artifacts, 'shell.png') })

    await check('powłoka nie zgłasza błędów w konsoli', async () => {
      assert.deepEqual(consoleErrors, [])
    })
  } finally {
    await app.close()
    sink.stop()
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }

  for (const [status, name] of results) console.log(`${status.padEnd(5)} ${name}`)
  if (!hasSilos) console.log('POMINIĘTO dokument Silos')
  if (sink.hits.length) console.log('Trafienia:', sink.hits)
  process.exitCode = results.some(([status]) => status !== 'OK') ? 1 : 0
}

await main()
