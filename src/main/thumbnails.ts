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
/** Markdown nie ma skryptów, więc wystarczy jedna klatka ukrytego okna. */
const STATIC_SETTLE_MS = 120
/** Ściana czeka na wszystkie miniatury naraz, a każda to osobny proces na czas robienia zrzutu. */
const WORKERS = 3
/** Tyle czasu otwierany dokument nie dzieli procesora z miniaturami. */
const OPEN_PRIORITY_MS = 700
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

/** Poświata leży obok miniatury, bo policzenie jej od nowa to dekodowanie obrazu na głównym wątku. */
const glowPath = (file: string): string => `${file}.glow`

function parseGlow(json: string): DocThumb['glow'] | null {
  try {
    const glow: unknown = JSON.parse(json)
    return Array.isArray(glow) && glow.length === 3 && glow.every((color) => typeof color === 'string')
      ? (glow as DocThumb['glow'])
      : null
  } catch {
    return null
  }
}

interface ReadyThumb {
  jpeg: Buffer
  glow: DocThumb['glow']
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

/** Ukryte okno jednego z równoległych pracowników. */
interface Slot {
  window: BrowserWindow | null
}

/**
 * Robi miniatury w ukrytych oknach. Strona działa tam w sesji dokumentów i podlega tym samym
 * ograniczeniom co otwarty dokument. Gotowe obrazy zostają na dysku pod skrótem treści.
 */
export class Thumbnailer {
  private readonly queue: string[] = []
  private readonly sent = new Map<string, string>()
  private readonly slots = new Set<Slot>()
  private pausedUntil = 0
  private closed = false

  constructor(private readonly options: ThumbnailerOptions) {}

  request(docIds: string[]): void {
    for (const docId of docIds) {
      const stamp = this.stampOf(docId)
      if (!stamp || this.sent.get(docId) === stamp || this.queue.includes(docId)) continue
      this.queue.push(docId)
    }
    while (this.slots.size < Math.min(WORKERS, this.queue.length)) void this.work()
  }

  /** Otwierany dokument ma pierwszeństwo. Gotowe miniatury dalej przychodzą z dysku. */
  pause(): void {
    this.pausedUntil = Date.now() + OPEN_PRIORITY_MS
  }

  /** Gotowa miniatura z dysku. Brakującą zamawia, ale na nią nie czeka. */
  async stored(docId: string): Promise<string | null> {
    const stamp = this.stampOf(docId)
    if (!stamp) return null
    const jpeg = await readFile(join(this.options.dir, `${docId}-${stamp}.jpg`)).catch(() => null)
    if (jpeg) return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    this.request([docId])
    return null
  }

  /**
   * Przeładowana powłoka zaczyna bez miniatur, a te wysłane wcześniej nie przyszłyby drugi raz.
   * W trybie dev to każda zmiana w kodzie powłoki, więc ściana, paleta i podgląd wiersza zostawały puste.
   */
  forgetSent(): void {
    this.sent.clear()
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
    for (const slot of this.slots) this.closeWindow(slot)
  }

  private async work(): Promise<void> {
    const slot: Slot = { window: null }
    this.slots.add(slot)
    try {
      for (let docId = this.queue.shift(); docId && !this.closed; docId = this.queue.shift()) {
        await this.deliver(docId, slot).catch(() => {
          // Dokument bez miniatury dalej działa, a ściana pokazuje pustą kartkę.
        })
      }
    } finally {
      this.slots.delete(slot)
      this.closeWindow(slot)
    }
  }

  private async deliver(docId: string, slot: Slot): Promise<void> {
    const stamp = this.stampOf(docId)
    if (!stamp) return
    const file = join(this.options.dir, `${docId}-${stamp}.jpg`)
    const stored = await readFile(file).catch(() => null)
    const thumb = stored ? { jpeg: stored, glow: await this.storedGlow(file, stored) } : await this.freshJpeg(docId, stamp, file, slot)
    if (!thumb || this.closed) return
    this.sent.set(docId, stamp)
    this.options.send({ docId, url: `data:image/jpeg;base64,${thumb.jpeg.toString('base64')}`, glow: thumb.glow })
  }

  /** Miniatura sprzed zapisywania poświaty dostaje ją raz, a potem już tylko z dysku. */
  private async storedGlow(file: string, jpeg: Buffer): Promise<DocThumb['glow']> {
    const saved = await readFile(glowPath(file), 'utf8').then(parseGlow, () => null)
    if (saved) return saved
    const glow = glowOf(nativeImage.createFromBuffer(jpeg))
    await writeFile(glowPath(file), JSON.stringify(glow)).catch(() => {})
    return glow
  }

  private async freshJpeg(docId: string, stamp: string, file: string, slot: Slot): Promise<ReadyThumb | null> {
    const page = await this.render(docId, slot)
    if (!page) return null
    if (this.stampOf(docId) !== stamp) {
      // Motyw zmienił się w trakcie, więc zrzut nie pasuje już do pliku.
      this.request([docId])
      return null
    }
    const thumb = { jpeg: page.toJPEG(JPEG_QUALITY), glow: glowOf(page) }
    await this.store(docId, file, thumb)
    return thumb
  }

  private async store(docId: string, file: string, { jpeg, glow }: ReadyThumb): Promise<void> {
    const { dir } = this.options
    await mkdir(dir, { recursive: true })
    await writeFile(file, jpeg)
    await writeFile(glowPath(file), JSON.stringify(glow)).catch(() => {})
    const current = `${docId}-${this.options.shaOf(docId)}`
    const stale = (await readdir(dir)).filter((name) => name.startsWith(`${docId}-`) && !name.startsWith(current))
    await Promise.all(stale.map((name) => unlink(join(dir, name)).catch(() => {})))
  }

  private openWindow(viewer: DocViewer, slot: Slot): BrowserWindow {
    if (slot.window && !slot.window.isDestroyed()) return slot.window
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
    slot.window = window
    return window
  }

  private closeWindow(slot: Slot): void {
    const { window } = slot
    slot.window = null
    if (window && !window.isDestroyed()) window.destroy()
  }

  private async render(docId: string, slot: Slot): Promise<NativeImage | null> {
    for (let wait = this.pausedUntil - Date.now(); wait > 0; wait = this.pausedUntil - Date.now()) {
      await new Promise((done) => setTimeout(done, wait))
    }
    const viewer = this.options.viewer()
    if (!viewer) return null
    const window = this.openWindow(viewer, slot)
    viewer.admit(window.webContents, docId)
    const loaded = await this.load(window, docId)
    if (!loaded || this.closed) {
      // Zawieszony dokument mógłby zablokować kolejne, więc okno idzie do kosza.
      this.closeWindow(slot)
      return null
    }
    const settle = this.options.themed(docId) ? STATIC_SETTLE_MS : SETTLE_MS
    await new Promise((done) => setTimeout(done, settle))
    if (window.isDestroyed()) return null
    const page = await window.webContents.capturePage()
    return page.isEmpty() ? null : page.resize({ width: THUMB_WIDTH, quality: 'good' })
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
