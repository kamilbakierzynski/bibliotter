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

Funkcja [start](../src/app.ts#L140-L142) uruchamia wszystko. Nowy skrypt to [narzędzie](../src/tool.py), a obraz to [logo](../src/logo.png). Całość leży w [folderze](../src/).

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
  await writeFile(join(repo, '.gitignore'), 'build/\n')
  await mkdir(join(repo, 'build'), { recursive: true })
  await writeFile(join(repo, 'build', 'out.js'), 'void 0\n')
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

    await check('minimapa dostaje szkic całego pliku, a nie tylko wyrenderowanych wierszy', async () => {
      await until(() => file.evaluate(() => !!document.getElementById('bibliotter-sketch')), 'szkic strony')
      const measure = () =>
        file.evaluate(() => {
          const lines = JSON.parse(document.getElementById('bibliotter-sketch').textContent)
          let bottom = 0
          for (let i = 1; i < lines.length; i += 5) bottom = Math.max(bottom, lines[i] + lines[i + 2])
          // Pod treścią edytora strona ma jeszcze margines, więc koniec pliku to dół `.cm-content`.
          const end = document.querySelector('.cm-content').getBoundingClientRect().bottom + scrollY
          const rowH = parseFloat(getComputedStyle(document.querySelector('.cm-line')).lineHeight)
          return { bars: lines.length / 5, bottom, end, rowH, rendered: document.querySelectorAll('.cm-line').length }
        })
      // Strona dopisuje szkic po każdym przeliczeniu wysokości wierszy, więc czekamy, aż dogoni układ.
      await until(async () => {
        const now = await measure()
        return now.bottom > now.end - 3 * now.rowH
      }, 'szkic do końca pliku', 3000).catch(() => {})
      const { bars, bottom, end, rowH, rendered } = await measure()
      // Pasek pierwszego rzędu wiersza z linku ma leżeć tam, gdzie ten rząd naprawdę jest.
      const drift = await file.evaluate((row) => {
        const lines = JSON.parse(document.getElementById('bibliotter-sketch').textContent)
        const target = document.querySelector('.cm-line.cm-target').getBoundingClientRect()
        const real = target.top + scrollY + row / 2
        let best = Infinity
        for (let i = 1; i < lines.length; i += 5) best = Math.min(best, Math.abs(lines[i] + lines[i + 2] / 2 - real))
        return best
      }, rowH)
      assert.ok(drift < 3, `pasek wiersza z linku odjechał o ${drift} px`)
      assert.ok(bars >= 220, `szkic ma ${bars} pasków`)
      assert.ok(rendered < 220, `CodeMirror wyrenderował wszystkie ${rendered} wierszy, więc test niczego nie sprawdza`)
      // Ostatni wiersz pliku jest pusty, więc ostatni pasek kończy się najwyżej dwa rzędy nad dołem treści.
      assert.ok(bottom > end - 3 * rowH, `szkic kończy się na ${bottom}, a treść na ${end} px`)
    })

    await check('obok pliku stoi drzewo repozytorium z otwartym plikiem i stanem gita', async () => {
      await until(() => file.evaluate(() => !!document.querySelector('#file-tree .ft-row.on')), 'wiersz otwartego pliku')
      const tree = await file.evaluate(() =>
        [...document.querySelectorAll('#file-tree .ft-row')].map((row) => ({
          rel: row.dataset.rel,
          on: row.classList.contains('on'),
          mark: row.dataset.mark ?? null,
          ignored: row.classList.contains('ignored'),
          dot: !!row.querySelector('.ft-dot')
        }))
      )
      const at = (rel) => tree.find((row) => row.rel === rel)
      assert.equal(at('src/app.ts')?.on, true, 'otwarty plik nie jest zaznaczony')
      assert.equal(at('src/app.ts')?.mark, 'M')
      assert.equal(at('src/tool.py')?.mark, 'U')
      assert.equal(at('src')?.dot, true, 'folder ze zmianami nie ma kropki')
      assert.equal(at('build')?.ignored, true, 'folder z .gitignore nie jest przygaszony')
      assert.deepEqual(tree.slice(0, 4).map((row) => row.rel), ['build', 'docs', 'src', 'src/app.ts'])
      const left = await file.evaluate(() => document.querySelector('.cm-content').getBoundingClientRect().left)
      assert.ok(left > 200, 'kod nie odsunął się od drzewa')
    })

    await check('przeciąganie podziału zostawia żywe dokumenty i zmienia ich szerokość od razu', async () => {
      const handle = await shell.locator('#splitHandle').boundingBox()
      const x = handle.x + handle.width / 2
      const y = handle.y + handle.height / 2
      const widthOf = () => file.evaluate(() => innerWidth)
      const start = await widthOf()
      await shell.mouse.move(x, y)
      await shell.mouse.down()
      let frames = 0
      const widths = []
      for (let step = 1; step <= 12; step++) {
        await shell.mouse.move(x - step * 12, y)
        await delay(40)
        if (await shell.evaluate(() => !!document.querySelector('canvas.sheet-frame'))) frames++
        widths.push(await widthOf())
      }
      await shell.mouse.up()
      assert.equal(frames, 0, 'w trakcie przeciągania arkusz zszedł na zrzut')
      assert.ok(widths.at(-1) > start + 100, `plik nie urósł: ${start} → ${widths.at(-1)}`)
      assert.ok(new Set(widths).size >= 8, `szerokość zmieniała się skokami: ${widths.join(', ')}`)
    })

    await check('arkusz pliku nie przyjmuje uwag, więc zakreślacz się w nim nie włącza', async () => {
      await shell.locator('.pane.focused .pl-title').click()
      await shell.keyboard.press('m')
      await delay(200)
      assert.notEqual(await shell.evaluate(() => document.getElementById('app')?.dataset.tool), 'highlight')
    })

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

    await check('klik w drzewie otwiera plik w tym samym arkuszu', async () => {
      await shell.keyboard.press('Escape')
      await until(() => shell.evaluate(() => !document.querySelector('.pane.peek')), 'koniec zerknięcia')
      // Zamknięte arkusze zostają w DOM, więc liczą się tylko te, które widać na scenie.
      const shown = () =>
        shell.evaluate(() =>
          [...document.querySelectorAll('.pane[data-pane]')]
            .filter((pane) => {
              const box = pane.getBoundingClientRect()
              return box.width > 50 && box.right > 0 && box.left < innerWidth && Number(getComputedStyle(pane).opacity) > 0.5
            })
            .map((pane) => pane.querySelector('.pl-title')?.textContent ?? '')
        )
      await until(async () => (await shown()).length === 2, 'para arkuszy po zerknięciu')
      const before = await shown()
      assert.ok(before.includes('app.ts'), `przed klikiem widać: ${before.join(', ')}`)
      const { x, y } = await file.evaluate(() => {
        const box = document.querySelector('#file-tree .ft-row[data-rel="src/tool.py"]').getBoundingClientRect()
        return { x: box.x + 30, y: box.y + box.height / 2 }
      })
      await file.mouse.click(x, y)
      await until(async () => (await shown()).includes('tool.py'), 'tool.py w arkuszu')
      await delay(400)
      const after = await shown()
      assert.equal(await shell.evaluate(() => !!document.querySelector('.pane.peek')), false, 'klik w drzewie otworzył zerknięcie')
      assert.deepEqual(after, before.map((title) => (title === 'app.ts' ? 'tool.py' : title)), `po kliku widać: ${after.join(', ')}`)
    })

    await check('link do folderu otwiera w apce drzewo rozwinięte do tego folderu', async () => {
      await clickLink(page, '../src/')
      const folder = await pageAt(app, (view) => view.evaluate(() => document.documentElement.hasAttribute('data-folder')), 'arkusz folderu')
      await until(() => folder.evaluate(() => !!document.querySelector('#file-tree .ft-row[data-rel="src/app.ts"]')), 'pliki folderu')
      assert.equal(await folder.evaluate(() => document.querySelector('#file-tree .ft-row[data-rel="src"]')?.getAttribute('aria-expanded')), 'true')
      assert.equal(await app.evaluate(() => globalThis.outside.length), 1, 'folder poszedł do Eksploratora')
      assert.equal(await folder.evaluate(() => document.getElementById('bibliotter-sketch')?.textContent), '[]', 'minimapa dostała szkic drzewa')
      if (shots) await shots('folder', shell, folder)
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
