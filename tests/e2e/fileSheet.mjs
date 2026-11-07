// Arkusz pliku: link do kodu w dokumencie otwiera plik obok, a przełącznik w plakietce pokazuje zmiany.
// Można uruchomić sam ten plik: node tests/e2e/fileSheet.mjs (E2E_ENTRY wskazuje inny build).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const DOC = 'Notatki o kodzie'

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const before = Array.from({ length: 220 }, (_, i) =>
  i === 4 ? 'const limit = 10' : i === 139 ? 'export function start(): void {' : `// wiersz ${i + 1} opisuje krok ${i + 1}`
).join('\n')
const after = before.replace('const limit = 10', 'const limit = 25').replace('// wiersz 180 opisuje krok 180', '// wiersz 180 opisuje krok 180\nconst extra = true')

const prose = 'Ten akapit opisuje, jak moduł startuje i dlaczego limit ma taką wartość. '.repeat(12)
const doc = `# ${DOC}

${prose}

## Start

Funkcja [start](../src/app.ts#L140-L142) uruchamia wszystko. Nowy skrypt to [narzędzie](../src/tool.py), a obraz to [logo](../src/logo.png).

Limit leży w \`src/app.ts:5\`, a \`src/brak.ts\` jeszcze nie powstał.

${prose}

## Ryzyka

${prose}
`

/** Pętla w Node, bo `waitForFunction` nie czeka na obietnice. */
async function until(test, what, timeout = 8000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await test().catch(() => false)) return
    await delay(80)
  }
  throw new Error(`Nie doczekano: ${what}`)
}

async function pageAt(app, test, what) {
  let found = null
  await until(async () => {
    for (const page of app.windows()) {
      if (!page.url().startsWith('htmldoc://')) continue
      if (await test(page).catch(() => false)) {
        found = page
        return true
      }
    }
    return false
  }, what)
  return found
}

async function clickLink(page, href, modifiers = []) {
  const { x, y } = await page.evaluate((target) => {
    const link = document.querySelector(`a[href="${target}"]`)
    link.scrollIntoView({ block: 'center' })
    const box = link.getClientRects()[0]
    return { x: box.x + 6, y: box.y + box.height / 2 }
  }, href)
  await page.mouse.move(x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(x, y)
  for (const key of modifiers) await page.keyboard.up(key)
}

export async function fileSheetFlow(workspace, { check, entry = projectRoot, shots = null }) {
  const home = join(workspace, 'file-sheet-home')
  const repo = join(workspace, 'file-sheet-repo')
  await mkdir(home, { recursive: true })
  await mkdir(join(repo, 'docs'), { recursive: true })
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(repo, 'docs', 'notatki.md'), doc)
  await writeFile(join(repo, 'src', 'app.ts'), `${before}\n`)
  await writeFile(join(repo, 'src', 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 0]))
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('add', '.')
  git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', 'commit', '-q', '-m', 'start')
  await writeFile(join(repo, 'src', 'app.ts'), `${after}\n`)
  await writeFile(join(repo, 'src', 'tool.py'), 'def main():\n    return 42\n')
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [repo] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'file-sheet-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    await app.evaluate(({ shell: electronShell }) => {
      globalThis.outside = []
      electronShell.showItemInFolder = (path) => void globalThis.outside.push(path)
    })
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    await shell.locator('.row[data-doc]', { hasText: DOC }).click()
    const page = await pageAt(app, (view) => view.evaluate((title) => document.title === title, DOC), 'dokument z linkami')
    await until(() => shell.evaluate(() => !document.querySelector('canvas.sheet-frame')), 'żywy arkusz')
    await delay(300)

    let file = null
    await check('link do kodu otwiera plik w arkuszu obok, na wskazanych wierszach', async () => {
      await clickLink(page, '../src/app.ts#L140-L142')
      await until(() => shell.evaluate(() => document.getElementById('stage')?.classList.contains('split')), 'dwa arkusze')
      await until(() => shell.evaluate(() => document.querySelector('.pane.focused .pl-title')?.textContent === 'app.ts'), 'plakietka pliku')
      file = await pageAt(app, (view) => view.evaluate(() => !!document.querySelector('.cm-editor')), 'strona z CodeMirrorem')
      await until(() => file.evaluate(() => document.querySelectorAll('.cm-line.cm-target').length === 3), 'trzy wskazane wiersze')
      assert.equal(await file.evaluate(() => document.querySelector('.cm-line.cm-target')?.textContent), 'export function start(): void {')
      assert.ok((await file.evaluate(() => scrollY)) > 0, 'strona nie przewinęła się do wierszy')
    })
    if (shots && file) await shots('plik', shell, file)

    await check('przełącznik Zmiany pokazuje diff względem HEAD', async () => {
      const toggle = shell.locator('.pane.focused .file-seg button', { hasText: 'Zmiany' })
      assert.match(await toggle.textContent(), /\+2\s*−1/)
      await toggle.click()
      await until(() => file.evaluate(() => document.documentElement.dataset.mode === 'diff'), 'tryb zmian')
      await until(() => file.evaluate(() => document.querySelectorAll('.cm-changedLine').length >= 2), 'dodane wiersze')
      assert.ok((await file.evaluate(() => document.querySelectorAll('.cm-deletedChunk').length)) >= 1, 'brak usuniętego wiersza')
      assert.ok((await file.evaluate(() => document.querySelectorAll('.cm-collapsedLines').length)) >= 1, 'niezmienione wiersze nie są zwinięte')
    })
    if (shots && file) await shots('zmiany', shell, file)

    await check('Plik wraca do całego pliku', async () => {
      await shell.locator('.pane.focused .file-seg button', { hasText: 'Plik' }).click()
      await until(() => file.evaluate(() => document.documentElement.dataset.mode === 'file'), 'tryb pliku')
      assert.equal(await file.evaluate(() => document.querySelectorAll('.cm-changedLine').length), 0)
    })

    await check('ścieżka w kodzie Markdownu prowadzi do pliku, a brakujący plik zostaje kodem', async () => {
      const codes = await page.evaluate(() =>
        [...document.querySelectorAll('p code')].map((code) => [code.textContent, code.closest('a.code-path')?.getAttribute('href') ?? null])
      )
      assert.deepEqual(codes, [['src/app.ts:5', '../src/app.ts:5'], ['src/brak.ts', null]])
      if (shots) await shots('kod', shell, page)
      await clickLink(page, '../src/app.ts:5')
      await until(() => file.evaluate(() => document.querySelectorAll('.cm-line.cm-target').length === 1), 'wskazany wiersz')
      assert.equal(await file.evaluate(() => document.querySelector('.cm-line.cm-target')?.textContent), 'const limit = 25')
    })

    await check('Ctrl + klik zerka na nowy plik, a obraz idzie do Eksploratora', async () => {
      await shell.locator('.pane[data-pane]').first().click({ position: { x: 40, y: 10 } })
      await clickLink(page, '../src/tool.py', ['Control'])
      await until(() => shell.evaluate(() => document.querySelector('.pane.peek .pl-title')?.textContent === 'tool.py'), 'zerknięcie na tool.py')
      await clickLink(page, '../src/logo.png')
      await until(async () => (await app.evaluate(() => globalThis.outside)).length === 1, 'Eksplorator')
      assert.deepEqual(await app.evaluate(() => globalThis.outside), [join(repo, 'src', 'logo.png')])
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
  const out = process.env.E2E_SHOTS
  const shots = out
    ? async (name, shell, file) => {
        await delay(700)
        await shell.screenshot({ path: join(out, `${name}-shell.png`) })
        await file.screenshot({ path: join(out, `${name}-file.png`) })
        await file.emulateMedia({ colorScheme: 'dark' })
        await delay(600)
        await file.screenshot({ path: join(out, `${name}-file-dark.png`) })
        await file.emulateMedia({ colorScheme: 'light' })
      }
    : null
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-file-sheet-'))
  try {
    await fileSheetFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot, shots })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
