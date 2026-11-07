import { parseArgs } from 'node:util'
import type { AgentApi, AgentComment, AgentDocument } from './agentApi'
import { canDrawOtter, otterText } from './otter'

export const USAGE = `bibliotter: HTML and Markdown documents and the user's comments on them

  bibliotter list [--status <status>] [--project <name>] [--branch <name>] [--label <name>]
  bibliotter labels                      labels with document counts
  bibliotter label <id|path|current> <label>...
  bibliotter unlabel <id|path|current> <label>...
  bibliotter current                     document open in the app right now
  bibliotter read <id|path|current> [--html]
  bibliotter comments [id|path|current] [--all] [--personal]
  bibliotter reply <comment-id> "text"
  bibliotter resolve <comment-id> ["text"]
  bibliotter search "query"

Every command accepts --json.
Private comments are skipped unless you pass --personal.`

function formatDocument(doc: AgentDocument): string {
  const place = [doc.project, doc.branch].filter(Boolean).join(' / ')
  const notes = doc.openComments > 0 ? `  open comments: ${doc.openComments}` : ''
  const labels = doc.labels.length > 0 ? `  labels: ${doc.labels.join(', ')}` : ''
  return `${doc.id}  [${doc.status}]  ${doc.title ?? doc.path}  (${place || 'no project'})${notes}${labels}`
}

function formatComment(comment: AgentComment): string {
  const place = [comment.docTitle ?? comment.docId, comment.heading].filter(Boolean).join(' › ')
  const flags = [
    comment.kind === 'sticky' && 'sticky note',
    comment.kind === 'highlight' && 'highlight',
    comment.kind === 'shape' && 'shape',
    comment.audience === 'me' && 'private',
    comment.status === 'resolved' && 'resolved',
    comment.outdated && 'older version'
  ].filter(Boolean)
  const lines = [`${comment.id}  ${place}${flags.length > 0 ? `  (${flags.join(', ')})` : ''}`]
  if (comment.quote) lines.push(`  > ${comment.quote}`)
  for (const message of comment.messages) {
    lines.push(`  ${message.author === 'agent' ? 'Agent' : 'User'}: ${message.text}`)
  }
  return lines.join('\n')
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing argument: ${name}\n\n${USAGE}`)
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
      label: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
  const [command, first, second, ...more] = positionals
  const asJson = (value: unknown): string => JSON.stringify(value, null, 2)
  const labelArgs = (): string[] => [required(second, 'label'), ...more]
  const showLabels = (labels: string[]): string =>
    values.json ? asJson(labels) : labels.join(', ') || 'The document has no labels.'

  if (values.help || !command || command === 'help') return USAGE

  switch (command) {
    case 'list': {
      const { status, project, branch, label } = values
      const docs = await api.documents({ status, project, branch, label })
      if (values.json) return asJson(docs)
      return docs.map(formatDocument).join('\n') || 'No documents.'
    }
    case 'labels': {
      const labels = await api.labels()
      if (values.json) return asJson(labels)
      return labels.map(({ name, count }) => `${name}  (${count})`).join('\n') || 'No labels.'
    }
    case 'label':
      return showLabels(await api.changeLabels(required(first, 'document'), { add: labelArgs() }))
    case 'unlabel':
      return showLabels(await api.changeLabels(required(first, 'document'), { remove: labelArgs() }))
    case 'current': {
      const current = await api.current()
      if (values.json) return asJson(current)
      if (!current) return 'No document is open in the app.'
      return [current.title ?? current.path, current.docId, current.path].join('\n')
    }
    case 'read': {
      const format = values.html ? 'html' : 'text'
      const doc = await api.readDocument(required(first, 'document'), format)
      return values.json ? asJson(doc) : doc.content
    }
    case 'comments': {
      const comments = await api.comments({
        doc: first,
        status: values.all ? 'all' : 'open',
        includePersonal: values.personal
      })
      if (values.json) return asJson(comments)
      return comments.map(formatComment).join('\n\n') || 'No comments.'
    }
    case 'reply': {
      await api.reply(required(first, 'comment id'), required(second, 'text'))
      return 'Reply saved.'
    }
    case 'resolve': {
      await api.resolveComment(required(first, 'comment id'), second)
      return 'Comment resolved.'
    }
    case 'search': {
      const hits = await api.search(required(first, 'query'))
      if (values.json) return asJson(hits)
      return hits.map((hit) => `${hit.id}  ${hit.title ?? hit.path}\n  ${hit.snippet}`).join('\n') || 'No results.'
    }
    // Ukryte: celowo nie ma go w USAGE, żeby agenci czytający pomoc nie płacili za żart.
    case 'otter':
      return otterText({ draw: canDrawOtter(process.stdout, process.env), random: Math.random })
    default:
      throw new Error(`Unknown command: ${command}\n\n${USAGE}`)
  }
}
