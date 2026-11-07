// Menu wiersza w panelu: ukrywanie folderów, nazwy w apce, ścieżki i rysowanie nad dokumentem.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/rowMenu.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const BODY = `<style>body { margin: 16px }</style><h1>Temat</h1><h2>Cel</h2><h2>Ryzyka</h2>
<p>${'Akapit opisujący łamigłówki i decyzje projektowe. '.repeat(30)}</p>`
const documentNamed = (title) => `<!doctype html><title>${title}</title><body>${BODY}<p>${title}</p></body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function waitFor(read, wanted, timeout = 8000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await read()
    if (wanted(value)) return value
    await delay(50)
  }
  throw new Error(`Nie doczekano się, ostatnia wartość: ${JSON.stringify(value)}`)
}

export async function rowMenuFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'menu-home')
  const docs = join(workspace, 'menu-docs')
  const profile = join(workspace, 'menu-profile')
  await mkdir(home, { recursive: true })
  for (const folder of ['raporty', 'notatki']) await mkdir(join(docs, folder), { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'raporty', 'q1.html'), documentNamed('Kwartał pierwszy'))
  await writeFile(join(docs, 'raporty', 'q2.html'), documentNamed('Kwartał drugi'))
  await writeFile(join(docs, 'notatki', 'n1.html'), documentNamed('Notatka pierwsza'))
  await writeFile(join(docs, 'notatki', 'n2.html'), documentNamed('Notatka druga'))
  await writeFile(join(docs, 'luzny.html'), documentNamed('Luźny dokument'))

  const launch = () =>
    electron.launch({
      args: [entry, `--user-data-dir=${profile}`],
      env: { ...process.env, BIBLIOTTER_HOME: home }
    })
  const readConfig = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
  const readMeta = async (path) => {
    const library = join(home, 'library')
    for (const id of await readdir(library)) {
      const meta = await readFile(join(library, id, 'meta.json'), 'utf8').then(JSON.parse, () => null)
      if (meta?.path === path) return meta
    }
    return null
  }

  let app = await launch()
  try {
    const shell = await app.firstWindow()
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    const row = (name) => shell.locator('.row', { hasText: name })
    const docRow = (name) => shell.locator('.row[data-doc]', { hasText: name })
    const menu = shell.locator('#rowMenu.on')
    const items = () => menu.locator('.ar').allTextContents()
    const openMenu = async (target) => {
      await target.click({ button: 'right' })
      await menu.waitFor()
    }
    const closeMenu = async () => {
      await shell.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
    }
    const pick = async (target, title) => {
      await openMenu(target)
      await menu.getByRole('menuitem', { name: title }).click()
    }
    const allNames = () => shell.locator('.row .lbl').allTextContents()
    await row('raporty').waitFor()
    await delay(600)

    await check('menu folderu ma nazwę, ścieżkę i ukrywanie', async () => {
      await openMenu(row('raporty'))
      assert.deepEqual(await items(), ['Zmień nazwę', 'Pokaż w Eksploratorze', 'Kopiuj ścieżkę', 'Przenieś do archiwum', 'Ukryj folder'])
      await closeMenu()
    })

    await check('menu dokumentu ma otwieranie, kieszeń, nazwę i ścieżkę', async () => {
      await openMenu(docRow('Luźny'))
      assert.deepEqual(await items(), [
        'Otwórz',
        'Zerknij',
        'Włóż do kieszeni',
        'Zmień nazwę',
        'Pokaż w Eksploratorze',
        'Kopiuj ścieżkę',
        'Przenieś do archiwum'
      ])
      await closeMenu()
    })

    await check('wybranego folderu nie da się ukryć z menu projektu', async () => {
      await openMenu(shell.locator('.row.head').first())
      assert.ok(!(await items()).some((title) => title.startsWith('Ukryj')), (await items()).join())
      await closeMenu()
    })

    await check('menu stoi przy kursorze i nie wychodzi poza okno', async () => {
      const box = await row('raporty').boundingBox()
      await shell.mouse.click(box.x + 20, box.y + 10, { button: 'right' })
      await menu.waitFor()
      const { left, top, right, bottom, width, height } = await menu.evaluate((element) => {
        const r = element.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }
      })
      assert.ok(Math.abs(left - (box.x + 20)) < 16, `lewa krawędź ${left}`)
      assert.ok(Math.abs(top - (box.y + 10)) < 16, `góra ${top}`)
      assert.ok(right <= width && bottom <= height)
      await closeMenu()
    })

    await check('klik obok zamyka menu', async () => {
      await openMenu(row('raporty'))
      const box = await shell.locator('#homeBtn').boundingBox()
      await shell.mouse.click(box.x + 300, box.y + 300)
      await menu.waitFor({ state: 'detached' })
      await shell.keyboard.press('Escape')
    })

    await check('strzałki i Enter wybierają akcję', async () => {
      await openMenu(docRow('Luźny'))
      await shell.keyboard.press('ArrowDown')
      await shell.keyboard.press('Enter')
      await menu.waitFor({ state: 'detached' })
      await shell.locator('.pane.focused .pl-title', { hasText: 'Luźny dokument' }).waitFor()
    })

    await check('menu nad otwartym dokumentem jest widoczne, a dokument wraca do życia', async () => {
      await shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))
      await openMenu(docRow('Luźny'))
      await shell.locator('canvas.sheet-frame').first().waitFor({ state: 'attached' })
      await delay(500)
      await shell.screenshot({ path: join(artifacts, 'row-menu.png') })
      await closeMenu()
      await shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))
    })

    await check('kopiowanie ścieżki trafia do schowka i ma potwierdzenie', async () => {
      await pick(row('raporty'), 'Kopiuj ścieżkę')
      await menu.getByRole('menuitem', { name: 'Skopiowano' }).waitFor()
      await menu.waitFor({ state: 'detached' })
      assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), join(docs, 'raporty'))
    })

    await check('paleta też kopiuje ścieżkę do schowka', async () => {
      const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
      await layer.locator('#cmdBtn').click()
      await layer.locator('#cmdInput').fill('Luźny')
      await layer.locator('.cr', { hasText: 'Luźny dokument' }).waitFor()
      await layer.keyboard.press('Control+Shift+C')
      await waitFor(() => app.evaluate(({ clipboard }) => clipboard.readText()), (text) => text === join(docs, 'luzny.html'))
      await layer.keyboard.press('Escape')
      await layer.locator('.dock.wide').waitFor({ state: 'detached' })
    })

    await check('pokazanie w Eksploratorze dostaje prawdziwą ścieżkę', async () => {
      await app.evaluate(({ shell: electronShell }) => {
        globalThis.revealed = []
        electronShell.showItemInFolder = (path) => void globalThis.revealed.push(path)
      })
      await pick(row('notatki'), 'Pokaż w Eksploratorze')
      await pick(docRow('Luźny'), 'Pokaż w Eksploratorze')
      await waitFor(() => app.evaluate(() => globalThis.revealed.length), (count) => count === 2)
      assert.deepEqual(await app.evaluate(() => globalThis.revealed), [join(docs, 'notatki'), join(docs, 'luzny.html')])
    })

    const field = shell.locator('.row-edit')

    await check('nowa nazwa folderu zostaje w apce, a folder na dysku się nie zmienia', async () => {
      await pick(row('raporty'), 'Zmień nazwę')
      await field.waitFor()
      assert.equal(await field.inputValue(), 'raporty')
      await shell.screenshot({ path: join(artifacts, 'row-rename.png') })
      await field.fill('Kwartalne')
      await field.press('Enter')
      await row('Kwartalne').waitFor()
      await field.waitFor({ state: 'detached' })
      assert.deepEqual(await readdir(join(docs, 'raporty')), ['q1.html', 'q2.html'])
      assert.deepEqual((await readConfig()).folderNames, { [join(docs, 'raporty')]: 'Kwartalne' })
    })

    await check('Esc rezygnuje ze zmiany nazwy i nie cofa innych kroków', async () => {
      await pick(docRow('Luźny'), 'Zmień nazwę')
      await field.waitFor()
      await field.fill('Niechciana')
      await field.press('Escape')
      await field.waitFor({ state: 'detached' })
      assert.ok(!(await allNames()).includes('Niechciana'))
      await shell.locator('.pane.focused .pl-title', { hasText: 'Luźny dokument' }).waitFor()
    })

    await check('nazwa dokumentu działa w arkuszu, a plik zostaje nietknięty', async () => {
      await pick(docRow('Luźny'), 'Zmień nazwę')
      await field.waitFor()
      await field.fill('Mój dokument')
      await field.press('Enter')
      await docRow('Mój dokument').waitFor()
      await shell.locator('.pane.focused .pl-title', { hasText: 'Mój dokument' }).waitFor()
      assert.ok((await readdir(docs)).includes('luzny.html'))
    })

    await check('oryginalną nazwę można przywrócić z menu', async () => {
      await openMenu(docRow('Mój dokument'))
      assert.ok((await items()).includes('Przywróć nazwę'))
      await menu.getByRole('menuitem', { name: 'Przywróć nazwę' }).click()
      await docRow('Luźny dokument').waitFor()
    })

    const archivedRow = (name) => shell.locator('.row.archived[data-doc]', { hasText: name })

    await check('dokument trafia z menu do archiwum i wraca z niego przez Odarchiwizuj', async () => {
      await pick(docRow('Kwartał drugi'), 'Przenieś do archiwum')
      // Archiwum startuje zwinięte, więc dokument najpierw znika z widoku.
      await row('Archiwum').waitFor()
      await waitFor(() => docRow('Kwartał drugi').count(), (count) => count === 0)
      await row('Archiwum').click()
      await openMenu(archivedRow('Kwartał drugi'))
      const titles = await items()
      assert.equal(titles.at(-1), 'Odarchiwizuj')
      assert.ok(!titles.includes('Przenieś do archiwum'), titles.join())
      await menu.getByRole('menuitem', { name: 'Odarchiwizuj' }).click()
      await waitFor(() => row('Archiwum').count(), (count) => count === 0)
      await docRow('Kwartał drugi').waitFor()
      // Wskazany przez użytkownika dokument nie wraca do skrzynki.
      await waitFor(() => readMeta(join(docs, 'raporty', 'q2.html')).then((meta) => meta?.status), (status) => status === 'read')
    })

    await check('cały folder trafia do archiwum i wraca z niego razem', async () => {
      await pick(row('notatki'), 'Przenieś do archiwum')
      // Archiwum zostało rozwinięte w poprzednim kroku i apka to pamięta.
      await waitFor(() => archivedRow('Notatka').count(), (count) => count === 2)
      await delay(600)
      await openMenu(row('notatki'))
      assert.deepEqual((await items()).slice(-2), ['Odarchiwizuj', 'Ukryj folder'])
      await delay(400)
      await shell.screenshot({ path: join(artifacts, 'row-archive.png') })
      await menu.getByRole('menuitem', { name: 'Odarchiwizuj' }).click()
      await waitFor(() => row('Archiwum').count(), (count) => count === 0)
      await docRow('Notatka pierwsza').waitFor()
      await docRow('Notatka druga').waitFor()
    })

    await check('ukryty folder znika z biblioteki, a jego dokument z arkusza', async () => {
      await docRow('Notatka pierwsza').click()
      await shell.locator('.pane.focused .pl-title', { hasText: 'Notatka pierwsza' }).waitFor()
      await pick(row('notatki'), 'Ukryj folder')
      await waitFor(allNames, (names) => !names.includes('notatki'), 1000)
      await waitFor(allNames, (names) => !names.some((name) => name.startsWith('Notatka')))
      await waitFor(() => shell.locator('.pane.focused .pl-title', { hasText: 'Notatka' }).count(), (count) => count === 0)
      assert.deepEqual((await readConfig()).hiddenFolders, [join(docs, 'notatki')])
      assert.deepEqual((await readdir(join(docs, 'notatki'))).length, 2)
    })

    await check('wyszukiwarka nie znajduje dokumentów z ukrytego folderu', async () => {
      const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
      await layer.locator('#cmdBtn').click()
      await layer.locator('#cmdInput').fill('Notatka')
      await delay(400)
      assert.equal(await layer.locator('.cr', { hasText: 'Notatka' }).count(), 0)
      await layer.keyboard.press('Escape')
      await layer.locator('.dock.wide').waitFor({ state: 'detached' })
    })

    assert.deepEqual(errors, [])
  } finally {
    await app.close()
  }

  app = await launch()
  try {
    const shell = await app.firstWindow()
    const row = (name) => shell.locator('.row', { hasText: name })
    await row('Kwartalne').waitFor()

    await check('ukrycie i nazwy przetrwają ponowne uruchomienie', async () => {
      assert.equal(await row('Notatka').count(), 0)
      await shell.locator('.rb[data-view="folders"]').click()
      await shell.locator('.f-row', { hasText: 'notatki' }).waitFor()
      await delay(500)
      await shell.screenshot({ path: join(artifacts, 'hidden-folders.png') })
    })

    await check('przywrócony folder wraca do biblioteki', async () => {
      await shell.getByRole('button', { name: `Przywróć ${join(docs, 'notatki')}` }).click()
      await shell.locator('.f-row', { hasText: 'notatki' }).waitFor({ state: 'detached' })
      await shell.locator('.rb[data-view="library"]').click()
      await row('Notatka pierwsza').waitFor()
      assert.deepEqual((await readConfig()).hiddenFolders, [])
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-menu-'))
  await mkdir(artifacts, { recursive: true })
  try {
    await rowMenuFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
