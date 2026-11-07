import type { DocClass, DocStatus, ScanProgress, SearchHit } from '../shared/types'
import type { LabelChoice } from './autoLabel'
import type { LibraryConfig } from './library'

export interface LibraryInit {
  dataDir: string
  config: LibraryConfig
}

/** To, o co główny wątek może poprosić wątek biblioteki. */
export interface LibraryCommands {
  configure(config: LibraryConfig, refreshGit: boolean): void
  settings(config: LibraryConfig): Promise<void>
  scan(refreshGit: boolean): void
  setStatus(docId: string, status: DocStatus): Promise<void>
  setStatuses(docIds: string[], status: DocStatus): Promise<void>
  renameDoc(docId: string, name: string): Promise<void>
  markOpened(docId: string): Promise<void>
  setClassification(docId: string, classification: Exclude<DocClass, 'review'>): Promise<void>
  setLabels(docId: string, labels: unknown): Promise<void>
  addLabels(docId: string, names: string[]): Promise<string[]>
  documentText(docId: string): Promise<string>
  labelChoices(): Promise<LabelChoice[]>
  renameLabel(from: string, to: unknown): Promise<void>
  deleteLabel(name: string): Promise<void>
  reloadLabels(): Promise<void>
  search(query: string): Promise<SearchHit[]>
  renderMarkdown(docPath: string): Promise<string>
  shutdown(): Promise<void>
}

export interface LibraryCall {
  id: number
  command: keyof LibraryCommands
  args: unknown[]
}

export type LibraryMessage =
  | { type: 'changed'; json: string }
  | { type: 'new-docs'; docIds: string[] }
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'reply'; id: number; result?: unknown; error?: string }
