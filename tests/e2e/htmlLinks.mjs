// Linki lokalne w dokumencie HTML. Dokument ma skrypty, więc liczy się tylko prawdziwe kliknięcie.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/htmlLinks.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

const MAIN = 'Główny linków'
const TARGET = 'Cel linków'
const ABOVE = 'Wyżej linków'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const tall = '<div style="height: 3000px"></div>'
/** Bez własnego stylu, treści i struktury skan nie uzna pliku za dokument. */
const prose = `<style>body { margin: 16px }</style><h2>Cel</h2><h2>Ryzyka</h2><p>${'Akapit opisujący decyzje projektowe dokumentu. '.repeat(30)}</p>`
const plainDoc = (title) => `<!doctype html><title>${title}</title><body><h1>${title}</h1>${prose}${tall}<h2 id="dol">Dół</h2></body>`

const mainDoc = `<!doctype html><title>${MAIN}</title>
<body>
<h1>${MAIN}</h1>
<p><a id="dokument" href="cel.html#dol">dokument</a> <a id="wyzej" href="../wyzej.html">wyżej</a>
<a id="nowa-karta" href="cel.html" target="_blank">nowa karta</a></p>
<p><a id="plik" href="../kod.ts">plik</a> <a id="zasob" href="obraz.svg">zasób</a>
<a id="martwy" href="nie-ma.html">martwy</a></p>
<p><a id="router" href="cel.html">router</a> <button id="skrypt">skrypt klika link</button></p>
<div id="zatrzymuje"><a id="zatrzymany" href="cel.html">zatrzymany</a></div>
<p><a id="kotwica" href="#dol">kotwica</a> <a id="pusta" href="#">pusta</a>
<a id="strona" href="?strona=2">strona</a> <a id="korzen" href="/">korzeń</a></p>
<p><a id="w-ramce" href="obraz.svg" target="podglad">w ramce</a></p>
<iframe name="podglad" width="60" height="60"></iframe>
<div contenteditable="true"><a id="edytowany" href="cel.html">edytowany</a></div>
<p><a id="siec" href="//serwer-testowy/udzial/plik.html">sieć</a>
<a id="siec-ukosniki" href="\\\\serwer-testowy\\udzial\\plik.html">sieć wstecz</a>
<a id="siec-kodowana" href="%5C%5Cserwer-testowy%5Cudzial%5Cplik.html">sieć kodowana</a></p>
${prose}${tall}<h2 id="dol">Dół</h2>
<script>
document.getElementById('router').addEventListener('click', (event) => {
  event.preventDefault()
  document.body.dataset.trasa = 'cel'
})
document.getElementById('zatrzymuje').addEventListener('click', (event) => event.stopPropagation())
document.getElementById('skrypt').addEventListener('click', () => document.getElementById('dokument').click())
</script></body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

/*
 * Apka anuluje część nawigacji w `will-navigate`, a Playwright się o tym nie dowiaduje. Po takiej
 * nawigacji `page.click` i `page.title` czekają na nią bez końca, więc test używa samej myszy
 * i kodu strony, które nie zależą od jej stanu.
 */
const titleOf = (view) => view.evaluate(() => document.title)

/** Odpytuje zegarem, bo strona poza ekranem może nie dostawać klatek animacji. */
const until = (view, test, argument) => view.waitForFunction(test, argument, { polling: 100 })

async function pointAt(view, selector) {
  return view.evaluate((target) => {
    const element = document.querySelector(target)
    element.scrollIntoView({ block: 'center' })
    const { x, y, width, height } = element.getClientRects()[0]
    return { x: x + width / 2, y: y + height / 2 }
  }, selector)
}

async function hover(view, selector) {
  const { x, y } = await pointAt(view, selector)
  await view.mouse.move(x, y)
}

/** Prawdziwe kliknięcie: przechodzi przez przeglądarkę, więc `isTrusted` jest prawdą. */
async function press(view, selector) {
  const { x, y } = await pointAt(view, selector)
  await view.mouse.click(x, y)
}

function attachDocument(app) {
  return async (title) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await titleOf(page).catch(() => '')).includes(title)) return page
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${title}”`)
  }
}

export async function htmlLinkFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'html-links-home')
  const repo = join(workspace, 'html-links-repo')
  const docs = join(repo, 'docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(docs, 'glowny.html'), mainDoc)
  await writeFile(join(docs, 'cel.html'), plainDoc(TARGET))
  await writeFile(join(docs, 'obraz.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
  await writeFile(join(repo, 'wyzej.html'), plainDoc(ABOVE))
  await writeFile(join(repo, 'kod.ts'), 'export {}\n')
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'html-links-profile')}`],
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
    shell.setDefaultTimeout(6000)
    const findDocument = attachDocument(app)
    const paneTitle = () => shell.locator('.pane.focused .pl-title').textContent()
    const isLive = () => until(shell, () => !document.querySelector('canvas.sheet-frame'))

    const openMain = async () => {
      await shell.locator('.row[data-doc]', { hasText: MAIN }).click()
      const page = await findDocument(MAIN)
      await until(page, () => document.readyState === 'complete')
      await isLive()
      await delay(300)
      return page
    }
    const page = await openMain()
    await page.evaluate(() => {
      window.bezPrzeladowania = true
    })

    /** Dokument został na swoim adresie, a powłoka niczego nie podmieniła. */
    const stays = async (view = page) => {
      await delay(400)
      assert.equal(await view.evaluate(() => location.pathname), '/')
      assert.equal(await titleOf(view), MAIN)
      assert.equal(await paneTitle(), MAIN)
      assert.equal(await shell.locator('.pane.peek').count(), 0)
    }

    await check('skrypt nie otwiera linku lokalnego bez kliknięcia', async () => {
      await page.evaluate(() => {
        const link = document.getElementById('dokument')
        link.click()
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        document.getElementById('plik').click()
      })
      await stays()
      assert.deepEqual(await outside(), [])
    })

    await check('skrypt nie opuszcza adresu dokumentu przez `location`, `window.open` ani `meta`', async () => {
      await page.evaluate(() => {
        location.href = 'cel.html'
      })
      await stays()
      await page.evaluate(() => location.assign('../kod.ts'))
      await stays()
      await page.evaluate(() => void window.open('cel.html'))
      await stays()
      await page.evaluate(() => {
        const refresh = document.createElement('meta')
        refresh.httpEquiv = 'refresh'
        refresh.content = '0;url=obraz.svg'
        document.head.append(refresh)
      })
      await stays()
      assert.deepEqual(await outside(), [])
      assert.equal(await page.evaluate(() => window.bezPrzeladowania), true)
    })

    await check('skrypt klikający link podczas prawdziwego kliknięcia niczego nie otwiera', async () => {
      await press(page, '#skrypt')
      await stays()
      assert.deepEqual(await outside(), [])
    })

    await check('dokument HTML nie dostaje kart z danymi innych dokumentów', async () => {
      await page.mouse.move(4, 400)
      const baseline = await page.screenshot()
      await hover(page, '#dokument')
      await delay(800)
      assert.ok((await page.screenshot()).equals(baseline), 'nad linkiem pojawiła się karta')
      const answers = await app.evaluate(async ({ BrowserWindow, ipcMain }) => {
        const main = BrowserWindow.getAllWindows().find((window) => window.isVisible())
        const view = main.contentView.children.find((child) => child.webContents?.getURL().startsWith('htmldoc://'))
        const ask = (channel, href) => ipcMain._invokeHandlers.get(channel)({ sender: view.webContents }, href)
        return [await ask('doc:link-preview', 'cel.html'), await ask('doc:open-link', 'nie-ma.html')]
      })
      assert.deepEqual(answers, [null, 'missing'])
    })

    await check('własny router dokumentu zachowuje kliknięcie dla siebie', async () => {
      await press(page, '#router')
      await stays()
      assert.equal(await page.evaluate(() => document.body.dataset.trasa), 'cel')
    })

    await check('kotwice działają w dokumencie bez przeładowania', async () => {
      await press(page, '#kotwica')
      await until(page, () => location.hash === '#dol' && scrollY > 500)
      await page.evaluate(() => scrollTo(0, 0))
      await press(page, '#pusta')
      await until(page, () => location.hash === '' && window.bezPrzeladowania)
      await stays()
    })

    await check('nazwana ramka i tekst do edycji zostają w dokumencie', async () => {
      await press(page, '#w-ramce')
      await until(page, () => document.querySelector('iframe').contentWindow.location.pathname === '/obraz.svg')
      await press(page, '#edytowany')
      await stays()
      assert.deepEqual(await outside(), [])
    })

    await check('martwy link zostawia dokument i mówi, że pliku nie ma', async () => {
      await hover(page, '#martwy')
      await delay(100)
      const baseline = await page.screenshot()
      await press(page, '#martwy')
      await delay(500)
      assert.ok(!(await page.screenshot()).equals(baseline), 'brak informacji przy linku')
      await stays()
      assert.deepEqual(await outside(), [])
    })

    await check('inny plik i zasób dokumentu pokazują Eksplorator', async () => {
      await press(page, '#plik')
      await stays()
      await press(page, '#zasob')
      await stays()
      assert.deepEqual(await outside(), [join(repo, 'kod.ts'), join(docs, 'obraz.svg')])
    })

    await check('ścieżka sieciowa nie wychodzi poza maszynę', async () => {
      const before = (await outside()).length
      for (const id of ['siec', 'siec-ukosniki', 'siec-kodowana']) {
        await press(page, `#${id}`)
        await stays()
      }
      assert.equal((await outside()).length, before)
    })

    await check('link do własnej strony nie otwiera Eksploratora', async () => {
      const before = (await outside()).length
      await press(page, '#strona')
      await until(page, () => location.search === '?strona=2')
      await press(page, '#korzen')
      await until(page, () => location.search === '')
      await stays()
      assert.equal((await outside()).length, before)
    })

    await check('prawdziwe kliknięcie otwiera dokument przy kotwicy', async () => {
      await press(page, '#dokument')
      const target = await findDocument(TARGET)
      await until(target, () => location.hash === '#dol' && scrollY > 300)
      assert.equal(await paneTitle(), TARGET)
    })

    await check('link z `..` trafia do dokumentu wyżej', async () => {
      const again = await openMain()
      await press(again, '#wyzej')
      await findDocument(ABOVE)
      await isLive()
      assert.equal(await paneTitle(), ABOVE)
    })

    await check('Enter na linku działa jak kliknięcie', async () => {
      const again = await openMain()
      await again.evaluate(() => document.getElementById('wyzej').focus())
      await again.keyboard.press('Enter')
      await findDocument(ABOVE)
      await until(shell, (title) => document.querySelector('.pane.focused .pl-title')?.textContent === title, ABOVE)
    })

    await check('link do nowej karty otwiera dokument w apce', async () => {
      const again = await openMain()
      await press(again, '#nowa-karta')
      await findDocument(TARGET)
      await until(shell, (title) => document.querySelector('.pane.focused .pl-title')?.textContent === title, TARGET)
    })

    await check('zatrzymane zdarzenie nie gubi linku i nie prowadzi do 404', async () => {
      const again = await openMain()
      await press(again, '#zatrzymany')
      const target = await findDocument(TARGET)
      await until(shell, (title) => document.querySelector('.pane.focused .pl-title')?.textContent === title, TARGET)
      assert.equal(await target.evaluate(() => location.pathname), '/')
    })

    await check('Ctrl + klik zerka na dokument, a układ zostaje', async () => {
      const again = await openMain()
      await again.keyboard.down('Control')
      await press(again, '#dokument')
      await again.keyboard.up('Control')
      await shell.locator('.pane.peek').waitFor({ state: 'attached' })
      const target = await findDocument(TARGET)
      await until(target, () => location.hash === '#dol' && scrollY > 300)
      await target.keyboard.press('Escape')
      await until(shell, () => !document.querySelector('.pane.peek'))
      await stays(again)
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-html-links-'))
  try {
    await htmlLinkFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
