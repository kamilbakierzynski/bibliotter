// Szukanie w dokumencie i w treści wszystkich dokumentów: podświetlenia, skoki i przełączniki.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/find.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const ALPHA = 'Alfa szukania'
const BETA = 'Beta szukania'
const CURRENT = 'bibliotter-find-current'
const ALL = 'bibliotter-find'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const prose = 'Akapit opisujący decyzje projektowe dokumentu i jego strukturę. '.repeat(24)
const tall = '<div style="height: 1400px"></div>'

const alphaDoc = `<!doctype html><title>${ALPHA}</title>
<style>body { margin: 24px; font: 16px/1.5 sans-serif }</style>
<body><h1>${ALPHA}</h1><h2>Cel</h2><h2>Ryzyka</h2><p>${prose}</p>
<p id="pierwsza">Pierwsza Łąka stoi na początku.</p>${tall}
<p id="druga">Druga łąka leży w środku, a <b>po</b>dział idzie przez węzły.</p>${tall}
<p id="trzecia">Trzecia laka kończy listę. Pole słonecznikowe to polesie.</p>
<p style="display: none">Ukryta łąka nie liczy się wcale.</p>
<details id="schowek"><summary>Więcej</summary><p>Zwinięty skarb czeka.</p></details>
<div id="zmienne"></div>
<p id="dlugi">${'a'.repeat(4000)}b</p>
<script>window.zmiany = 0; new MutationObserver(() => window.zmiany++).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })</script>
</body>`

const betaDoc = `# ${BETA}

## Cel

${prose}

## Ryzyka

Pierwsza wzmianka o orkiestrze stoi tutaj.

${prose}

${prose}

Druga wzmianka o orkiestrze mówi o smyczkach i kończy dokument.
`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const until = (view, test, argument) => view.waitForFunction(test, argument, { polling: 100 })

function attachDocument(app) {
  return async (title) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await page.evaluate(() => document.title).catch(() => '')).includes(title)) return page
      }
      await delay(100)
    }
    throw new Error(`Nie znaleziono dokumentu „${title}”`)
  }
}

async function dockLayer(app, shell) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const layer = app.windows().find((page) => page !== shell && page.url() === 'about:blank')
    if (layer) return layer
    await delay(50)
  }
  throw new Error('Nie znaleziono warstwy doku')
}

/** Rejestr podświetleń jest wspólny dla światów, więc test widzi to, co ustawiła warstwa. */
const painted = (page) =>
  page.evaluate(
    ([all, current]) => {
      const texts = (name) => [...(CSS.highlights.get(name) ?? [])].map((range) => {
        const live = document.createRange()
        live.setStart(range.startContainer, range.startOffset)
        live.setEnd(range.endContainer, range.endOffset)
        return live
      })
      const now = texts(current)[0]
      const box = now?.getBoundingClientRect()
      return {
        all: texts(all).map((range) => range.toString()),
        current: now?.toString() ?? null,
        visible: box ? box.top >= 0 && box.bottom <= innerHeight : false
      }
    },
    [ALL, CURRENT]
  )

export async function findFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'find-home')
  const docs = join(workspace, 'find-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'alfa.html'), alphaDoc)
  await writeFile(join(docs, 'beta.md'), betaDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'find-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const layer = await dockLayer(app, shell)
    const findDocument = attachDocument(app)
    const field = shell.locator('#findInput')
    const expectCount = (text) => until(shell, (wanted) => document.querySelector('.find-count')?.textContent === wanted, text)
    const row = (name) => shell.locator('.row[data-doc]', { hasText: name })

    await row(ALPHA).click()
    const alpha = await findDocument(ALPHA)
    await until(alpha, () => document.readyState === 'complete')
    await until(shell, () => !document.querySelector('canvas.sheet-frame'))
    await delay(300)

    const search = (text) => field.fill(text)
    const toggle = (name) => shell.locator(`.find:not(.wide) .find-opt.${name}`).click()

    const quietBefore = await alpha.evaluate(() => window.zmiany)

    await check('Ctrl F otwiera pasek w plakietce i oddaje mu klawiaturę, także z dokumentu', async () => {
      await alpha.evaluate(() => window.focus())
      await layer.keyboard.press('Control+f')
      await field.waitFor()
      await until(shell, () => document.activeElement?.id === 'findInput')
    })

    await check('fraza bez polskich znaków znajduje wszystkie widoczne odmiany', async () => {
      await search('laka')
      await expectCount('1 z 3')
      const { all, current, visible } = await painted(alpha)
      assert.deepEqual(all, ['Łąka', 'łąka', 'laka'])
      assert.equal(current, 'Łąka')
      assert.equal(visible, true)
    })

    await check('podświetlenie nie dotyka DOM dokumentu', async () => {
      assert.equal(await alpha.evaluate(() => window.zmiany), quietBefore)
    })

    await check('podświetlenie widać na ekranie, a nie tylko w rejestrze', async () => {
      const amber = await app.evaluate(async ({ webContents }) => {
        const page = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith('htmldoc://') && !contents.isOffscreen())
        const image = await page.capturePage()
        const pixels = image.toBitmap()
        let count = 0
        for (let at = 0; at < pixels.length; at += 4) {
          if (pixels[at + 2] > 245 && pixels[at + 1] > 160 && pixels[at + 1] < 195 && pixels[at] < 70) count += 1
        }
        return count
      })
      assert.ok(amber > 100, `bursztynowych pikseli: ${amber}`)
    })

    await check('Enter skacze do następnego, a Shift Enter wraca, z zawijaniem', async () => {
      await field.press('Enter')
      await expectCount('2 z 3')
      await until(alpha, () => scrollY > 800)
      const second = await painted(alpha)
      assert.equal(second.current, 'łąka')
      assert.equal(second.visible, true)
      await field.press('Enter')
      await field.press('Enter')
      await expectCount('1 z 3')
      await field.press('Shift+Enter')
      await expectCount('3 z 3')
      assert.equal((await painted(alpha)).visible, true)
    })

    await check('klawiatura zostaje w polu przy przeskakiwaniu', async () => {
      assert.equal(await shell.evaluate(() => document.activeElement?.id), 'findInput')
    })

    await check('skok do trafienia zostawia je nad dokiem', async () => {
      await shell.locator('.find .mini').nth(1).click()
      await expectCount('1 z 3')
      const { bottom, room } = await alpha.evaluate(
        ([name]) => {
          const [range] = CSS.highlights.get(name)
          const live = document.createRange()
          live.setStart(range.startContainer, range.startOffset)
          live.setEnd(range.endContainer, range.endOffset)
          return { bottom: live.getBoundingClientRect().bottom, room: innerHeight - 84 }
        },
        [CURRENT]
      )
      assert.ok(bottom <= room, `trafienie kończy się na ${bottom}, a dok zaczyna na ${room}`)
    })

    await check('wielkość liter zawęża wyniki', async () => {
      await toggle('matchCase')
      await until(shell, () => document.querySelector('.find-count')?.textContent === '1 z 1')
      assert.deepEqual((await painted(alpha)).all, ['laka'])
      await toggle('matchCase')
      await until(shell, () => document.querySelector('.find-count')?.textContent.endsWith(' z 3'))
    })

    await check('całe słowa pomijają wnętrze innego słowa', async () => {
      await search('pole')
      await expectCount('1 z 2')
      await toggle('wholeWord')
      await expectCount('1 z 1')
      await toggle('wholeWord')
    })

    await check('fraza przechodzi przez znacznik w środku słowa', async () => {
      await search('podział idzie')
      await expectCount('1 z 1')
      assert.equal((await painted(alpha)).current, 'podział idzie')
    })

    await check('wyrażenie regularne szuka w tekście strony', async () => {
      await toggle('regex')
      await search('(Pierwsza|Druga) .{2}ka')
      await until(shell, () => document.querySelector('.find-count')?.textContent.endsWith(' z 2'))
      assert.deepEqual((await painted(alpha)).all, ['Pierwsza Łąka', 'Druga łąka'])
    })

    await check('niepoprawne wyrażenie mówi o tym zamiast nic nie znaleźć', async () => {
      await search('(')
      await expectCount('Błędne wyrażenie')
      assert.equal(await field.getAttribute('aria-invalid'), 'true')
    })

    await check('wyrażenie, które liczyłoby się w nieskończoność, nie zawiesza dokumentu', async () => {
      await search('(a+)+$')
      await until(shell, () => document.querySelector('.find-count')?.textContent === 'Zbyt wolne wyrażenie')
      assert.equal(await alpha.evaluate(() => 1 + 1), 2)
      await toggle('regex')
    })

    await check('trafienie w zwiniętym bloku rozwija go przy skoku', async () => {
      await search('zwinięty skarb')
      await expectCount('1 z 1')
      await until(alpha, () => document.getElementById('schowek').open)
    })

    await check('treść dopisana przez dokument trafia do wyników', async () => {
      await search('dopisane zdanie')
      await expectCount('Brak wyników')
      await alpha.evaluate(() => {
        document.getElementById('zmienne').textContent = 'Dopisane zdanie'
      })
      await expectCount('1 z 1')
    })

    await check('Esc zamyka pasek, zdejmuje podświetlenia i wraca do dokumentu', async () => {
      await field.press('Escape')
      await field.waitFor({ state: 'detached' })
      await until(alpha, ([all, current]) => !CSS.highlights.has(all) && !CSS.highlights.has(current), [ALL, CURRENT])
      await until(alpha, () => document.hasFocus())
    })

    await check('zaznaczony tekst staje się zapytaniem', async () => {
      await alpha.evaluate(() => {
        const range = document.createRange()
        range.selectNodeContents(document.querySelector('#trzecia'))
        range.setEnd(document.querySelector('#trzecia').firstChild, 7)
        getSelection().removeAllRanges()
        getSelection().addRange(range)
      })
      await layer.keyboard.press('Control+f')
      await until(shell, () => document.getElementById('findInput')?.value === 'Trzecia')
      await expectCount('1 z 1')
      await field.press('Escape')
      await alpha.evaluate(() => getSelection().removeAllRanges())
    })

    const panelField = shell.locator('#searchInput')
    const hits = shell.locator('.row.hit:not(.more)')

    await check('Ctrl Shift F otwiera panel na szynie, a pole dostaje klawiaturę', async () => {
      await layer.keyboard.press('Control+Shift+f')
      await panelField.waitFor()
      await until(shell, () => document.activeElement?.id === 'searchInput')
    })

    await check('panel szuka w treści wszystkich dokumentów i grupuje trafienia', async () => {
      await panelField.fill('orkiestrze')
      await until(shell, () => document.querySelectorAll('.row.hit').length === 2)
      assert.match(await shell.locator('.panel-head span').textContent(), /2 wyniki w 1 dokumencie/)
      assert.equal(await shell.locator('.row.found .num').textContent(), '2')
      assert.equal(await hits.nth(1).locator('mark').textContent(), 'orkiestrze')
    })

    await check('fragment w środku słowa też się liczy, inaczej niż w palecie', async () => {
      await panelField.fill('kiestrz')
      await until(shell, () => document.querySelector('.row.hit mark')?.textContent === 'kiestrz')
      await panelField.fill('orkiestrze')
      await until(shell, () => document.querySelector('.row.hit mark')?.textContent === 'orkiestrze')
    })

    await check('klik w drugie trafienie otwiera dokument dokładnie w tym miejscu', async () => {
      await hits.nth(1).click()
      const beta = await findDocument(BETA)
      await until(beta, (name) => CSS.highlights.has(name), CURRENT)
      await expectCount('2 z 2')
      const current = await beta.evaluate((name) => {
        const [range] = CSS.highlights.get(name)
        const live = document.createRange()
        live.setStart(range.startContainer, range.startOffset)
        live.setEnd(range.endContainer, range.endOffset)
        return { paragraph: live.startContainer.parentElement.textContent, scrolled: scrollY > 200 }
      }, CURRENT)
      assert.match(current.paragraph, /Druga wzmianka/)
      assert.equal(current.scrolled, true)
      await shell.waitForTimeout(500)
      await shell.screenshot({ path: join(artifacts, 'find-shell.png') })
      await beta.screenshot({ path: join(artifacts, 'find-doc.png') })
    })

    await check('F4 przechodzi po trafieniach, a pasek trzyma to samo zapytanie', async () => {
      assert.equal(await field.inputValue(), 'orkiestrze')
      await shell.keyboard.press('F4')
      await expectCount('1 z 2')
      await until(shell, () => document.querySelector('.row.hit.now mark') !== null)
    })

    await check('strzałki wybierają wiersz, a Enter otwiera wybrany', async () => {
      await panelField.focus()
      await panelField.press('ArrowDown')
      await until(shell, () => document.querySelectorAll('.row.hit')[1]?.classList.contains('now'))
      await expectCount('1 z 2')
      await panelField.press('Enter')
      await expectCount('2 z 2')
      assert.equal(await shell.evaluate(() => document.activeElement?.id), 'searchInput')
    })

    await check('pasek otwarty z panelu nie zabiera mu klawiatury', async () => {
      await shell.locator('.find:not(.wide) button[aria-label="Zamknij szukanie"]').click()
      await field.waitFor({ state: 'detached' })
      await panelField.focus()
      await panelField.press('Enter')
      await field.waitFor()
      await delay(200)
      assert.equal(await shell.evaluate(() => document.activeElement?.id), 'searchInput')
      await panelField.press('Enter')
      await until(shell, () => document.querySelectorAll('.row.hit')[1]?.classList.contains('now'))
      assert.equal(await shell.evaluate(() => document.activeElement?.id), 'searchInput')
    })

    await check('fraza, której nie ma, mówi o tym w panelu', async () => {
      await panelField.fill('nieistniejacy wyraz')
      await until(shell, () => document.querySelector('#panelItems .empty')?.textContent === 'Żaden dokument tego nie zawiera.')
    })

    await check('Esc w panelu oddaje klawiaturę dokumentowi', async () => {
      await panelField.fill('orkiestrze')
      await until(shell, () => document.querySelectorAll('.row.hit').length === 2)
      await panelField.press('Escape')
      const beta = await findDocument(BETA)
      await until(beta, () => document.hasFocus())
    })

    await check('F3 z dokumentu dalej przeskakuje', async () => {
      // Klawiatura Playwrighta omija before-input-event, a to tamtędy klawisz wychodzi z dokumentu.
      await app.evaluate(({ webContents }, title) => {
        const page = webContents.getAllWebContents().find((contents) => contents.getTitle().includes(title) && !contents.isOffscreen())
        page.sendInputEvent({ type: 'keyDown', keyCode: 'F3' })
        page.sendInputEvent({ type: 'keyUp', keyCode: 'F3' })
      }, BETA)
      await expectCount('1 z 2')
    })

    await check('pasek idzie za dokumentem razem z zapytaniem', async () => {
      await shell.locator('.rb[data-view="library"]').click()
      await row(ALPHA).click()
      await expectCount('Brak wyników')
      assert.equal(await field.inputValue(), 'orkiestrze')
      await field.fill('łąka')
      await until(shell, () => document.querySelector('.find-count')?.textContent.endsWith(' z 3'))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-find-'))
  try {
    await findFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
