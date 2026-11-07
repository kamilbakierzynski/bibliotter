// Wstecz i dalej po ostatnio oglądanych dokumentach: przyciski w nagłówku arkusza, Alt ← i Alt →
// z powłoki i z dokumentu oraz boczne przyciski myszy, które okno dostaje jako app-command.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/history.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const FIRST = 'Pierwsza notatka o historii'
const SECOND = 'Druga notatka o historii'
const THIRD = 'Trzecia notatka o historii'

const paragraph = (topic) =>
  `${topic} opisuje, które pliki zmieniamy, w jakiej kolejności i co sprawdzi test po każdym kroku. `.repeat(6)

const docHtml = (title) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title></head>
<body><style>body { margin: 16px; font: 16px/1.6 serif }</style><h1>${title}</h1>${['Streszczenie', 'Kontekst', 'Kroki', 'Ryzyka']
  .map((head) => `<h2>${head}</h2><p>${paragraph(head)}</p>`)
  .join('')}</body></html>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const until = (view, test, argument, what = 'warunek') =>
  view.waitForFunction(test, argument, { polling: 100, timeout: 10000 }).catch((error) => {
    throw new Error(`${what}: ${error.message.split('\n')[0]}`)
  })

export async function historyFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'history-home')
  const repo = join(workspace, 'history-repo')
  await mkdir(home, { recursive: true })
  await mkdir(join(repo, 'docs'), { recursive: true })
  await writeFile(join(repo, 'docs', 'pierwsza.html'), docHtml(FIRST))
  await writeFile(join(repo, 'docs', 'druga.html'), docHtml(SECOND))
  await writeFile(join(repo, 'docs', 'trzecia.html'), docHtml(THIRD))
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo], language: 'pl' }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'history-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(10000)
    const title = (name) => until(shell, (expected) => document.querySelector('.pane.focused .pl-title')?.textContent === expected, name, `tytuł arkusza „${name}”`)
    const isLive = () => until(shell, () => !document.querySelector('canvas.sheet-frame'), undefined, 'żywy dokument')
    const nav = (which) => shell.locator(`.pane.focused .pl-nav [data-nav="${which}"]`)
    const open = async (name) => {
      await shell.locator('.row[data-doc]', { hasText: name }).click()
      await title(name)
      await isLive()
      await delay(300)
    }
    /** Klawisz musi przejść przez `before-input-event` dokumentu, a Playwright przez CDP go omija. */
    const docKey = (name, keyCode, modifiers) =>
      app.evaluate(
        ({ webContents }, [name, keyCode, modifiers]) => {
          const view = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith('htmldoc://') && contents.getTitle() === name)
          if (!view) throw new Error(`brak widoku „${name}”`)
          view.focus()
          view.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
          view.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
        },
        [name, keyCode, modifiers]
      )
    const appCommand = (command) =>
      app.evaluate(({ BrowserWindow }, command) => {
        const window = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('index.html'))
        if (!window) throw new Error('brak okna powłoki')
        window.emit('app-command', {}, command)
      }, command)

    await check('pierwszy dokument nie ma dokąd się cofnąć', async () => {
      await open(FIRST)
      await nav('back').waitFor({ state: 'visible' })
      assert.equal(await nav('back').isDisabled(), true)
      assert.equal(await nav('forward').isDisabled(), true)
    })

    await check('wstecz wraca po kolei do poprzednich dokumentów i podpisuje cel', async () => {
      await open(SECOND)
      await open(THIRD)
      assert.equal(await nav('back').getAttribute('data-tip'), `Wróć do: ${SECOND}`)
      await shell.locator('.pane.focused .placard').screenshot({ path: join(artifacts, 'history-placard.png') })
      await nav('back').click()
      await title(SECOND)
      await isLive()
      await nav('back').click()
      await title(FIRST)
      assert.equal(await nav('back').isDisabled(), true)
      assert.equal(await nav('forward').getAttribute('data-tip'), `Przejdź do: ${SECOND}`)
    })

    await check('dalej idzie z powrotem do przodu', async () => {
      await isLive()
      await nav('forward').click()
      await title(SECOND)
      await isLive()
      await nav('forward').click()
      await title(THIRD)
      assert.equal(await nav('forward').isDisabled(), true)
    })

    await check('Alt ← i Alt → działają z powłoki', async () => {
      await isLive()
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('Alt+ArrowLeft')
      await title(SECOND)
      await isLive()
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('Alt+ArrowRight')
      await title(THIRD)
    })

    await check('Alt ← działa, gdy fokus ma dokument', async () => {
      await isLive()
      await docKey(THIRD, 'Left', ['alt'])
      await title(SECOND)
      await isLive()
      await docKey(SECOND, 'Right', ['alt'])
      await title(THIRD)
    })

    await check('boczne przyciski myszy cofają i idą dalej', async () => {
      await isLive()
      await appCommand('browser-backward')
      await title(SECOND)
      await isLive()
      await appCommand('browser-forward')
      await title(THIRD)
    })

    await check('nowy dokument po cofnięciu ucina kroki do przodu', async () => {
      await isLive()
      await nav('back').click()
      await title(SECOND)
      await nav('back').click()
      await title(FIRST)
      await isLive()
      await open(THIRD)
      assert.equal(await nav('forward').isDisabled(), true)
      await nav('back').click()
      await title(FIRST)
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-history-'))
  try {
    await mkdir(artifacts, { recursive: true })
    await historyFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
