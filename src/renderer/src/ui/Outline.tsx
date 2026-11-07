import { useEffect, useLayoutEffect, useRef } from 'react'
import { t } from '../../../shared/i18n'
import { setInsp } from '../shell/notes'
import { jumpToHeading, outline, requestOutline, toggleMinimap } from '../shell/outline'
import { useShell } from '../shell/state'
import { Icon } from './icons'
import { SkeletonList } from './Skeleton'

/** Głębiej spis przestaje się mieścić w panelu, a i tak czyta się go po kształcie. */
const MAX_DEPTH = 4

/**
 * Pigułka bieżącego rozdziału jedzie między wierszami, zamiast przeskakiwać, bo przy czytaniu
 * zmienia się sama i oko powinno widzieć, skąd przyszła. Lista dociąga ją do widoku, ale tylko
 * w swoim pudełku, żeby nie przewinąć powłoki.
 */
function useCurrentPill(list: React.RefObject<HTMLElement | null>, current: number, rows: number): React.RefObject<HTMLSpanElement | null> {
  const pill = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = list.current
    const mark = pill.current
    if (!box || !mark) return
    const row = box.querySelector<HTMLElement>(`[data-heading="${current}"]`)
    if (!row) {
      mark.style.opacity = '0'
      return
    }
    const first = mark.style.opacity !== '1'
    if (first) mark.style.transition = 'none'
    mark.style.opacity = '1'
    mark.style.translate = `0 ${row.offsetTop}px`
    mark.style.height = `${row.offsetHeight}px`
    if (first) {
      void mark.offsetHeight
      mark.style.transition = ''
    }
    const top = row.offsetTop - box.clientHeight * 0.3
    if (row.offsetTop < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }, [list, current, rows])
  return pill
}

export function OutlinePanel({ docId }: { docId: string | null }): React.JSX.Element {
  useShell()
  const known = docId ? outline.docs.get(docId) : undefined
  const headings = known?.headings ?? []
  const current = known?.current ?? -1
  const list = useRef<HTMLElement>(null)
  const pill = useCurrentPill(list, current, headings.length)
  const base = headings.reduce((low, heading) => Math.min(low, heading.level), 6)

  useEffect(() => {
    if (docId) requestOutline(docId)
  }, [docId])

  return (
    <>
      <header className="insp-head">
        <strong>
          {t('Spis treści')} <span>{headings.length || ''}</span>
        </strong>
        <button className="mini" aria-label={t('Zamknij spis treści')} onClick={() => setInsp(false)}>
          <Icon name="x" />
        </button>
      </header>
      <nav className="toc-list" id="tocList" ref={list} aria-label={t('Spis treści')}>
        <span className="toc-pill" ref={pill} aria-hidden="true" />
        {docId && !known ? (
          <SkeletonList count={7} />
        ) : headings.length === 0 ? (
          <p className="empty">{t('Ten dokument nie ma nagłówków.')}</p>
        ) : (
          headings.map((heading, i) => (
            <button
              key={i}
              className={i === current ? 'toc-row on' : 'toc-row'}
              data-heading={i}
              data-depth={Math.min(heading.level - base, MAX_DEPTH)}
              aria-current={i === current ? 'location' : undefined}
              title={heading.text}
              onClick={() => jumpToHeading(i)}
            >
              <span>{heading.text}</span>
            </button>
          ))
        )}
      </nav>
      <footer className="insp-foot">
        <button className="o-toggle toc-map" role="switch" aria-checked={outline.minimap} onClick={toggleMinimap}>
          <span>{t('Minimapa przy krawędzi arkusza')}</span>
          <i />
        </button>
      </footer>
    </>
  )
}
