import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { type IPty, spawn } from 'node-pty'
import type { TerminalOutput, TerminalSession } from '../shared/terminal'

/*
 * Terminal obok dokumentu. Proces powłoki żyje w procesie głównym, a powłoka okna tylko go rysuje.
 * Sesja przeżywa przeładowanie strony, dlatego trzyma ogon wyjścia: nowa strona dostaje go przy
 * podłączeniu i widzi to samo, co przed chwilą.
 */

/** Tyle ostatniego wyjścia wraca po przeładowaniu strony. */
const BACKLOG_LIMIT = 256 * 1024
/** Wyjście zbiera się przez chwilę, bo pojedyncze znaki osobno zalałyby IPC. */
const FLUSH_MS = 6

interface Session {
  pty: IPty
  cwd: string
  backlog: string
  pending: string
  timer: NodeJS.Timeout | null
}

/** Zmienne dev serwera i Electrona nie powinny wyciec do powłoki użytkownika. */
const DROPPED_ENV = ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ELECTRON_NO_ATTACH_CONSOLE']

function onPath(command: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some((folder) => folder && existsSync(join(folder, command)))
}

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: onPath('pwsh.exe') ? 'pwsh.exe' : 'powershell.exe', args: ['-NoLogo'] }
  }
  return { file: process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'), args: ['-l'] }
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Terminal staje w katalogu repozytorium dokumentu, a bez repozytorium w folderze dokumentu. */
export function terminalDir(docPath: string | null): string {
  if (!docPath) return homedir()
  const start = dirname(docPath)
  if (!isDirectory(start)) return homedir()
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return start
  }
}

const clampSize = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1000, Math.max(2, Math.round(value))) : fallback

export class Terminals {
  private sessions = new Map<number, Session>()
  private next = 1

  constructor(
    private readonly send: (channel: 'terminal:data' | 'terminal:exit', payload: TerminalOutput | number) => void
  ) {}

  start(cwd: string, cols: unknown, rows: unknown): TerminalSession {
    const { file, args } = shellCommand()
    const env: Record<string, string | undefined> = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Bibliotter' }
    for (const name of DROPPED_ENV) delete env[name]
    const pty = spawn(file, args, {
      name: 'xterm-256color',
      cols: clampSize(cols, 80),
      rows: clampSize(rows, 24),
      cwd,
      env: env as Record<string, string>,
      useConpty: true
    })
    const id = this.next++
    const session: Session = { pty, cwd, backlog: '', pending: '', timer: null }
    this.sessions.set(id, session)
    pty.onData((data) => {
      session.pending += data
      session.timer ??= setTimeout(() => this.flush(id), FLUSH_MS)
    })
    pty.onExit(() => {
      this.flush(id)
      this.sessions.delete(id)
      this.send('terminal:exit', id)
    })
    return { id, cwd, backlog: '' }
  }

  /** Strona po przeładowaniu podłącza się do sesji, która dalej działa. */
  attach(id: unknown): TerminalSession | null {
    const session = typeof id === 'number' ? this.sessions.get(id) : undefined
    if (!session) return null
    this.flush(id as number)
    return { id: id as number, cwd: session.cwd, backlog: session.backlog }
  }

  write(id: unknown, data: unknown): void {
    if (typeof id !== 'number' || typeof data !== 'string') return
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: unknown, cols: unknown, rows: unknown): void {
    const session = typeof id === 'number' ? this.sessions.get(id) : undefined
    if (!session) return
    try {
      session.pty.resize(clampSize(cols, session.pty.cols), clampSize(rows, session.pty.rows))
    } catch {
      // Proces mógł właśnie się zakończyć, a wtedy zmiana rozmiaru nie ma czego zmieniać.
    }
  }

  kill(id: unknown): void {
    const session = typeof id === 'number' ? this.sessions.get(id) : undefined
    if (!session) return
    this.sessions.delete(id as number)
    if (session.timer) clearTimeout(session.timer)
    session.pty.kill()
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }

  private flush(id: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.timer) clearTimeout(session.timer)
    session.timer = null
    if (!session.pending) return
    const data = session.pending
    session.pending = ''
    session.backlog = (session.backlog + data).slice(-BACKLOG_LIMIT)
    this.send('terminal:data', { id, data })
  }
}
