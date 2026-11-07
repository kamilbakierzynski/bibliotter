import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  commandRunner,
  parseReflog,
  parseReflogFile,
  positionAt,
  readRepo,
  readRepoFromFiles,
  type RepoInfo
} from '../src/main/git'

const git = commandRunner('git')

function repoWith(reflog: RepoInfo['reflog'], currentBranch: string | null = 'nowy'): RepoInfo {
  return {
    worktreePath: '/r',
    mainPath: '/r',
    name: 'r',
    defaultBranch: 'main',
    currentBranch,
    head: 'c3',
    remoteUrl: null,
    reflog
  }
}

describe('parseReflog', () => {
  it('rozpoznaje przełączenia i pomija inne wpisy', () => {
    const entries = parseReflog(
      [
        'HEAD@{2000}\tc2\tcheckout: moving from feature/a to main',
        'HEAD@{1000}\tc1\tcommit: zmiana',
        'śmieci'
      ].join('\n')
    )

    expect(entries).toEqual([
      { timeMs: 2_000_000, commit: 'c2', checkoutFrom: 'feature/a' },
      { timeMs: 1_000_000, commit: 'c1', checkoutFrom: null }
    ])
  })
})

describe('parseReflogFile', () => {
  it('oddaje wpisy od najnowszych i rozpoznaje przełączenia', () => {
    const before = '0'.repeat(40)
    const after = 'a'.repeat(40)
    const entries = parseReflogFile(
      [
        `${before} ${after} Ktoś Ważny <k@example.com> 1000 +0100\tcommit: zmiana`,
        `${after} ${after} Ktoś Ważny <k@example.com> 2000 -0500\tcheckout: moving from feature/a to main`,
        'śmieci',
        ''
      ].join('\n')
    )

    expect(entries).toEqual([
      { timeMs: 2_000_000, commit: after, checkoutFrom: 'feature/a' },
      { timeMs: 1_000_000, commit: after, checkoutFrom: null }
    ])
  })
})

describe('positionAt', () => {
  const reflog = [
    { timeMs: 3000, commit: 'c3', checkoutFrom: 'stary' },
    { timeMs: 2000, commit: 'c2', checkoutFrom: null },
    { timeMs: 1000, commit: 'c1', checkoutFrom: 'main' }
  ]

  it('dla świeżego pliku zwraca bieżący branch i commit', () => {
    expect(positionAt(repoWith(reflog), 4000)).toEqual({ branch: 'nowy', commit: 'c3' })
  })

  it('dla starszego pliku cofa się do brancha z tamtej chwili', () => {
    expect(positionAt(repoWith(reflog), 2500)).toEqual({ branch: 'stary', commit: 'c2' })
  })

  it('dla pliku starszego niż reflog zwraca najstarszy znany branch', () => {
    expect(positionAt(repoWith(reflog), 500).branch).toBe('main')
  })

  it('nie zwraca odłączonego HEAD jako brancha', () => {
    const detached = [{ timeMs: 3000, commit: 'c3', checkoutFrom: 'a1b2c3d4e5f6' }]
    expect(positionAt(repoWith(detached), 1000).branch).toBeNull()
    expect(positionAt(repoWith([], null), 1000).branch).toBeNull()
  })
})

describe('readRepo', () => {
  let root: string
  const main = (): string => join(root, 'repo')

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'git-'))
    await mkdir(main())
    await git(['init', '-b', 'main'], main())
    await git(['config', 'user.email', 'test@example.com'], main())
    await git(['config', 'user.name', 'Test'], main())
    await writeFile(join(main(), 'a.txt'), 'a')
    await git(['add', '.'], main())
    await git(['commit', '-m', 'start'], main())
    await git(['worktree', 'add', '-b', 'feature/x', join(root, 'wt')], main())
  }, 30000)

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('odczytuje repozytorium główne', async () => {
    const repo = await readRepo(main(), git)

    expect(repo).toMatchObject({ name: 'repo', currentBranch: 'main', defaultBranch: 'main' })
    expect(repo?.head).toMatch(/^[0-9a-f]{40}$/)
    expect(repo?.reflog.length).toBeGreaterThan(0)
  })

  it('łączy worktree z głównym repozytorium', async () => {
    const repo = await readRepo(join(root, 'wt'), git)

    expect(repo?.currentBranch).toBe('feature/x')
    expect(repo?.name).toBe('repo')
    expect(repo?.mainPath.toLowerCase()).toBe(main().toLowerCase())
  })

  it('zwraca null dla katalogu spoza repozytorium', async () => {
    expect(await readRepo(tmpdir(), git)).toBeNull()
  })

  describe('z plików daje to samo co git', () => {
    const same = async (directory: string): Promise<void> => {
      const expected = await readRepo(directory, git)
      const actual = await readRepoFromFiles(directory)
      const shape = (repo: RepoInfo | null): unknown => ({
        ...repo,
        worktreePath: repo?.worktreePath.toLowerCase(),
        mainPath: repo?.mainPath.toLowerCase()
      })
      expect(shape(actual)).toEqual(shape(expected))
    }

    it('w repozytorium głównym', () => same(main()))

    it('w worktree', () => same(join(root, 'wt')))

    it('w podkatalogu', async () => {
      await mkdir(join(main(), 'a', 'b'), { recursive: true })
      await same(join(main(), 'a', 'b'))
    })

    it('z przełączeniami w reflogu i zdalnym repozytorium', async () => {
      await git(['remote', 'add', 'origin', 'git@github.com:ktos/repo.git'], main())
      await git(['checkout', '-b', 'inna'], main())
      await git(['commit', '--allow-empty', '-m', 'druga'], main())
      await git(['checkout', 'main'], main())
      await same(main())
    })

    it('z odłączonym HEAD', async () => {
      const head = await git(['rev-parse', 'HEAD'], main())
      await git(['checkout', '--detach', head], main())
      await same(main())
      await git(['checkout', 'main'], main())
    })

    it('po spakowaniu referencji i z domyślnym branchem zdalnym', async () => {
      await git(['update-ref', 'refs/remotes/origin/trunk', 'HEAD'], main())
      await git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], main())
      await git(['pack-refs', '--all'], main())
      await same(main())
      expect((await readRepoFromFiles(main()))?.defaultBranch).toBe('trunk')
    })

    it('dla świeżego repozytorium bez commitów', async () => {
      const empty = join(root, 'pusty')
      await mkdir(empty)
      await git(['init', '-b', 'main'], empty)
      await same(empty)
    })
  })

  it('poza repozytorium zwraca null', async () => {
    expect(await readRepoFromFiles(root)).toBeNull()
  })

  it('nieznanego układu nie zgaduje', async () => {
    const reftable = join(root, 'reftable')
    await mkdir(join(reftable, '.git'), { recursive: true })
    await writeFile(join(reftable, '.git', 'HEAD'), 'ref: refs/heads/.invalid\n')

    expect(await readRepoFromFiles(reftable)).toBeNull()
  })
})
