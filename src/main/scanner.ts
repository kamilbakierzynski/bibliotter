import { createHash } from 'node:crypto'
import { type Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'obj',
  'bin',
  'Library',
  'Temp',
  'Logs',
  'Packages',
  'venv',
  '__pycache__',
  'site-packages',
  'playwright-report',
  'storybook-static'
])

const HTML_FILE = /\.html?$/i
const CONCURRENCY = 16

export const isHtmlFile = (name: string): boolean => HTML_FILE.test(name)

export const isIgnoredDirectory = (name: string): boolean =>
  name.startsWith('.') || IGNORED_DIRECTORIES.has(name)

export function normalizePath(path: string): string {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

export function stableId(prefix: string, path: string): string {
  // Pierwsza litera sprawia, że identyfikator nigdy nie zostanie odczytany jako adres IPv4.
  return `${prefix}${createHash('sha256').update(normalizePath(path)).digest('hex').slice(0, 31)}`
}

export const docIdFor = (path: string): string => stableId('d', path)

export function isInside(path: string, folder: string): boolean {
  const target = normalizePath(path)
  const base = normalizePath(folder)
  return target === base || target.startsWith(base.endsWith('\\') || base.endsWith('/') ? base : `${base}${process.platform === 'win32' ? '\\' : '/'}`)
}

export interface FoundFile {
  path: string
  name: string
  /** Wybrany folder, w którym znaleziono plik. */
  root: string
  /** Najbliższy katalog z `.git`, jeśli plik leży w repozytorium. */
  repoDir: string | null
  mtimeMs: number
  size: number
  /** Liczba plików HTML w tym samym folderze. */
  siblings: number
}

export interface WalkResult {
  files: FoundFile[]
  unavailableRoots: string[]
}

interface PendingDirectory {
  path: string
  root: string
  repoDir: string | null
}

/** Znajduje pliki HTML w wybranych folderach. Nie czyta ich zawartości. */
export async function walkRoots(roots: string[]): Promise<WalkResult> {
  const files: FoundFile[] = []
  const unavailableRoots: string[] = []
  const seenDirectories = new Set<string>()
  const queue: PendingDirectory[] = []
  let active = 0

  // Foldery mogą się nakładać, więc każdy katalog odwiedzamy tylko raz.
  const enqueue = (directory: PendingDirectory): void => {
    const key = normalizePath(directory.path)
    if (seenDirectories.has(key)) return
    seenDirectories.add(key)
    queue.push(directory)
  }

  const visit = async ({ path, root, repoDir }: PendingDirectory): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(path, { withFileTypes: true })
    } catch {
      return // Brak uprawnień do podkatalogu nie powinien przerywać skanu.
    }

    const owner = entries.some((entry) => entry.name === '.git') ? path : repoDir
    const htmlEntries = entries.filter((entry) => entry.isFile() && isHtmlFile(entry.name))

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !isIgnoredDirectory(entry.name)) {
        enqueue({ path: join(path, entry.name), root, repoDir: owner })
      }
    }

    const found = await Promise.all(
      htmlEntries.map(async (entry): Promise<FoundFile | null> => {
        const filePath = join(path, entry.name)
        try {
          const info = await stat(filePath)
          return {
            path: filePath,
            name: entry.name,
            root,
            repoDir: owner,
            mtimeMs: info.mtimeMs,
            size: info.size,
            siblings: htmlEntries.length
          }
        } catch {
          return null // Plik mógł zniknąć w trakcie skanu.
        }
      })
    )
    for (const file of found) {
      if (file) files.push(file)
    }
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift()
      if (next) {
        active += 1
        await visit(next)
        active -= 1
      } else if (active === 0) {
        return
      } else {
        await new Promise((done) => setImmediate(done))
      }
    }
  }

  for (const root of roots) {
    try {
      await readdir(root)
      enqueue({ path: root, root, repoDir: null })
    } catch {
      unavailableRoots.push(root)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { files, unavailableRoots }
}

export const folderName = (path: string): string => basename(path) || path
