import { execFile } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'

export type GitRunner = (args: string[], cwd: string) => Promise<string>

const COMMAND_TIMEOUT_MS = 8000

export function commandRunner(command: string): GitRunner {
  return (args, cwd) =>
    new Promise((done, fail) => {
      execFile(
        command,
        args,
        { cwd, windowsHide: true, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
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

const REFLOG_LIMIT = '2000'
const COMMIT_LIKE = /^[0-9a-f]{7,40}$/

function cleanBranch(name: string | null): string | null {
  return !name || name === 'HEAD' || COMMIT_LIKE.test(name) ? null : name
}

export function parseReflog(output: string): ReflogEntry[] {
  const entries: ReflogEntry[] = []
  for (const line of output.split('\n')) {
    const [selector, commit, ...subject] = line.split('\t')
    const seconds = /\{(\d+)\}/.exec(selector ?? '')?.[1]
    if (!seconds || !commit) continue
    const checkout = /^checkout: moving from (.+) to .+$/.exec(subject.join('\t'))
    entries.push({
      timeMs: Number(seconds) * 1000,
      commit,
      checkoutFrom: checkout ? (checkout[1] ?? null) : null
    })
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
  const absoluteCommon = resolve(worktreePath, commonDir)
  const mainPath = basename(absoluteCommon) === '.git' ? dirname(absoluteCommon) : absoluteCommon

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
    mainPath,
    name: basename(mainPath).replace(/\.git$/, ''),
    defaultBranch,
    currentBranch,
    head,
    remoteUrl,
    reflog: parseReflog(reflog ?? '')
  }
}
