import { useMemo } from 'react'
import { OTTERS, type OtterPose } from '../assets/otters'

let copies = 0

/**
 * Wydra nad napisem pustego stanu. Napis zostaje bez zmian i mówi wprost, co się dzieje,
 * a rysunek tylko mu towarzyszy, więc czytnik ekranu go pomija.
 */
export function Otter({ pose, className = '' }: { pose: OtterPose; className?: string }): React.JSX.Element {
  const html = useMemo(() => OTTERS[pose].replaceAll('__P__', `otter${++copies}`), [pose])
  return <span className={`otter otter-${pose} ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
}
