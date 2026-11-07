import type { KeyboardEvent, PointerEvent } from 'react'
import { actPill, cmdPill } from '../shell/layout'
import {
  actionRows,
  actSelect,
  closeActs,
  closeCmd,
  cmd,
  cmdSelect,
  countLabel,
  DOC_MORE,
  docSub,
  dropFilter,
  fileLine,
  filters,
  filterKey,
  type FilterKey,
  type Item,
  keymap,
  norm,
  onCmdInput,
  renderActs,
  runChord,
  runCmd,
  startFilter,
  syncActPill,
  syncCmdPill,
  wordMarks
} from '../shell/palette'
import { FORMAT_LABELS } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { data, MOD, noteText, plural, STATUS, ui, useShell } from '../shell/state'
import { displayName, relativeTime } from '../tree'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'
import { Otter } from './Otter'
import { SkeletonList } from './Skeleton'

const FILTER_ICON: Record<FilterKey, string> = { project: 'folder', branch: 'branch', format: 'file', label: 'tag', kind: 'layers', status: 'layers' }

function Marked({ text, q }: { text: string; q: string }): React.JSX.Element {
  const at = q ? norm(text).indexOf(q) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

/** Tekst z kilkoma zaznaczeniami. Nachodzące na siebie łączą się w jedno. */
function MarkedWords({ text, q }: { text: string; q: string }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [from, to] of wordMarks(text, q)) {
    if (to <= at) continue
    const start = Math.max(from, at)
    parts.push(text.slice(at, start), <mark key={start}>{text.slice(start, to)}</mark>)
    at = to
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

function Row({ item, i, q }: { item: Item; i: number; q: string }): React.JSX.Element {
  if (item.type === 'more') {
    return (
      <button className="cr more" data-i={i}>
        <span className="tile">
          <Icon name="chev" />
        </span>
        <span className="t">
          <b>{t('Pokaż kolejne {n}', { n: Math.min(item.left, DOC_MORE) })}</b>
        </span>
        <span className="r">{item.left}</span>
      </button>
    )
  }
  if (item.type === 'value') {
    return (
      <button className="cr" data-i={i}>
        <span className="tile">
          {item.key === 'status' ? <i className={`dot ${STATUS[item.v as keyof typeof STATUS].tone}`} /> : <Icon name={FILTER_ICON[item.key]} />}
        </span>
        <span className="t">
          <b>{filters()[item.key].name(item.v)}</b>
        </span>
        <span className="r">{item.count}</span>
      </button>
    )
  }
  if (item.type === 'doc') {
    const { doc, hit, file } = item
    return (
      <button className="cr" data-i={i}>
        <span className="tile">
          <Icon name="file" />
        </span>
        <span className="t">
          <b>
            <Marked text={displayName(doc)} q={q} />
          </b>
          {file ? (
            <small className="file">
              <MarkedWords text={fileLine(doc)} q={q} />
            </small>
          ) : hit ? (
            <small className="snippet">
              {hit.before}
              <mark>{hit.match}</mark>
              {hit.after}
            </small>
          ) : (
            <small>{docSub(doc)}</small>
          )}
        </span>
        <span className="r">
          <i className={`dot ${STATUS[doc.status].tone}`} />
        </span>
      </button>
    )
  }
  if (item.type === 'note') {
    const { note } = item
    const doc = data.entries.get(note.docId)
    return (
      <button className="cr" data-i={i}>
        {note.kind === 'sticky' ? (
          <span className={`tile sw ${note.color ?? 'yellow'}`} />
        ) : (
          <span className="tile">
            <Icon name={note.kind === 'highlight' ? 'marker' : 'comment'} />
          </span>
        )}
        <span className="t">
          <b>
            <Marked text={noteText(note)} q={q} />
          </b>
          <small>{doc ? displayName(doc) : ''}</small>
        </span>
      </button>
    )
  }
  return (
    <button className="cr" data-i={i}>
      <span className="tile">
        <Icon name={item.action.icon} />
      </span>
      <span className="t">
        <b>
          <Marked text={item.action.title} q={q} />
        </b>
      </span>
      <span className="r">
        <Keys keys={item.action.keys} />
      </span>
    </button>
  )
}

function Preview({ item, q }: { item: Item | undefined; q: string }): React.JSX.Element | null {
  if (!item) return null
  if (item.type === 'more') {
    return (
      <>
        <p className="pv-title">{t('Pozostałe dokumenty')}</p>
        <p className="pv-text">{t('Reszta wyników to starsze albo słabiej pasujące pliki. Żeton lub dłuższe słowo zawęzi listę.')}</p>
      </>
    )
  }
  if (item.type === 'value') {
    return (
      <>
        <p className="pv-title">{filters()[item.key].name(item.v)}</p>
        <p className="pv-text">
          {item.count} {plural(item.count, 'wynik', 'wyniki', 'wyników')}
        </p>
      </>
    )
  }
  if (item.type === 'doc') {
    const { doc } = item
    const thumb = data.thumbs.get(doc.id)
    return (
      <>
        <div className="thumb" data-format={doc.format}>{thumb && <img src={thumb.url} alt="" draggable={false} />}</div>
        <dl className="meta">
          <dt>{t('Projekt')}</dt>
          <dd>{doc.projectName}</dd>
          {doc.branch && (
            <>
              <dt>Branch</dt>
              <dd>{doc.branch}</dd>
            </>
          )}
          <dt>{t('Plik')}</dt>
          <dd className="wrap">
            <MarkedWords text={doc.relPath} q={item.file ? q : ''} />
          </dd>
          <dt>Format</dt>
          <dd>{FORMAT_LABELS[doc.format]}</dd>
          <dt>Status</dt>
          <dd>{STATUS[doc.status].label}</dd>
          {doc.labels.length > 0 && (
            <>
              <dt>{t('Etykiety')}</dt>
              <dd title={doc.labels.join(', ')}>{doc.labels.join(', ')}</dd>
            </>
          )}
          <dt>{t('Zmieniono')}</dt>
          <dd>{relativeTime(doc.mtimeMs)}</dd>
        </dl>
      </>
    )
  }
  if (item.type === 'note') {
    const doc = data.entries.get(item.note.docId)
    return (
      <>
        <p className="pv-title">{doc ? displayName(doc) : ''}</p>
        {item.note.messages.length === 0 && <p className="pv-text">{noteText(item.note)}</p>}
        {item.note.messages.map((message) => (
          <p className="pv-text" key={message.id}>
            <b>{message.author === 'agent' ? 'Agent' : t('Ty')}:</b> {message.text}
          </p>
        ))}
      </>
    )
  }
  return (
    <>
      <p className="pv-title">{item.action.title}</p>
      <p className="pv-text">{item.action.sub}</p>
    </>
  )
}

function Hint({ keys, text }: { keys: string[]; text: string }): React.JSX.Element {
  return (
    <span className="act">
      <Keys keys={keys} />
      <span>{text}</span>
    </span>
  )
}

function FootHints({ item }: { item: Item | undefined }): React.JSX.Element | null {
  if (ui.map) {
    return (
      <>
        <Hint keys={['Esc']} text={t('Zamknij')} />
        <Hint keys={[MOD, 'K']} text={t('Paleta')} />
      </>
    )
  }
  if (!item) return null
  if (item.type === 'value') return <Hint keys={['↵']} text={t('Dodaj filtr')} />
  if (item.type === 'more') return <Hint keys={['↵']} text={t('Pokaż więcej')} />
  const label = item.type === 'doc' ? t('Otwórz') : item.type === 'note' ? t('Pokaż w dokumencie') : t('Uruchom')
  return (
    <>
      <Hint keys={['↵']} text={label} />
      <Hint keys={[MOD, 'K']} text={t('Akcje')} />
    </>
  )
}

function KeyMap({ q }: { q: string }): React.JSX.Element {
  let n = 0
  return (
    <div className="km">
      {keymap().map((group) => (
        <section className="km-group" key={group.group}>
          <h3>{group.group}</h3>
          {group.items.map((item) => {
            const off = q !== '' && !norm(`${item.title} ${item.keys.join(' ')}`).includes(q)
            return (
              <div
                key={item.title}
                className={off ? 'km-row off' : 'km-row'}
                style={{ '--n': n++ } as React.CSSProperties}
              >
                <Icon name={item.icon} />
                <span>{item.title}</span>
                <i className="keys">
                  <Keys keys={item.keys} />
                </i>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function mapCount(q: string): string {
  const all = keymap().flatMap((group) => group.items)
  const hits = q ? all.filter((item) => norm(`${item.title} ${item.keys.join(' ')}`).includes(q)).length : all.length
  return `${hits} ${plural(hits, 'skrót', 'skróty', 'skrótów')}`
}

function inputKey(e: KeyboardEvent<HTMLInputElement>): void {
  if (ui.map) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeCmd()
    }
    return
  }
  if (runChord(e.nativeEvent)) return
  const input = e.currentTarget
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cmdSelect(cmd.idx + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cmdSelect(cmd.idx - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runCmd(e.ctrlKey || e.metaKey)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (cmd.pick) {
      input.value = ''
      onCmdInput('')
    } else {
      closeCmd()
    }
  } else if (e.key === 'Backspace' && !input.value) {
    const last = cmd.order.at(-1)
    if (last) dropFilter(last[0], last[1])
  } else if (e.key === 'Tab') {
    e.preventDefault()
    if (cmd.pick) {
      runCmd(false)
      return
    }
    const key = filterKey(input.value.trim())
    if (key) startFilter(key)
  }
}

function actKey(e: KeyboardEvent<HTMLInputElement>): void {
  if (runChord(e.nativeEvent)) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    actSelect(cmd.actIdx + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    actSelect(cmd.actIdx - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    actionRows()[cmd.actIdx]?.run?.()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeActs()
  }
}

function Actions(): React.JSX.Element {
  let n = 0
  const moved = (e: PointerEvent<HTMLElement>): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.ar')
    if (row && Number(row.dataset.a) !== cmd.actIdx) actSelect(Number(row.dataset.a))
  }
  return (
    <div className={ui.acts ? 'cmd-acts on' : 'cmd-acts'} id="cmdActs" role="menu" aria-label={t('Akcje')}>
      <div className="act-rows" id="actBox">
        <i className="act-pill" ref={actPill.bind} />
        <div id="actRows" onPointerMove={moved}>
          {cmd.actRows.map((action, at) => {
            if (action.group) {
              return (
                <div className="ar-group" key={`g${at}`}>
                  {action.group}
                </div>
              )
            }
            const i = n++
            return (
              <button className="ar" data-a={i} role="menuitem" key={at} onClick={action.run}>
                {action.dot === undefined ? <Icon name={action.icon ?? 'file'} /> : <i className={`dot ${action.dot}`} />}
                <span>{action.title}</span>
                <i className="keys">{action.check ? <Icon name="check" /> : <Keys keys={action.keys ?? []} />}</i>
              </button>
            )
          })}
        </div>
      </div>
      <input
        id="actInput"
        type="text"
        placeholder={t('Szukaj akcji')}
        autoComplete="off"
        spellCheck={false}
        aria-label={t('Szukaj akcji')}
        onChange={(e) => {
          cmd.actQuery = e.target.value
          renderActs()
        }}
        onKeyDown={actKey}
      />
    </div>
  )
}

export function Palette(): React.JSX.Element {
  useShell()
  const q = norm((cmd.pick ? '' : cmd.query).trim())
  const item = cmd.items[cmd.idx]
  let n = 0

  useSynced(() => {
    syncCmdPill(cmd.instant)
    cmd.instant = false
    if (ui.acts) syncActPill()
  })

  const pressRow = (e: PointerEvent<HTMLElement>): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.cr')
    if (row) cmdSelect(Number(row.dataset.i))
  }

  return (
    <div
      className="cmd"
      id="cmd"
      role="dialog"
      aria-label={t('Paleta poleceń')}
      data-view={ui.map ? 'list' : undefined}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement
        if (target.id !== 'cmdInput' && target.id !== 'actInput') e.preventDefault()
      }}
    >
      <div className="cmd-top">
        <Icon name="search" />
        <div className="cmd-chips">
          {cmd.order.map(([key, value]) => (
            <span className="f-chip" key={`${key}:${value}`}>
              <b>{filters()[key].label}</b>
              {filters()[key].name(value)}
              <button aria-label={t('Usuń filtr')} onClick={() => dropFilter(key, value)}>
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
        <input
          id="cmdInput"
          type="text"
          placeholder={ui.map ? t('Szukaj skrótu') : t('Szukaj dokumentów, uwag i akcji')}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('Szukaj')}
          onChange={(e) => onCmdInput(e.target.value)}
          onKeyDown={inputKey}
        />
      </div>
      <div className="cmd-filters">
        <span className="f-note">{t('Dodaj filtr')}</span>
        {(Object.keys(filters()) as FilterKey[]).map((key) => (
          <button key={key} className={cmd.pick?.key === key ? 'f-add on' : 'f-add'} onClick={() => startFilter(key)}>
            {filters()[key].label}
          </button>
        ))}
      </div>
      <div className="cmd-body">
        <div className="cmd-list" id="cmdList">
          <i className="cmd-sel" ref={cmdPill.bind} />
          <div
            id="cmdRows"
            onPointerMove={pressRow}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.cr')) runCmd(e.ctrlKey || e.metaKey)
            }}
          >
            {cmd.rows.map((row, at) => {
              if (row.type === 'group') {
                return (
                  <div className="cmd-group" key={`g${at}`}>
                    {row.label}
                  </div>
                )
              }
              const i = n++
              return <Row key={`${row.type}${i}`} item={row} i={i} q={q} />
            })}
            {cmd.rows.length === 0 &&
              (cmd.pending || !data.library ? (
                <SkeletonList shape="two" count={5} />
              ) : (
                <div className="cmd-none">
                  <Otter pose="swimming" />
                  <p>{t('Nic nie pasuje. Spróbuj innego słowa.')}</p>
                </div>
              ))}
          </div>
        </div>
        <aside className="cmd-preview">
          <Preview item={item} q={q} />
        </aside>
      </div>
      <div className="cmd-map">{ui.map && <KeyMap q={norm(cmd.query.trim())} />}</div>
      <div className="cmd-foot">
        <div>{ui.map ? mapCount(norm(cmd.query.trim())) : cmd.flash || countLabel(cmd.total)}</div>
        <div>
          <FootHints item={item} />
        </div>
      </div>
      <Actions />
    </div>
  )
}
