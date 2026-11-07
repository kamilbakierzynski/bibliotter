import { type KeyboardEvent, type MouseEvent, useLayoutEffect, useRef } from 'react'
import { plural, t } from '../../../shared/i18n'
import type { SearchFailure, TextQuery, TextSnippet } from '../../../shared/textSearch'
import { closeFind, find, findLabel, type QueryOption, setFindText, stepFind, toggleFindOption } from '../shell/find'
import { openRowMenu } from '../shell/menu'
import {
  allFolded,
  DOC_ROW,
  HIT_ROW,
  hitPill,
  leaveSearch,
  moveHit,
  openFound,
  openHit,
  search,
  searchModel,
  type SearchRow,
  setSearchText,
  stepHit,
  syncHitPill,
  toggleAllFolds,
  toggleDocFold,
  toggleSearchOption
} from '../shell/search'
import { useShell } from '../shell/state'
import { displayName } from '../tree'
import { Icon } from './icons'
import { Otter } from './Otter'
import { SkeletonList } from './Skeleton'
import { Windowed } from './Windowed'

/** Panel jest wąski, więc przed trafieniem stoi tylko tyle, żeby samo trafienie się zmieściło. */
const LEAD = 16

const OPTION_KEYS: Record<string, QueryOption> = { c: 'matchCase', w: 'wholeWord', r: 'regex' }

/** Alt z pierwszą literą przełącza opcję, jak w VS Code. */
function optionKey(e: KeyboardEvent, toggle: (option: QueryOption) => void): boolean {
  const option = e.altKey ? OPTION_KEYS[e.key.toLowerCase()] : undefined
  if (!option) return false
  e.preventDefault()
  toggle(option)
  return true
}

function QueryToggles({ query, toggle }: { query: TextQuery; toggle: (option: QueryOption) => void }): React.JSX.Element {
  const options: { id: QueryOption; mark: string; label: string }[] = [
    { id: 'matchCase', mark: 'Aa', label: t('Uwzględnij wielkość liter') },
    { id: 'wholeWord', mark: 'ab', label: t('Całe słowa') },
    { id: 'regex', mark: '.*', label: t('Wyrażenie regularne') }
  ]
  return (
    <span className="find-opts">
      {options.map(({ id, mark, label }) => (
        <button
          key={id}
          className={query[id] ? `find-opt ${id} on` : `find-opt ${id}`}
          title={label}
          aria-label={label}
          aria-pressed={query[id]}
          onClick={() => toggle(id)}
        >
          {mark}
        </button>
      ))}
    </span>
  )
}

/** Klik w przycisk nie może zabrać klawiatury polu. */
const keepField = (e: MouseEvent<HTMLElement>): void => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
}

function useFieldFocus(owner: { focus: boolean }): React.RefObject<HTMLInputElement | null> {
  const field = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (!owner.focus) return
    owner.focus = false
    const grab = (): void => {
      field.current?.focus()
      field.current?.select()
    }
    grab()
    // Panel może jeszcze wyjeżdżać, a ukryte pole nie przyjmuje klawiatury.
    requestAnimationFrame(grab)
  })
  return field
}

/** Pasek nad arkuszem. Stoi w plakietce, bo tylko tam nie zasłania dokumentu. */
export function FindBar(): React.JSX.Element {
  useShell()
  const field = useFieldFocus(find)
  const keys = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (optionKey(e, toggleFindOption)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      stepFind(!e.shiftKey)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      closeFind()
    }
  }
  const { failure, count } = find.state
  return (
    <div className="find" role="search" onMouseDown={keepField}>
      <input
        id="findInput"
        ref={field}
        value={find.query.text}
        placeholder={t('Szukaj w dokumencie')}
        aria-label={t('Szukaj w dokumencie')}
        aria-invalid={failure === 'pattern'}
        spellCheck={false}
        onChange={(e) => setFindText(e.target.value)}
        onKeyDown={keys}
      />
      <QueryToggles query={find.query} toggle={toggleFindOption} />
      <span className="find-count" aria-live="polite">
        {findLabel()}
      </span>
      <button className="mini" aria-label={t('Poprzednie trafienie')} disabled={count === 0} onClick={() => stepFind(false)}>
        <Icon name="up" />
      </button>
      <button className="mini" aria-label={t('Następne trafienie')} disabled={count === 0} onClick={() => stepFind(true)}>
        <Icon name="down" />
      </button>
      <button className="mini" aria-label={t('Zamknij szukanie')} onClick={closeFind}>
        <Icon name="x" />
      </button>
    </div>
  )
}

/** Pole nad wynikami. Stoi poza przewijaną listą, więc zostaje na miejscu. */
export function SearchField(): React.JSX.Element {
  useShell()
  const field = useFieldFocus(search)
  const keys = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (optionKey(e, toggleSearchOption)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveHit(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) openHit(Math.max(search.active, 0), true)
      else stepHit(!e.shiftKey)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      leaveSearch()
    }
  }
  return (
    <div className="find wide rv" role="search" onMouseDown={keepField}>
      <input
        id="searchInput"
        ref={field}
        value={search.query.text}
        placeholder={t('Szukaj we wszystkich dokumentach')}
        aria-label={t('Szukaj we wszystkich dokumentach')}
        aria-invalid={search.failure === 'pattern'}
        spellCheck={false}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={keys}
      />
      <QueryToggles query={search.query} toggle={toggleSearchOption} />
    </div>
  )
}

export function FoldAll(): React.JSX.Element {
  const folded = allFolded()
  const label = folded ? t('Rozwiń wszystkie dokumenty') : t('Zwiń wszystkie dokumenty')
  return (
    <button className="mini" aria-label={label} title={label} onClick={toggleAllFolds}>
      <Icon name={folded ? 'down' : 'up'} />
    </button>
  )
}

function DocFound({ row }: { row: Extract<SearchRow, { type: 'doc' }> }): React.JSX.Element {
  const { doc, count, closed } = row
  return (
    <button
      className={closed ? 'row found closed' : 'row found'}
      data-doc={doc.id}
      title={doc.path}
      aria-expanded={!closed}
      onClick={() => toggleDocFold(doc.id)}
      onContextMenu={(e) => openRowMenu(e, { kind: 'doc', doc })}
    >
      <Icon name="chev" className="chev" />
      <span className="lbl">{displayName(doc)}</span>
      <span className="num">{count}</span>
    </button>
  )
}

/** Początek zdania jest ucięty, żeby trafienie zawsze zmieściło się w wierszu. */
function lead(before: string): string {
  const clipped = before.trimStart().slice(-LEAD)
  return clipped.length < before.trimStart().length ? `…${clipped}` : clipped
}

function HitText({ hit }: { hit: TextSnippet }): React.JSX.Element {
  return (
    <span className="hit-text">
      {lead(hit.before)}
      <mark>{hit.match}</mark>
      {hit.after}
    </span>
  )
}

function HitRow({ row }: { row: Extract<SearchRow, { type: 'hit' }> }): React.JSX.Element {
  const now = row.at === search.active
  useLayoutEffect(() => {
    if (now) syncHitPill()
  }, [now])
  return (
    <button
      className={now ? 'row hit now' : 'row hit'}
      onClick={(e) => openHit(row.at, e.ctrlKey || e.metaKey)}
      onContextMenu={(e) => openRowMenu(e, { kind: 'doc', doc: row.doc })}
    >
      <HitText hit={row.hit} />
    </button>
  )
}

function MoreRow({ row }: { row: Extract<SearchRow, { type: 'more' }> }): React.JSX.Element {
  return (
    <button className="row hit more" onClick={(e) => openFound(row.doc, e.ctrlKey || e.metaKey)}>
      <span className="lbl">{t('Jeszcze {count} w tym dokumencie', { count: row.left })}</span>
    </button>
  )
}

function Row({ row }: { row: SearchRow }): React.JSX.Element {
  const height = row.type === 'doc' ? DOC_ROW : HIT_ROW
  return (
    <div className="vr" style={{ '--y': `${row.y}px`, height } as React.CSSProperties}>
      {row.type === 'doc' && <DocFound row={row} />}
      {row.type === 'hit' && <HitRow row={row} />}
      {row.type === 'more' && <MoreRow row={row} />}
    </div>
  )
}

function failureText(failure: SearchFailure): string {
  if (failure === 'pattern') return t('To wyrażenie regularne jest niepoprawne.')
  if (failure === 'slow') return t('Szukanie trwało zbyt długo. Uprość wyrażenie.')
  return t('Indeks jeszcze się buduje. Spróbuj za chwilę.')
}

export function SearchList(): React.JSX.Element {
  useShell()
  useLayoutEffect(() => () => hitPill.hide(), [])
  const { rows, height } = searchModel()
  if (search.failure) return <p className="empty rv">{failureText(search.failure)}</p>
  if (rows.length > 0) return <Windowed rows={rows} height={height} render={(row) => <Row key={row.key} row={row} />} />
  if (search.busy) return <SkeletonList shape="hits" />
  if (search.answered) {
    return (
      <div className="empty-otter rv">
        <Otter pose="swimming" />
        <p className="empty">{t('Żaden dokument tego nie zawiera.')}</p>
      </div>
    )
  }
  return <p className="empty rv">{t('Wpisz frazę, a znajdę ją w treści każdego dokumentu.')}</p>
}

export function searchHeading(): string {
  const { docs, total } = searchModel()
  if (search.busy) return t('Szukam…')
  if (docs === 0) return t('Treść wszystkich dokumentów')
  const found = `${total} ${plural(total, 'wynik', 'wyniki', 'wyników')}`
  return t('{found} w {count} {docs}', {
    found,
    count: docs,
    docs: plural(docs, 'dokumencie', 'dokumentach', 'dokumentach')
  })
}
