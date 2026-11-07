// Panel opcji: motyw, start, autostart, dozwolone adresy i instrukcje dla agenta.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/options.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const BODY = `<style>body { margin: 16px }</style><h2>Cel</h2><h2>Ryzyka</h2><p>${'Akapit opisujący decyzje projektowe i ich uzasadnienie. '.repeat(30)}</p>`
const IMAGE_HOST = 'obraz.example.com'
const documentNamed = (title) => `<!doctype html><title>${title}</title><body><h1>${title}</h1>${BODY}</body>`

export async function optionsFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'options-home')
  const docs = join(workspace, 'options-docs')
  const profile = join(workspace, 'options-profile')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))
  await writeFile(join(docs, 'pierwszy.html'), documentNamed('Dokument pierwszy'))
  await writeFile(join(docs, 'drugi.html'), documentNamed('Dokument drugi'))
  await writeFile(
    join(docs, 'obraz.html'),
    documentNamed('Dokument z obrazem').replace('</h1>', `</h1><img src="https://${IMAGE_HOST}/a.png" alt="">`)
  )

  const launch = () =>
    electron.launch({
      // Bez tego Playwright udaje jasny system, a motyw systemowy ma tu zobaczyć prawdziwy wynik.
      colorScheme: null,
      args: [entry, `--user-data-dir=${profile}`],
      env: { ...process.env, BIBLIOTTER_HOME: home }
    })
  const readConfig = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
  const modeOf = (shell) => shell.evaluate(() => document.documentElement.dataset.mode)
  const nativeSource = (app) => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)

  let app = await launch()
  let shell = await app.firstWindow()
  try {
    await shell.waitForSelector('.row[data-doc]')
    const openOptions = () => shell.locator('#railOptions').click()
    const radio = (name) => shell.getByRole('radio', { name, exact: true })
    const panel = shell.locator('#panelItems')

    await check('zębatka na szynie otwiera opcje', async () => {
      await openOptions()
      await shell.locator('.panel-head strong', { hasText: 'Opcje' }).waitFor()
      await shell.locator('.panel-head', { hasText: 'Electron' }).waitFor()
      assert.equal(await shell.getByRole('button', { name: 'Skanuj foldery' }).count(), 0)
    })

    await check('wybór motywu działa i wraca na system', async () => {
      await radio('Ciemny').click()
      assert.equal(await modeOf(shell), 'dark')
      assert.equal(await nativeSource(app), 'dark')
      await radio('Jasny').click()
      assert.equal(await modeOf(shell), 'light')
      assert.equal(await nativeSource(app), 'light')
      await radio('Systemowy').click()
      assert.equal(await nativeSource(app), 'system')
      const dark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
      await shell.waitForFunction((wanted) => document.documentElement.dataset.mode === wanted, dark ? 'dark' : 'light')
    })

    await check('klawisz T przechodzi z motywu systemowego na jawny', async () => {
      const before = await modeOf(shell)
      await shell.keyboard.press('t')
      const after = await modeOf(shell)
      assert.notEqual(after, before)
      assert.equal(await radio(after === 'dark' ? 'Ciemny' : 'Jasny').getAttribute('aria-checked'), 'true')
      await radio('Systemowy').click()
    })

    await check('autostart idzie przez system i pokazuje jego odpowiedź', async () => {
      // Prawdziwy wpis trafiłby do rejestru użytkownika, więc system jest tu udawany.
      await app.evaluate(({ app: electronApp }) => {
        globalThis.login = { open: false, calls: [] }
        electronApp.setLoginItemSettings = (settings) => {
          globalThis.login.open = settings.openAtLogin
          globalThis.login.calls.push(settings)
        }
        electronApp.getLoginItemSettings = () => ({ openAtLogin: globalThis.login.open })
      })
      const toggle = shell.getByRole('switch', { name: 'Uruchamiaj z systemem' })
      await toggle.click()
      await shell.waitForSelector('.o-toggle[aria-checked="true"]')
      const [settings] = await app.evaluate(() => globalThis.login.calls)
      assert.equal(settings.openAtLogin, true)
      assert.ok(settings.path.toLowerCase().includes('electron'), settings.path)
      assert.equal(settings.args.length, 1)
      await toggle.click()
      await shell.waitForSelector('.o-toggle[aria-checked="false"]')
    })

    await check('adres dodany w panelu trafia do konfiguracji i polityki', async () => {
      await shell.locator('.o-page', { hasText: 'Dozwolone adresy' }).click()
      await shell.locator('.panel-head strong', { hasText: 'Dozwolone adresy' }).waitFor()
      const field = shell.getByRole('textbox', { name: 'Nowy dozwolony adres' })
      await field.fill('dwa słowa')
      await field.press('Enter')
      await panel.getByText('To nie wygląda na adres').waitFor()
      await field.fill('https://cdn.example.com/lib.js')
      await field.press('Enter')
      await panel.getByText('cdn.example.com', { exact: true }).waitFor()
      assert.ok((await readConfig()).allowedHosts.includes('cdn.example.com'))
      await shell.getByRole('button', { name: 'Usuń cdn.example.com' }).click()
      await panel.getByText('cdn.example.com', { exact: true }).waitFor({ state: 'detached' })
      assert.ok(!(await readConfig()).allowedHosts.includes('cdn.example.com'))
    })

    await check('nowy adres odblokowuje dokument po ponownym wczytaniu', async () => {
      await shell.locator('[data-view="library"]').click()
      const row = shell.locator('.row[data-doc]', { hasText: 'Dokument z obrazem' })
      const docId = await row.getAttribute('data-doc')
      await row.click()
      const notice = shell.locator('.pane.focused .notice')
      await notice.waitFor()
      await openOptions()
      const field = shell.getByRole('textbox', { name: 'Nowy dozwolony adres' })
      await field.fill(IMAGE_HOST)
      await field.press('Enter')
      await panel.getByText(IMAGE_HOST, { exact: true }).waitFor()
      await shell.evaluate((id) => window.api.reloadDoc(id), docId)
      await notice.waitFor({ state: 'detached' })
      await shell.getByRole('button', { name: `Usuń ${IMAGE_HOST}` }).click()
      await panel.getByText(IMAGE_HOST, { exact: true }).waitFor({ state: 'detached' })
      await shell.keyboard.press('h')
    })

    await check('strona agenta pokazuje instalację i zawartość pluginu', async () => {
      await shell.getByRole('button', { name: 'Wszystkie opcje' }).click()
      await shell.locator('.o-page', { hasText: 'Agent' }).click()
      await panel.getByText('Co dostaje agent').waitFor({ timeout: 15000 })
      const code = await panel.locator('.o-code code').allTextContents()
      assert.ok(code.some((text) => text.includes('plugin install bibliotter@bibliotter-local')), code.join('\n'))
      assert.ok(code.some((text) => text.includes('plugin marketplace add')), code.join('\n'))
      assert.ok(code.some((text) => text.includes('mcpServers')), code.join('\n'))
      const names = await panel.locator('.o-names').first().textContent()
      assert.match(names, /current_document/)
      await panel.locator('.o-part', { hasText: 'Skille' }).waitFor()
      await panel.locator('.o-part', { hasText: 'Hooki' }).waitFor()
    })

    await check('przycisk kopiuje polecenie i potwierdza', async () => {
      const copy = shell.getByRole('button', { name: 'Kopiuj polecenie instalacji', exact: true })
      await copy.click()
      await shell.getByRole('button', { name: 'Skopiowano' }).waitFor()
      const text = await app.evaluate(({ clipboard }) => clipboard.readText())
      assert.equal(text, 'claude plugin install bibliotter@bibliotter-local')
    })

    await check('zrzuty panelu', async () => {
      await mkdir(artifacts, { recursive: true })
      await shell.screenshot({ path: join(artifacts, 'opcje-agent.png') })
      await shell.getByRole('button', { name: 'Wszystkie opcje' }).click()
      await shell.locator('.o-page', { hasText: 'Agent' }).waitFor()
      await shell.waitForTimeout(400)
      await shell.screenshot({ path: join(artifacts, 'opcje.png') })
      await radio('Ciemny').click()
      await shell.waitForTimeout(700)
      await shell.screenshot({ path: join(artifacts, 'opcje-ciemne.png') })
      await radio('Systemowy').click()
    })

    await check('Ctrl + przecinek zwija opcje i otwiera je z powrotem', async () => {
      await shell.keyboard.press('Control+,')
      await shell.waitForFunction(() => !document.getElementById('nav').classList.contains('is-open'))
      await shell.keyboard.press('Control+,')
      await shell.locator('.panel-head strong', { hasText: 'Opcje' }).waitFor()
    })

    await check('wybór startu i odbiorcy zostaje w opcjach', async () => {
      await radio('Ostatni układ').click()
      await radio('Dla mnie').click()
      await shell.locator('[data-view="library"]').click()
      await shell.locator('.row[data-doc]', { hasText: 'Dokument drugi' }).click()
      await shell.locator('.pane.focused').waitFor()
      await shell.waitForFunction(() => localStorage.getItem('lastLayout')?.includes('"'))
    })
  } finally {
    await app.close()
  }

  app = await launch()
  shell = await app.firstWindow()
  try {
    await check('po uruchomieniu wraca ostatni układ', async () => {
      await shell.locator('.pane.focused', { hasText: 'Dokument drugi' }).waitFor({ timeout: 15000 })
      assert.equal(await shell.evaluate(() => localStorage.getItem('startView')), 'last')
    })
    await check('zapamiętany odbiorca komentarza wraca po uruchomieniu', async () => {
      assert.equal(await shell.evaluate(() => localStorage.getItem('noteAudience')), 'me')
      await shell.locator('#railOptions').click()
      await shell.getByRole('radio', { name: 'Dla mnie', exact: true }).waitFor()
      assert.equal(await shell.getByRole('radio', { name: 'Dla mnie', exact: true }).getAttribute('aria-checked'), 'true')
    })
  } finally {
    await app.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-options-'))
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
    await optionsFlow(workspace, { check })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
  process.exitCode = failed.length > 0 ? 1 : 0
}
