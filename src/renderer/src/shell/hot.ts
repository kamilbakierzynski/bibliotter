import { toggleHome, toggleHomeView } from './home'
import { els, setNav, syncRail } from './layout'
import { setInsp } from './notes'
import { data, type InspView, notify, type PanelView, type SavedLayout, ui } from './state'

/*
 * Zmiana w powłoce przeładowuje stronę (`reloadShell` w `electron.vite.config.ts`). Tu układ
 * przechodzi przez przeładowanie, żeby każda zmiana nie wracała na ścianę i nie gubiła dokumentów.
 * To tylko tryb dev, bo w zbudowanej apce `import.meta.hot` nie istnieje.
 */

const KEPT_KEY = 'keptLayout'

interface KeptLayout {
  home: boolean
  nav: boolean
  view: PanelView
  insp: boolean
  inspView: InspView
  notesView: 'wall' | 'list'
  homeView: 'wall' | 'list'
  layout: SavedLayout
}

/** Fast Refresh kończy pracę tuż po `vite:afterUpdate`, a React dopiero wtedy wymienia elementy. */
const REFRESH_MS = 100

function saveLayout(): void {
  const { home, nav, view, insp, inspView, notesView, homeView, order, panes, focus } = ui
  const layout = { order, docs: order.map((slot) => panes[slot] ?? null), focus }
  const kept: KeptLayout = { home, nav, view, insp, inspView, notesView, homeView, layout }
  sessionStorage.setItem(KEPT_KEY, JSON.stringify(kept))
}

export function keepLayout(): void {
  const hot = import.meta.hot
  if (!hot) return
  hot.on('vite:beforeFullReload', saveLayout)
  // Zmiana hooków montuje komponent od nowa, a powłoka trzyma jego stare elementy.
  hot.on('vite:afterUpdate', () => {
    setTimeout(() => {
      if (Object.values(els).every((element) => element.isConnected)) return
      saveLayout()
      location.reload()
    }, REFRESH_MS)
  })
}

/** Biblioteka musi być już wczytana, bo układ wraca tą samą drogą co klawisz `H`. */
export function reopenLayout(): boolean {
  if (!import.meta.hot) return false
  const stored = sessionStorage.getItem(KEPT_KEY)
  if (!stored) return false
  sessionStorage.removeItem(KEPT_KEY)
  const kept = JSON.parse(stored) as KeptLayout
  ui.view = kept.view
  ui.inspView = kept.inspView
  ui.notesView = kept.notesView
  notify()
  syncRail(true)
  if (kept.nav !== ui.nav) setNav(kept.nav)
  if (kept.homeView !== ui.homeView) toggleHomeView()
  if (kept.home || !kept.layout.docs.every((id) => !id || data.entries.has(id))) return true
  ui.last = kept.layout
  toggleHome()
  if (kept.insp) setInsp(true)
  return true
}
