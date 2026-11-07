import type { DocPair } from '../../../shared/links'
import { followLink } from './sheets'
import { data } from './state'

/** Odpowiedź z jednej migawki biblioteki. Po skanie pytamy od nowa, bo plan mógł dostać objaśnienie. */
const known = new Map<string, { library: unknown; pair: Promise<DocPair | null> }>()

/** Plan w Markdownie albo jego objaśnienie, z którym dokument tworzy parę. */
export function pairOf(docId: string): Promise<DocPair | null> {
  const cached = known.get(docId)
  if (cached?.library === data.library) return cached.pair
  const pair = window.api.docPair(docId).catch(() => null)
  known.set(docId, { library: data.library, pair })
  return pair
}

/** Przeskok jak link: na miejscu arkusza, a z Ctrl zerknięcie obok. */
export async function openPair(docId: string, peek = false): Promise<boolean> {
  const pair = await pairOf(docId)
  if (!pair || !data.entries.has(pair.docId)) return false
  followLink(docId, pair.docId, peek)
  return true
}
