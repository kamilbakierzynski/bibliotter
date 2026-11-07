// Przenoszenie uwag: przeciągnięcie karteczki i pinezki, przycisk Przenieś w wątku, Esc i cofanie.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/moveNote.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

const BODY = `<style>body { margin: 16px; font: 16px/28px sans-serif }</style><h1>Przegląd projektu</h1>
<h2>Cel</h2><p id="tekst">${'Akapit opisujący łamigłówki i decyzje projektowe na kolejny tydzień. '.repeat(10)}</p>
<h2>Ryzyka</h2><p id="cel">${'Drugi akapit, do którego trafi przeniesiona uwaga razem ze swoim wątkiem. '.repeat(8)}</p>
<div style="height: 1400px"></div>`
const documentNamed = (title) => `<!doctype html><title>${title}</title><body>${BODY}</body>`

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

export async function moveNoteFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'move-home')
  const docs = join(workspace, 'move-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'przenoszenie.html'), documentNamed('Dokument do przenoszenia'))

  const notes = async () => {
    const library = join(home, 'library')
    const found = []
    for (const doc of await readdir(library).catch(() => [])) {
      const folder = join(library, doc, 'annotations')
      for (const file of await readdir(folder).catch(() => [])) {
        if (!file.endsWith('.json')) continue
        const raw = await readFile(join(folder, file), 'utf8').catch(() => null)
        if (raw) found.push(JSON.parse(raw))
      }
    }
    return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  const noteSaying = (text) => async () => (await notes()).find((note) => note.messages[0]?.text === text)

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'move-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(6000)
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    const layer = await waitFor(
      async () => app.windows().find((candidate) => candidate !== shell && candidate.url() === 'about:blank'),
      Boolean
    )
    layer.setDefaultTimeout(6000)
    const live = () => shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))
    const tip = () => layer.locator('#tip.on').innerText().catch(() => '')
    const said = (text) => waitFor(tip, (value) => value.includes(text))

    await shell.locator('.row[data-doc]').first().waitFor({ timeout: 30000 })
    await shell.locator('.row[data-doc]', { hasText: 'Dokument do przenoszenia' }).click()
    const page = await waitFor(async () => {
      for (const candidate of app.windows()) {
        if (!candidate.url().startsWith('htmldoc://')) continue
        const shown = await candidate.evaluate(() => innerWidth !== 1040).catch(() => false)
        if (shown && (await candidate.title().catch(() => '')).includes('Dokument do przenoszenia')) return candidate
      }
      return null
    }, Boolean)
    await page.waitForLoadState('load')
    page.on('pageerror', (error) => errors.push(String(error)))
    await live()
    await delay(350)
    const text = await page.locator('#tekst').boundingBox()
    const goal = await page.locator('#cel').boundingBox()

    const write = async (key, at, body) => {
      await page.keyboard.press(key)
      await page.mouse.click(at.x, at.y)
      const field = shell.locator('.bubble textarea')
      await field.fill(body)
      await field.press('Control+Enter')
      return waitFor(noteSaying(body), Boolean)
    }
    /** Punkt kotwicy uwagi na ekranie dokumentu, z elementu i ułamków zapisanych w pliku. */
    const spotOf = async (note) => {
      const box = await page.locator(note.anchor.selector).boundingBox()
      return { x: box.x + note.anchor.offsetX * box.width, y: box.y + note.anchor.offsetY * box.height }
    }
    const around = (spot) => ({ x: Math.round(spot.x - 24), y: Math.round(spot.y - 30), width: 210, height: 130 })
    const drag = async (from, to) => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 14 })
      await delay(60)
      await page.mouse.up()
    }

    const placed = { x: text.x + 40, y: text.y + 20 }
    let sticky

    await check('nowa karteczka przykleja się na miejscu, a potem leży płasko', async () => {
      sticky = await write('n', placed, 'Karteczka do przeniesienia')
      // Zapis i przyklejenie zaczynają się razem, więc zaraz po zapisie karteczka jeszcze siada.
      const early = await page.screenshot({ clip: around(placed) })
      await delay(1300)
      const settled = await page.screenshot({ clip: around(placed) })
      await delay(400)
      assert.ok(!early.equals(settled), 'karteczka nie miała ruchu przyklejania')
      assert.ok(settled.equals(await page.screenshot({ clip: around(placed) })), 'karteczka nie uspokoiła się')
    })

    await check('przeciągnięta karteczka unosi się w ręce i przykleja w nowym miejscu', async () => {
      await live()
      const grip = { x: placed.x + 30, y: placed.y + 14 }
      await page.mouse.move(grip.x, grip.y)
      await delay(700)
      const flat = await page.screenshot({ clip: around(placed) })
      await page.mouse.down()
      await page.mouse.move(grip.x + 9, grip.y, { steps: 3 })
      await page.mouse.move(grip.x, grip.y, { steps: 3 })
      await delay(700)
      const held = await page.screenshot({ clip: around(placed) })
      assert.ok(!flat.equals(held), 'karteczka w ręce wygląda jak leżąca')
      await page.mouse.move(goal.x + 90, goal.y + 40, { steps: 14 })
      await delay(60)
      await page.mouse.up()
      const moved = await waitFor(noteSaying('Karteczka do przeniesienia'), (note) => note?.anchor.selector === '#cel')
      assert.match(moved.anchor.quote, /^Drugi akapit/)
      assert.equal(moved.anchor.heading, 'Ryzyka')
      assert.equal(moved.messages.length, 1)
      assert.equal(moved.docSha, sticky.docSha)
      const spot = await spotOf(moved)
      assert.ok(Math.abs(spot.x - (goal.x + 60)) < 2 && Math.abs(spot.y - (goal.y + 26)) < 2, JSON.stringify(spot))
      await delay(300)
      assert.equal(await shell.locator('.th-pop').count(), 0, 'puszczenie przycisku otworzyło wątek')
    })

    await check('Ctrl+Z oddaje karteczkę na stare miejsce, a Ctrl+Shift+Z przenosi ją z powrotem', async () => {
      await page.keyboard.press('Control+z')
      await said('Cofnięto: przeniesienie karteczki')
      const back = await waitFor(noteSaying('Karteczka do przeniesienia'), (note) => note?.anchor.selector === '#tekst')
      assert.deepEqual(back.anchor, sticky.anchor)
      await page.keyboard.press('Control+Shift+z')
      await said('Przywrócono: przeniesienie karteczki')
      await waitFor(noteSaying('Karteczka do przeniesienia'), (note) => note?.anchor.selector === '#cel')
    })

    const openThread = async (body) => {
      const note = await noteSaying(body)()
      const spot = await spotOf(note)
      const head = note.kind === 'sticky' ? { x: spot.x + 30, y: spot.y + 14 } : { x: spot.x + 11, y: spot.y - 12 }
      await page.mouse.click(head.x, head.y)
      await shell.locator('.th-pop').waitFor()
    }

    await check('przycisk Przenieś odkleja karteczkę, a kliknięcie stawia ją w nowym miejscu', async () => {
      await delay(900)
      await openThread('Karteczka do przeniesienia')
      await shell.locator('.th-pop').getByRole('button', { name: 'Przenieś' }).click()
      await shell.locator('.th-pop').waitFor({ state: 'detached' })
      await said('Kliknij nowe miejsce')
      await live()
      const target = { x: text.x + 220, y: text.y + 50 }
      await page.mouse.move(target.x - 80, target.y + 60, { steps: 4 })
      await page.mouse.move(target.x, target.y, { steps: 8 })
      await delay(150)
      await page.mouse.click(target.x, target.y)
      const moved = await waitFor(noteSaying('Karteczka do przeniesienia'), (note) => note?.anchor.selector === '#tekst')
      const spot = await spotOf(moved)
      assert.ok(Math.abs(spot.x - target.x) < 2 && Math.abs(spot.y - target.y) < 2, JSON.stringify(spot))
    })

    await check('Esc odkłada niesioną uwagę tam, gdzie była, i kolejne kliknięcie jej nie rusza', async () => {
      await delay(900)
      const before = await noteSaying('Karteczka do przeniesienia')()
      await openThread('Karteczka do przeniesienia')
      await shell.locator('.th-pop').getByRole('button', { name: 'Przenieś' }).click()
      await live()
      await page.mouse.move(goal.x + 200, goal.y + 30, { steps: 8 })
      await page.keyboard.press('Escape')
      await delay(300)
      await page.mouse.click(goal.x + 200, goal.y + 30)
      await delay(500)
      assert.deepEqual((await noteSaying('Karteczka do przeniesienia')()).anchor, before.anchor)
    })

    await check('przeciągnięta pinezka przenosi komentarz razem z wątkiem', async () => {
      const tipAt = { x: text.x + 420, y: text.y + 60 }
      const comment = await write('c', tipAt, 'Komentarz do przeniesienia')
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      await live()
      await delay(900)
      await store(comment.id).agentSays('Widzę ten komentarz')
      const head = { x: tipAt.x + 11, y: tipAt.y - 12 }
      await drag(head, { x: goal.x + 311, y: goal.y + 28 })
      const moved = await waitFor(noteSaying('Komentarz do przeniesienia'), (note) => note?.anchor.selector === '#cel')
      assert.deepEqual(
        moved.messages.map(({ author }) => author),
        ['user', 'agent']
      )
      const spot = await spotOf(moved)
      assert.ok(Math.abs(spot.x - (goal.x + 300)) < 2 && Math.abs(spot.y - (goal.y + 40)) < 2, JSON.stringify(spot))
    })

    await check('komentarz do zaznaczonego tekstu przesunięty w obrębie akapitu zachowuje cytat', async () => {
      await delay(900)
      const words = await page.evaluate(() => {
        const node = document.getElementById('tekst').firstChild
        const start = node.data.indexOf('łamigłówki')
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + 'łamigłówki i decyzje'.length)
        getSelection().removeAllRanges()
        getSelection().addRange(range)
        const { right, top } = range.getBoundingClientRect()
        return { right, top }
      })
      await page.keyboard.press('c')
      await shell.locator('.draft .bubble').waitFor()
      await shell.getByLabel('Treść uwagi').fill('Cytat zostaje')
      await shell.getByLabel('Treść uwagi').press('Control+Enter')
      const quoted = await waitFor(noteSaying('Cytat zostaje'), Boolean)
      assert.equal(quoted.anchor.quote, 'łamigłówki i decyzje')
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      await live()
      await delay(900)
      const head = { x: words.right + 11, y: words.top - 12 }
      await drag(head, { x: head.x + 140, y: head.y + 28 })
      const moved = await waitFor(noteSaying('Cytat zostaje'), (note) => note && note.anchor.offsetX !== quoted.anchor.offsetX)
      assert.equal(moved.anchor.selector, '#tekst')
      assert.equal(moved.anchor.quote, 'łamigłówki i decyzje')
    })

    await check('przycisk Przenieś ratuje uwagę, której miejsca nie ma w tej wersji', async () => {
      await delay(900)
      const lost = await noteSaying('Karteczka do przeniesienia')()
      await store(lost.id).rewrite((note) => {
        note.anchor = { selector: '#nie-ma', offsetX: 0, offsetY: 0, quote: 'Tego zdania nie ma w dokumencie', heading: null }
      })
      await page.keyboard.press('i')
      const card = shell.locator('#threads .thread', { hasText: 'Karteczka do przeniesienia' })
      await card.locator('.th-flag', { hasText: 'Nie ma tego miejsca w tej wersji' }).waitFor()
      await card.locator('.th-head').click()
      await card.getByRole('button', { name: 'Przenieś' }).click()
      await live()
      const target = { x: goal.x + 150, y: goal.y + 60 }
      await page.mouse.move(target.x - 40, target.y - 20, { steps: 4 })
      await page.mouse.move(target.x, target.y, { steps: 6 })
      await delay(150)
      await page.mouse.click(target.x, target.y)
      const found = await waitFor(noteSaying('Karteczka do przeniesienia'), (note) => note?.anchor.selector === '#cel')
      const spot = await spotOf(found)
      assert.ok(Math.abs(spot.x - target.x) < 2 && Math.abs(spot.y - target.y) < 2, JSON.stringify(spot))
      await shell.locator('.th-flag', { hasText: 'Nie ma tego miejsca w tej wersji' }).waitFor({ state: 'detached' })
    })

    await check('przenoszenie nie zgłasza błędów strony', () => assert.deepEqual(errors, []))
  } finally {
    await app.close()
  }

  /** Zmiana pliku uwagi taka, jaką robi agent przez CLI: plik i sygnał dla otwartej apki. */
  function store(id) {
    const rewrite = async (change) => {
      const library = join(home, 'library')
      for (const doc of await readdir(library)) {
        const path = join(library, doc, 'annotations', `${id}.json`)
        const raw = await readFile(path, 'utf8').catch(() => null)
        if (!raw) continue
        const note = JSON.parse(raw)
        change(note)
        await writeFile(path, `${JSON.stringify(note, null, 2)}\n`)
        await mkdir(join(home, 'state', 'signals'), { recursive: true })
        await writeFile(join(home, 'state', 'signals', 'annotations'), new Date().toISOString())
        return
      }
      throw new Error(`Nie ma uwagi ${id}`)
    }
    return {
      rewrite,
      agentSays: (body) =>
        rewrite((note) => {
          note.messages.push({ id: 'm-agent', author: 'agent', text: body, createdAt: new Date().toISOString() })
        })
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entry = process.env.E2E_ENTRY ? resolve(process.env.E2E_ENTRY) : projectRoot
  const workspace = await mkdtemp(join(tmpdir(), 'move-note-'))
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
  await moveNoteFlow(workspace, { check, entry }).catch((error) => {
    results.push(['BŁĄD', error.message])
    console.log(error)
  })
  await rm(workspace, { recursive: true, force: true }).catch(() => {})
  process.exitCode = results.some(([status]) => status !== 'OK') ? 1 : 0
}
