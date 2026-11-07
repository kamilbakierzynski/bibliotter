// Wzory w arkuszu Markdownu: czcionki pod CSP, motywy, długie wzory i zaznaczanie.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/math.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const prose = 'Zdanie opisujące decyzję w dokumencie, które robi tu objętość. '.repeat(16)
const longFormula = Array.from({ length: 40 }, (_, index) => `x_{${index}}`).join(' + ')

const mathDoc = `# Wzory w dokumencie

Masa i energia wiążą się przez $E = mc^2$, a pierwiastki równania to \\(x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}\\). Bilet kosztuje $5 albo $10.

## Całki i sumy

${prose}

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}, \\qquad \\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

\\[
\\mathbf{A} = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\quad
f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}
\\]

\`\`\`math
\\overrightarrow{AB} + \\widehat{xyz} = \\mathcal{L}\\{f\\}(s)
\`\`\`

## Długi wzór

$$
${longFormula}
$$

## Błąd

Ten wzór jest zepsuty: $\\frac{a$ i tekst idzie dalej.

${prose}
`

const COLORS = { light: 'rgb(23, 24, 26)', dark: 'rgb(244, 244, 245)' }

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function documentPage(app) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (!page.url().startsWith('htmldoc://')) continue
      const width = await page.evaluate(() => innerWidth).catch(() => 1040)
      if (width !== 1040 && (await page.title().catch(() => '')).includes('Wzory')) return page
    }
    await delay(100)
  }
  throw new Error('Nie znaleziono dokumentu ze wzorami')
}

export async function mathFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'math-home')
  const docs = join(workspace, 'math-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(docs, 'wzory.md'), mathDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'math-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home },
    colorScheme: null
  })
  try {
    const shell = await app.firstWindow()
    await shell.locator('.row[data-doc]', { hasText: 'Wzory w dokumencie' }).click()
    const page = await documentPage(app)
    await shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))
    await page.evaluate(() => document.fonts.ready)

    await check('każda notacja składa się we wzór, a ceny zostają tekstem', async () => {
      const found = await page.evaluate(() => ({
        inline: document.querySelectorAll('p [role="math"] > .katex').length,
        display: document.querySelectorAll('.katex-display').length,
        broken: document.querySelectorAll('.katex-error').length,
        prices: document.querySelector('p').textContent.includes('$5 albo $10')
      }))
      assert.deepEqual(found, { inline: 2, display: 4, broken: 1, prices: true })
    })

    await check('czcionki wzorów ładują się mimo blokady CSP', async () => {
      const loaded = await page.evaluate(() =>
        [...document.fonts].filter((font) => font.family.includes('KaTeX') && font.status === 'loaded').map((font) => font.family)
      )
      assert.ok(loaded.some((family) => family.includes('KaTeX_Main')), loaded.join())
      assert.ok(loaded.some((family) => family.includes('KaTeX_Math')), loaded.join())
    })

    await check('ułamek, pierwiastek i strzałka mają kształt', async () => {
      const shapes = await page.evaluate(() => {
        const size = (selector) => {
          const { width, height } = document.querySelector(selector).getBoundingClientRect()
          return width > 0 && height > 0
        }
        return { line: size('.frac-line'), root: size('.sqrt svg'), arrow: size('.overlay svg, .hide-tail svg') }
      })
      assert.deepEqual(shapes, { line: true, root: true, arrow: true })
    })

    await check('długi wzór przewija się w sobie i nie rozpycha strony', async () => {
      const box = await page.evaluate(() => {
        const long = [...document.querySelectorAll('.katex-display')].at(-1)
        return { inside: long.scrollWidth > long.clientWidth, page: document.documentElement.scrollWidth <= innerWidth }
      })
      assert.deepEqual(box, { inside: true, page: true })
    })

    await check('wysoki wzór mieści się w pionie', async () => {
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('.katex-display')].flatMap((math) => {
          const box = math.getBoundingClientRect()
          return [...math.querySelectorAll('.katex-base')]
            .map((part) => part.getBoundingClientRect())
            .filter(({ top, bottom }) => top < box.top - 1 || bottom > box.bottom + 1)
            .map(({ top, bottom }) => `${top - box.top}/${box.bottom - bottom}`)
        })
      )
      assert.deepEqual(clipped, [])
    })

    await check('uwaga z cytatem przez wzór zostaje przy swoim miejscu', async () => {
      await page.evaluate(() => {
        const paragraph = document.querySelector('p')
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
        const first = walker.nextNode()
        let last = first
        for (let node = first; node; node = walker.nextNode()) last = node
        const range = document.createRange()
        range.setStart(first, first.data.indexOf('wiążą'))
        range.setEnd(last, last.data.indexOf('Bilet'))
        getSelection().removeAllRanges()
        getSelection().addRange(range)
      })
      const layer = app.windows().find((candidate) => candidate !== shell && candidate.url() === 'about:blank')
      await layer.locator('.tray-s .ask', { hasText: 'Skomentuj' }).click()
      await shell.locator('.draft .bubble').waitFor()
      await shell.getByLabel('Treść uwagi').fill('Uwaga do wzoru')
      await shell.getByRole('button', { name: 'Zapisz' }).click()
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      await page.reload()
      await page.evaluate(() => document.fonts.ready)
      await delay(500)
      await page.keyboard.press('i')
      const thread = shell.locator('.thread', { hasText: 'Uwaga do wzoru' }).first()
      await thread.waitFor()
      assert.equal(await shell.locator('.th-flag').count(), 0)
      await delay(300)
      await page.screenshot({ path: join(artifacts, 'math-quote.png') })
      await page.keyboard.press('i')
    })

    const shot = (name) => page.screenshot({ path: join(artifacts, name) })
    await check('wzór idzie za motywem', async () => {
      for (const mode of ['light', 'dark']) {
        if ((await shell.evaluate(() => document.documentElement.dataset.mode)) !== mode) await page.keyboard.press('t')
        await page.waitForFunction((ink) => getComputedStyle(document.querySelector('.katex')).color === ink, COLORS[mode])
        await delay(500)
        await shot(`math-${mode}.png`)
      }
    })

    await check('wzory stoją w obu miejscach strony: akapit i blok', async () => {
      await page.evaluate(() => document.querySelector('h2:last-of-type').scrollIntoView())
      await delay(200)
      await shot('math-long.png')
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-math-'))
  await mkdir(artifacts, { recursive: true })
  try {
    await mathFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
