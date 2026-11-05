import { realpath } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'

export const DOC_SCHEME = 'htmldoc'

const ASSET_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export const docUrl = (docId: string): string => `${DOC_SCHEME}://${docId}/`

export function assetContentType(path: string): string | null {
  return ASSET_TYPES[extname(path).toLowerCase()] ?? null
}

/**
 * Zamienia ścieżkę z adresu dokumentu na plik obok tego dokumentu.
 * Zwraca null dla plików spoza katalogu dokumentu, ukrytych i typów spoza listy.
 * `realpath` chroni przed wyjściem z katalogu przez dowiązanie symboliczne.
 */
export async function resolveAssetPath(docPath: string, urlPathname: string): Promise<string | null> {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || !assetContentType(decoded)) return null
  if (decoded.split(/[\\/]/).some((part) => part.startsWith('.'))) return null

  const candidate = resolve(dirname(docPath), `.${decoded}`)
  try {
    const [realDirectory, realCandidate] = await Promise.all([
      realpath(dirname(docPath)),
      realpath(candidate)
    ])
    const inside = relative(realDirectory, realCandidate)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
    return realCandidate
  } catch {
    return null
  }
}

export interface RequestContext {
  url: string
  /** Host bieżącego dokumentu w widoku, z którego pochodzi żądanie. */
  documentHost: string | null
  allowedHosts: readonly string[]
}

/** Dokument czyta tylko własne pliki i hosty z listy. Reszta sieci jest zablokowana. */
export function isRequestAllowed({ url, documentHost, allowedHosts }: RequestContext): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  switch (parsed.protocol) {
    case 'data:':
    case 'blob:':
      return true
    case 'https:':
      return allowedHosts.includes(parsed.hostname)
    case `${DOC_SCHEME}:`:
      return documentHost !== null && parsed.hostname === documentHost
    default:
      return false
  }
}

export function isExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
