import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { mapLimit } from './concurrency'

/**
 * Ścieżki w kodzie Markdownu. Agenci piszą `src/app.ts:42` albo `tools/podgląd.ps1` w zwykłym
 * kodzie zamiast linku, a czytelnik chce otworzyć ten plik obok. Link dostaje tylko ścieżka,
 * która naprawdę istnieje, więc `window.location` czy `npm test` zostają zwykłym kodem.
 */

/** Dokument z tysiącem kawałków kodu nie powinien czekać na tyle samo zapytań do dysku. */
const MAX_CANDIDATES = 400
const STAT_CONCURRENCY = 16
/** Tyle pięter w górę szukamy korzenia repozytorium. Dalej dokument raczej nie sięga. */
const MAX_DEPTH = 12

const CODE_SPAN = /(?<!`)`([^`\n]{2,300})`(?!`)/g
/** Znaki, których nie ma w ścieżce pisanej przez agenta, a są w wywołaniach, wzorach i poleceniach. */
const NOT_PATH = /[\s<>"'|*?$={}();,`]|^-|^~|^[a-z][a-z\d+.-]+:\/\/|^[\\/]{2}/i
/** Ścieżka ma ukośnik albo rozszerzenie od litery, jak `package.json`, ale nie `1.5x`. */
const PATH_SHAPE = /[\\/]|[^\\/.]\.[a-z][a-z\d]{0,9}$/i
const LINE_SUFFIX = /:\d+(?:[:-]\d+)?$/

/** Kod w postaci, którą zna renderer: bez skrajnych spacji. */
export const codeKey = (text: string): string => text.trim()

/** Część kodu, która powinna być plikiem albo katalogiem: bez numeru wiersza i końcowego ukośnika. */
export function pathPart(code: string): string | null {
  const text = codeKey(code)
  if (NOT_PATH.test(text)) return null
  const bare = text.replace(LINE_SUFFIX, '').replace(/[\\/]+$/, '')
  if (!bare || /^\.{1,2}$/.test(bare) || !PATH_SHAPE.test(text)) return null
  return bare
}

/** Kod, który wygląda na ścieżkę. Spis jest przybliżony, bo renderer i tak bierze tylko trafienia. */
export function codePathCandidates(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(CODE_SPAN)) {
    const text = codeKey(match[1] as string)
    if (pathPart(text)) found.add(text)
    if (found.size >= MAX_CANDIDATES) break
  }
  return [...found]
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

/**
 * Katalogi, względem których czytamy ścieżki: folder dokumentu i piętra nad nim aż do korzenia
 * repozytorium, bo agent pisze ścieżki od korzenia, a dokument leży zwykle w `docs/`.
 * Bez repozytorium zostaje sam folder dokumentu.
 */
export async function codePathBases(docPath: string): Promise<string[]> {
  const home = dirname(resolve(docPath))
  const chain = [home]
  let directory = home
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (await exists(resolve(directory, '.git'))) return chain
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
    chain.push(directory)
  }
  return [home]
}

/** Adres względem dokumentu, który `linkTarget` zamieni z powrotem na ten sam plik. */
function hrefFor(home: string, path: string, code: string): string {
  const rel = relative(home, path)
  const target = (isAbsolute(rel) ? path : rel || '.').replace(/\\/g, '/')
  const encoded = encodeURI(target).replace(/#/g, '%23').replace(/\?/g, '%3F')
  return `${encoded}${LINE_SUFFIX.exec(codeKey(code))?.[0] ?? ''}`
}

/** Kod, który prowadzi do istniejącego pliku lub katalogu, i adres linku do niego. */
export async function findCodePaths(source: string, docPath: string): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  const candidates = codePathCandidates(source)
  if (candidates.length === 0) return links
  const bases = await codePathBases(docPath)
  const home = bases[0] as string
  await mapLimit(candidates, STAT_CONCURRENCY, async (code) => {
    const part = pathPart(code) as string
    for (const base of isAbsolute(part) ? [home] : bases) {
      const path = resolve(base, part)
      if (await exists(path)) {
        links.set(code, hrefFor(home, path, code))
        return
      }
    }
  })
  return links
}
