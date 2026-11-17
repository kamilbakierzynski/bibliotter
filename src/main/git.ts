import { execFile } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

export type GitRunner = (args: string[], cwd: string) => Promise<string>

const COMMAND_TIMEOUT_MS = 8000

export function commandRunner(command: string, timeoutMs = COMMAND_TIMEOUT_MS): GitRunner {
  return (args, cwd) =>
    new Promise((done, fail) => {
      execFile(
        command,
        args,
        { cwd, windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => (error ? fail(error) : done(stdout.trim()))
      )
    })
}

export interface ReflogEntry {
  timeMs: number
  commit: string
  /** Branch opuszczony w tym wpisie, jeśli wpis to przełączenie brancha. */
  checkoutFrom: string | null
}

export interface RepoInfo {
  worktreePath: string
  mainPath: string
  name: string
  defaultBranch: string | null
  currentBranch: string | null
  head: string | null
  remoteUrl: string | null
  reflog: ReflogEntry[]
}

export interface RepoPosition {
  branch: string | null
  commit: string | null
}

const REFLOG_LIMIT = 2000
/** Ogon pliku, który mieści tyle wpisów. Reflog aktywnego repozytorium potrafi mieć dziesiątki MB. */
const REFLOG_TAIL_BYTES = 512 * 1024
const REF_DEPTH_LIMIT = 5
const COMMIT_LIKE = /^[0-9a-f]{7,40}$/
const COMMIT_ID = /^[0-9a-f]{40,64}$/
const REFLOG_LINE = /^[0-9a-f]+ ([0-9a-f]+) .* (\d+) [+-]\d{4}(?:\t(.*))?$/

function cleanBranch(name: string | null): string | null {
  return !name || name === 'HEAD' || COMMIT_LIKE.test(name) ? null : name
}

function reflogEntry(seconds: string, commit: string, subject: string): ReflogEntry {
  const checkout = /^checkout: moving from (.+) to .+$/.exec(subject)
  return { timeMs: Number(seconds) * 1000, commit, checkoutFrom: checkout?.[1] ?? null }
}

export function parseReflog(output: string): ReflogEntry[] {
  const entries: ReflogEntry[] = []
  for (const line of output.split('\n')) {
    const [selector, commit, ...subject] = line.split('\t')
    const seconds = /\{(\d+)\}/.exec(selector ?? '')?.[1]
    if (seconds && commit) entries.push(reflogEntry(seconds, commit, subject.join('\t')))
  }
  return entries
}

/** Plik `logs/HEAD` trzyma wpisy od najstarszych, a reszta kodu oczekuje najnowszych na początku. */
export function parseReflogFile(content: string): ReflogEntry[] {
  const entries: ReflogEntry[] = []
  for (const line of content.split('\n').reverse()) {
    const [, commit, seconds, subject] = REFLOG_LINE.exec(line) ?? []
    if (commit && seconds) entries.push(reflogEntry(seconds, commit, subject ?? ''))
    if (entries.length === REFLOG_LIMIT) break
  }
  return entries
}

/**
 * Ustala branch i commit z chwili `timeMs`. Reflog jest posortowany od najnowszych,
 * więc cofamy przełączenia nowsze od tej chwili. Dzięki temu dokument nieśledzony
 * dostaje branch, na którym powstał, a nie ten, który jest teraz aktywny.
 */
export function positionAt(repo: RepoInfo, timeMs: number): RepoPosition {
  let branch = repo.currentBranch
  let commit = repo.head
  for (const entry of repo.reflog) {
    if (entry.timeMs <= timeMs) {
      commit = entry.commit
      break
    }
    if (entry.checkoutFrom !== null) branch = entry.checkoutFrom
    commit = null
  }
  return { branch: cleanBranch(branch), commit }
}

async function attempt(run: GitRunner, args: string[], cwd: string): Promise<string | null> {
  try {
    return (await run(args, cwd)) || null
  } catch {
    return null
  }
}

async function readDefaultBranch(run: GitRunner, cwd: string): Promise<string | null> {
  const remoteHead = await attempt(run, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)
  if (remoteHead) return remoteHead.replace(/^origin\//, '')
  for (const candidate of ['main', 'master']) {
    const found = await attempt(run, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`], cwd)
    if (found) return candidate
  }
  return null
}

/** Odczytuje repozytorium. Zwraca null, gdy katalog nie jest prawidłowym repozytorium. */
export async function readRepo(directory: string, run: GitRunner): Promise<RepoInfo | null> {
  const paths = await attempt(run, ['rev-parse', '--show-toplevel', '--git-common-dir'], directory)
  const [topLevel, commonDir] = paths?.split('\n').map((line) => line.trim()) ?? []
  if (!topLevel || !commonDir) return null

  const worktreePath = resolve(topLevel)
  const absoluteCommon = resolve(directory, commonDir)

  const [currentBranch, head, remoteUrl, defaultBranch, reflog] = await Promise.all([
    attempt(run, ['symbolic-ref', '--short', 'HEAD'], worktreePath),
    attempt(run, ['rev-parse', 'HEAD'], worktreePath),
    attempt(run, ['config', '--get', 'remote.origin.url'], worktreePath),
    readDefaultBranch(run, worktreePath),
    attempt(
      run,
      ['reflog', 'show', 'HEAD', '--date=unix', `-n${REFLOG_LIMIT}`, '--format=%gd%x09%H%x09%gs'],
      worktreePath
    )
  ])

  return {
    worktreePath,
    mainPath: mainPathOf(absoluteCommon),
    name: repoName(absoluteCommon),
    defaultBranch,
    currentBranch,
    head,
    remoteUrl,
    reflog: parseReflog(reflog ?? '')
  }
}

const mainPathOf = (commonDir: string): string =>
  basename(commonDir) === '.git' ? dirname(commonDir) : commonDir

const repoName = (commonDir: string): string => basename(mainPathOf(commonDir)).replace(/\.git$/, '')

const readText = (path: string): Promise<string | null> => readFile(path, 'utf8').catch(() => null)

async function readTail(path: string, limit: number): Promise<string> {
  const file = await open(path).catch(() => null)
  if (!file) return ''
  try {
    const { size } = await file.stat()
    const length = Math.min(size, limit)
    const { buffer } = await file.read({ buffer: Buffer.alloc(length), position: size - length })
    const text = buffer.toString('utf8')
    return length < size ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await file.close()
  }
}

/** Najbliższy `.git` od katalogu w górę. W worktree to plik wskazujący właściwy katalog gita. */
async function findGitDir(directory: string): Promise<{ worktreePath: string; gitDir: string } | null> {
  for (let current = resolve(directory); ; current = dirname(current)) {
    const dotGit = join(current, '.git')
    const info = await stat(dotGit).catch(() => null)
    if (info?.isDirectory()) return { worktreePath: current, gitDir: dotGit }
    if (info?.isFile()) {
      const pointer = /^gitdir:\s*(.+?)\s*$/m.exec((await readText(dotGit)) ?? '')?.[1]
      return pointer ? { worktreePath: current, gitDir: resolve(current, pointer) } : null
    }
    if (dirname(current) === current) return null
  }
}

function parsePackedRefs(content: string): Map<string, string> {
  const refs = new Map<string, string>()
  for (const line of content.split('\n')) {
    const [sha, ref] = line.split(' ')
    if (sha && ref && COMMIT_ID.test(sha)) refs.set(ref.trim(), sha)
  }
  return refs
}

function parseRemoteUrl(config: string): string | null {
  let url: string | null = null
  let inOrigin = false
  for (const line of config.split('\n')) {
    const section = /^\s*\[(.+)\]/.exec(line)?.[1]
    if (section) inOrigin = /^remote\s+"origin"$/i.test(section)
    const value = /^\s*url\s*=\s*(.*?)\s*$/i.exec(line)?.[1]
    // Git bierze ostatnią wartość, a tak samo działa `config --get`.
    if (inOrigin && value) url = value.replace(/^"(.*)"$/, '$1')
  }
  return url
}

/**
 * Odczytuje repozytorium z jego plików, co jest o dwa rzędy wielkości szybsze niż kilka
 * uruchomień gita. Zwraca null przy układzie, którego nie znamy (np. reftable),
 * i wtedy decyduje `readRepo`.
 */
export async function readRepoFromFiles(directory: string): Promise<RepoInfo | null> {
  const found = await findGitDir(directory)
  if (!found) return null
  const { worktreePath, gitDir } = found

  const headFile = (await readText(join(gitDir, 'HEAD')))?.trim()
  if (!headFile) return null
  const headRef = /^ref:\s*(\S+)$/.exec(headFile)?.[1] ?? null
  if (headRef?.endsWith('.invalid') || (!headRef && !COMMIT_ID.test(headFile))) return null

  const common = (await readText(join(gitDir, 'commondir')))?.trim()
  const commonDir = common ? resolve(gitDir, common) : gitDir

  let packed: Promise<Map<string, string>> | null = null
  const packedRefs = (): Promise<Map<string, string>> => {
    packed ??= readText(join(commonDir, 'packed-refs')).then((content) => parsePackedRefs(content ?? ''))
    return packed
  }
  const resolveRef = async (ref: string, depth = 0): Promise<string | null> => {
    const value = (await readText(join(commonDir, ref)))?.trim()
    if (!value) return (await packedRefs()).get(ref) ?? null
    const target = /^ref:\s*(\S+)$/.exec(value)?.[1]
    if (!target) return value
    return depth < REF_DEPTH_LIMIT ? resolveRef(target, depth + 1) : null
  }
  const readDefault = async (): Promise<string | null> => {
    const remoteHead = await readText(join(commonDir, 'refs', 'remotes', 'origin', 'HEAD'))
    const target = /^ref:\s*refs\/remotes\/origin\/(\S+)/.exec(remoteHead ?? '')?.[1]
    if (target) return target
    for (const candidate of ['main', 'master']) {
      if (await resolveRef(`refs/heads/${candidate}`)) return candidate
    }
    return null
  }

  const [head, defaultBranch, config, reflog] = await Promise.all([
    headRef ? resolveRef(headRef) : headFile,
    readDefault(),
    readText(join(commonDir, 'config')),
    readTail(join(gitDir, 'logs', 'HEAD'), REFLOG_TAIL_BYTES)
  ])

  return {
    worktreePath,
    mainPath: mainPathOf(commonDir),
    name: repoName(commonDir),
    defaultBranch,
    currentBranch: headRef?.replace(/^refs\/heads\//, '') ?? null,
    head,
    remoteUrl: parseRemoteUrl(config ?? ''),
    reflog: parseReflogFile(reflog)
  }
}
