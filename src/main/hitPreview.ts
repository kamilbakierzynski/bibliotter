import { join } from 'node:path'
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import type { FindCommand, TextQuery, TextSnippet } from '../shared/textSearch'
import { docUrl } from './docPolicy'
import type { DocViewer } from './docViewer'

/*
 * Podgląd trafienia z panelu „Szukaj w treści”. Ukryte okno wczytuje dokument, szuka w nim tym samym
 * kodem co pasek nad arkuszem, stawia trafienie na środku i robi zrzut razem z podświetleniem.
 * Okno jest jedno i trzyma ostatni dokument, więc kolejne trafienia z tego samego pliku są szybkie.
 */

/** Kawałek strony na karcie. Węższy od arkusza, żeby po zmniejszeniu tekst dało się przeczytać. */
const PAGE_WIDTH = 680
const PAGE_HEIGHT = 400
/** Skrypty dokumentu dostają chwilę na narysowanie treści, Markdown tylko jedną klatkę. */
const SETTLE_MS = 400
const STATIC_SETTLE_MS = 120
const LOAD_LIMIT_MS = 6000
const FIND_LIMIT_MS = 1500
/** Przewinięcie i podświetlenie trafiają na zrzut dopiero z następną klatką. */
const PAINT_MS = 90
const FRAME_RATE = 30
/** Kursor zwykle idzie do następnego trafienia, więc okno z procesem chwilę czeka. */
const IDLE_MS = 45_000
const JPEG_QUALITY = 86
const NO_SCROLLBARS = 'html { scrollbar-width: none; }'

/** Zrzut jako adres `data:`. `null` to brak trafienia na stronie, a `later` to zamówienie wyprzedzone przez nowsze. */
export type HitShot = string | null | 'later'

interface FindReply {
  count: number
  failure: unknown
}

interface HitPreviewOptions {
  viewer: () => DocViewer | null
  /** Skrót bieżącej treści. Zmieniony plik trzeba wczytać od nowa. */
  shaOf: (docId: string) => string | null
  /** Markdown nie ma skryptów, więc nie trzeba czekać, aż się narysuje. */
  isStatic: (docId: string) => boolean
  /** Gęstość pikseli ekranu, na którym stoi apka. */
  scale: () => number
}

const delay = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Świat skryptu, który ustawia stronę na kotwicy. Inny niż świat dokumentu i preloadu. */
const PLACE_WORLD = 1207
/** Kotwica nad górną krawędzią kadru, z odrobiną tekstu przed nią. */
const PLACE_MARGIN = 24

/** Kotwica idzie jako tekst JSON, więc nazwa z dokumentu nie stanie się kodem. */
const placeScript = (fragment: string): string => `(() => {
  const raw = ${JSON.stringify(fragment)};
  let name = raw;
  try { name = decodeURIComponent(raw); } catch {}
  for (const box of document.querySelectorAll('*')) if (box.scrollTop) box.scrollTop = 0;
  window.scrollTo(0, 0);
  const target = name ? document.getElementById(name) || document.getElementsByName(name)[0] : null;
  if (!target) return false;
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
  window.scrollBy({ top: -${PLACE_MARGIN}, behavior: 'instant' });
  return true;
})()`

export class HitPreviewer {
  private window: BrowserWindow | null = null
  private scale = 1
  /** Dokument wczytany w oknie razem ze skrótem treści. */
  private loaded: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private latest = 0
  private reply: ((found: FindReply) => void) | null = null
  private idle: NodeJS.Timeout | null = null
  private closed = false

  constructor(private readonly options: HitPreviewOptions) {
    ipcMain.on('overlay:event', this.listen)
  }

  /** Wynik szukania przychodzi tym samym kanałem co z otwartych arkuszy, więc liczy się tylko nadawca. */
  private readonly listen = (event: IpcMainEvent, payload: unknown): void => {
    if (!this.reply || !this.window || event.sender !== this.window.webContents) return
    const { type, state } = (payload ?? {}) as Record<string, unknown>
    if (type !== 'find' || typeof state !== 'object' || state === null) return
    const { count, failure } = state as Record<string, unknown>
    this.reply({ count: Number.isInteger(count) ? (count as number) : 0, failure: failure ?? null })
  }

  preview(docId: string, query: TextQuery, target: TextSnippet): Promise<HitShot> {
    return this.enqueue(docId, async (window) => {
      const found = await this.find(window, { type: 'set', query, target, center: true })
      return Boolean(found && found.count > 0 && !found.failure)
    })
  }

  /**
   * Miejsce, do którego prowadzi link: element o nazwie z kotwicy u góry kadru, a bez kotwicy
   * początek dokumentu. Nieznana kotwica też daje początek, bo link i tak tam otworzy dokument.
   */
  place(docId: string, fragment: string): Promise<HitShot> {
    return this.enqueue(docId, async (window) => {
      window.webContents.send('find:command', { type: 'clear' } satisfies FindCommand)
      // Osobny świat: skrypt dokumentu nie podmieni funkcji, którymi szukamy kotwicy.
      await window.webContents.executeJavaScriptInIsolatedWorld(PLACE_WORLD, [{ code: placeScript(fragment) }]).catch(() => false)
      return true
    })
  }

  /** Zamówienia idą po kolei, a nowe unieważnia te, które jeszcze czekają. */
  private enqueue(docId: string, aim: (window: BrowserWindow) => Promise<boolean>): Promise<HitShot> {
    const own = (this.latest += 1)
    const job = this.queue
      .then(() => (own === this.latest && !this.closed ? this.render(docId, aim) : 'later'))
      .catch(() => null)
      .finally(() => {
        if (own === this.latest) this.rest()
      })
    this.queue = job
    return job
  }

  close(): void {
    this.closed = true
    ipcMain.removeListener('overlay:event', this.listen)
    this.drop()
  }

  private rest(): void {
    if (this.idle) clearTimeout(this.idle)
    this.idle = this.closed ? null : setTimeout(() => this.drop(), IDLE_MS)
  }

  private drop(): void {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    const { window } = this
    this.window = null
    this.loaded = null
    if (window && !window.isDestroyed()) window.destroy()
  }

  private async render(docId: string, aim: (window: BrowserWindow) => Promise<boolean>): Promise<string | null> {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    const viewer = this.options.viewer()
    const sha = this.options.shaOf(docId)
    if (!viewer || !sha) return null
    const window = this.open(viewer)
    const stamp = `${docId}:${sha}`
    if (this.loaded !== stamp) {
      this.loaded = null
      viewer.admit(window.webContents, docId)
      if (!(await this.load(window, docId))) {
        // Zawieszony dokument zablokowałby kolejne podglądy, więc okno idzie do kosza.
        this.drop()
        return null
      }
      await delay(this.options.isStatic(docId) ? STATIC_SETTLE_MS : SETTLE_MS)
      if (window.isDestroyed()) return null
      this.loaded = stamp
    }
    if (!(await aim(window)) || window.isDestroyed()) return null
    await delay(PAINT_MS)
    if (window.isDestroyed()) return null
    const page = await window.webContents.capturePage()
    return page.isEmpty() ? null : `data:image/jpeg;base64,${page.toJPEG(JPEG_QUALITY).toString('base64')}`
  }

  private find(window: BrowserWindow, command: FindCommand): Promise<FindReply | null> {
    return new Promise((done) => {
      const finish = (found: FindReply | null): void => {
        clearTimeout(limit)
        this.reply = null
        done(found)
      }
      const limit = setTimeout(() => finish(null), FIND_LIMIT_MS)
      this.reply = finish
      // Po wyczyszczeniu strona zgłasza wynik nawet wtedy, gdy wygląda tak samo jak poprzedni.
      window.webContents.send('find:command', { type: 'clear' } satisfies FindCommand)
      window.webContents.send('find:command', command)
    })
  }

  private open(viewer: DocViewer): BrowserWindow {
    const scale = this.options.scale()
    if (this.window && !this.window.isDestroyed() && this.scale === scale) return this.window
    this.drop()
    this.scale = scale
    const window = new BrowserWindow({
      show: false,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      useContentSize: true,
      webPreferences: {
        session: viewer.session,
        preload: join(__dirname, '../preload/doc.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        // Zrzut ma tyle pikseli co ekran, inaczej tekst na karcie byłby rozmyty.
        offscreen: { deviceScaleFactor: scale },
        backgroundThrottling: false
      }
    })
    const { webContents } = window
    webContents.setAudioMuted(true)
    webContents.setFrameRate(FRAME_RATE)
    webContents.on('dom-ready', () => void webContents.insertCSS(NO_SCROLLBARS, { cssOrigin: 'user' }))
    webContents.on('render-process-gone', () => {
      if (this.window === window) this.drop()
    })
    this.window = window
    return window
  }

  private load(window: BrowserWindow, docId: string): Promise<boolean> {
    const { webContents } = window
    return new Promise((done) => {
      const finish = (ok: boolean): void => {
        clearTimeout(limit)
        webContents.removeListener('did-finish-load', loaded)
        webContents.removeListener('did-fail-load', failed)
        done(ok)
      }
      const loaded = (): void => finish(true)
      const failed = (_event: Electron.Event, _code: number, _text: string, _url: string, main: boolean): void => {
        if (main) finish(false)
      }
      const limit = setTimeout(() => finish(false), LOAD_LIMIT_MS)
      webContents.on('did-finish-load', loaded)
      webContents.on('did-fail-load', failed)
      void webContents.loadURL(docUrl(docId)).catch(() => {
        // Błąd ładowania zgłasza `did-fail-load`.
      })
    })
  }
}
