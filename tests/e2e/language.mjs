// Język interfejsu: zmiana w opcjach, obchód paneli po angielsku i powrót po ponownym uruchomieniu.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/language.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

/** Polskie znaki łapią zdania, a słowa bez nich trzeba wymienić. */
const POLISH =
  /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(Akcje|Arkusze|Biblioteka|Dokumenty|Etykiety|Foldery|Kopiuj|Motyw|Niepewne|Opcje|Ostatnie|Otwórz|Skrzynka|Szukaj|Uwagi|Zamknij|Ostatnie|Wszystkie|Praca|Dane|Pomoc)\b/

const BODY = `<style>body { margin: 16px }</style><h1>Topic</h1><h2>Goal</h2><h2>Risks</h2><p>${'A paragraph about design decisions and their reasons. '.repeat(30)}</p>`
const html = (title) => `<!doctype html><title>${title}</title><body>${BODY}</body>`
const prose = 'More text about the plan and the reasons behind it. '.repeat(60)
const markdown = `# Plan\n\n${prose}\n\n## Goal\n\n[Broken](missing.md)\n\n[Alpha](alpha.html)\n\n## Risks\n\n${prose}\n\n## Steps\n\n${prose}\n`
const loose = `A note without any structure. `.repeat(20)

/** Tekst i opisy dostępności, także w elementach schowanych, bo one też kiedyś się pokażą. */
const polishOn = (page) =>
  page.evaluate((source) => {
    const polish = new RegExp(source)
    const found = new Set()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent ?? ''
      if (polish.test(text)) found.add(text.trim())
    }
    for (const element of document.body.querySelectorAll('*')) {
      for (const name of ['title', 'aria-label', 'placeholder', 'data-tip']) {
        const value = element.getAttribute(name)
        if (value && polish.test(value)) found.add(`${name}: ${value}`)
      }
    }
    return [...found]
  }, POLISH.source)

async function dockLayer(app, shell) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
    if (layer) return layer
    await delay(50)
  }
  throw new Error('Nie znaleziono warstwy doku')
}

async function documentPage(app, title) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if ((await page.title().catch(() => '')) === title) return page
    }
    await delay(50)
  }
  throw new Error(`Nie znaleziono dokumentu ${title}`)
}

export async function languageFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'language-home')
  const docs = join(workspace, 'language-docs')
  const profile = join(workspace, 'language-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'alpha.html'), html('Alpha'))
  await writeFile(join(docs, 'beta.html'), html('Beta'))
  await writeFile(join(docs, 'plan.md'), markdown)
  await writeFile(join(docs, 'luzny.md'), loose)

  const launch = () =>
    electron.launch({ args: [entry, `--user-data-dir=${profile}`], env: { ...process.env, BIBLIOTTER_HOME: home } })
  const readConfig = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
  const lang = (page) => page.evaluate(() => document.documentElement.lang)

  let app = await launch()
  let shell = await app.firstWindow()
  try {
    await shell.waitForSelector('.row[data-doc]')
    const layer = await dockLayer(app, shell)
    const radio = (name) => shell.getByRole('radio', { name, exact: true })
    const heading = (text) => shell.locator('.panel-head strong', { hasText: text }).waitFor()
    const clean = async (where) => {
      assert.deepEqual(await polishOn(shell), [], `${where}: powłoka`)
      assert.deepEqual(await polishOn(layer), [], `${where}: dok`)
    }

    await shell.locator('#railOptions').click()

    await check('domyślnym językiem jest polski', async () => {
      await heading('Opcje')
      assert.equal(await radio('Polski').getAttribute('aria-checked'), 'true')
      assert.equal(await lang(shell), 'pl')
    })

    await check('wybór języka zmienia interfejs od razu i trafia do konfiguracji', async () => {
      await radio('English').click()
      await heading('Options')
      await radio('Light').waitFor()
      await shell.getByRole('radio', { name: 'English' }).waitFor()
      await shell.locator('.f-head', { hasText: 'Appearance' }).waitFor()
      assert.equal(await radio('English').getAttribute('aria-checked'), 'true')
      assert.equal(await lang(shell), 'en')
      assert.equal(await lang(layer), 'en')
      await expectConfig(readConfig, 'en')
    })

    await check('strony opcji są po angielsku', async () => {
      await clean('opcje')
      for (const [row, title] of [
        ['AI', 'AI'],
        ['Agent', 'Agent'],
        ['Allowed hosts', 'Allowed hosts']
      ]) {
        await shell.locator('.o-page', { hasText: row }).click()
        await heading(title)
        await delay(100)
        await clean(title)
        await shell.getByRole('button', { name: 'All options' }).click()
        await heading('Options')
      }
    })

    await check('panele szyny są po angielsku', async () => {
      for (const [view, title] of [
        ['inbox', 'Inbox'],
        ['notes', 'Notes'],
        ['labels', 'Labels'],
        ['review', 'Unsure'],
        ['folders', 'Folders'],
        ['library', 'Library']
      ]) {
        await shell.locator(`.rb[data-view="${view}"]`).click()
        await heading(title)
        await delay(100)
        await clean(title)
        if (view === 'review') await shell.getByText('Has content but little structure').waitFor()
      }
    })

    await check('ekran startowy i menu wiersza są po angielsku', async () => {
      await clean('ekran startowy')
      await shell.locator('.row[data-doc]').first().click({ button: 'right' })
      await shell.locator('.row-menu.on').waitFor()
      await clean('menu wiersza')
      await shell.keyboard.press('Escape')
    })

    let page
    await check('otwarty dokument, uwagi i linki są po angielsku', async () => {
      await shell.locator('.row[data-doc]', { hasText: 'Plan' }).click()
      await shell.locator('.pane.focused').waitFor()
      page = await documentPage(app, 'Plan')
      await page.waitForLoadState('load')
      await delay(400)
      await clean('dokument')
      await shell.locator('.pane.focused [data-moved="insp"]').click()
      await shell.locator('#insp').waitFor()
      await delay(100)
      await clean('uwagi')
      await shell.locator('.pane.focused [data-moved="links"]').click()
      await shell.locator('#insp', { hasText: 'From this document' }).waitFor()
      await delay(300)
      await clean('linki')
      await shell.locator('.pane.focused [data-moved="links"]').click()
      await shell.screenshot({ path: join(artifacts, 'language-en.png') })
    })

    await check('dokument dostaje język, więc podpowiedź w nim jest po angielsku', async () => {
      const before = await page.screenshot()
      await page.locator('a[href="missing.md"]').click()
      await delay(400)
      const after = await page.screenshot({ path: join(artifacts, 'language-doc-notice.png') })
      assert.ok(!after.equals(before))
    })

    await check('paleta, ściąga i filtry są po angielsku', async () => {
      await layer.locator('#cmdBtn').click()
      const input = layer.getByRole('textbox', { name: 'Search' })
      await input.waitFor()
      await delay(300)
      await clean('paleta')
      await layer.screenshot({ path: join(artifacts, 'language-palette.png') })
      await input.fill('branch:')
      await layer.locator('.cr, .cmd-none').first().waitFor()
      await input.fill('')
      await input.fill('project:')
      await layer.locator('.cmd-group', { hasText: 'Project' }).waitFor()
      await input.fill('')
      await input.fill('?')
      await layer.getByRole('textbox', { name: 'Search' }).waitFor()
      await layer.locator('.km').waitFor()
      await clean('ściąga')
      await layer.keyboard.press('Escape')
      await layer.keyboard.press('Escape')
    })

    await check('polska nazwa filtra działa też po angielsku', async () => {
      await layer.locator('#cmdBtn').click()
      const input = layer.getByRole('textbox', { name: 'Search' })
      await input.fill('projekt:')
      await layer.locator('.cmd-group', { hasText: 'Project' }).waitFor()
      await input.fill('')
      await layer.keyboard.press('Escape')
    })

    await check('status i etykiety w doku są po angielsku', async () => {
      await layer.locator('#statusBtn').click()
      await delay(200)
      await clean('status')
      await layer.keyboard.press('Escape')
    })
  } finally {
    await app.close()
  }

  app = await launch()
  shell = await app.firstWindow()
  try {
    await check('język wraca po ponownym uruchomieniu, od pierwszego rysowania', async () => {
      await shell.waitForSelector('#railOptions')
      assert.equal(await lang(shell), 'en')
      assert.equal(await shell.locator('#railOptions').getAttribute('aria-label'), 'Options')
    })

    await check('powrót na polski działa tak samo', async () => {
      await shell.locator('.row[data-doc]', { hasText: 'Beta' }).click()
      await shell.locator('.pane.focused').waitFor()
      await shell.locator('#railOptions').click()
      await delay(900)
      await shell.screenshot({ path: join(artifacts, 'language-options.png') })
      const room = () =>
        shell.evaluate(() => {
          const list = document.getElementById('panelItems')
          return { content: list.scrollHeight, room: list.clientHeight }
        })
      const english = await room()
      assert.ok(english.content <= english.room, JSON.stringify(english))
      await shell.getByRole('radio', { name: 'Polski', exact: true }).click()
      await shell.locator('.panel-head strong', { hasText: 'Opcje' }).waitFor()
      assert.equal(await lang(shell), 'pl')
      await expectConfig(readConfig, 'pl')
    })

    await check('dok dopasowuje się do napisów w nowym języku', async () => {
      const layer = await dockLayer(app, shell)
      await delay(600)
      const fit = () =>
        layer.evaluate(() => ({
          dock: Math.round(document.getElementById('dock').getBoundingClientRect().width),
          bar: document.getElementById('bar').offsetWidth,
          text: document.getElementById('barCtxIn').textContent
        }))
      const polish = await fit()
      assert.match(polish.text, /Przeczytane/)
      assert.equal(polish.dock, polish.bar)
      await shell.getByRole('radio', { name: 'English', exact: true }).click()
      await delay(600)
      const english = await fit()
      assert.match(english.text, /Read/)
      assert.notEqual(english.bar, polish.bar)
      assert.equal(english.dock, english.bar)
      await layer.screenshot({ path: join(artifacts, 'language-dock.png') })
    })
  } finally {
    await app.close()
  }
}

async function expectConfig(readConfig, language) {
  const deadline = Date.now() + 3000
  while ((await readConfig()).language !== language) {
    if (Date.now() > deadline) assert.equal((await readConfig()).language, language)
    await delay(50)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-language-'))
  const failed = []
  const check = async (name, run) => {
    try {
      await run()
      console.log('OK  ', name)
    } catch (error) {
      failed.push(name)
      console.log('BŁĄD', name, error.message)
    }
  }
  try {
    await languageFlow(workspace, { check })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
  process.exitCode = failed.length > 0 ? 1 : 0
}
