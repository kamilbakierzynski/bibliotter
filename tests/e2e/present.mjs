// Odtwarzanie trasy: F5 i przycisk w doku zaczynają prezentację, klawisze prowadzą po krokach,
// kamera jedzie do kadru, maska przygasza albo chowa resztę strony, kształty kroku rysują się po
// ruchu kamery, a krok bez kadru wypada. Esc kończy i przywraca układ. Uwaga dodana w trakcie
// zostaje na swoim kroku, a po wyjściu panel pokazuje listę dodanych. Agent układa trasę przez MCP.
// Część `npm run test:e2e`. Można też uruchomić sam ten plik: node tests/e2e/present.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const artifacts = join(projectRoot, 'tests/e2e/artifacts')

const TITLE = 'Prezentacja dokumentu'
/** Miniatury renderują dokumenty w ukrytym oknie o tej szerokości. */
const THUMB_WIDTH = 1040

const prose = 'Akapit opisujący decyzje projektowe dokumentu i jego strukturę. '.repeat(20)

// Wykres i tabela stoją w szerokich białych polach, żeby kadr kamery miał wokół siebie samą biel.
const presentDoc = `<!doctype html><title>${TITLE}</title>
<style>
  body { margin: 16px; font: 16px/1.5 sans-serif; color: #222; background: #fff }
  section { display: grid; place-items: center; height: 900px }
  #diagram { width: 300px; height: 180px; background: rgb(30 120 200) }
  #table { width: 420px; height: 200px; border: 2px solid #333 }
  #slider { width: 200px; height: 40px; border: 1px solid #999 }
</style>
<body><h1>${TITLE}</h1><h2>Cel</h2><p>${prose}</p>
<p id="wniosek" style="max-width: 460px">Wąski akapit, a w nim zdanie z <strong>ważnym wnioskiem</strong> na końcu.</p>
<div id="slider" tabindex="0"></div>
<textarea id="field"></textarea>
<h2>Ryzyka</h2>
<section><div id="diagram"></div></section>
<h2>Tabela</h2>
<section><div id="table"></div></section>
<script>
  document.getElementById('slider').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight') return
    event.preventDefault()
    window.suwak = (window.suwak ?? 0) + 1
  })
</script>
</body>`

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const documentIsLive = (shell) => shell.waitForFunction(() => !document.querySelector('canvas.sheet-frame'))

function attachDocument(app) {
  return async (title) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      for (const page of app.windows()) {
        if (!page.url().startsWith('htmldoc://')) continue
        const width = await page.evaluate(() => innerWidth).catch(() => THUMB_WIDTH)
        if (width !== THUMB_WIDTH && (await page.title().catch(() => '')).includes(title)) return page
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

/**
 * Co widać w prostokącie widoku dokumentu: piksele karteczki, piksele różowego kształtu
 * i średnia jasność. Zrzut bierze widok taki, jak stoi na ekranie, także pod zoomem kamery.
 */
const sample = (app, url, box) =>
  app.evaluate(
    async ({ webContents }, { url, box }) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
      const image = await contents.capturePage()
      const data = image.toBitmap()
      const size = image.getSize()
      const scale = Math.sqrt(data.length / 4 / (size.width * size.height))
      const width = Math.round(size.width * scale)
      const height = Math.round(size.height * scale)
      let sticky = 0
      let pink = 0
      let light = 0
      let count = 0
      for (let y = Math.max(0, Math.round(box.y * scale)); y < Math.min(height, Math.round((box.y + box.height) * scale)); y++) {
        for (let x = Math.max(0, Math.round(box.x * scale)); x < Math.min(width, Math.round((box.x + box.width) * scale)); x++) {
          const i = (y * width + x) * 4
          const [b, g, r] = [data[i], data[i + 1], data[i + 2]]
          if (r > 235 && g > 215 && b > 140 && b < 185) sticky++
          // Różowy tusz, dzienny i nocny. Niebieski wykres, biel i przygaszona biel go nie mają.
          if (r > 150 && r - g > 60 && r > b + 30) pink++
          light += (r + g + b) / 3
          count++
        }
      }
      const area = scale * scale
      return { sticky: sticky / area, pink: pink / area, light: count ? light / count : 0 }
    },
    { url, box }
  )

/** Wycięcie warstwy doku w oknie. Poza nim kliknięcia trafiają do dokumentu. */
const layerCutout = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    // Strona warstwy leży w przycinającym widoku, a jego prostokąt to wycięcie.
    for (const window of BrowserWindow.getAllWindows()) {
      for (const child of window.contentView.children) {
        if (child.children?.some((view) => view.webContents?.getURL() === 'about:blank')) return child.getBounds()
      }
    }
    return null
  })

/** Zrzut widoku dokumentu z procesu głównego. Zrzut z Playwrighta zeruje powiększenie kamery. */
const capture = async (app, url, file) => {
  const png = await app.evaluate(async ({ webContents }, url) => {
    const contents = webContents.getAllWebContents().find((item) => item.getURL() === url)
    return (await contents.capturePage()).toPNG().toString('base64')
  }, url)
  await writeFile(file, Buffer.from(png, 'base64'))
}

export async function presentFlow(workspace, { check, entry = projectRoot }) {
  const home = join(workspace, 'present-home')
  const docs = join(workspace, 'present-docs')
  await mkdir(home, { recursive: true })
  await mkdir(docs, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(docs, 'prezentacja.html'), presentDoc)
  await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [docs] }))

  const until = async (test, ms = 6000) => {
    const start = Date.now()
    let last
    while (Date.now() - start < ms) {
      last = await test()
      if (last) return last
      await delay(80)
    }
    throw new Error(`Nie doczekano się zmiany (ostatnio: ${JSON.stringify(last)})`)
  }

  const app = await electron.launch({
    args: [entry, `--user-data-dir=${join(workspace, 'present-profile')}`],
    env: { ...process.env, BIBLIOTTER_HOME: home }
  })
  try {
    const shell = await app.firstWindow()
    shell.setDefaultTimeout(8000)
    const errors = []
    shell.on('pageerror', (error) => errors.push(String(error)))
    await shell.locator('.row[data-doc]', { hasText: TITLE }).waitFor({ timeout: 30000 })
    await shell.locator('.row[data-doc]', { hasText: TITLE }).click()
    const page = await attachDocument(app)(TITLE)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.waitForLoadState('load')
    await documentIsLive(shell)
    const layer = await dockLayer(app, shell)
    const url = page.url()
    const docId = await shell.evaluate(async (title) => {
      const library = JSON.parse(await window.api.getLibrary())
      return library.projects.flatMap((project) => project.docs).find((doc) => doc.title === title)?.id
    }, TITLE)
    assert.ok(docId, 'brak dokumentu w bibliotece')

    const anchor = (selector, heading) => ({ selector, offsetX: 0.5, offsetY: 0.5, quote: '', heading })
    const { sticky, shape } = await shell.evaluate(async ({ docId, at }) => {
      await window.api.createAnnotation(docId, {
        kind: 'sticky',
        audience: 'me',
        color: 'yellow',
        anchor: { ...at, offsetX: 0.95, offsetY: 0.05 },
        text: 'Karteczka przy wykresie'
      })
      await window.api.createAnnotation(docId, {
        kind: 'shape',
        audience: 'me',
        color: 'pink',
        anchor: at,
        text: '',
        shape: { type: 'rect', box: { x: 0.15, y: 0.2, width: 0.5, height: 0.5 } }
      })
      const notes = await window.api.listAnnotations()
      const idOf = (kind) => notes.find((note) => note.docId === docId && note.kind === kind)?.id
      return { sticky: idOf('sticky'), shape: idOf('shape') }
    }, { docId, at: anchor('#diagram', 'Ryzyka') })
    await shell.evaluate(
      ({ docId, steps }) => window.api.savePresentation(docId, { steps }),
      {
        docId,
        steps: [
          { id: 's1', title: 'Wstęp', camera: { kind: 'hold' }, rest: 'normal', show: [] },
          { id: 's2', title: 'Wykres', camera: { kind: 'place', anchor: anchor('#diagram', 'Ryzyka') }, rest: 'dim', show: [shape] },
          { id: 's3', title: 'Wykres z karteczką', camera: { kind: 'hold' }, rest: 'hide', show: [shape, sticky] },
          { id: 's4', title: 'Zgubiony kadr', camera: { kind: 'place', anchor: anchor('#nie-ma', 'Ryzyka') }, rest: 'normal', show: [] },
          {
            id: 's5',
            title: 'Tabela',
            camera: { kind: 'area', anchor: anchor('#table', 'Tabela'), box: { x: 0, y: 0, width: 0.5, height: 1 } },
            rest: 'normal',
            show: []
          }
        ]
      }
    )

    const root = () => shell.evaluate(() => document.documentElement.classList.contains('presenting'))
    const count = layer.locator('#presentCount')
    const title = layer.locator('#presentTitle')
    const scale = () => page.evaluate(() => visualViewport.scale)
    const atStep = async (text, name) => {
      await count.filter({ hasText: text }).waitFor()
      if (name) await title.filter({ hasText: name }).waitFor()
    }
    // Róg widoku leży poza każdym kadrem, a pod zoomem kamery pokazuje biel wokół wykresu.
    const corner = () => sample(app, url, { x: 6, y: 6, width: 40, height: 40 })
    const whole = () => sample(app, url, { x: 0, y: 0, width: 10000, height: 10000 })
    const stickyAt = async () => {
      const box = await page.locator('#diagram').boundingBox()
      return sample(app, url, { x: box.x + box.width * 0.9, y: box.y, width: 200, height: 140 })
    }
    let sheetBefore = 0

    await check('dokument przed prezentacją pokazuje swoje karteczki', async () => {
      await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
      await until(async () => (await stickyAt()).sticky > 400)
      sheetBefore = await shell.evaluate(() => document.querySelector('.pane.focused .sheet').getBoundingClientRect().width)
    })

    await check('F5 zaczyna prezentację: szyna schodzi, arkusz rośnie, a dok jest pilotem', async () => {
      await page.keyboard.press('F5')
      await until(root)
      await atStep('1 z 4', 'Wstęp')
      await until(async () => {
        const width = await shell.evaluate(() => document.querySelector('.pane.focused .sheet').getBoundingClientRect().width)
        return width > sheetBefore + 40
      })
      await until(async () => (await shell.evaluate(() => getComputedStyle(document.getElementById('nav')).opacity)) === '0')
      assert.notEqual(await layer.locator('#cmdBox').getAttribute('inert'), null, 'szukanie zostaje w doku')
      // Pilot mieści się w doku w całości.
      const dock = await layer.locator('#dock').boundingBox()
      const exit = await layer.locator('#presentExit').boundingBox()
      assert.ok(exit.x + exit.width <= dock.x + dock.width + 0.5, `wyjście poza dokiem: ${exit.x + exit.width} > ${dock.x + dock.width}`)
      const clip = { x: dock.x - 12, y: dock.y - 12, width: dock.width + 24, height: dock.height + 24 }
      await writeFile(join(artifacts, 'present-dock.png'), await layer.screenshot({ clip }))
    })

    await check('pierwszy krok pokazuje cały dokument bez uwag, których krok nie wskazał', async () => {
      assert.ok((await scale()) < 1.01)
      await until(async () => (await stickyAt()).sticky < 20)
      assert.ok((await corner()).light > 230)
    })

    await check('strzałka jedzie kamerą do kadru, przygasza resztę i rysuje kształt po ruchu', async () => {
      await page.keyboard.press('ArrowRight')
      await atStep('2 z 4', 'Wykres')
      await page.waitForFunction(() => visualViewport.scale > 1.3, null, { timeout: 8000 })
      // Kształt czeka na koniec ruchu kamery, a potem rośnie wzdłuż linii.
      const first = (await whole()).pink
      const final = await until(async () => {
        const value = (await whole()).pink
        return value > 300 ? value : null
      })
      assert.ok(first < final * 0.8, `kształt był gotowy od razu: ${first} z ${final}`)
      const light = (await corner()).light
      assert.ok(light > 60 && light < 170, `jasność przygaszonej reszty: ${light}`)
      await capture(app, url, join(artifacts, 'present-dim.png'))
    })

    await check('krok bez ruchu zostawia kadr, chowa resztę i pokazuje karteczkę kroku', async () => {
      const before = await scale()
      await page.keyboard.press('ArrowRight')
      await atStep('3 z 4', 'Wykres z karteczką')
      await until(async () => (await corner()).light < 30).catch(async () => {
        throw new Error(`reszta nie zniknęła: ${JSON.stringify(await corner())}`)
      })
      const after = await scale()
      assert.ok(Math.abs(after - before) < 0.05, `skala zmieniła się z ${before} na ${after}`)
      await until(async () => (await whole()).sticky > 400).catch(async () => {
        throw new Error(`karteczki nie widać: ${JSON.stringify(await whole())}`)
      })
      await capture(app, url, join(artifacts, 'present-hide.png'))
    })

    await check('krok, którego kadru nie ma w dokumencie, wypada z prezentacji', async () => {
      const before = await scale()
      await page.keyboard.press('PageDown')
      await atStep('4 z 4', 'Tabela')
      await page.waitForFunction((before) => Math.abs(visualViewport.scale - before) > 0.1, before, { timeout: 8000 })
      await until(async () => (await corner()).light > 230)
      assert.ok((await whole()).pink < 20)
    })

    await check('PgUp i strzałka wracają, a Home i End skaczą na krańce trasy', async () => {
      await page.keyboard.press('PageUp')
      await atStep('3 z 4')
      await page.keyboard.press('ArrowLeft')
      await atStep('2 z 4')
      await page.keyboard.press('End')
      await atStep('4 z 4')
      await page.keyboard.press('Home')
      await atStep('1 z 4')
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
    })

    await check('spacja idzie dalej, ale pole i dokument z własną obsługą klawiszy zostają przy swoich', async () => {
      await page.keyboard.press('Space')
      await atStep('2 z 4')
      await page.keyboard.press('Home')
      await atStep('1 z 4')
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
      await page.locator('#field').focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowRight')
      await delay(300)
      await atStep('1 z 4')
      assert.equal(await page.locator('#field').inputValue(), ' ')
      await page.locator('#slider').focus()
      await page.keyboard.press('ArrowRight')
      await delay(300)
      await atStep('1 z 4')
      assert.equal(await page.evaluate(() => window.suwak), 1)
      await page.locator('#slider').blur()
    })

    await check('D odsłania wszystkie uwagi dokumentu, a drugie D je chowa', async () => {
      await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
      await page.keyboard.press('d')
      await until(async () => (await stickyAt()).sticky > 400)
      await page.keyboard.press('d')
      await until(async () => (await stickyAt()).sticky < 20)
    })

    await check('kropka w doku skacze do kroku', async () => {
      await layer.locator('.present-dots button').nth(2).click()
      await atStep('3 z 4', 'Wykres z karteczką')
      await page.waitForFunction(() => visualViewport.scale > 1.3, null, { timeout: 8000 })
    })

    await check('licznik otwiera listę wszystkich kroków, Esc ją zamyka, a wiersz skacze do kroku', async () => {
      const rows = layer.locator('#presentSteps .rt-step')
      await count.click()
      await rows.first().waitFor({ state: 'visible' })
      assert.equal(await rows.count(), 5)
      // Krok bez kadru stoi na liście, ale prezentacja go pomija.
      assert.equal(await layer.locator('#presentSteps .rt-step:disabled').count(), 1)
      assert.equal(await layer.locator('#presentSteps .rt-step.on').textContent().then((text) => text.includes('Wykres z karteczką')), true)
      await delay(600)
      await writeFile(join(artifacts, 'present-steps.png'), await layer.screenshot())
      await page.keyboard.press('Escape')
      await rows.first().waitFor({ state: 'detached' })
      assert.equal(await root(), true)
      await count.click()
      await rows.first().click()
      await atStep('1 z 4')
      await rows.first().waitFor({ state: 'detached' })
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
      await layer.locator('.present-dots button').nth(2).click()
      await atStep('3 z 4', 'Wykres z karteczką')
      await page.waitForFunction(() => visualViewport.scale > 1.3, null, { timeout: 8000 })
    })

    await check('Esc kończy prezentację: kamera wraca do całej strony, a układ i karteczki na miejsce', async () => {
      await page.keyboard.press('Escape')
      await until(async () => !(await root()))
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
      await until(async () => (await shell.evaluate(() => getComputedStyle(document.getElementById('nav')).opacity)) === '1')
      await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
      await until(async () => (await stickyAt()).sticky > 400)
      await until(async () => (await corner()).light > 230)
      assert.equal(await layer.locator('#cmdBox').getAttribute('inert'), null)
    })

    await check('Esc tuż po kroku nie zostawia maski ani kamery na kadrze', async () => {
      await page.keyboard.press('F5')
      await atStep('1 z 4')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Escape')
      await until(async () => !(await root()))
      await delay(1500)
      assert.ok((await scale()) < 1.01, `skala po wyjściu: ${await scale()}`)
      const light = (await corner()).light
      assert.ok(light > 230, `jasność po wyjściu: ${light}`)
    })

    const inspOpen = () => shell.evaluate(() => document.getElementById('insp').classList.contains('open'))

    await check('przycisk w doku otwiera trasę, a Prezentuj w panelu zaczyna od pierwszego kroku', async () => {
      await layer.locator('#presentBtn').click()
      await shell.locator('#routeForm .rt-step').first().waitFor()
      assert.equal(await root(), false)
      await shell.locator('#rtPresent').click()
      await until(root)
      await atStep('1 z 4', 'Wstęp')
      await layer.locator('#presentExit').click()
      await until(async () => !(await root()))
      // Panel trasy wraca po wyjściu, a przycisk w doku go zamyka.
      await until(inspOpen)
      await layer.locator('#presentBtn').click()
      await until(async () => !(await inspOpen()))
      await delay(800)
    })

    await check('Shift+F5 zaczyna od kroku wybranego w trasie, a panel trasy wraca po wyjściu', async () => {
      await page.keyboard.press('Shift+P')
      await shell.locator('#routeForm .rt-step').nth(2).click()
      await shell.locator('#routeForm [data-editing="s3"]').waitFor()
      await page.keyboard.press('Shift+F5')
      await atStep('3 z 4', 'Wykres z karteczką')
      await until(async () => !(await inspOpen()))
      await page.keyboard.press('Escape')
      await until(async () => !(await root()))
      await until(inspOpen)
      // Podgląd kroku jedzie po wyjściu do kroku wybranego w trasie, a kolejne sprawdzenie zaczyna od F5.
      await delay(600)
      await until(async () => (await shell.evaluate(() => document.querySelectorAll('canvas.sheet-frame').length)) === 0, 8000)
    })

    const field = layer.locator('#presentNote textarea')
    const fieldFocused = () => layer.evaluate(() => document.hasFocus() && document.activeElement?.tagName === 'TEXTAREA')
    const added = () => shell.evaluate(async (docId) => {
      const notes = await window.api.listAnnotations()
      return notes.filter((note) => note.docId === docId && note.messages[0]?.text?.endsWith('w trakcie'))
    }, docId)

    await check('N stawia karteczkę przy kadrze, a pole wpisu staje nad dokiem i nie zamraża dokumentu', async () => {
      const focus = (target) => target.evaluate(() => [document.hasFocus(), document.activeElement?.tagName, document.activeElement?.className])
      const state = async () =>
        JSON.stringify([await root(), await count.textContent(), await title.textContent(), await focus(shell), await focus(layer), await focus(page)])
      await page.keyboard.press('F5')
      await title.filter({ hasText: 'Wstęp' }).waitFor({ timeout: 8000 }).catch(async () => {
        throw new Error(`F5: ${await state()}`)
      })
      // Dokument łapie klawisze kroków, gdy dostanie stan pierwszego kroku, a ten idzie za kamerą.
      await delay(800)
      await page.keyboard.press('ArrowRight')
      await title.filter({ hasText: 'Wykres' }).waitFor({ timeout: 8000 }).catch(async () => {
        throw new Error(`strzałka: ${await state()}`)
      })
      await page.waitForFunction(() => visualViewport.scale > 1.3, null, { timeout: 8000 })
      await until(async () => (await whole()).sticky < 20)
      // Przelot kamery stoi na zrzutach, więc pole otwieramy dopiero po nim.
      const frozen = () => shell.evaluate(() => document.querySelectorAll('canvas.sheet-frame').length)
      await until(async () => (await frozen()) === 0)
      await page.keyboard.press('n')
      await layer.locator('#presentNote.on').waitFor({ timeout: 5000 }).catch(async () => {
        const tools = await layer.locator('[data-present-tool]').count()
        const kind = await layer.locator('#presentNote').getAttribute('class')
        throw new Error(`pole się nie otworzyło: narzędzia ${tools}, klasa ${kind}`)
      })
      await until(fieldFocused)
      // Szkic karteczki widać w dokumencie od razu, w kolorze papieru.
      await until(async () => (await whole()).sticky > 400)
      const note = await layer.locator('#presentNote .bubble').boundingBox()
      const dock = await layer.locator('#dock').boundingBox()
      assert.ok(note.y + note.height < dock.y, 'pole nie stoi nad dokiem')
      assert.ok(Math.abs(note.x + note.width / 2 - (dock.x + dock.width / 2)) < 2, 'pole nie stoi nad środkiem doku')
      await until(async () => {
        const cutout = await layerCutout(app)
        return cutout && cutout.y <= note.y && cutout.x <= note.x && cutout.x + cutout.width >= note.x + note.width
      }).catch(async () => {
        throw new Error(`wycięcie nie obejmuje pola: ${JSON.stringify(await layerCutout(app))} wobec ${JSON.stringify(note)}`)
      })
      await delay(400)
      assert.equal(await frozen(), 0, 'dokument zamarzł na czas pisania')
      assert.equal(await shell.locator('.draft .bubble').count(), 0, 'dymek szkicu nad arkuszem')
      // Zrzut dopiero z gotowym kształtem kroku, bo pióro rysuje go po ruchu kamery.
      let last = -1
      await until(async () => {
        const pink = (await whole()).pink
        const done = pink > 300 && Math.abs(pink - last) < 1
        last = pink
        return done
      })
      await capture(app, url, join(artifacts, 'present-note.png'))
      const clip = { x: dock.x - 12, y: note.y - 12, width: dock.width + 24, height: dock.y + dock.height - note.y + 24 }
      await writeFile(join(artifacts, 'present-note-dock.png'), await layer.screenshot({ clip }))
    })

    await check('Enter zapisuje karteczkę na kroku: zostaje widoczna, a licznik w doku rośnie', async () => {
      await field.pressSequentially('Karteczka w trakcie')
      await field.press('Enter')
      await layer.locator('#presentNote:not(.on)').waitFor({ state: 'attached' })
      await layer.locator('#presentAdded', { hasText: '+1' }).waitFor()
      const [note] = await until(async () => ((await added()).length === 1 ? await added() : null))
      assert.equal(note.kind, 'sticky')
      await atStep('2 z 4', 'Wykres')
      await delay(300)
      assert.ok((await whole()).sticky > 400, 'nowa karteczka zgasła po zapisie')
    })

    await check('nowa uwaga nie wchodzi do trasy, ale wraca na swoim kroku', async () => {
      await page.keyboard.press('Home')
      await atStep('1 z 4')
      await page.waitForFunction(() => visualViewport.scale < 1.01, null, { timeout: 8000 })
      await page.evaluate(() => document.getElementById('diagram').scrollIntoView({ block: 'center' }))
      await until(async () => (await stickyAt()).sticky < 20)
      const steps = await shell.evaluate(async (docId) => (await window.api.getPresentation(docId))?.steps ?? [], docId)
      const ids = new Set((await added()).map(({ id }) => id))
      assert.ok(steps.every((step) => step.show.every((id) => !ids.has(id))), 'nowa uwaga weszła do trasy')
      await page.keyboard.press('ArrowRight')
      await atStep('2 z 4')
      await page.waitForFunction(() => visualViewport.scale > 1.3, null, { timeout: 8000 })
      await until(async () => (await whole()).sticky > 400)
    })

    await check('C stawia pinezkę, a kliknięcie w dokument ją przestawia', async () => {
      await page.keyboard.press('c')
      await layer.locator('#presentNote.on .seg').waitFor()
      await until(fieldFocused)
      // Mysz z Playwrighta liczy się od rogu widocznego kawałka strony, ale bez skali kamery.
      const target = await page.evaluate(() => {
        const box = document.getElementById('diagram').getBoundingClientRect()
        return { x: box.x + box.width / 2 - visualViewport.offsetLeft, y: box.y + box.height / 2 - visualViewport.offsetTop }
      })
      await page.mouse.click(target.x, target.y)
      await until(fieldFocused)
      await field.pressSequentially('Komentarz w trakcie')
      await field.press('Enter')
      await layer.locator('#presentAdded', { hasText: '+2' }).waitFor()
      const comment = await until(async () => (await added()).find((note) => note.kind === 'comment'))
      assert.match(comment.anchor.selector, /diagram/, JSON.stringify(comment.anchor))
      assert.ok(comment.anchor.offsetX > 0.2 && comment.anchor.offsetX < 0.8, `pinezka nie przeszła: ${comment.anchor.offsetX}`)
    })

    await check('Esc najpierw anuluje uwagę i odkłada narzędzie, a dopiero potem kończy prezentację', async () => {
      await layer.locator('[data-present-tool="comment"]').click()
      await layer.locator('#presentNote.on .seg').waitFor({ timeout: 8000 })
      await until(fieldFocused)
      await field.press('Escape')
      await layer.locator('#presentNote:not(.on)').waitFor({ state: 'attached', timeout: 8000 })
      assert.ok(await root(), 'Esc w polu zakończył prezentację')
      await page.keyboard.press('m')
      await layer.locator('[data-present-tool="highlight"].lit').waitFor({ timeout: 8000 })
      await page.keyboard.press('Escape')
      await layer.locator('[data-present-tool="highlight"]:not(.lit)').waitFor({ timeout: 8000 })
      assert.ok(await root(), 'Esc z zakreślaczem zakończył prezentację')
      assert.equal((await added()).length, 2)
    })

    await check('po wyjściu panel uwag pokazuje listę dodanych podczas prezentacji', async () => {
      await page.keyboard.press('Escape')
      await until(async () => !(await root()))
      await shell.locator('#insp.open #notesTitle', { hasText: 'Dodane podczas prezentacji' }).waitFor()
      await until(async () => (await shell.locator('#threads .thread').count()) === 2)
      await shell.locator('#showAllNotes').click()
      await shell.locator('#notesTitle', { hasText: 'Uwagi' }).waitFor()
      await until(async () => (await shell.locator('#threads .thread').count()) === 3)
    })

    await check('agent układa trasę przez MCP: kamera bierze cały akapit z cytatem, a jego kształt rysuje się w kroku', async () => {
      const mcp = new Client({ name: 'test', version: '1.0.0' })
      await mcp.connect(
        new StdioClientTransport({ command: process.execPath, args: [join(entry, 'out/main/mcp.js')], env: { ...process.env, BIBLIOTTER_HOME: home } })
      )
      try {
        const call = async (name, args) => {
          const result = await mcp.callTool({ name, arguments: args })
          assert.ok(!result.isError, result.content[0].text)
          return JSON.parse(result.content[0].text)
        }
        const saved = await call('set_presentation', {
          document: docId,
          steps: [
            { title: 'Agent: wstęp' },
            {
              title: 'Agent: wniosek',
              camera: { kind: 'place', quote: 'ważnym wnioskiem' },
              rest: 'dim',
              shapes: [{ type: 'ellipse', at: { quote: 'ważnym wnioskiem' } }]
            }
          ]
        })
        assert.equal(saved.steps[1].camera.heading, 'Cel')
        assert.equal(saved.created.length, 1)
      } finally {
        await mcp.close()
      }
      // Trasa od agenta dochodzi do otwartej apki sama.
      await page.keyboard.press('F5')
      await atStep('1 z 2', 'Agent: wstęp')
      await delay(800)
      await page.keyboard.press('ArrowRight')
      await atStep('2 z 2', 'Agent: wniosek')
      // Kamera kadruje cały akapit, a nie samo pogrubienie, które powiększyłaby do granic.
      const framed = () =>
        page.evaluate(() => {
          const box = document.getElementById('wniosek').getBoundingClientRect()
          const left = visualViewport.offsetLeft
          const top = visualViewport.offsetTop
          return {
            scale: visualViewport.scale,
            inside: box.left >= left - 1 && box.right <= left + visualViewport.width + 1 && box.top >= top - 1 && box.bottom <= top + visualViewport.height + 1,
            box: box.toJSON(),
            view: { left, top, width: visualViewport.width, height: visualViewport.height }
          }
        })
      await until(async () => {
        const view = await framed()
        return view.scale > 1.8 && view.inside ? view : null
      }).catch(async () => {
        throw new Error(`kamera nie kadruje akapitu: ${JSON.stringify(await framed())}`)
      })
      assert.ok((await scale()) < 3.5, `kamera powiększyła samo pogrubienie: ${await scale()}`)
      // Elipsa od agenta stoi wokół cytatu. Pióro rysuje ją po ruchu, więc zrzut czeka na cały kształt.
      const aroundQuote = async () => {
        const region = await page.evaluate(() => {
          const box = document.querySelector('#wniosek strong').getBoundingClientRect()
          const k = visualViewport.scale
          const left = (box.left - visualViewport.offsetLeft - 20) * k
          const top = (box.top - visualViewport.offsetTop - 20) * k
          return { x: left, y: top, width: (box.width + 40) * k, height: (box.height + 40) * k }
        })
        return (await sample(app, url, region)).pink
      }
      let last = -1
      await until(async () => {
        const pink = await aroundQuote()
        const done = pink > 2000 && pink === last
        last = pink
        return done
      }).catch(() => {
        throw new Error(`kształtu od agenta nie widać przy cytacie: ${last}`)
      })
      await capture(app, url, join(artifacts, 'present-agent.png'))
      await page.keyboard.press('Escape')
      await until(async () => !(await root()))
    })

    await check('prezentacja nie zgłasza błędów', async () => assert.deepEqual(errors, []))
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
  const workspace = await mkdtemp(join(tmpdir(), 'bibliotter-present-'))
  try {
    await presentFlow(workspace, { check, entry: process.env.E2E_ENTRY ?? projectRoot })
  } finally {
    console.log(results.join('\n'))
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  process.exitCode = results.some((line) => line.startsWith('BŁĄD')) ? 1 : 0
}
