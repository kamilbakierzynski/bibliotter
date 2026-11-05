import { useLayoutEffect, useRef } from 'react'
import { DOC_STATUSES, type DocEntry, type DocStatus, type LibrarySnapshot, type ViewerState } from '../../shared/types'
import { blockedLabel, displayName, STATUS_LABELS } from './tree'

interface DocViewportProps {
  doc: DocEntry | null
  library: LibrarySnapshot | null
  state: ViewerState
  /** Plik zmienił się na dysku po otwarciu. */
  outdated: boolean
  onReload: () => void
  onStatus: (status: DocStatus) => void
  onClassify: (classification: 'document' | 'ignored') => void
}

function DocMeta({ doc, library }: { doc: DocEntry; library: LibrarySnapshot | null }): React.JSX.Element {
  const pullRequest = doc.branch
    ? library?.projects.find((project) => project.name === doc.projectName)?.pullRequests[doc.branch]
    : undefined

  return (
    <span className="doc-meta muted">
      <span>{doc.projectName}</span>
      {doc.branch && <span>{doc.branch}</span>}
      {doc.commit && <span title={doc.commit}>{doc.commit.slice(0, 7)}</span>}
      {pullRequest && (
        <button className="link" title={pullRequest.title} onClick={() => void window.api.openExternal(pullRequest.url)}>
          PR #{pullRequest.number}
        </button>
      )}
      <span className="doc-path" title={doc.path}>
        {doc.path}
      </span>
    </span>
  )
}

export function DocViewport(props: DocViewportProps): React.JSX.Element {
  const { doc, library, state, outdated, onReload, onStatus, onClassify } = props
  const viewport = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const report = (): void => {
      const { x, y, width, height } = element.getBoundingClientRect()
      window.api.setViewerBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      window.api.setViewerBounds(null)
    }
  }, [])

  return (
    <section className="document">
      <header className="toolbar">
        {doc ? (
          <>
            <div className="doc-heading">
              <strong>{displayName(doc)}</strong>
              <DocMeta doc={doc} library={library} />
            </div>
            {doc.missing && <span className="notice">Oryginał zniknął, to zachowana kopia</span>}
            {state.blockedRequests > 0 && (
              <span className="notice" title={state.blockedHosts.join('\n')}>
                {blockedLabel(state.blockedRequests)}
              </span>
            )}
            {doc.classification === 'review' ? (
              <>
                <button className="primary" onClick={() => onClassify('document')}>
                  Dodaj do biblioteki
                </button>
                <button className="ghost" onClick={() => onClassify('ignored')}>
                  Pomiń
                </button>
              </>
            ) : (
              <select
                aria-label="Status dokumentu"
                value={doc.status}
                onChange={(event) => onStatus(event.target.value as DocStatus)}
              >
                {DOC_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            )}
            <button className={outdated ? 'primary' : 'ghost'} onClick={onReload}>
              {outdated ? 'Pokaż nową wersję' : 'Odśwież'}
            </button>
            {!doc.missing && (
              <button className="ghost" onClick={() => void window.api.revealDoc(doc.id)}>
                Pokaż w folderze
              </button>
            )}
            {doc.classification === 'document' && (
              <button className="ghost" title="Usuń z biblioteki" onClick={() => onClassify('ignored')}>
                Pomiń
              </button>
            )}
          </>
        ) : (
          <span className="muted">Nie wybrano dokumentu</span>
        )}
      </header>
      <div ref={viewport} className="viewport">
        {!doc && <p className="muted placeholder">Wybierz dokument z listy po lewej.</p>}
        {state.status === 'error' && <p className="placeholder">Nie udało się otworzyć dokumentu.</p>}
      </div>
    </section>
  )
}
