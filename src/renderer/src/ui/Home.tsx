import type { MouseEvent, PointerEvent } from 'react'
import { type DocEntry, FORMAT_LABELS } from '../../../shared/types'
import {
  homeDocs,
  homeHover,
  homeRendered,
  homeTotal,
  leaveHomeHover,
  rankOf,
  setHomeView
} from '../shell/home'
import { homePill, spisPill } from '../shell/layout'
import { dropFolders, load, scanLabel } from '../shell/library'
import { openDoc, peekDoc } from '../shell/sheets'
import { answered, countDocs, countWait, data, plural, STATUS, toneOf, ui, useShell, waiting } from '../shell/state'
import { displayName, relativeTime } from '../tree'
import { FormatSeg } from './FormatSeg'
import { useSynced } from './hooks'
import { Icon } from './icons'

/** Ściana ma stałą pojemność, więc licznik mówi, ile jeszcze czeka poza nią. */
function wallCount(shown: number): string {
  const total = homeTotal()
  return shown < total ? `${shown} z ${countDocs(total)}` : countDocs(shown)
}

const when = (doc: DocEntry): string => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`

function reason(doc: DocEntry): string {
  if (doc.status === 'to-decide' && answered(doc)) return 'Do decyzji, agent odpisał na uwagę'
  return answered(doc) ? 'Agent odpisał na uwagę' : STATUS[doc.status].label
}

function Wall({ docs }: { docs: DocEntry[] }): React.JSX.Element {
  return (
    <div className="h-wall">
      {docs.map((doc, i) => {
        const tone = toneOf(doc)
        const thumb = data.thumbs.get(doc.id)
        return (
          <div
            key={doc.id}
            className="hs"
            role="button"
            data-doc={doc.id}
            style={{ '--i': i, '--sway': `${i % 2 ? 1.4 : -1.4}deg` } as React.CSSProperties}
          >
            <div className="hs-sheet" data-format={doc.format}>{thumb && <img src={thumb.url} alt="" draggable={false} />}</div>
            <div className="hs-cap">
              <b>
                {tone !== 'none' && <i className={`dot ${tone}`} />}
                <span>{displayName(doc)}</span>
              </b>
              <small>{when(doc)}</small>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SpisRows({ title, docs }: { title: string; docs: DocEntry[] }): React.JSX.Element | null {
  if (docs.length === 0) return null
  return (
    <>
      <h2>{title}</h2>
      {docs.map((doc) => (
        <div key={doc.id} className="sr" role="button" data-doc={doc.id}>
          <i className={`dot ${toneOf(doc)}`} />
          <span className="t">
            <b>{displayName(doc)}</b>
            <small>{reason(doc)}</small>
          </span>
          <span className="m">{when(doc)}</span>
        </div>
      ))}
    </>
  )
}

function Spis({ docs, wait }: { docs: DocEntry[]; wait: DocEntry[] }): React.JSX.Element {
  const date = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const n = wait.length
  const line = n ? `${countDocs(n)} ${plural(n, 'czeka', 'czekają', 'czeka')} na Ciebie.` : 'Nic nie czeka na Ciebie.'
  return (
    <article className="spis">
      <i className="spis-pill" ref={spisPill.bind} />
      <header>
        <small>{date}</small>
        <h1>{line}</h1>
      </header>
      <SpisRows title="Czeka na Ciebie" docs={wait} />
      <SpisRows title="Do przeczytania" docs={docs.filter((doc) => rankOf(doc) === 1)} />
      <SpisRows title="Pozostałe" docs={docs.filter((doc) => rankOf(doc) === 2)} />
    </article>
  )
}

function Setup(): React.JSX.Element {
  const first = ui.setup === 'first'
  return (
    <article className="spis h-setup">
      <header>
        <small>{first ? 'Biblioteka jest pusta' : data.library?.roots[0]}</small>
        <h1>{first ? 'Wskaż foldery z dokumentami.' : 'Nie ma tu jeszcze dokumentów.'}</h1>
      </header>
      <p>
        {first
          ? 'Apka zbierze z nich dokumenty HTML i Markdown, także z podfolderów, a nowe wykryje sama. Niczego nie zmienia ani nie przenosi.'
          : 'Gdy agent zapisze w tym folderze dokument HTML lub Markdown, sam zawiśnie na ścianie. Możesz też wskazać inne foldery.'}
      </p>
      <footer>
        <button className="setup-add" onClick={() => load(window.api.addRoot)}>
          <Icon name="folder" />
          <span>Dodaj foldery</span>
        </button>
        <small>albo przeciągnij je na ścianę</small>
      </footer>
    </article>
  )
}

export function Home(): React.JSX.Element {
  useShell()
  const docs = homeDocs()
  const wait = docs.filter(waiting)
  const signature = `${ui.setup}|${docs.map((doc) => `${doc.id}${doc.sha}`).join()}`

  useSynced(() => {
    homeRendered()
    window.api.requestThumbs(docs.map((doc) => doc.id))
  }, [signature])

  const click = (e: MouseEvent<HTMLElement>): void => {
    const home = e.currentTarget
    if (home.dataset.skip) {
      delete home.dataset.skip
      return
    }
    const doc = (e.target as HTMLElement).closest<HTMLElement>('[data-doc]')?.dataset.doc
    if (!doc) return
    ui.kbd = false
    if (e.ctrlKey || e.metaKey) peekDoc(doc)
    else openDoc(doc)
  }

  const over = (e: PointerEvent<HTMLElement>): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-doc]')
    if (el) homeHover(el)
  }

  return (
    <div
      className="home"
      id="home"
      aria-label="Ekran startowy"
      onClick={click}
      onDragOver={(e) => {
        if (!ui.setup) return
        e.preventDefault()
        e.currentTarget.classList.add('drop')
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove('drop')}
      onDrop={(e) => {
        e.preventDefault()
        e.currentTarget.classList.remove('drop')
        if (ui.setup) dropFolders(e.dataTransfer.files)
      }}
      onPointerOver={over}
      onPointerLeave={() => {
        homeHover(null)
        leaveHomeHover()
      }}
    >
      <div className="h-head">
        <b>Ostatnie</b>
        <span>{ui.scanned === null ? wallCount(docs.length) + countWait(wait.length) : scanLabel(ui.scanned)}</span>
        <FormatSeg />
        <div className="seg view-seg" id="homeSeg" role="radiogroup" aria-label="Widok ekranu startowego">
          <i className="view-pill" ref={homePill.bind} />
          {(
            [
              ['wall', 'gallery', 'Ściana'],
              ['list', 'index', 'Spis']
            ] as const
          ).map(([view, icon, label]) => (
            <button
              key={view}
              className={ui.homeView === view ? 'mini on' : 'mini'}
              data-home-view={view}
              role="radio"
              aria-checked={ui.homeView === view}
              aria-label={label}
              onClick={() => setHomeView(view)}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
      </div>
      <div className="h-body" id="homeBody">
        {ui.setup ? (
          <Setup />
        ) : docs.length === 0 && ui.format !== 'all' ? (
          <p className="empty h-none">Wszystkie dokumenty {FORMAT_LABELS[ui.format]} są w archiwum.</p>
        ) : (
          <>
            <Wall docs={docs} />
            <div className="h-list">
              <Spis docs={docs} wait={wait} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
