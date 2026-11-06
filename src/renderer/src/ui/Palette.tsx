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
  FILTERS,
  filterKey,
  type FilterKey,
  type Item,
  KEYMAP,
  norm,
  onCmdInput,
  renderActs,
  runChord,
  runCmd,
  startFilter,
  syncActPill,
  syncCmdPill
} from '../shell/palette'
import { FORMAT_LABELS } from '../../../shared/types'
import { data, MOD, plural, STATUS, ui, useShell } from '../shell/state'
import { displayName, relativeTime } from '../tree'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'

const FILTER_ICON: Record<FilterKey, string> = { project: 'folder', branch: 'branch', format: 'file', kind: 'layers', status: 'layers' }

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

function Row({ item, i, q }: { item: Item; i: number; q: string }): React.JSX.Element {
  if (item.type === 'more') {
    return (
      <button className="cr more" data-i={i}>
        <span className="tile">
          <Icon name="chev" />
        </span>
        <span className="t">
          <b>Pokaż kolejne {Math.min(item.left, DOC_MORE)}</b>
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
          <b>{FILTERS[item.key].name(item.v)}</b>
        </span>
        <span className="r">{item.count}</span>
      </button>
    )
  }
  if (item.type === 'doc') {
    const { doc, hit } = item
    return (
      <button className="cr" data-i={i}>
        <span className="tile">
          <Icon name="file" />
        </span>
        <span className="t">
          <b>
            <Marked text={displayName(doc)} q={q} />
          </b>
          {hit ? (
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
            <Icon name="comment" />
          </span>
        )}
        <span className="t">
          <b>
            <Marked text={note.messages[0]?.text ?? ''} q={q} />
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

function Preview({ item }: { item: Item | undefined }): React.JSX.Element | null {
  if (!item) return null
  if (item.type === 'more') {
    return (
      <>
        <p className="pv-title">Pozostałe dokumenty</p>
        <p className="pv-text">Reszta wyników to starsze albo słabiej pasujące pliki. Żeton lub dłuższe słowo zawęzi listę.</p>
      </>
    )
  }
  if (item.type === 'value') {
    return (
      <>
        <p className="pv-title">{FILTERS[item.key].name(item.v)}</p>
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
          <dt>Projekt</dt>
          <dd>{doc.projectName}</dd>
          {doc.branch && (
            <>
              <dt>Branch</dt>
              <dd>{doc.branch}</dd>
            </>
          )}
          <dt>Format</dt>
          <dd>{FORMAT_LABELS[doc.format]}</dd>
          <dt>Status</dt>
          <dd>{STATUS[doc.status].label}</dd>
          <dt>Zmieniono</dt>
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
        {item.note.messages.map((message) => (
          <p className="pv-text" key={message.id}>
            <b>{message.author === 'agent' ? 'Agent' : 'Ty'}:</b> {message.text}
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
        <Hint keys={['Esc']} text="Zamknij" />
        <Hint keys={[MOD, 'K']} text="Paleta" />
      </>
    )
  }
  if (!item) return null
  if (item.type === 'value') return <Hint keys={['↵']} text="Dodaj filtr" />
  if (item.type === 'more') return <Hint keys={['↵']} text="Pokaż więcej" />
  const label = item.type === 'doc' ? 'Otwórz' : item.type === 'note' ? 'Pokaż w dokumencie' : 'Uruchom'
  return (
    <>
      <Hint keys={['↵']} text={label} />
      <Hint keys={[MOD, 'K']} text="Akcje" />
    </>
  )
}

function KeyMap({ q }: { q: string }): React.JSX.Element {
  let n = 0
  return (
    <div className="km">
      {KEYMAP.map((group) => (
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
  const all = KEYMAP.flatMap((group) => group.items)
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
    <div className={ui.acts ? 'cmd-acts on' : 'cmd-acts'} id="cmdActs" role="menu" aria-label="Akcje">
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
              <button className="ar" data-a={i} role="menuitem" key={action.title} onClick={action.run}>
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
        placeholder="Szukaj akcji"
        autoComplete="off"
        spellCheck={false}
        aria-label="Szukaj akcji"
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
      aria-label="Paleta poleceń"
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
              <b>{FILTERS[key].label}</b>
              {FILTERS[key].name(value)}
              <button aria-label="Usuń filtr" onClick={() => dropFilter(key, value)}>
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
        <input
          id="cmdInput"
          type="text"
          placeholder={ui.map ? 'Szukaj skrótu' : 'Szukaj dokumentów, uwag i akcji'}
          autoComplete="off"
          spellCheck={false}
          aria-label="Szukaj"
          onChange={(e) => onCmdInput(e.target.value)}
          onKeyDown={inputKey}
        />
      </div>
      <div className="cmd-filters">
        <span className="f-note">Dodaj filtr</span>
        {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
          <button key={key} className={cmd.pick?.key === key ? 'f-add on' : 'f-add'} onClick={() => startFilter(key)}>
            {FILTERS[key].label}
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
            {cmd.rows.length === 0 && <p className="cmd-none">Nic nie pasuje. Spróbuj innego słowa.</p>}
          </div>
        </div>
        <aside className="cmd-preview">
          <Preview item={item} />
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
