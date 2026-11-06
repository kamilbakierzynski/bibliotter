import { useLayoutEffect, useRef, useState } from 'react'
import { syncSel } from '../shell/layout'

/** Zapas nad i pod ekranem, żeby przewijanie nie odsłaniało pustki. */
const MARGIN_PX = 480
/** Okno przesuwa się skokami, bo każdy piksel przewinięcia to za często na rysowanie. */
const STEP_PX = 96

export interface Placed {
  key: string
  y: number
}

function firstBelow(rows: Placed[], y: number): number {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((rows[middle] as Placed).y < y) low = middle + 1
    else high = middle
  }
  return low
}

interface WindowedProps<Row extends Placed> {
  /** Wiersze w kolejności `y`. */
  rows: Row[]
  height: number
  render: (row: Row) => React.JSX.Element
}

/** Rysuje tylko wiersze blisko ekranu. Przewija je panel, w którym lista leży. */
export function Windowed<Row extends Placed>({ rows, height, render }: WindowedProps<Row>): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, bottom: 1200 })

  useLayoutEffect(() => {
    const list = box.current
    const scroller = list?.closest<HTMLElement>('.panel-scroll')
    if (!list || !scroller) return undefined
    const measure = (): void => {
      const offset = scroller.getBoundingClientRect().top - list.getBoundingClientRect().top
      const top = Math.floor(offset / STEP_PX) * STEP_PX
      const bottom = top + scroller.clientHeight + STEP_PX
      setView((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
    }
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [])

  // Wiersz wybranego dokumentu mógł właśnie wejść do okna albo z niego wyjść.
  useLayoutEffect(() => syncSel(true), [view])

  const from = firstBelow(rows, view.top - MARGIN_PX)
  const to = firstBelow(rows, view.bottom + MARGIN_PX)
  return (
    <div className="vl" ref={box} style={{ height }}>
      {rows.slice(from, to).map(render)}
    </div>
  )
}
