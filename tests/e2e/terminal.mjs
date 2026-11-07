// Terminal obok dokumentu: z prawej i pod spodem, chowanie z dokumentem, pinezka i skrót Ctrl `.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/terminal.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

async function waitFor(read, wanted, timeout = 10000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await read()
    if (wanted(value)) return value
    await delay(50)
  }
  throw new Error(`Nie doczekano się, ostatnia wartość: ${JSON.stringify(value)}`)
}

/** Stan terminala i arkuszy w liczbach, które da się porównać. */
const readStage = (shell) =>
  shell.evaluate(() => {
    const el = document.getElementById('term')
    const box = el.getBoundingClientRect()
    const panes = [...document.querySelectorAll('.pane')].filter((pane) => getComputedStyle(pane).visibility === 'visible')
    const sheet = panes.map((pane) => pane.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
    return {
      shown: el.dataset.shown === 'on',
      pinned: el.dataset.pinned === 'on',
      side: el.dataset.side,
      term: { left: box.left, top: box.top, width: box.width, height: box.height },
      sheet: sheet ? { right: sheet.right, bottom: sheet.bottom } : null,
      text: (document.querySelector('.term .xterm-rows')?.textContent ?? '').replace(/\s+/g, ' '),
      keyboard: Boolean(document.activeElement?.closest('.term')),
      cwd: document.querySelector('.term-cwd')?.textContent ?? ''
    }
  })

export async function terminalFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'terminal-home')
  const repo = join(workspace, 'terminal-repo')
  const docs = join(repo, 'docs')
  const profile = join(workspace, 'terminal-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  // Terminal staje w katalogu repozytorium, a nie w folderze, w którym leży dokument.
  await mkdir(join(repo, '.git'), { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo] }))
  await writeFile(join(docs, 'pierwszy.html'), documentNamed('Pierwszy dokument'))
  await writeFile(join(docs, 'drugi.html'), documentNamed('Drugi dokument'))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${profile}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    const row = (name) => shell.locator('.row[data-doc]', { hasText: name }).first()
    const stage = () => readStage(shell)
    const settled = async (wanted) => {
      let last = ''
      return waitFor(
        async () => {
          const now = await stage()
          const key = JSON.stringify([now.term, now.sheet])
          const still = key === last
          last = key
          return still ? now : { ...now, moving: true }
        },
        (value) => !value.moving && wanted(value)
      )
    }

    await row('Pierwszy').waitFor({ timeout: 15000 })
    await row('Pierwszy').click()
    await shell.locator('.pane.focused [data-moved="term"]').waitFor()

    await check('terminal staje z prawej w katalogu repozytorium dokumentu', async () => {
      await shell.locator('.pane.focused [data-moved="term"]').click()
      const now = await settled((value) => value.shown && value.term.width > 200)
      assert.equal(now.side, 'right')
      assert.ok(now.sheet.right <= now.term.left, `arkusz zachodzi na terminal: ${JSON.stringify(now)}`)
      assert.equal(now.cwd, repo)
      // Zamknięty panel uwag nie może prześwitywać na terminalu, choć arkusze odsunęły się od brzegu okna.
      const inspOpacity = await shell.evaluate(() => Number(getComputedStyle(document.getElementById('inspIn')).opacity))
      assert.ok(inspOpacity < 0.01, `panel uwag prześwituje: ${inspOpacity}`)
      await waitFor(stage, (value) => value.text.includes('terminal-repo'))
    })

    await check('klawiatura trafia do powłoki, a nie do skrótów apki', async () => {
      await waitFor(stage, (value) => value.keyboard)
      await shell.keyboard.type('echo bibliotter-42')
      await shell.keyboard.press('Enter')
      await waitFor(stage, (value) => /bibliotter-42.*bibliotter-42/.test(value.text))
      // Litery z polecenia przełączyłyby motyw (T) i ekran startowy (H), gdyby trafiły do apki.
      assert.equal(await shell.locator('.home.on').count(), 0)
    })

    await check('panel linków staje między dokumentem a terminalem', async () => {
      await shell.locator('.pane.focused [data-moved="links"]').click()
      const now = await settled((value) => value.shown)
      const insp = await waitFor(
        () =>
          shell.evaluate(() => {
            const el = document.getElementById('inspIn')
            const { left, right } = el.getBoundingClientRect()
            return { left, right, opacity: Number(getComputedStyle(el).opacity) }
          }),
        (value) => value.opacity > 0.99
      )
      assert.ok(now.sheet.right <= insp.left + 1, `arkusz pod panelem: ${now.sheet.right} > ${insp.left}`)
      assert.ok(insp.right <= now.term.left + 1, `panel na terminalu: ${insp.right} > ${now.term.left}`)
      assert.ok(now.term.left + now.term.width >= (await shell.evaluate(() => innerWidth)) - 20, 'terminal nie stoi przy brzegu okna')
      await shell.screenshot({ path: join(artifacts, 'terminal-links.png') })
      await shell.locator('.pane.focused [data-moved="links"]').click()
      await settled((value) => value.shown && value.sheet.right >= value.term.left - 20)
    })

    await check('terminal przechodzi pod dokument i z powrotem', async () => {
      await shell.locator('[data-act="term-side"]').click()
      const below = await settled((value) => value.side === 'bottom' && value.term.height > 100)
      assert.ok(below.sheet.bottom <= below.term.top, `arkusz zachodzi na terminal: ${JSON.stringify(below)}`)
      assert.ok(below.text.includes('bibliotter-42'), 'zmiana układu zgubiła historię')
      await shell.screenshot({ path: join(artifacts, 'terminal-bottom.png') })
    })

    await check('nieprzypięty terminal chowa się z dokumentem i wraca z nim', async () => {
      await row('Drugi').click()
      await settled((value) => !value.shown && value.term.height === 0)
      await row('Pierwszy').click()
      const back = await settled((value) => value.shown && value.term.height > 100)
      assert.ok(back.text.includes('bibliotter-42'), 'schowanie zakończyło sesję')
    })

    await check('przypięty terminal zostaje przy innym dokumencie', async () => {
      await shell.locator('[data-act="term-pin"]').click()
      await row('Drugi').click()
      await shell.locator('.pane.focused .pl-title', { hasText: 'Drugi' }).waitFor()
      const now = await settled((value) => value.pinned)
      assert.ok(now.shown && now.term.height > 100, `terminal zniknął: ${JSON.stringify(now)}`)
      await shell.screenshot({ path: join(artifacts, 'terminal-pinned.png') })
    })

    await check('Ctrl ` w terminalu chowa go, a drugi raz pokazuje z klawiaturą', async () => {
      await shell.locator('.term-screen').click()
      await shell.keyboard.press('Control+Backquote')
      await settled((value) => !value.shown)
      await shell.keyboard.press('Control+Backquote')
      await settled((value) => value.shown && value.keyboard)
    })

    await check('krzyżyk kończy sesję, a Ctrl ` z dokumentu otwiera nową', async () => {
      await shell.locator('[data-act="term-close"]').click()
      await settled((value) => !value.shown && !value.pinned)
      // Zdarzenie z procesu głównego przechodzi przez `before-input-event` jak prawdziwy klawisz. CDP go omija.
      const sent = await waitFor(
        () =>
          app.evaluate(({ webContents }) => {
            const doc = webContents
              .getAllWebContents()
              .find((w) => w.getURL().startsWith('htmldoc://') && w.getTitle().includes('Drugi') && !w.isOffscreen() && w.isFocused())
            if (!doc) return false
            doc.sendInputEvent({ type: 'keyDown', keyCode: '`', modifiers: ['control'] })
            doc.sendInputEvent({ type: 'keyUp', keyCode: '`', modifiers: ['control'] })
            return true
          }),
        Boolean
      )
      assert.ok(sent)
      const now = await settled((value) => value.shown && value.keyboard)
      assert.ok(!now.text.includes('bibliotter-42'), 'nowa sesja pokazuje starą historię')
    })

    await check('terminal nie zostawia błędów strony', async () => {
      assert.deepEqual(errors, [])
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-terminal-'))
  await mkdir(artifacts, { recursive: true })
  try {
    await terminalFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    if (process.env.E2E_LOG) await writeFile(process.env.E2E_LOG, results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
