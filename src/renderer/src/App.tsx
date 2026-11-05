import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Anchor,
  Annotation,
  AnnotationKind,
  Audience,
  OverlayEvent,
  OverlayMode,
  StickyColor
} from '../../shared/annotations'
import type { DocEntry, DocStatus, LibrarySnapshot, ViewerState } from '../../shared/types'
import { AnnotationsPanel } from './AnnotationsPanel'
import { DocViewport } from './DocViewport'
import { FoldersPanel } from './FoldersPanel'
import { Sidebar, type SidebarView } from './Sidebar'

const LAST_DOC_KEY = 'lastDocId'
const COLLAPSED_KEY = 'collapsedNodes'
const IDLE_STATE: ViewerState = { docId: null, status: 'idle', blockedRequests: 0, blockedHosts: [] }

export interface Draft {
  kind: AnnotationKind
  anchor: Anchor | null
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Zapamiętany widok to tylko wygoda, więc jego utrata niczego nie psuje.
  }
}

function readCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readStored(COLLAPSED_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function allEntries(library: LibrarySnapshot | null): Map<string, DocEntry> {
  const docs = [...(library?.projects.flatMap((project) => project.docs) ?? []), ...(library?.review ?? [])]
  return new Map(docs.map((doc) => [doc.id, doc]))
}

export function App(): React.JSX.Element {
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [viewerState, setViewerState] = useState<ViewerState>(IDLE_STATE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openedMtime, setOpenedMtime] = useState<number | null>(null)
  const [view, setView] = useState<SidebarView>('library')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [showFolders, setShowFolders] = useState(false)
  const [scanning, setScanning] = useState(true)
  const [mode, setMode] = useState<OverlayMode>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [orphans, setOrphans] = useState<Set<string>>(new Set())
  const restored = useRef(false)
  const focusAfterLoad = useRef<string | null>(null)

  const entries = useMemo(() => allEntries(library), [library])
  const selected = selectedId ? (entries.get(selectedId) ?? null) : null
  const docNotes = useMemo(
    () => annotations.filter((item) => item.docId === selectedId),
    [annotations, selectedId]
  )

  const changeMode = useCallback((next: OverlayMode) => {
    setMode(next)
    window.api.setOverlayMode(next)
  }, [])

  const resetAnnotating = useCallback(() => {
    setMode(null)
    setDraft(null)
    setActiveNoteId(null)
    setOrphans(new Set())
  }, [])

  const selectDoc = useCallback(
    (doc: DocEntry, noteId: string | null = null) => {
      resetAnnotating()
      setActiveNoteId(noteId)
      focusAfterLoad.current = noteId
      setSelectedId(doc.id)
      setOpenedMtime(doc.mtimeMs)
      setShowFolders(false)
      writeStored(LAST_DOC_KEY, doc.id)
      void window.api.openDoc(doc.id)
    },
    [resetAnnotating]
  )

  const load = useCallback((request: () => Promise<LibrarySnapshot>) => {
    setScanning(true)
    request()
      .then(setLibrary)
      .finally(() => setScanning(false))
      .catch(() => {})
  }, [])

  useEffect(() => window.api.onViewerState(setViewerState), [])
  useEffect(() => window.api.onLibraryChanged(setLibrary), [])
  useEffect(() => window.api.onAnnotationsChanged(setAnnotations), [])
  useEffect(() => load(window.api.getLibrary), [load])
  useEffect(() => {
    void window.api.listAnnotations().then(setAnnotations)
  }, [])
  useEffect(() => {
    if (viewerState.status !== 'ready' || viewerState.docId !== selectedId || !focusAfterLoad.current) return
    window.api.focusAnnotation(focusAfterLoad.current)
    focusAfterLoad.current = null
  }, [viewerState, selectedId])

  const toggleMode = useCallback(
    (kind: AnnotationKind) => {
      setDraft(null)
      changeMode(mode === kind ? null : kind)
    },
    [mode, changeMode]
  )

  useEffect(
    () =>
      window.api.onOverlayEvent((event: OverlayEvent) => {
        switch (event.type) {
          case 'place':
            setMode(null)
            setActiveNoteId(null)
            setDraft({ kind: event.kind, anchor: event.anchor })
            break
          case 'select':
            setActiveNoteId(event.id)
            break
          case 'orphans':
            setOrphans(new Set(event.ids))
            break
          case 'shortcut':
            if (event.key === 'cancel') {
              setDraft(null)
              changeMode(null)
            } else {
              toggleMode(event.key)
            }
            break
        }
      }),
    [changeMode, toggleMode]
  )

  const canAnnotate = selected?.classification === 'document' && !showFolders

  // Dokument obsługuje te skróty sam, gdy ma fokus. Ten nasłuch działa, gdy fokus jest w apce.
  useEffect(() => {
    if (!canAnnotate) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'c') toggleMode('comment')
      if (event.key === 'n') toggleMode('sticky')
      if (event.key === 'Escape') {
        setDraft(null)
        changeMode(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAnnotate, toggleMode, changeMode])

  useEffect(() => {
    if (!library) return
    if (library.roots.length === 0) setShowFolders(true)
    if (!restored.current) {
      restored.current = true
      const last = entries.get(readStored(LAST_DOC_KEY) ?? '')
      if (last) selectDoc(last)
      return
    }
    if (selectedId && !entries.has(selectedId)) {
      setSelectedId(null)
      resetAnnotating()
      void window.api.closeDoc()
    }
  }, [library, entries, selectedId, selectDoc, resetAnnotating])

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      writeStored(COLLAPSED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const reload = useCallback(() => {
    setOpenedMtime(selected?.mtimeMs ?? null)
    resetAnnotating()
    void window.api.reloadDoc()
  }, [selected, resetAnnotating])

  const setStatus = useCallback(
    (status: DocStatus) => {
      if (selectedId) load(() => window.api.setStatus(selectedId, status))
    },
    [selectedId, load]
  )

  const classify = useCallback(
    (classification: 'document' | 'ignored') => {
      if (selectedId) load(() => window.api.setClassification(selectedId, classification))
    },
    [selectedId, load]
  )

  const selectNote = useCallback((id: string | null) => {
    setActiveNoteId(id)
    window.api.focusAnnotation(id)
  }, [])

  const cancelDraft = useCallback(() => {
    setDraft(null)
    changeMode(null)
  }, [changeMode])

  const submitDraft = useCallback(
    (text: string, audience: Audience, color: StickyColor | null) => {
      if (!draft || !selectedId) return
      void window.api
        .createAnnotation(selectedId, { kind: draft.kind, anchor: draft.anchor, audience, color, text })
        .then(cancelDraft)
    },
    [draft, selectedId, cancelDraft]
  )

  const openNote = useCallback(
    (annotation: Annotation) => {
      const doc = entries.get(annotation.docId)
      if (!doc) return
      if (doc.id === selectedId) selectNote(annotation.id)
      else selectDoc(doc, annotation.id)
    },
    [entries, selectedId, selectDoc, selectNote]
  )

  const outdated = selected !== null && openedMtime !== null && selected.mtimeMs !== openedMtime

  return (
    <div className={canAnnotate ? 'app with-notes' : 'app'}>
      <Sidebar
        library={library}
        annotations={annotations}
        view={view}
        selectedId={selectedId}
        collapsed={collapsed}
        scanning={scanning}
        onView={setView}
        onToggle={toggle}
        onSelect={selectDoc}
        onOpenNote={openNote}
        onShowFolders={() => setShowFolders(true)}
        onRescan={() => load(window.api.rescan)}
      />
      <main className="content">
        {showFolders ? (
          <FoldersPanel
            library={library}
            onAdd={() => load(window.api.addRoot)}
            onRemove={(path) => load(() => window.api.removeRoot(path))}
            onLink={() => load(window.api.linkFolder)}
            onUnlink={(folder) => load(() => window.api.unlinkFolder(folder))}
            onClose={() => setShowFolders(false)}
          />
        ) : (
          <DocViewport
            doc={selected}
            library={library}
            state={viewerState}
            outdated={outdated}
            mode={mode}
            canAnnotate={canAnnotate}
            onReload={reload}
            onStatus={setStatus}
            onClassify={classify}
            onMode={toggleMode}
          />
        )}
      </main>
      {canAnnotate && selected && (
        <AnnotationsPanel
          doc={selected}
          annotations={docNotes}
          docSha={selected.sha}
          draft={draft}
          selectedId={activeNoteId}
          orphans={orphans}
          onSelect={selectNote}
          onSubmitDraft={submitDraft}
          onCancelDraft={cancelDraft}
          onDocumentNote={() => setDraft({ kind: 'comment', anchor: null })}
        />
      )}
    </div>
  )
}
