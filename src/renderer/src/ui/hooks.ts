import { type DependencyList, useLayoutEffect } from 'react'
import { ui } from '../shell/state'

/** Porządkuje ruch po narysowaniu. Przed startem powłoki nie ma jeszcze czego mierzyć. */
export function useSynced(sync: () => void, deps?: DependencyList): void {
  useLayoutEffect(() => {
    if (ui.ready) sync()
  }, deps)
}
