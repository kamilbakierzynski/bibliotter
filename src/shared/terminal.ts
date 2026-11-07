/** Sesja terminala z procesu głównego. `backlog` to ogon wyjścia dla strony, która podłącza się ponownie. */
export interface TerminalSession {
  id: number
  cwd: string
  backlog: string
}

export interface TerminalOutput {
  id: number
  data: string
}

export interface TerminalApi {
  /** Uruchamia powłokę w katalogu dokumentu, a bez dokumentu w katalogu domowym. */
  startTerminal(docId: string | null, cols: number, rows: number): Promise<TerminalSession>
  attachTerminal(id: number): Promise<TerminalSession | null>
  writeTerminal(id: number, data: string): void
  resizeTerminal(id: number, cols: number, rows: number): void
  killTerminal(id: number): void
  onTerminalData(listener: (output: TerminalOutput) => void): () => void
  onTerminalExit(listener: (id: number) => void): () => void
}
