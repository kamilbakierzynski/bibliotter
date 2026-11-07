// Powiększanie obrazka po kliknięciu w Markdownie i w HTML-u.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/imageZoom.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const MD_TITLE = 'Plan pięter'
const HTML_TITLE = 'Galeria obrazków'

/** Jednolity PNG o zadanym rozmiarze, bez zależności. */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const prose = 'Zdanie opisujące piętra terminalu, które robi tu objętość dokumentu. '.repeat(14)

const mdDoc = `# ${MD_TITLE}

## Cel

${prose}

## Piętra

![Plan pięter](plan.png)

*Od dołu: L0, L1, L2.*

${prose}

## Ryzyka

${prose}
`

const htmlDoc = `<!doctype html><title>${HTML_TITLE}</title>
<style>body { margin: 24px; font: 16px/1.5 system-ui } img { display: block; margin: 12px 0 } #wlasny { cursor: pointer }</style>
<body>
<h1>${HTML_TITLE}</h1>
<h2>Cel</h2>
<p>${prose}</p>
<img id="duzy" src="plan.png" alt="Plan" style="width: 320px">
<a href="cel.html"><img id="w-linku" src="plan.png" alt="" style="width: 200px"></a>
<img id="wlasny" src="plan.png" alt="" style="width: 200px">
<img id="ikonka" src="ikonka.png" alt="" style="width: 24px">
<h2>Ryzyka</h2>
<p>${prose}</p>
<div style="height: 2400px"></div>
<script>
document.getElementById('wlasny').addEventListener('click', () => { document.body.dataset.wlasny = 'tak' })
</script>
</body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const until = (view, test, argument) => view.waitForFunction(test, argument, { polling: 100, timeout: 6000 })

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

async function pointAt(view, selector) {
  return view.evaluate((target) => {
    const element = document.querySelector(target)
    element.scrollIntoView({ block: 'center' })
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  }, selector)
}

async function press(view, selector) {
  const { x, y } = await pointAt(view, selector)
  await view.mouse.move(x - 2, y - 2)
  await view.mouse.move(x, y)
  await view.mouse.click(x, y)
}

const isOpen = (view) =>
  view.evaluate(() => {
    const host = document.querySelector('bibliotter-lightbox')
    return Boolean(host && !host.hidden)
  })
const waitOpen = (view) => until(view, () => document.querySelector('bibliotter-lightbox')?.hidden === false)
const waitClosed = (view) => until(view, () => document.querySelector('bibliotter-lightbox')?.hidden !== false)

/** Kolor piksela widoku. Zrzut dekoduje proces główny, bo CSP dokumentu nie wpuści `fetch`. */
async function colorAt(app, view, x, y) {
  const shot = (await view.screenshot({ type: 'png' })).toString('base64')
  const width = await view.evaluate(() => innerWidth)
  return app.evaluate(
    ({ nativeImage }, { shot, x, y, width }) => {
      const image = nativeImage.createFromBuffer(Buffer.from(shot, 'base64'))
      const size = image.getSize()
      const ratio = size.width / width
      const bitmap = image.toBitmap()
      const at = (Math.round(y * ratio) * size.width + Math.round(x * ratio)) * 4
      return [bitmap[at + 2], bitmap[at + 1], bitmap[at]]
    },
    { shot, x, y, width }
  )
}

const isDark = ([r, g, b]) => r + g + b < 200
const isPlan = ([r, g, b]) => Math.abs(r - 180) < 12 && Math.abs(g - 222) < 12 && Math.abs(b - 178) < 12

export async function imageZoomFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'zoom-home')
  const docs = join(workspace, 'zoom-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'plan.png'), png(1600, 1000, [180, 222, 178]))
  await writeFile(join(docs, 'ikonka.png'), png(24, 24, [40, 40, 40]))
  await writeFile(join(docs, 'plan.md'), mdDoc)
  await writeFile(join(docs, 'galeria.html'), htmlDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'zoom-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(6000)
    const findDocument = attachDocument(app)
    const isLive = () => until(shell, () => !document.querySelector('canvas.sheet-frame'))
    const openDoc = async (title) => {
      await shell.locator('.row[data-doc]', { hasText: title }).first().click({ timeout: 20000 })
      const page = await findDocument(title)
      await until(page, () => document.readyState === 'complete' && [...document.images].every((image) => image.complete))
      await isLive()
      await delay(300)
      return page
    }

    const md = await openDoc(MD_TITLE)

    await check('obrazek w Markdownie powiększa się po kliknięciu', async () => {
      const before = await md.evaluate(() => document.querySelector('img').getBoundingClientRect().width)
      await press(md, 'img')
      await waitOpen(md)
      await delay(700)
      await md.screenshot({ path: join(artifacts, 'image-zoom-markdown.png') })
      const view = await md.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      // Zasłona przykrywa róg widoku, a obrazek zajmuje większość szerokości.
      assert.ok(view.width - 56 > before * 1.15, `widok ${view.width}, obrazek ${before}`)
      assert.ok(isDark(await colorAt(app, md, 6, view.height - 6)), 'róg bez zasłony')
      assert.ok(isPlan(await colorAt(app, md, 40, view.height / 2 - 40)), 'brzeg widoku bez obrazka')
    })

    await check('Esc zamyka powiększenie, a arkusz zostaje otwarty', async () => {
      const scroll = await md.evaluate(() => scrollY)
      await md.mouse.wheel(0, 600)
      await delay(200)
      assert.equal(await md.evaluate(() => scrollY), scroll, 'strona przewinęła się pod powiększeniem')
      await md.keyboard.press('Escape')
      await waitClosed(md)
      await delay(300)
      assert.equal(await shell.locator('.pane .pl-title', { hasText: MD_TITLE }).count(), 1)
    })

    await check('klik w zasłonę zamyka powiększenie', async () => {
      await press(md, 'img')
      await waitOpen(md)
      await delay(600)
      await md.mouse.click(8, 8)
      await waitClosed(md)
    })

    await check('klik w duży obrazek pokazuje go w rzeczywistym rozmiarze, a drugi wraca do dopasowania', async () => {
      await press(md, 'img')
      await waitOpen(md)
      await delay(600)
      const { width, height } = await md.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      // Trzecie otwarcie ma zasłonę, mimo że wcześniejsze zamknięcia ją wygasiły.
      assert.ok(isDark(await colorAt(app, md, 6, height - 6)), 'róg bez zasłony po ponownym otwarciu')
      await md.mouse.click(width / 2, (height - 84) / 2)
      await delay(700)
      await md.screenshot({ path: join(artifacts, 'image-zoom-actual.png') })
      // Obrazek większy od widoku zajmuje go cały.
      assert.ok(isPlan(await colorAt(app, md, 6, 6)), 'rzeczywisty rozmiar nie wypełnia widoku')
      // Przeciągnięcie przewija obrazek i niczego nie zamyka.
      await md.mouse.move(width / 2, height / 2)
      await md.mouse.down()
      await md.mouse.move(width / 2 - 120, height / 2 - 60, { steps: 6 })
      await md.mouse.up()
      assert.equal(await isOpen(md), true)
      await md.mouse.click(width / 2, height / 2)
      await delay(700)
      assert.equal(await isOpen(md), true)
      await md.keyboard.press('Escape')
      await waitClosed(md)
    })

    const html = await openDoc(HTML_TITLE)

    await check('obrazek w HTML-u powiększa się, a jego kursor to lupa', async () => {
      const { x, y } = await pointAt(html, '#duzy')
      await html.mouse.move(x - 2, y - 2)
      await html.mouse.move(x, y)
      assert.equal(await html.evaluate(() => getComputedStyle(document.getElementById('duzy')).cursor), 'zoom-in')
      await html.mouse.click(x, y)
      await waitOpen(html)
      await delay(600)
      await html.screenshot({ path: join(artifacts, 'image-zoom-html.png') })
      await html.keyboard.press('Escape')
      await waitClosed(html)
    })

    await check('obrazek w linku, z własną obsługą kliknięcia i mała ikonka zostają bez powiększenia', async () => {
      for (const id of ['#wlasny', '#ikonka']) {
        await press(html, id)
        await delay(400)
        assert.equal(await isOpen(html), false, id)
      }
      assert.equal(await html.evaluate(() => document.body.dataset.wlasny), 'tak')
      assert.equal(await html.evaluate(() => getComputedStyle(document.getElementById('ikonka')).cursor), 'auto')
      const { x, y } = await pointAt(html, '#w-linku')
      await html.mouse.move(x, y)
      await delay(100)
      assert.equal(await html.evaluate(() => getComputedStyle(document.getElementById('w-linku')).cursor), 'pointer')
    })

    await check('w trybie komentarza klik w obrazek stawia uwagę, a nie powiększa', async () => {
      await html.evaluate(() => scrollTo(0, 0))
      const { x, y } = await pointAt(html, '#duzy')
      await shell.keyboard.press('c')
      await delay(300)
      await html.mouse.move(x, y)
      await html.mouse.click(x, y)
      await delay(500)
      assert.equal(await isOpen(html), false)
      await html.keyboard.press('Escape')
      await delay(200)
      await shell.keyboard.press('Escape')
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-image-zoom-'))
  try {
    await imageZoomFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
