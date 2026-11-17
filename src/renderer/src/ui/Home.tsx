import { type MouseEvent, type PointerEvent, useRef } from 'react'
import { type DocEntry, FORMAT_LABELS } from '../../../shared/types'
import { locale, t } from '../../../shared/i18n'
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
import { openCmd } from '../shell/palette'
import { openAs } from '../shell/sheets'
import { openModeOf } from '../../../shared/links'
import { answered, countDocs, countWait, data, MOD, plural, STATUS, toneOf, ui, useShell, waiting } from '../shell/state'
import { displayName, relativeTime } from '../tree'
import { AgentHint } from './AgentHint'
import { FormatSeg } from './FormatSeg'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'
import { LabelTags } from './Labels'
import { LogoMark } from './LogoMark'
import { Otter } from './Otter'
import { SkeletonLine, SkeletonSheet, SkeletonWall } from './Skeleton'

/** Ściana ma stałą pojemność, więc licznik mówi, ile jeszcze czeka poza nią. */
function wallCount(shown: number): string {
  const total = homeTotal()
  return shown < total ? `${shown} z ${countDocs(total)}` : countDocs(shown)
}

const when = (doc: DocEntry): string => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`

function reason(doc: DocEntry): string {
  if (doc.status === 'to-decide' && answered(doc)) return t('Do decyzji, agent odpisał na uwagę')
  return answered(doc) ? t('Agent odpisał na uwagę') : STATUS[doc.status].label
}

function Wall({ docs }: { docs: DocEntry[] }): React.JSX.Element {
  /** Kolejność wejścia liczy się w obrębie porcji, a kartka zachowuje swoją do końca. */
  const entrance = useRef(new Map<string, number>())
  let arriving = 0
  return (
    <div className="h-wall">
      {docs.map((doc, i) => {
        const tone = toneOf(doc)
        const order = entrance.current.get(doc.id) ?? arriving++
        entrance.current.set(doc.id, order)
        const thumb = data.thumbs.get(doc.id)
        return (
          <div
            key={doc.id}
            className="hs"
            role="button"
            data-doc={doc.id}
            style={{ '--i': order, '--sway': `${i % 2 ? 1.4 : -1.4}deg` } as React.CSSProperties}
          >
            <div className="hs-sheet" data-format={doc.format}>
              {thumb && <img src={thumb.url} alt="" draggable={false} />}
              <SkeletonSheet />
            </div>
            <div className="hs-cap">
              <b>
                {tone !== 'none' && <i className={`dot ${tone}`} />}
                <span>{displayName(doc)}</span>
              </b>
              <small>
                <LabelTags doc={doc} max={2} />
                {when(doc)}
              </small>
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
            <small>
              <LabelTags doc={doc} max={3} />
              {reason(doc)}
            </small>
          </span>
          <span className="m">{when(doc)}</span>
        </div>
      ))}
    </>
  )
}

function Spis({ docs, wait }: { docs: DocEntry[]; wait: DocEntry[] }): React.JSX.Element {
  const date = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const n = wait.length
  const line = n
    ? t('{docs} {waits} na Ciebie.', { docs: countDocs(n), waits: plural(n, 'czeka', 'czekają', 'czeka') })
    : t('Nic nie czeka na Ciebie.')
  return (
    <article className="spis">
      <i className="spis-pill" ref={spisPill.bind} />
      <header className={n ? '' : 'calm'}>
        <small>{date}</small>
        <h1>{line}</h1>
        {n === 0 && <Otter pose="sleeping" className="spis-otter" />}
      </header>
      <SpisRows title={t('Czeka na Ciebie')} docs={wait} />
      <SpisRows title={t('Do przeczytania')} docs={docs.filter((doc) => rankOf(doc) === 1)} />
      <SpisRows title={t('Pozostałe')} docs={docs.filter((doc) => rankOf(doc) === 2)} />
    </article>
  )
}

function Searching(): React.JSX.Element {
  const { found } = data.scan
  return (
    <article className="spis h-setup">
      <Otter pose="juggling" className="setup-otter" />
      <header>
        <small>{data.library?.roots.at(-1)}</small>
        <h1>{t('Szukam dokumentów.')}</h1>
      </header>
      <p>
        {found === 0
          ? t('Przeglądam foldery.')
          : t('Znalezione pliki: {found}. Dokumenty zaraz zawisną na ścianie.', { found: found.toLocaleString(locale()) })}
      </p>
    </article>
  )
}

function Setup(): React.JSX.Element {
  const first = ui.setup === 'first'
  if (!first && data.scan.active) return <Searching />
  return (
    <article className="spis h-setup">
      <Otter pose="prone" className="setup-otter" />
      <header>
        <small>{first ? t('Biblioteka jest pusta') : data.library?.roots[0]}</small>
        <h1>{first ? t('Wskaż foldery z dokumentami.') : t('Nie ma tu jeszcze dokumentów.')}</h1>
      </header>
      <p>
        {first
          ? t('Apka zbierze z nich dokumenty HTML i Markdown, także z podfolderów, a nowe wykryje sama. Niczego nie zmienia ani nie przenosi.')
          : t('Gdy agent zapisze w tym folderze dokument HTML lub Markdown, sam zawiśnie na ścianie. Możesz też wskazać inne foldery.')}
      </p>
      <footer>
        <button className="setup-add" onClick={() => load(window.api.addRoot)}>
          <Icon name="folder" />
          <span>{t('Dodaj foldery')}</span>
        </button>
        <small>{t('albo przeciągnij je na ścianę')}</small>
      </footer>
    </article>
  )
}

/** Znak, nazwa i pasek szukania. Paleta wyrasta z paska, więc na czas jej życia pasek znika. */
function Hero(): React.JSX.Element {
  return (
    <div className="h-hero">
      <LogoMark />
      <h1>Bibliotter</h1>
      <button className={ui.cmd ? 'h-ask away' : 'h-ask'} id="homeAsk" onClick={openCmd}>
        <Icon name="search" />
        <span>{t('Szukaj dokumentów, uwag i akcji')}</span>
        <i className="keys">
          <Keys keys={[MOD, 'K']} />
        </i>
      </button>
      <AgentHint />
    </div>
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
    openAs(doc, openModeOf(e))
  }

  const over = (e: PointerEvent<HTMLElement>): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-doc]')
    if (el) homeHover(el)
  }

  return (
    <div
      className="home"
      id="home"
      aria-label={t('Ekran startowy')}
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
      {!ui.setup && <Hero />}
      <div className="h-head">
        <b>{t('Ostatnie')}</b>
        <span>
          {ui.streaming ? scanLabel(homeTotal()) : data.library ? wallCount(docs.length) + countWait(wait.length) : <SkeletonLine />}
        </span>
        <FormatSeg />
        <div className="seg view-seg" id="homeSeg" role="radiogroup" aria-label={t('Widok ekranu startowego')}>
          <i className="view-pill" ref={homePill.bind} />
          {(
            [
              ['wall', 'gallery', t('Ściana')],
              ['list', 'index', t('Spis')]
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
        ) : !data.library ? (
          <SkeletonWall />
        ) : docs.length === 0 && ui.format !== 'all' ? (
          <p className="empty h-none">{t('Wszystkie dokumenty {format} są w archiwum.', { format: FORMAT_LABELS[ui.format] })}</p>
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
