import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, type NativeImage, nativeImage, nativeTheme } from 'electron'
import type { DocThumb } from '../shared/types'
import { docUrl } from './docPolicy'
import type { DocViewer } from './docViewer'

/** Rozmiar strony, która trafia na miniaturę. Szerokość odpowiada typowemu arkuszowi. */
const PAGE_WIDTH = 1040
const PAGE_HEIGHT = 1360
const THUMB_WIDTH = 620
const JPEG_QUALITY = 84
/** Skrypty dokumentu dostają chwilę na narysowanie treści. */
const SETTLE_MS = 400
const LOAD_LIMIT_MS = 6000
const FRAME_RATE = 10
const NO_SCROLLBARS = 'html { scrollbar-width: none; }'

const GLOW_SAMPLES = 12
const GLOW_MIN_SATURATION = 0.14
const GLOW_LIGHTNESS = 0.68
const GLOW_MIN_HUE_GAP = 40
const NEUTRAL_GLOW: DocThumb['glow'] = ['#e7c9a0', '#9fb4d6', '#d8a8a0']

interface Hsl {
  h: number
  s: number
  l: number
}

function toHsl(red: number, green: number, blue: number): Hsl {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const sector = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: sector * 60, s, l }
}

const css = ({ h, s }: Hsl): string =>
  `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.72) * 100)}% ${GLOW_LIGHTNESS * 100}%)`

const hueGap = (a: Hsl, b: Hsl): number => {
  const gap = Math.abs(a.h - b.h)
  return Math.min(gap, 360 - gap)
}

/** Poświata bierze barwy z dokumentu. Biała kartka zostaje przy spokojnym, neutralnym świetle. */
export function glowOf(image: NativeImage): DocThumb['glow'] {
  const bitmap = image.resize({ width: GLOW_SAMPLES, height: GLOW_SAMPLES, quality: 'good' }).toBitmap()
  const vivid: Hsl[] = []
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    const color = toHsl(bitmap[i + 2] as number, bitmap[i + 1] as number, bitmap[i] as number)
    if (color.s >= GLOW_MIN_SATURATION && color.l > 0.12 && color.l < 0.94) vivid.push(color)
  }
  vivid.sort((a, b) => b.s - a.s)
  const picked: Hsl[] = []
  for (const color of vivid) {
    if (picked.every((other) => hueGap(color, other) >= GLOW_MIN_HUE_GAP)) picked.push(color)
    if (picked.length === 3) break
  }
  const [first, second, third] = picked
  if (!first) return NEUTRAL_GLOW
  return [css(first), css(second ?? first), css(third ?? first)]
}

interface ThumbnailerOptions {
  dir: string
  viewer: () => DocViewer | null
  /** Skrót bieżącej treści. Dokument bez skrótu nie ma jeszcze miniatury. */
  shaOf: (docId: string) => string | null
  /** Dokument wygląda inaczej w każdym motywie, więc ma osobne miniatury. */
  themed: (docId: string) => boolean
  send: (thumb: DocThumb) => void
}

/**
 * Robi miniatury po kolei w ukrytym oknie. Strona działa tam w sesji dokumentów i podlega tym
 * samym ograniczeniom co otwarty dokument. Gotowe obrazy zostają na dysku pod skrótem treści.
 */
export class Thumbnailer {
  private readonly queue: string[] = []
  private readonly sent = new Map<string, string>()
  private window: BrowserWindow | null = null
  private running = false
  private closed = false

  constructor(private readonly options: ThumbnailerOptions) {}

  request(docIds: string[]): void {
    for (const docId of docIds) {
      const stamp = this.stampOf(docId)
      if (!stamp || this.sent.get(docId) === stamp || this.queue.includes(docId)) continue
      this.queue.push(docId)
    }
    void this.pump()
  }

  /** Dosyła miniatury tym dokumentom, które wyglądają inaczej w nowym motywie. */
  syncTheme(): void {
    this.request([...this.sent.keys()])
  }

  /** Jasna miniatura nosi sam skrót treści, a ciemna leży obok niej. */
  private stampOf(docId: string): string | null {
    const sha = this.options.shaOf(docId)
    if (!sha) return null
    return this.options.themed(docId) && nativeTheme.shouldUseDarkColors ? `${sha}-dark` : sha
  }

  /** Ukryte okno nie może zatrzymać zamknięcia apki. */
  close(): void {
    this.closed = true
    this.queue.length = 0
    this.closeWindow()
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let docId = this.queue.shift(); docId && !this.closed; docId = this.queue.shift()) {
        await this.deliver(docId).catch(() => {
          // Dokument bez miniatury dalej działa, a ściana pokazuje pustą kartkę.
        })
      }
    } finally {
      this.running = false
      this.closeWindow()
    }
  }

  private async deliver(docId: string): Promise<void> {
    const stamp = this.stampOf(docId)
    if (!stamp) return
    const file = join(this.options.dir, `${docId}-${stamp}.jpg`)
    const stored = await readFile(file).catch(() => null)
    const jpeg = stored ?? (await this.freshJpeg(docId, stamp, file))
    if (!jpeg || this.closed) return
    this.sent.set(docId, stamp)
    this.options.send({
      docId,
      url: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      glow: glowOf(nativeImage.createFromBuffer(jpeg))
    })
  }

  private async freshJpeg(docId: string, stamp: string, file: string): Promise<Buffer | null> {
    const page = await this.render(docId)
    if (!page) return null
    if (this.stampOf(docId) !== stamp) {
      // Motyw zmienił się w trakcie, więc zrzut nie pasuje już do pliku.
      this.request([docId])
      return null
    }
    const jpeg = page.toJPEG(JPEG_QUALITY)
    await this.store(docId, file, jpeg)
    return jpeg
  }

  private async store(docId: string, file: string, jpeg: Buffer): Promise<void> {
    const { dir } = this.options
    await mkdir(dir, { recursive: true })
    await writeFile(file, jpeg)
    const current = `${docId}-${this.options.shaOf(docId)}`
    const stale = (await readdir(dir)).filter((name) => name.startsWith(`${docId}-`) && !name.startsWith(current))
    await Promise.all(stale.map((name) => unlink(join(dir, name)).catch(() => {})))
  }

  private openWindow(viewer: DocViewer): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const window = new BrowserWindow({
      show: false,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      webPreferences: {
        session: viewer.session,
        preload: join(__dirname, '../preload/doc.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        offscreen: true,
        backgroundThrottling: false
      }
    })
    window.webContents.setAudioMuted(true)
    window.webContents.setFrameRate(FRAME_RATE)
    window.webContents.on('dom-ready', () => void window.webContents.insertCSS(NO_SCROLLBARS, { cssOrigin: 'user' }))
    this.window = window
    return window
  }

  private closeWindow(): void {
    const window = this.window
    this.window = null
    if (window && !window.isDestroyed()) window.destroy()
  }

  private async render(docId: string): Promise<NativeImage | null> {
    const viewer = this.options.viewer()
    if (!viewer) return null
    const window = this.openWindow(viewer)
    viewer.admit(window.webContents, docId)
    const loaded = await this.load(window, docId)
    if (!loaded || this.closed) {
      // Zawieszony dokument mógłby zablokować kolejne, więc okno idzie do kosza.
      this.closeWindow()
      return null
    }
    await new Promise((done) => setTimeout(done, SETTLE_MS))
    if (window.isDestroyed()) return null
    const page = await window.webContents.capturePage()
    return page.isEmpty() ? null : page.resize({ width: THUMB_WIDTH, quality: 'best' })
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
