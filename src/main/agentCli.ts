import { parseArgs } from 'node:util'
import type { AgentApi, AgentComment, AgentDocument } from './agentApi'

export const USAGE = `htmldocs: dokumenty HTML i Markdown oraz uwagi użytkownika

  htmldocs list [--status <status>] [--project <nazwa>] [--branch <nazwa>]
  htmldocs current                     dokument otwarty teraz w apce
  htmldocs read <id|ścieżka|current> [--html]
  htmldocs comments [id|ścieżka|current] [--all] [--personal]
  htmldocs reply <id-uwagi> "tekst"
  htmldocs resolve <id-uwagi> ["tekst"]
  htmldocs search "zapytanie"

Każda komenda przyjmuje --json.
Uwagi oznaczone „Dla mnie” są pomijane, chyba że użyjesz --personal.`

function formatDocument(doc: AgentDocument): string {
  const place = [doc.project, doc.branch].filter(Boolean).join(' / ')
  const notes = doc.openComments > 0 ? `  otwarte uwagi: ${doc.openComments}` : ''
  return `${doc.id}  [${doc.status}]  ${doc.title ?? doc.path}  (${place || 'bez projektu'})${notes}`
}

function formatComment(comment: AgentComment): string {
  const place = [comment.docTitle ?? comment.docId, comment.heading].filter(Boolean).join(' › ')
  const flags = [
    comment.kind === 'sticky' && 'karteczka',
    comment.audience === 'me' && 'prywatna',
    comment.status === 'resolved' && 'zamknięta',
    comment.outdated && 'do starszej wersji'
  ].filter(Boolean)
  const lines = [`${comment.id}  ${place}${flags.length > 0 ? `  (${flags.join(', ')})` : ''}`]
  if (comment.quote) lines.push(`  > ${comment.quote}`)
  for (const message of comment.messages) {
    lines.push(`  ${message.author === 'agent' ? 'Agent' : 'Użytkownik'}: ${message.text}`)
  }
  return lines.join('\n')
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Brakuje argumentu: ${name}\n\n${USAGE}`)
  return value
}

/** Wykonuje komendę i zwraca tekst do wypisania. Błędy zgłasza wyjątkiem. */
export async function runCli(argv: string[], api: AgentApi): Promise<string> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      html: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      personal: { type: 'boolean', default: false },
      status: { type: 'string' },
      project: { type: 'string' },
      branch: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
  const [command, first, second] = positionals
  const asJson = (value: unknown): string => JSON.stringify(value, null, 2)

  if (values.help || !command || command === 'help') return USAGE

  switch (command) {
    case 'list': {
      const { status, project, branch } = values
      const docs = await api.documents({ status, project, branch })
      if (values.json) return asJson(docs)
      return docs.map(formatDocument).join('\n') || 'Brak dokumentów.'
    }
    case 'current': {
      const current = await api.current()
      if (values.json) return asJson(current)
      if (!current) return 'W apce nie jest otwarty żaden dokument.'
      return [current.title ?? current.path, current.docId, current.path].join('\n')
    }
    case 'read': {
      const format = values.html ? 'html' : 'text'
      const doc = await api.readDocument(required(first, 'dokument'), format)
      return values.json ? asJson(doc) : doc.content
    }
    case 'comments': {
      const comments = await api.comments({
        doc: first,
        status: values.all ? 'all' : 'open',
        includePersonal: values.personal
      })
      if (values.json) return asJson(comments)
      return comments.map(formatComment).join('\n\n') || 'Brak uwag.'
    }
    case 'reply': {
      await api.reply(required(first, 'id uwagi'), required(second, 'tekst'))
      return 'Odpowiedź zapisana.'
    }
    case 'resolve': {
      await api.resolveComment(required(first, 'id uwagi'), second)
      return 'Uwaga zamknięta.'
    }
    case 'search': {
      const hits = await api.search(required(first, 'zapytanie'))
      if (values.json) return asJson(hits)
      return hits.map((hit) => `${hit.id}  ${hit.title ?? hit.path}\n  ${hit.snippet}`).join('\n') || 'Brak wyników.'
    }
    default:
      throw new Error(`Nieznana komenda: ${command}\n\n${USAGE}`)
  }
}
