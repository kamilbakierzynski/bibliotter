// Minimapa przy krawędzi arkusza i spis treści w panelu: szkic, skoki, bieżący rozdział i ustępowanie.
// Można uruchomić sam ten plik: node tests/e2e/outline.mjs (E2E_ENTRY wskazuje inny build).
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040
const STRIP = 64

const ESSAY = 'Esej o minimapie'
const COLUMN = 'Kolumna z rozdziałami'
const WIDE = 'Panel na całą szerokość'
const BANDS = 'Pasy z paskiem nawigacji'
/** Wysokość przyklejonego paska w dokumencie z pasami. */
const NAV = 48
/** Uchwyt szuflady leży tyle od prawej krawędzi pasa. */
const GRIP_COLUMNS = 10

const sentence = 'Minimapa pokazuje kształt dokumentu, a spis treści jego rozdziały, więc czytelnik wie, gdzie jest i dokąd może pójść. '
const paragraph = (n) => sentence.repeat(n)

const essay = `# ${ESSAY}

${paragraph(3)}

## Po co mapa

${paragraph(5)}

${paragraph(4)}

### Szkic zamiast zrzutu

${paragraph(4)}

\`\`\`ts
const map = sketchPage()
draw(map, { scale: 1 / 8 })
\`\`\`

${paragraph(3)}

## Spis treści

${paragraph(5)}

| Element | Miejsce |
|---|---|
| Minimapa | krawędź arkusza |
| Spis | panel obok uwag |

${paragraph(4)}

### Bieżący rozdział

${paragraph(6)}

## Kiedy mapa ustępuje

${paragraph(5)} Na końcu gra orkiestra.

${paragraph(5)}

## Zakończenie

${paragraph(3)}
`

const column = `<!doctype html><html lang="pl"><title>${COLUMN}</title>
<style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #222; background: #fff; }
  main { max-width: 680px; margin: 0 auto; padding: 48px 24px; }
  h2 .n { margin-right: .6em; color: #999; font-size: .7em; }
  figure { height: 220px; margin: 24px 0; background: #eef; border-radius: 8px; }
</style>
<main>
  <h1>${COLUMN}</h1>
  <p>${paragraph(3)}</p>
  <pre style="overflow-x: auto">${'const długaLinia = ' + 'x + '.repeat(400)}</pre>
  ${Array.from({ length: 7 }, (_, i) => `<h2><span class="n">${i + 1}</span>Rozdział ${['pierwszy', 'drugi', 'trzeci', 'czwarty', 'piąty', 'szósty', 'siódmy'][i]}</h2>
  <p>${paragraph(4)}</p>${i % 3 === 1 ? '<figure></figure>' : ''}<p>${paragraph(3)}</p>`).join('\n')}
</main></html>`

const wide = `<!doctype html><html lang="pl"><title>${WIDE}</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #e8e8ea; background: #15161a; }
  header { padding: 18px 28px; background: #23252c; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; padding: 18px 28px; }
  .card { min-height: 150px; padding: 14px; background: #1f2127; border-radius: 10px; }
</style>
<header><h1>${WIDE}</h1></header>
${Array.from({ length: 6 }, (_, i) => `<h2 style="padding: 0 28px">Sekcja ${i + 1}</h2><div class="grid">${Array.from({ length: 8 }, () => `<div class="card">${paragraph(1)}</div>`).join('')}</div>`).join('\n')}
</html>`

// Wąska kolumna tekstu na pasach tła na całą szerokość, pod przyklejonym paskiem, a na końcu
// wykres przez całą stronę. Tak wyglądają dokumenty projektowe generowane przez agentów.
const bands = `<!doctype html><html lang="pl"><title>${BANDS}</title>
<style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #222; background: #fff; }
  nav { position: sticky; top: 0; z-index: 2; height: ${NAV}px; display: flex; align-items: center; padding: 0 24px; background: #20242c; color: #fff; }
  section { padding: 28px 0; border-bottom: 1px solid #d8d4cc; }
  section:nth-of-type(odd) { background: #f1eee7; }
  .col { max-width: 620px; margin: 0 auto; padding: 0 24px; }
  svg { display: block; }
</style>
<nav>${BANDS}</nav>
${Array.from({ length: 9 }, (_, i) => `<section><div class="col"><h2>Pas ${i + 1}</h2><p>${paragraph(3)}</p><p>${paragraph(2)}</p></div></section>`).join('\n')}
<svg width="100%" height="520"><rect width="100%" height="100%" fill="#d5deef"/></svg>
</html>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const until = (view, test, argument) => view.waitForFunction(test, argument, { polling: 100 })

async function waitFor(test, ms = 6000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await test()) return
    await delay(100)
  }
  throw new Error('nie doczekałem się warunku')
}

function attachDocument(app) {
  return async (title) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await page.evaluate(() => document.title).catch(() => '')).includes(title)) return page
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

/**
 * Pas minimapy na zrzucie widoku. Rysunek leży w zamkniętym Shadow DOM, więc liczy się obraz:
 * `ink` to piksele, które odcinają się od tła obok pasa, a `pixels` pozwalają porównać dwa stany.
 * `from` i `to` to wiersze w px strony, a `columns` to kolumny liczone od prawej krawędzi pasa.
 */
const stripShot = (app, url, { from = 16, to = -16, columns = [0, STRIP] } = {}) =>
  app.evaluate(async ({ webContents }, { url, from, to, columns }) => {
    const page = webContents.getAllWebContents().find((contents) => contents.getURL() === url && !contents.isOffscreen())
    const image = await page.capturePage()
    const { width, height } = image.getSize()
    const pixels = image.toBitmap()
    const scale = width / (await page.executeJavaScript('innerWidth'))
    const scrollbar = await page.executeJavaScript('innerWidth - document.documentElement.clientWidth')
    const edge = Math.round(width - scrollbar * scale)
    const right = Math.round(edge - columns[0] * scale)
    const left = Math.round(edge - columns[1] * scale)
    const at = (x, y) => (y * width + x) * 4
    const bg = pixels.subarray(at(left - 4, 40), at(left - 4, 40) + 3)
    let ink = 0
    let amber = 0
    const band = []
    const bottom = to < 0 ? height + to * scale : to * scale
    for (let y = Math.round(from * scale); y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const i = at(x, y)
        band.push(pixels[i], pixels[i + 1], pixels[i + 2])
        if (Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 24) ink++
        // Bitmapa ma kolejność BGRA.
        if (pixels[i + 2] > 200 && pixels[i + 1] > 120 && pixels[i + 1] < 215 && pixels[i] < 110) amber++
      }
    }
    return { ink, amber, paper: bg[0] + bg[1] + bg[2], pixels: Buffer.from(band).toString('base64') }
  }, { url, from, to, columns })

const stripInk = async (app, url) => (await stripShot(app, url)).ink

/** Ile pikseli pasa zmieniło się między dwoma zrzutami. */
function changed(a, b) {
  const x = Buffer.from(a.pixels, 'base64')
  const y = Buffer.from(b.pixels, 'base64')
  if (x.length !== y.length) return Infinity
  let count = 0
  for (let i = 0; i < x.length; i += 3) {
    if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 24) count++
  }
  return count
}

/** Zrzut całego okna: powłoka, widoki dokumentów i warstwa doku złożone tak, jak widzi je użytkownik. */
const windowShot = async (app, file) => {
  const shell = await app.firstWindow()
  await until(shell, () => !document.querySelector('canvas.sheet-frame'))
  await delay(900)
  return composite(app, file)
}

const composite = (app, file) =>
  app.evaluate(async ({ BrowserWindow, nativeImage, WebContentsView }) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())
    const base = await win.webContents.capturePage()
    const size = base.getSize()
    const scale = size.width / win.getContentBounds().width
    const out = Buffer.from(base.toBitmap())
    const views = []
    const walk = (view, dx, dy) => {
      for (const child of view.children) {
        const b = child.getBounds()
        if (child instanceof WebContentsView) views.push({ view: child, x: dx + b.x, y: dy + b.y, clip: { x: dx + b.x, y: dy + b.y, w: b.width, h: b.height }, parentClip: view === win.contentView ? null : { x: dx, y: dy, w: view.getBounds().width, h: view.getBounds().height } })
        if (child.children?.length) walk(child, dx + b.x, dy + b.y)
      }
    }
    walk(win.contentView, 0, 0)
    for (const { view, x, y, parentClip } of views) {
      if (!view.getVisible?.() && view.getVisible) continue
      const image = await view.webContents.capturePage()
      const { width, height } = image.getSize()
      const src = image.toBitmap()
      const ox = Math.round(x * scale)
      const oy = Math.round(y * scale)
      const clip = parentClip ? { x0: Math.round(parentClip.x * scale), y0: Math.round(parentClip.y * scale), x1: Math.round((parentClip.x + parentClip.w) * scale), y1: Math.round((parentClip.y + parentClip.h) * scale) } : { x0: 0, y0: 0, x1: size.width, y1: size.height }
      for (let row = 0; row < height; row++) {
        const ty = oy + row
        if (ty < Math.max(0, clip.y0) || ty >= Math.min(size.height, clip.y1)) continue
        for (let col = 0; col < width; col++) {
          const tx = ox + col
          if (tx < Math.max(0, clip.x0) || tx >= Math.min(size.width, clip.x1)) continue
          const s = (row * width + col) * 4
          const d = (ty * size.width + tx) * 4
          const a = src[s + 3] / 255
          if (a === 0) continue
          for (let k = 0; k < 3; k++) out[d + k] = Math.round(src[s + k] * a + out[d + k] * (1 - a))
          out[d + 3] = 255
        }
      }
    }
    return nativeImage.createFromBitmap(out, size).toPNG().toString('base64')
  }).then((png) => writeFile(file, Buffer.from(png, 'base64')))

export async function outlineFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'outline-home')
  const docs = join(workspace, 'outline-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'esej.md'), essay)
  await writeFile(join(docs, 'kolumna.html'), column)
  await writeFile(join(docs, 'panel.html'), wide)
  await writeFile(join(docs, 'pasy.html'), bands)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'outline-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home },
    // Bez tego Playwright udaje jasny motyw i arkusz Markdownu nie ciemnieje.
    colorScheme: null
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())
      win.setBounds({ x: 40, y: 40, width: 1600, height: 1000 })
    })
    const layer = await dockLayer(app, shell)
    const open = attachDocument(app)
    const row = (name) => shell.locator('.row[data-doc]', { hasText: name })
    const settle = async (page) => {
      await until(page, () => document.readyState === 'complete')
      await until(shell, () => !document.querySelector('canvas.sheet-frame'))
      await delay(700)
    }

    await row(ESSAY).click()
    const essayPage = await open(ESSAY)
    await settle(essayPage)

    await check('minimapa rysuje szkic przy prawej krawędzi arkusza Markdownu', async () => {
      await waitFor(async () => (await stripInk(app, essayPage.url())) > 400)
    })

    await check('G otwiera spis treści z nagłówkami dokumentu', async () => {
      await essayPage.keyboard.press('g')
      await shell.locator('.toc-row').first().waitFor()
      const texts = await shell.locator('.toc-row').allTextContents()
      assert.deepEqual(texts, [ESSAY, 'Po co mapa', 'Szkic zamiast zrzutu', 'Spis treści', 'Bieżący rozdział', 'Kiedy mapa ustępuje', 'Zakończenie'])
      assert.equal(await shell.locator('.toc-row[data-depth="2"]').count(), 2)
    })

    await check('na górze dokumentu bieżący jest pierwszy rozdział', async () => {
      await until(shell, () => document.querySelector('.toc-row.on')?.textContent === 'Esej o minimapie')
    })

    await windowShot(app, join(artifacts, 'outline-essay.png'))
    await check('klik w spis przenosi rozdział pod górną krawędź i zaznacza go', async () => {
      await shell.locator('.toc-row', { hasText: 'Spis treści' }).click()
      await until(shell, () => document.querySelector('.toc-row.on')?.textContent === 'Spis treści')
      await waitFor(async () => {
        const top = await essayPage.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Spis treści')?.getBoundingClientRect().top)
        return top > 0 && top < 80
      })
    })

    await check('przewijanie dokumentu przesuwa bieżący rozdział', async () => {
      await essayPage.mouse.move(400, 400)
      await essayPage.mouse.wheel(0, -500)
      await until(shell, () => document.querySelector('.toc-row.on')?.textContent !== 'Spis treści')
    })

    await windowShot(app, join(artifacts, 'outline-essay-jump.png'))

    await check('klik w minimapę przewija dokument w to miejsce', async () => {
      const before = await essayPage.evaluate(() => scrollY)
      const { width, end } = await essayPage.evaluate(() => ({ width: document.documentElement.clientWidth, end: document.documentElement.scrollHeight - innerHeight }))
      // Szkic ma 1/8 wysokości dokumentu, więc jego dół leży nad końcem pasa.
      const bottom = 12 + Math.round((end + (await essayPage.evaluate(() => innerHeight))) / 8) - 6
      await essayPage.mouse.click(width - STRIP / 2, bottom)
      await waitFor(async () => (await essayPage.evaluate(() => scrollY)) > before + 200)
      await essayPage.mouse.click(width - STRIP / 2, 20)
      await waitFor(async () => (await essayPage.evaluate(() => scrollY)) < 120)
    })

    await check('trafienia szukania mają na minimapie barwę podświetleń', async () => {
      await layer.keyboard.press('Control+f')
      await shell.locator('#findInput').fill('orkiestra')
      await until(shell, () => document.querySelector('.find-count')?.textContent === '1 z 1')
      await waitFor(async () => (await stripShot(app, essayPage.url())).amber > 6)
      // Esc w polu zamyka pasek i oddaje klawiaturę dokumentowi.
      await shell.locator('#findInput').press('Escape')
      await waitFor(async () => (await stripShot(app, essayPage.url())).amber === 0)
    })

    await check('w ciemnym motywie szkic jasnieje razem z arkuszem', async () => {
      await essayPage.keyboard.press('t')
      await waitFor(async () => {
        const shot = await stripShot(app, essayPage.url())
        return shot.paper < 200 && shot.ink > 400
      })
      await windowShot(app, join(artifacts, 'outline-essay-dark.png'))
      await essayPage.keyboard.press('t')
      await delay(900)
    })

    await check('Shift G chowa minimapę i przywraca ją', async () => {
      await essayPage.keyboard.press('Shift+G')
      await waitFor(async () => (await stripInk(app, essayPage.url())) < 40)
      assert.equal(await shell.locator('.toc-map[aria-checked="false"]').count(), 1)
      await essayPage.keyboard.press('Shift+G')
      await waitFor(async () => (await stripInk(app, essayPage.url())) > 400)
    })

    await row(COLUMN).click()
    const columnPage = await open(COLUMN)
    await settle(columnPage)

    await check('spis idzie za otwartym dokumentem i nie skleja numeru z tytułem', async () => {
      await until(shell, () => document.querySelector('.toc-row[data-heading="1"]')?.textContent === '1 Rozdział pierwszy')
      assert.equal(await shell.locator('.toc-row').count(), 8)
    })

    await check('długa linia w przewijanym bloku kodu nie zabiera minimapie marginesu', async () => {
      await waitFor(async () => (await stripInk(app, columnPage.url())) > 300)
    })

    await windowShot(app, join(artifacts, 'outline-column.png'))

    await row(WIDE).click()
    const widePage = await open(WIDE)
    await settle(widePage)

    const width = await widePage.evaluate(() => document.documentElement.clientWidth)
    await widePage.mouse.move(width - 400, 300)
    await delay(600)
    const resting = await stripShot(app, widePage.url())
    const body = { columns: [GRIP_COLUMNS, STRIP] }
    const gripColumns = { columns: [0, GRIP_COLUMNS] }

    await check('HTML na całą szerokość nie dostaje minimapy na treści, tylko uchwyt przy krawędzi', async () => {
      const [restingBody, restingGrip] = [await stripShot(app, widePage.url(), body), await stripShot(app, widePage.url(), gripColumns)]
      await widePage.keyboard.press('Shift+G')
      await delay(500)
      const [withoutBody, withoutGrip] = [await stripShot(app, widePage.url(), body), await stripShot(app, widePage.url(), gripColumns)]
      await widePage.keyboard.press('Shift+G')
      await delay(500)
      assert.ok(changed(restingBody, withoutBody) < 30, `pas różni się o ${changed(restingBody, withoutBody)} px`)
      assert.ok(changed(restingGrip, withoutGrip) > 20, `uchwyt ma ${changed(restingGrip, withoutGrip)} px`)
    })

    await check('minimapa wysuwa się spod krawędzi jak szuflada i chowa po odejściu', async () => {
      await widePage.mouse.move(width - 4, 300, { steps: 6 })
      await delay(700)
      await waitFor(async () => changed(resting, await stripShot(app, widePage.url())) > 300)
      await windowShot(app, join(artifacts, 'outline-wide-drawer.png'))
      await widePage.mouse.move(width - 500, 300, { steps: 4 })
      await waitFor(async () => changed(resting, await stripShot(app, widePage.url())) < 30)
    })

    await check('spis zostaje w panelu przy zmianie dokumentu', async () => {
      await until(shell, () => document.querySelectorAll('.toc-row').length === 7)
    })

    await row(BANDS).click()
    const bandsPage = await open(BANDS)
    await settle(bandsPage)
    await bandsPage.mouse.move(400, 400)
    /** Pas i jego okolica z minimapą i bez niej, żeby różnica była samą minimapą. */
    const toggled = async (options) => {
      const on = await stripShot(app, bandsPage.url(), options)
      await bandsPage.keyboard.press('Shift+G')
      await delay(500)
      const off = await stripShot(app, bandsPage.url(), options)
      await bandsPage.keyboard.press('Shift+G')
      await delay(500)
      return changed(on, off)
    }

    await check('tła pasów i ramki sekcji nie spychają minimapy z arkusza', async () => {
      await waitFor(async () => (await toggled({ from: NAV + 8 })) > 300, 8000)
    })

    await check('pas zaczyna się pod przyklejonym paskiem nawigacji', async () => {
      assert.ok((await toggled({ from: 0, to: NAV })) < 20)
    })

    await windowShot(app, join(artifacts, 'outline-bands.png'))

    await check('przy wykresie na całą szerokość minimapa ustępuje i wraca po jego minięciu', async () => {
      await bandsPage.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await delay(700)
      assert.ok((await toggled({ from: NAV + 8, columns: [GRIP_COLUMNS, STRIP] })) < 30)
      assert.ok((await toggled({ from: NAV + 8, columns: [0, GRIP_COLUMNS] })) > 20)
      await windowShot(app, join(artifacts, 'outline-bands-yield.png'))
      await bandsPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
      await waitFor(async () => (await toggled({ from: NAV + 8 })) > 300)
    })

    await layer.keyboard.press('Escape').catch(() => {})
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-outline-'))
  try {
    await outlineFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
