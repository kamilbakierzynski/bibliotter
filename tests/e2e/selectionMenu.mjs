// Menu zaznaczonego tekstu: wyrasta po zaznaczeniu, a prawy przycisk stawia je pod kursorem.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/selectionMenu.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const BODY = `<style>body { margin: 16px; font: 16px/28px sans-serif }</style><h1>Przegląd projektu</h1>
<h2>Cel</h2><p id="pierwszy">${'Symulator zarządzania prywatnym portem lotniczym w trzech wymiarach. '.repeat(6)}</p>
<h2>Ryzyka</h2><p id="drugi">${'Każdy pasażer jest agentem z własnymi preferencjami i potrzebami. '.repeat(6)}</p>
<p id="trzeci">${'Gra jest skalowana do pięćdziesięciu tysięcy pasażerów naraz. '.repeat(6)}</p>
<div style="height: 1400px"></div>`
const documentNamed = (title) => `<!doctype html><title>${title}</title><body>${BODY}</body>`

/*
 * Menu leży w zamkniętym Shadow DOM, więc test trafia w wiersze z układu menu: 5 px odstępu,
 * wiersze po 30 px i kreski po 9 px. Prawy przycisk stawia lewy górny róg menu pod kursorem.
 */
const ROW = { copy: 20, comment: 50, sticky: 80, highlight: 110, step: 149, find: 188, search: 218 }
const MENU_W = 252
/** Środki próbek koloru w wierszu Zakreśl, od prawej krawędzi menu. */
const SWATCH = { pink: 20.5, green: 40.5, blue: 60.5, yellow: 80.5 }

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function waitFor(read, wanted, timeout = 6000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await read()
    if (wanted(value)) return value
    await delay(50)
  }
  throw new Error(`Nie doczekano się, ostatnia wartość: ${JSON.stringify(value)}`)
}

const clean = (text) => text.replace(/\s+/g, ' ').trim()

export async function selectionMenuFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'selmenu-home')
  const docs = join(workspace, 'selmenu-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'zaznaczenie.html'), documentNamed('Dokument do zaznaczania'))

  const library = join(home, 'library')
  const notes = async () => {
    const found = []
    for (const doc of await readdir(library).catch(() => [])) {
      const folder = join(library, doc, 'annotations')
      for (const file of await readdir(folder).catch(() => [])) {
        if (!file.endsWith('.json')) continue
        const raw = await readFile(join(folder, file), 'utf8').catch(() => null)
        if (raw) found.push(JSON.parse(raw))
      }
    }
    return found
  }
  const route = async () => {
    for (const doc of await readdir(library).catch(() => [])) {
      const raw = await readFile(join(library, doc, 'presentation.json'), 'utf8').catch(() => null)
      if (raw) return JSON.parse(raw)
    }
    return null
  }

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'selmenu-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(6000)
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    const live = () => shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))

    await shell.locator('.row[data-doc]').first().waitFor({ timeout: 30000 })
    await shell.locator('.row[data-doc]', { hasText: 'Dokument do zaznaczania' }).click()
    const page = await waitFor(async () => {
      for (const candidate of app.windows()) {
        if (!candidate.url().startsWith('htmldoc://')) continue
        const shown = await candidate.evaluate(() => innerWidth !== 1040).catch(() => false)
        if (shown && (await candidate.title().catch(() => '')).includes('Dokument do zaznaczania')) return candidate
      }
      return null
    }, Boolean)
    await page.waitForLoadState('load')
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await live()
    await delay(350)
    let shots = 0

    /** Zaznacza myszą kawałek pierwszego wiersza akapitu i zwraca zaznaczony tekst. */
    const select = async (id, from = 40, to = 330) => {
      const box = await page.locator(`#${id}`).boundingBox()
      const y = box.y + 14
      await page.mouse.move(box.x + from, y)
      await page.mouse.down()
      await page.mouse.move(box.x + to, y, { steps: 10 })
      await page.mouse.up()
      const text = await page.evaluate(() => getSelection().toString())
      assert.ok(text.trim().length > 5, `zaznaczenie: ${JSON.stringify(text)}`)
      return { text, box, y }
    }
    /** Prawy przycisk w środku zaznaczenia otwiera menu z rogiem pod kursorem. */
    const menuAt = async ({ box, y }) => {
      const at = { x: box.x + 120, y }
      await page.mouse.click(at.x, at.y, { button: 'right' })
      await delay(450)
      shots += 1
      await writeFile(join(artifacts, `selection-menu-${shots}.png`), await page.screenshot())
      return at
    }
    const pick = async (at, row, dx = 60) => {
      await page.mouse.click(at.x + dx, at.y + ROW[row])
    }

    await check('menu wyrasta przy końcu zaznaczenia po puszczeniu myszy', async () => {
      const box = await page.locator('#pierwszy').boundingBox()
      const below = { x: Math.round(box.x + 80), y: Math.round(box.y + 30), width: 300, height: 120 }
      const before = await page.screenshot({ clip: below })
      await select('pierwszy')
      await delay(500)
      const after = await page.screenshot({ clip: below })
      await writeFile(join(artifacts, 'selection-menu.png'), await page.screenshot())
      assert.notDeepEqual(after, before, 'pod zaznaczeniem nic się nie pojawiło')
      await page.keyboard.press('Escape')
      await delay(300)
      const closed = await page.screenshot({ clip: below })
      assert.deepEqual(closed, before, 'Esc nie schował menu')
      assert.ok((await page.evaluate(() => getSelection().toString())).length > 5, 'Esc skasował zaznaczenie')
    })

    await check('Kopiuj z menu kładzie zaznaczony tekst do schowka', async () => {
      await app.evaluate(({ clipboard }) => clipboard.writeText('stare'))
      const selected = await select('pierwszy')
      const at = await menuAt(selected)
      await writeFile(join(artifacts, 'selection-menu-right.png'), await page.screenshot())
      await pick(at, 'copy')
      const text = await waitFor(() => app.evaluate(({ clipboard }) => clipboard.readText()), (value) => value !== 'stare')
      assert.equal(clean(text), clean(selected.text))
    })

    await check('Zakreśl w wybranym kolorze zapisuje zakreślenie zaznaczonego tekstu', async () => {
      const selected = await select('drugi')
      const at = await menuAt(selected)
      await page.mouse.click(at.x + MENU_W - SWATCH.blue, at.y + ROW.highlight)
      const mark = await waitFor(async () => (await notes()).find((note) => note.kind === 'highlight'), Boolean)
      assert.equal(mark.color, 'blue')
      assert.equal(mark.anchor.quote, clean(selected.text))
      assert.equal(mark.strokes.length, 1)
      assert.equal(await page.evaluate(() => getSelection().toString()), '', 'zaznaczenie zostało po zakreśleniu')
    })

    await check('Skomentuj otwiera dymek i zapisuje komentarz z cytatem', async () => {
      const selected = await select('trzeci')
      const at = await menuAt(selected)
      await pick(at, 'comment')
      const field = shell.locator('.bubble textarea')
      await field.fill('Komentarz z menu')
      await field.press('Control+Enter')
      const note = await waitFor(
        async () => (await notes()).find((item) => item.messages?.[0]?.text === 'Komentarz z menu'),
        Boolean
      )
      assert.equal(note.kind, 'comment')
      assert.equal(note.anchor.quote, clean(selected.text))
    })

    await check('Dodaj krok zapisuje krok z kadrem akapitu i początkiem cytatu w tytule', async () => {
      await live()
      const selected = await select('drugi', 20, 260)
      const at = await menuAt(selected)
      await pick(at, 'step')
      const stored = await waitFor(route, (value) => value?.steps?.length === 1)
      const [step] = stored.steps
      assert.equal(step.camera.kind, 'area')
      assert.match(step.camera.anchor.selector, /#drugi|p:nth/)
      // Obszar obejmuje zaznaczone wiersze, a nie cały akapit.
      assert.ok(step.camera.box.height < 0.8 && step.camera.box.width > 0, `obszar: ${JSON.stringify(step.camera.box)}`)
      assert.ok(clean(selected.text).startsWith(step.title.replace(/…$/, '')), `tytuł: ${step.title}`)
      // Formularz trasy otwiera się z nowym krokiem wybranym.
      await shell.locator(`#routeForm [data-step="${step.id}"][aria-current="step"]`).waitFor({ state: 'visible', timeout: 4000 })
      await live()
      await delay(400)
      await writeFile(join(artifacts, 'selection-menu-step.png'), await page.screenshot())
    })

    await check('Znajdź w dokumencie wpisuje zaznaczenie do paska szukania', async () => {
      await delay(700)
      const selected = await select('pierwszy', 40, 200)
      const at = await menuAt(selected)
      await pick(at, 'find')
      await waitFor(() => shell.evaluate(() => document.getElementById('findInput')?.value ?? ''), (value) => value !== '')
      assert.equal(await shell.evaluate(() => document.getElementById('findInput').value), clean(selected.text))
      await shell.locator('#findInput').press('Escape')
    })

    await check('menu zaznaczenia nie zostawia błędów strony', async () => {
      assert.deepEqual(errors, [])
    })
  } finally {
    await app.close().catch(() => {})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entry = process.env.E2E_ENTRY ? resolve(process.env.E2E_ENTRY) : projectRoot
  const workspace = await mkdtemp(join(tmpdir(), 'selection-menu-'))
  const results = []
  const check = async (name, run) => {
    try {
      await run()
      results.push(['OK', name])
    } catch (error) {
      results.push(['BŁĄD', `${name}: ${error.message.split('\n')[0]}`])
    }
    console.log(results.at(-1).join('  '))
  }
  await selectionMenuFlow(workspace, { check, entry }).catch((error) => {
    results.push(['BŁĄD', error.message])
    console.log(error)
  })
  await rm(workspace, { recursive: true, force: true }).catch(() => {})
  process.exitCode = results.some(([status]) => status !== 'OK') ? 1 : 0
}
