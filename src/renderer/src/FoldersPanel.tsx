import type { LibrarySnapshot } from '../../shared/types'

interface FoldersPanelProps {
  library: LibrarySnapshot | null
  onAdd: () => void
  onRemove: (path: string) => void
  onLink: () => void
  onUnlink: (folder: string) => void
  onClose: () => void
}

export function FoldersPanel(props: FoldersPanelProps): React.JSX.Element {
  const { library, onAdd, onRemove, onLink, onUnlink, onClose } = props
  const roots = library?.roots ?? []
  const links = library?.folderLinks ?? []
  const unavailable = new Set(library?.unavailableRoots ?? [])

  return (
    <section className="panel">
      <div className="panel-body">
        <h1>Foldery z dokumentami</h1>
        <p className="muted">
          Apka szuka dokumentów HTML w tych folderach i ich podfolderach, a nowe pliki wykrywa sama.
          Niczego nie zmienia ani nie przenosi. Kopie dokumentów trzyma w folderze HtmlDocs.
        </p>
        {roots.length > 0 && (
          <ul className="roots">
            {roots.map((root) => (
              <li key={root}>
                <span className="root-path">
                  {root}
                  {unavailable.has(root) && <em> (niedostępny)</em>}
                </span>
                <button className="ghost" onClick={() => onRemove(root)}>
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="panel-actions">
          <button className="primary" onClick={onAdd}>
            Dodaj foldery
          </button>
          {roots.length > 0 && (
            <button className="ghost" onClick={onClose}>
              Wróć do dokumentów
            </button>
          )}
        </div>

        {roots.length > 0 && (
          <>
            <h2>Foldery przypisane do repozytoriów</h2>
            <p className="muted">
              Dokumenty z takiego folderu trafiają do projektu repozytorium i dostają branch z chwili
              powstania, ale nie trafiają do samego repozytorium.
            </p>
            {links.length > 0 && (
              <ul className="roots">
                {links.map((link) => (
                  <li key={link.folder}>
                    <span className="root-path">
                      {link.folder}
                      <span className="muted"> → {link.repo}</span>
                    </span>
                    <button className="ghost" aria-label={`Odłącz ${link.folder}`} onClick={() => onUnlink(link.folder)}>
                      Odłącz
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="panel-actions">
              <button className="ghost outlined" onClick={onLink}>
                Przypisz folder do repozytorium
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
