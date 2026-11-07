const SHORT_ID = 10
export const REFERENCE_PREFIX = 'bibliotter:'
/** Odnośniki skopiowane, zanim apka zmieniła nazwę, leżą w starych rozmowach i nadal mają działać. */
export const LEGACY_REFERENCE_PREFIX = 'htmldocs:'

/** Odnośnik do wklejenia w rozmowie z agentem. Jego zapis opisują instrukcje serwera MCP. */
export function documentReference(doc: { id: string; title: string | null }): string {
  const title = (doc.title ?? '').replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
  return `[${title || 'dokument'}](${REFERENCE_PREFIX}${doc.id.slice(0, SHORT_ID)})`
}

/** Sam identyfikator albo jego początek, bez przedrostka odnośnika. */
export function referenceId(reference: string): string {
  const prefix = [REFERENCE_PREFIX, LEGACY_REFERENCE_PREFIX].find((item) => reference.startsWith(item))
  return prefix ? reference.slice(prefix.length) : reference
}
