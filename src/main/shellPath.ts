import { execFile } from 'node:child_process'

const MARK = '__BIBLIOTTER_PATH__'

/**
 * Apka otwarta z Findera albo Docka dostaje od macOS tylko `/usr/bin:/bin:/usr/sbin:/sbin`, więc nie
 * znalazłaby `claude` ani `git` z Homebrew. Pyta więc powłokę logowania o jej PATH, tak jak widzi go
 * terminal. Robi to w tle, bo procesy potomne startują dopiero na żądanie, a znaczniki odcinają to,
 * co pliki startowe powłoki wypiszą po drodze.
 */
export function adoptLoginShellPath(): void {
  if (process.platform !== 'darwin') return
  const shell = process.env.SHELL || '/bin/zsh'
  execFile(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000 }, (error, stdout) => {
    if (error) return
    const path = stdout.split(MARK)[1]
    if (path) process.env.PATH = path
  })
}
