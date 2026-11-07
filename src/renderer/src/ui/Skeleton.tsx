import type { CSSProperties } from 'react'
import { t } from '../../../shared/i18n'

/** Szerokości pasków są stałe, bo losowe mrugałyby przy każdym rysowaniu. */
const WIDTHS = ['64%', '82%', '52%', '73%', '44%', '68%', '58%', '77%']
const widthAt = (i: number): string => WIDTHS[i % WIDTHS.length] as string

/** Co piąty wiersz drzewa to projekt, a pod nim stoją jego dokumenty. */
const HEAD_EVERY = 5

/** Tyle kartek wypełnia ścianę w typowym oknie. Reszta i tak leży poniżej. */
const WALL_CARDS = 9

/** Tytuł i akapity kartki. Pusty wpis to odstęp między akapitami. */
const SHEET_LINES = ['46%', '', '100%', '94%', '98%', '62%', '', '96%', '100%', '71%', '', '100%', '93%', '84%']

/** `plain` to zwykłe wiersze, `two` to wiersze z podpisem, a `tree` i `hits` mają poziomy. */
export type SkeletonShape = 'plain' | 'two' | 'tree' | 'hits'

function Bar({ width, i }: { width: string; i: number }): React.JSX.Element {
  return <i className="sk" style={{ width, '--i': i } as CSSProperties} />
}

/** Wiersze listy, zanim lista przyjdzie. */
export function SkeletonList({ shape = 'plain', count = 8 }: { shape?: SkeletonShape; count?: number }): React.JSX.Element {
  const leveled = shape === 'tree' || shape === 'hits'
  return (
    <div className={`sk-list ${shape}`} role="status" aria-label={t('Wczytuję…')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={leveled && i % HEAD_EVERY !== 0 ? 'sk-row sub rv' : 'sk-row rv'}>
          <Bar width={widthAt(i)} i={i} />
          {shape === 'two' && <Bar width={widthAt(i + 3)} i={i} />}
        </div>
      ))}
    </div>
  )
}

/** Podpis pod nagłówkiem, zanim wiadomo, ile czego jest. */
export function SkeletonLine(): React.JSX.Element {
  return <i className="sk sk-line" aria-hidden="true" />
}

/** Tytuł i akapity na pustej kartce. Stoi pod miniaturą, więc miniatura wchodzi przez przenikanie. */
export function SkeletonSheet(): React.JSX.Element {
  return (
    <span className="sk-sheet" aria-hidden="true">
      {SHEET_LINES.map((width, i) => (width ? <i key={i} style={{ width }} /> : <b key={i} />))}
    </span>
  )
}

/** Ściana, zanim przyjdzie pierwsza migawka. Kartki stoją dokładnie tam, gdzie zawisną dokumenty. */
export function SkeletonWall(): React.JSX.Element {
  return (
    <div className="h-wall sk-wall" role="status" aria-label={t('Wczytuję…')}>
      {Array.from({ length: WALL_CARDS }, (_, i) => (
        <div key={i} className="hs sk-card" style={{ '--i': i } as CSSProperties}>
          {/* Format jeszcze nie jest znany, a kartka idąca za motywem nie błyśnie bielą nocą. */}
          <div className="hs-sheet" data-format="markdown">
            <SkeletonSheet />
          </div>
          <div className="hs-cap">
            <b>
              <Bar width={widthAt(i)} i={i} />
            </b>
            <small>
              <Bar width={widthAt(i + 3)} i={i} />
            </small>
          </div>
        </div>
      ))}
    </div>
  )
}
