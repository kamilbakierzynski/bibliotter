import { type BaseWindow, type HandlerDetails, View, WebContentsView, type WindowOpenHandlerResponse } from 'electron'
import type { ViewerBounds } from '../shared/types'

const LAYER_NAME = 'dock-layer'
const TRANSPARENT = '#00000000'

/**
 * Dok pływa nad dokumentami, a dokument to natywny widok nad powłoką. Dlatego dok ma własny,
 * przezroczysty widok na samej górze. Powłoka otwiera go przez `window.open`, więc strona działa
 * w jej procesie i wątku, a powłoka rysuje w niej dok wprost, bez kopii stanu.
 *
 * Strona ma zawsze rozmiar okna, a widać ją tylko przez wycięcie, czyli zewnętrzny `View`. Tylko
 * w wycięciu warstwa rysuje i łapie mysz, a reszta trafia do dokumentów pod nią. Przesunięcie
 * wycięcia nie zmienia rozmiaru strony, więc dok nie drgnie, gdy wycięcie idzie za nim.
 */
export class DockLayer {
  private readonly cutout = new View()
  private page: WebContentsView | null = null
  private box: ViewerBounds = { x: 0, y: 0, width: 0, height: 0 }

  constructor(private readonly window: BaseWindow) {
    window.contentView.addChildView(this.cutout)
    window.on('resize', () => this.alignPage())
  }

  /** To jedyne okno, które powłoka może otworzyć. */
  open({ frameName, url }: HandlerDetails): WindowOpenHandlerResponse {
    if (frameName !== LAYER_NAME || this.page || !['', 'about:blank'].includes(url)) return { action: 'deny' }
    return {
      action: 'allow',
      createWindow: (options) => {
        // Electron podaje tu gotową stronę, choć typ tego nie opisuje.
        const { webContents } = options as Electron.WebContentsViewConstructorOptions
        const page = new WebContentsView({ webContents })
        page.setBackgroundColor(TRANSPARENT)
        this.cutout.addChildView(page)
        page.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        page.webContents.on('will-navigate', (event) => event.preventDefault())
        this.page = page
        this.alignPage()
        return page.webContents
      }
    }
  }

  /** Lewy górny róg strony zostaje w rogu okna, gdziekolwiek stoi wycięcie. */
  private alignPage(): void {
    const [width = 0, height = 0] = this.window.getContentSize()
    this.page?.setBounds({ x: -this.box.x, y: -this.box.y, width, height })
  }

  place(box: ViewerBounds): void {
    this.box = box
    this.cutout.setBounds(box)
    this.alignPage()
  }

  /** Nowy widok dokumentu ląduje na wierzchu, a dok musi zostać nad nim. */
  raise(): void {
    this.window.contentView.addChildView(this.cutout)
  }

  focus(): void {
    this.page?.webContents.focus()
  }

  close(): void {
    this.page?.webContents.close()
    this.page = null
  }
}
