import { useEffect, useState } from 'react'
import { type DocPair, openModeOf } from '../../../shared/links'
import type { DocEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { openPair, pairOf } from '../shell/pair'
import { data } from '../shell/state'
import { displayName } from '../tree'
import { Icon } from './icons'

function usePair(docId: string): DocPair | null {
  const [state, setState] = useState<{ docId: string; pair: DocPair | null } | null>(null)
  const { library } = data

  useEffect(() => {
    let live = true
    void pairOf(docId).then((pair) => {
      if (live) setState({ docId, pair })
    })
    return () => {
      live = false
    }
  }, [docId, library])

  return state?.docId === docId ? state.pair : null
}

/** Przełącznik w nagłówku arkusza: z objaśnienia do planu w Markdownie i z powrotem. */
export function PairLink({ doc }: { doc: DocEntry }): React.JSX.Element | null {
  const pair = usePair(doc.id)
  const partner = pair ? data.entries.get(pair.docId) : undefined
  if (!pair || !partner) return null
  const label = pair.role === 'plan' ? t('Plan') : t('Objaśnienie planu')
  return (
    <button
      className="pl-link pl-pair"
      data-pair={pair.role}
      title={displayName(partner)}
      onClick={(event) => void openPair(doc.id, openModeOf(event))}
    >
      <Icon name="file" />
      <span>{label}</span>
    </button>
  )
}
