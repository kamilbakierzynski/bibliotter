import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DocEntry, DocStatus, LibrarySnapshot, ViewerState } from '../../shared/types'
import { DocViewport } from './DocViewport'
import { FoldersPanel } from './FoldersPanel'
import { Sidebar, type SidebarView } from './Sidebar'

const LAST_DOC_KEY = 'lastDocId'
const COLLAPSED_KEY = 'collapsedNodes'
const IDLE_STATE: ViewerState = { docId: null, status: 'idle', blockedRequests: 0, blockedHosts: [] }

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
  const [viewerState, setViewerState] = useState<ViewerState>(IDLE_STATE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openedMtime, setOpenedMtime] = useState<number | null>(null)
  const [view, setView] = useState<SidebarView>('library')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [showFolders, setShowFolders] = useState(false)
  const [scanning, setScanning] = useState(true)
  const restored = useRef(false)

  const entries = useMemo(() => allEntries(library), [library])
  const selected = selectedId ? (entries.get(selectedId) ?? null) : null

  const selectDoc = useCallback((doc: DocEntry) => {
    setSelectedId(doc.id)
    setOpenedMtime(doc.mtimeMs)
    setShowFolders(false)
    writeStored(LAST_DOC_KEY, doc.id)
    void window.api.openDoc(doc.id)
  }, [])

  const load = useCallback((request: () => Promise<LibrarySnapshot>) => {
    setScanning(true)
    request()
      .then(setLibrary)
      .finally(() => setScanning(false))
      .catch(() => {})
  }, [])

  useEffect(() => window.api.onViewerState(setViewerState), [])
  useEffect(() => window.api.onLibraryChanged(setLibrary), [])
  useEffect(() => load(window.api.getLibrary), [load])

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
      void window.api.closeDoc()
    }
  }, [library, entries, selectedId, selectDoc])

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
    void window.api.reloadDoc()
  }, [selected])

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

  const outdated = selected !== null && openedMtime !== null && selected.mtimeMs !== openedMtime

  return (
    <div className="app">
      <Sidebar
        library={library}
        view={view}
        selectedId={selectedId}
        collapsed={collapsed}
        scanning={scanning}
        onView={setView}
        onToggle={toggle}
        onSelect={selectDoc}
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
            onReload={reload}
            onStatus={setStatus}
            onClassify={classify}
          />
        )}
      </main>
    </div>
  )
}
