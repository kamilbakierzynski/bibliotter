import { Fragment, type PointerEvent, useLayoutEffect, useRef } from 'react'
import { t } from '../../../shared/i18n'
import { menuPill } from '../shell/layout'
import { cancelRename, clearMenuItem, commitRename, menu, pickMenuItem, placeMenu, rename, selectMenuItem } from '../shell/menu'
import { useShell, useShellValue } from '../shell/state'
import { Icon } from './icons'

/** Mniej więcej tyle znaków mieszczą dwa wiersze menu. Dłuższy napis dostaje jeszcze dymek. */
const MAX_LINES_CHARS = 44

export function RowMenu(): React.JSX.Element {
  useShell()
  const box = useRef<HTMLDivElement>(null)
  const { on, items, done, x, y } = menu
  useLayoutEffect(() => {
    if (on && box.current) placeMenu(box.current)
  }, [on, items, x, y])
  const over = (e: PointerEvent<HTMLElement>): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    if (row) selectMenuItem(Number(row.dataset.i))
  }
  return (
    <div
      className={on ? 'row-menu on' : 'row-menu'}
      id="rowMenu"
      role="menu"
      aria-label={t('Akcje wiersza')}
      ref={box}
      onPointerOver={over}
      onPointerLeave={clearMenuItem}
      onContextMenu={(e) => e.preventDefault()}
    >
      <i className="pop-pill" ref={menuPill.bind} />
      {items.map((item, i) => (
        <Fragment key={item.title}>
          {item.gap && <hr />}
          <button
            className="ar"
            role={item.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.on}
            tabIndex={-1}
            data-i={i}
            data-color={item.color}
            title={item.title.length > MAX_LINES_CHARS ? item.title : undefined}
            onClick={() => pickMenuItem(item)}
          >
            <Icon name={done === item ? 'check' : item.icon} />
            <span>{done === item ? item.done : item.title}</span>
            {item.on && <Icon name="check" className="ar-on" />}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Pole leży nad wierszem, bo wiersz to przycisk, a w przycisku nie może być pola tekstowego.
 * Zaczyna się tam, gdzie nazwa, więc ikona zostaje na miejscu, a tekst nie przeskakuje.
 */
export function RenameField({ rowKey, offset = 1 }: { rowKey: string; offset?: number }): React.JSX.Element | null {
  const edit = useShellValue(() => (rename.current?.key === rowKey ? rename.current : null))
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    // Przewijanie z kodu przesunęłoby panel pod kursorem, a wiersz i tak jest na ekranie.
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [edit])
  if (!edit) return null
  return (
    <input
      ref={input}
      className="row-edit"
      style={{ left: offset, width: `calc(100% - ${offset}px)` }}
      type="text"
      aria-label={t('Nazwa w aplikacji')}
      defaultValue={edit.alias || edit.original}
      placeholder={edit.original}
      spellCheck={false}
      onBlur={(e) => commitRename(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') cancelRename()
        else return
        // Klawisz należy do pola, więc nie może dojść do skrótów apki.
        e.stopPropagation()
      }}
    />
  )
}
