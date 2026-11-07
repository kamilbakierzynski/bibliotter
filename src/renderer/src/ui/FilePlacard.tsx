import type { FileMode } from '../../../shared/fileView'
import { t } from '../../../shared/i18n'
import type { DocEntry } from '../../../shared/types'
import { fileTree, refreshFile, setFileMode, toggleFileTree } from '../shell/files'
import { find, toggleFind } from '../shell/find'
import { closeSheet, pinPeek, splitKey } from '../shell/sheets'
import { pinned, ui } from '../shell/state'
import { FindBar } from './Find'
import { HistoryNav } from './HistoryNav'
import { Icon } from './icons'

const modes = (): { id: FileMode; label: string }[] => [
  { id: 'file', label: t('Plik') },
  { id: 'diff', label: t('Zmiany') }
]

/** Plik i zmiany to dwa widoki tego samego arkusza, więc przełącznik stoi w plakietce, jak podział. */
function ModeSwitch({ doc }: { doc: DocEntry }): React.JSX.Element | null {
  const file = doc.file
  if (!file?.changed) return null
  return (
    <div className="seg file-seg" role="radiogroup" aria-label={t('Widok pliku')}>
      {modes().map(({ id, label }) => (
        <button key={id} role="radio" aria-checked={file.mode === id} className={file.mode === id ? 'on' : ''} onClick={() => setFileMode(doc.id, id)}>
          {label}
          {id === 'diff' && (
            <span className="file-stat">
              <b>+{file.added}</b> −{file.removed}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Nagłówek arkusza pliku. Plik nie należy do biblioteki, więc nie ma statusu, etykiet, uwag ani linków,
 * a zostaje to, co steruje widokiem: szukanie, podział, odświeżenie i Eksplorator.
 */
export function FilePlacard({ i, doc }: { i: number; doc: DocEntry }): React.JSX.Element {
  const folder = doc.relPath.includes('/') ? doc.relPath.slice(0, doc.relPath.lastIndexOf('/')) : null
  return (
    <header className="placard" data-kind="file">
      <HistoryNav />
      <div className="pl-text">
        <span className="pl-title" title={doc.path}>
          {doc.name}
        </span>
        <span className="pl-meta">
          <span>{doc.projectName}</span>
          {folder && <span title={doc.relPath}>{folder}</span>}
          {doc.branch && (
            <>
              <Icon name="branch" />
              <span>{doc.branch}</span>
            </>
          )}
          {!doc.file?.changed && !doc.file?.folder && doc.branch && <span>{t('bez zmian')}</span>}
        </span>
      </div>
      {find.open && find.docId === doc.id && ui.panes[ui.focus] === doc.id && <FindBar />}
      <div className="pl-actions">
        <ModeSwitch doc={doc} />
        <span className="pl-moved">
          <button className="mini" data-moved="find" aria-label={t('Szukaj w dokumencie')} onClick={toggleFind}>
            <Icon name="textsearch" />
          </button>
          <button className={pinned() > 1 ? 'mini on' : 'mini'} data-moved="split" aria-label={t('Podziel widok')} onClick={splitKey}>
            <Icon name="split" />
          </button>
        </span>
        {!doc.file?.folder && (
          <button
            className={fileTree.shown ? 'mini on' : 'mini'}
            data-act="tree"
            aria-label={t('Drzewo plików')}
            aria-pressed={fileTree.shown}
            onClick={toggleFileTree}
          >
            <Icon name="folder" />
          </button>
        )}
        <button className="mini" data-act="refresh" aria-label={t('Odśwież plik')} onClick={() => refreshFile(doc.id)}>
          <Icon name="refresh" />
        </button>
        <button className="mini" data-act="reveal" aria-label={t('Pokaż w folderze')} onClick={() => void window.api.revealFolder(doc.path)}>
          <Icon name="reveal" />
        </button>
        <button className="ask pl-pin" onClick={pinPeek}>
          <Icon name="split" />
          <span>{t('Przypnij obok')}</span>
        </button>
        <button className="mini pl-close" aria-label={t('Zamknij arkusz')} onClick={() => closeSheet(i)}>
          <Icon name="x" />
        </button>
      </div>
    </header>
  )
}
