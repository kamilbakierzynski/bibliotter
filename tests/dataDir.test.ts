import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dataDir, moveLegacyDataDir } from '../src/main/config'

// os.homedir() czyta USERPROFILE na Windows i HOME gdzie indziej, więc test nie dotyka prawdziwego folderu.
const KEYS = ['USERPROFILE', 'HOME', 'BIBLIOTTER_HOME', 'HTMLDOCS_HOME'] as const
let saved: Record<string, string | undefined>
let home: string

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
  home = mkdtempSync(join(tmpdir(), 'bibliotter-home-'))
  process.env.USERPROFILE = home
  process.env.HOME = home
  delete process.env.BIBLIOTTER_HOME
  delete process.env.HTMLDOCS_HOME
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  rmSync(home, { recursive: true, force: true })
})

describe('folder danych po zmianie nazwy', () => {
  it('nowa instalacja dostaje folder Bibliotter', () => {
    expect(dataDir()).toBe(join(home, 'Bibliotter'))
    moveLegacyDataDir()
    expect(existsSync(join(home, 'Bibliotter'))).toBe(false)
  })

  it('do przeniesienia czyta stary folder, a potem przenosi go razem z treścią', () => {
    mkdirSync(join(home, 'HtmlDocs', 'library'), { recursive: true })
    writeFileSync(join(home, 'HtmlDocs', 'config.json'), '{"roots":[]}')
    expect(dataDir()).toBe(join(home, 'HtmlDocs'))

    moveLegacyDataDir()
    expect(dataDir()).toBe(join(home, 'Bibliotter'))
    expect(existsSync(join(home, 'HtmlDocs'))).toBe(false)
    expect(readFileSync(join(home, 'Bibliotter', 'config.json'), 'utf8')).toBe('{"roots":[]}')
    expect(existsSync(join(home, 'Bibliotter', 'library'))).toBe(true)
  })

  it('nie nadpisuje istniejącego folderu Bibliotter', () => {
    mkdirSync(join(home, 'HtmlDocs'))
    mkdirSync(join(home, 'Bibliotter'))
    writeFileSync(join(home, 'Bibliotter', 'config.json'), 'nowy')
    moveLegacyDataDir()
    expect(dataDir()).toBe(join(home, 'Bibliotter'))
    expect(existsSync(join(home, 'HtmlDocs'))).toBe(true)
    expect(readFileSync(join(home, 'Bibliotter', 'config.json'), 'utf8')).toBe('nowy')
  })

  it('folder wskazany zmienną wygrywa, także pod starą nazwą zmiennej', () => {
    mkdirSync(join(home, 'HtmlDocs'))
    process.env.HTMLDOCS_HOME = join(home, 'stara-zmienna')
    expect(dataDir()).toBe(join(home, 'stara-zmienna'))
    process.env.BIBLIOTTER_HOME = join(home, 'nowa-zmienna')
    expect(dataDir()).toBe(join(home, 'nowa-zmienna'))
    moveLegacyDataDir()
    expect(existsSync(join(home, 'HtmlDocs'))).toBe(true)
  })
})
