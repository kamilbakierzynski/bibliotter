// Cofanie uwag: Ctrl+Z i Ctrl+Shift+Z w dokumencie i w powłoce, a pola tekstowe zostają przy swoim cofaniu.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/undo.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

const BODY = `<style>body { margin: 16px; font: 16px/28px sans-serif }</style><h1>Temat</h1><h2>Cel</h2><h2>Ryzyka</h2>
<p id="tekst">${'Akapit opisujący łamigłówki i decyzje projektowe. '.repeat(30)}</p>
<input id="pole" value=""><div style="height: 1400px"></div>`
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

export async function undoFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'undo-home')
  const docs = join(workspace, 'undo-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'cofanie.html'), documentNamed('Dokument do cofania'))
  await writeFile(join(docs, 'drugi.html'), documentNamed('Drugi dokument'))

  const notes = async () => {
    const library = join(home, 'library')
    const found = []
    for (const doc of await readdir(library).catch(() => [])) {
      const folder = join(library, doc, 'annotations')
      for (const file of await readdir(folder).catch(() => [])) {
        if (!file.endsWith('.json')) continue
        // Plik może zniknąć między listą a odczytem, bo właśnie to cofamy.
        const raw = await readFile(join(folder, file), 'utf8').catch(() => null)
        if (raw) found.push(JSON.parse(raw))
      }
    }
    return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  const count = (kind) => async () => (await notes()).filter((note) => note.kind === kind).length
  const expectCount = (kind, wanted) => waitFor(count(kind), (value) => value === wanted)

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'undo-profile')}`],
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
    const openDocument = async (title) => {
      await shell.locator('.row[data-doc]', { hasText: title }).click()
      const page = await waitFor(async () => {
        for (const candidate of app.windows()) {
          if (!candidate.url().startsWith('htmldoc://')) continue
          const shown = await candidate.evaluate(() => innerWidth !== 1040).catch(() => false)
          if (shown && (await candidate.title().catch(() => '')).includes(title)) return candidate
        }
        return null
      }, Boolean)
      await page.waitForLoadState('load')
      await live()
      await delay(350)
      return page
    }
    const tip = () => layer.locator('#tip.on').innerText()
    const said = (text) => waitFor(tip, (value) => value.includes(text))

    // Pierwszy skan bywa wolny, gdy maszyna pracuje nad czymś innym.
    await shell.locator('.row[data-doc]').first().waitFor({ timeout: 30000 })
    const page = await openDocument('Dokument do cofania')
    const box = await page.locator('#tekst').boundingBox()
    page.on('pageerror', (error) => errors.push(String(error)))

    const write = async (key, at, text) => {
      await page.keyboard.press(key)
      await page.mouse.click(box.x + at, box.y + 40)
      const field = shell.locator('.bubble textarea')
      await field.fill(text)
      await field.press('Control+Enter')
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      await live()
    }
    const swipe = async (y) => {
      await page.mouse.move(box.x + 6, y)
      await page.mouse.down()
      await page.mouse.move(box.x + 300, y + 1, { steps: 8 })
      await delay(80)
      await page.mouse.up()
    }

    await check('Ctrl+Z w dokumencie cofa dodanie komentarza, a Ctrl+Shift+Z je przywraca', async () => {
      await write('c', 120, 'Komentarz do cofnięcia')
      await expectCount('comment', 1)
      const [created] = await notes()
      await page.keyboard.press('Control+z')
      await expectCount('comment', 0)
      await said('Cofnięto: dodanie komentarza')
      await page.keyboard.press('Control+Shift+z')
      await expectCount('comment', 1)
      await said('Przywrócono: dodanie komentarza')
      assert.deepEqual((await notes()).map(({ id }) => id), [created.id])
    })

    await check('jedno naciśnięcie to jeden krok, także z dokumentu', async () => {
      await write('n', 220, 'Karteczka druga')
      await expectCount('sticky', 1)
      await page.keyboard.press('Control+z')
      await expectCount('sticky', 0)
      await delay(300)
      assert.equal(await count('comment')(), 1)
      await page.keyboard.press('Control+Shift+z')
      await expectCount('sticky', 1)
    })

    await check('komunikat mieści się w wycięciu warstwy doku', async () => {
      await page.keyboard.press('Control+z')
      await said('Cofnięto: dodanie karteczki')
      // Komunikat gaśnie po chwili, więc wycięcie mierzymy tylko wtedy, gdy jeszcze świeci.
      const { on } = await waitFor(
        async () => {
          const tipBox = await layer.locator('#tip').evaluate((element) => {
            const { left, top, right, bottom } = element.getBoundingClientRect()
            return { left, top, right, bottom, on: element.classList.contains('on') }
          })
          // Nad dokiem leży jeszcze wycięcie kart linków, ale bez karty jest schowane.
          const room = await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].contentView.children.filter((child) => child.getVisible()).at(-1).getBounds()
          )
          const fits =
            room.y <= tipBox.top &&
            room.x <= tipBox.left &&
            room.x + room.width >= tipBox.right &&
            room.y + room.height >= tipBox.bottom
          return { ...tipBox, room, fits }
        },
        (state) => state.fits && state.on,
        1500
      )
      assert.equal(on, true)
      await page.keyboard.press('Control+Shift+z')
      await expectCount('sticky', 1)
    })

    await check('Ctrl+Z cofa zakreślenie, które jeszcze czeka na zapis, i nie zostawia szkicu', async () => {
      // Przywrócona karteczka jeszcze się przykleja, więc zrzut czeka, aż arkusz przestanie się ruszać.
      const park = async () => {
        await page.mouse.move(box.x + box.width - 4, box.y + box.height + 200)
        await delay(500)
        let last = await page.screenshot()
        return waitFor(async () => {
          await delay(150)
          const shot = await page.screenshot()
          const still = shot.equals(last)
          last = shot
          return still ? shot : null
        }, Boolean)
      }
      const clean = await park()
      await page.keyboard.press('m')
      await shell.locator('#app[data-tool="highlight"]').waitFor({ state: 'attached' })
      await swipe(box.y + 14)
      await page.keyboard.press('Control+z')
      await said('Cofnięto: dodanie zakreślenia')
      await expectCount('highlight', 0)
      await delay(1100)
      assert.equal(await count('highlight')(), 0)
      await page.keyboard.press('v')
      await shell.locator('#app[data-tool="move"]').waitFor({ state: 'attached' })
      assert.ok(clean.equals(await park()), 'na arkuszu został szkic zakreślenia')
      await page.keyboard.press('Control+Shift+z')
      await expectCount('highlight', 1)
      assert.ok(!clean.equals(await park()), 'przywrócone zakreślenie nie wróciło na arkusz')
    })

    await check('prawy przycisk usuwa zakreślenie, a Ctrl+Z je oddaje', async () => {
      await page.keyboard.press('m')
      await shell.locator('#app[data-tool="highlight"]').waitFor({ state: 'attached' })
      await delay(400)
      await page.mouse.click(box.x + 100, box.y + 14, { button: 'right' })
      await expectCount('highlight', 0)
      await page.keyboard.press('Control+z')
      await expectCount('highlight', 1)
      await said('Cofnięto: usunięcie zakreślenia')
      await page.keyboard.press('v')
      await shell.locator('#app[data-tool="move"]').waitFor({ state: 'attached' })
    })

    await check('Ctrl+Z w polu dokumentu cofa tekst pola, a nie uwagę', async () => {
      const before = (await notes()).length
      const field = page.locator('#pole')
      await field.click()
      await page.keyboard.type('abc')
      await page.keyboard.press('Control+z')
      await waitFor(() => field.inputValue(), (value) => value === '')
      await delay(300)
      assert.equal((await notes()).length, before)
      await page.mouse.click(box.x + box.width - 4, box.y + box.height + 200)
    })

    await check('Ctrl+Z w polu szkicu cofa pisanie, a nie uwagę', async () => {
      const before = (await notes()).length
      await page.keyboard.press('c')
      await page.mouse.click(box.x + 320, box.y + 40)
      const field = shell.locator('.bubble textarea')
      await field.pressSequentially('abc')
      await field.press('Control+z')
      // Przeglądarka sama decyduje, ile znaków to jeden krok.
      await waitFor(() => field.inputValue(), (value) => value !== 'abc')
      await delay(300)
      assert.equal((await notes()).length, before)
      await field.press('Escape')
      await shell.locator('.bubble').waitFor({ state: 'detached' })
      await live()
    })

    await check('cofa zamknięcie uwagi przy fokusie w powłoce', async () => {
      await page.keyboard.press('i')
      const card = shell.locator('.thread', { hasText: 'Komentarz do cofnięcia' })
      await card.locator('.th-head').click()
      await card.locator('.reply .mini').click()
      await waitFor(async () => (await notes())[0].status, (value) => value === 'resolved')
      await shell.locator('.thread').first().waitFor()
      await shell.evaluate(() => document.activeElement?.blur())
      await shell.keyboard.press('Control+z')
      await waitFor(async () => (await notes())[0].status, (value) => value === 'open')
      await said('Cofnięto: zamknięcie uwagi')
      await page.keyboard.press('i')
      await live()
    })

    await check('historia należy do dokumentu i nie cofa niewidocznych zmian', async () => {
      const before = (await notes()).length
      const other = await openDocument('Drugi dokument')
      await other.keyboard.press('Control+z')
      await delay(400)
      assert.equal((await notes()).length, before)
    })

    await check('ściąga i paleta znają skróty cofania', async () => {
      await shell.locator('.row[data-doc]', { hasText: 'Dokument do cofania' }).click()
      await live()
      await page.keyboard.press('?')
      await layer.getByText('Cofnij zmianę uwag', { exact: true }).first().waitFor()
      await layer.getByText('Przywróć zmianę uwag', { exact: true }).first().waitFor()
      await layer.locator('#cmdInput').press('Escape')
    })

    await check('cofanie nie zgłasza błędów strony', () => assert.deepEqual(errors, []))
  } finally {
    await app.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entry = process.env.E2E_ENTRY ? resolve(process.env.E2E_ENTRY) : projectRoot
  const workspace = await mkdtemp(join(tmpdir(), 'undo-'))
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
  await undoFlow(workspace, { check, entry }).catch((error) => {
    results.push(['BŁĄD', error.message])
    console.log(error)
  })
  await rm(workspace, { recursive: true, force: true }).catch(() => {})
  process.exitCode = results.some(([status]) => status !== 'OK') ? 1 : 0
}
