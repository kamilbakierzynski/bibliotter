import fileViewScript from 'virtual:file-view'
import { FILE_LIST_PATH, FILE_TREE_PATH, FILE_VIEW_CSP, FILE_VIEW_SCRIPT, type FileSheets } from './fileSheets'

const json = (value: unknown): Response =>
  value === null
    ? new Response(null, { status: 404 })
    : new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

/**
 * Odpowiedź dla adresu w arkuszu pliku: strona z danymi, skrypt CodeMirrora i listy drzewa plików.
 * Listy obejmują tylko korzeń drzewa tego arkusza, więc strona nie przeczyta nic poza nim.
 */
export async function fileViewResponse(sheets: Pick<FileSheets, 'page' | 'tree' | 'files'>, docId: string, url: URL): Promise<Response> {
  const { pathname, searchParams } = url
  if (pathname === '/') {
    const page = await sheets.page(docId)
    if (!page) return new Response(null, { status: 404 })
    return new Response(page, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': FILE_VIEW_CSP, 'Cache-Control': 'no-store' }
    })
  }
  if (pathname === FILE_VIEW_SCRIPT) {
    return new Response(fileViewScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
  }
  if (pathname === FILE_TREE_PATH) return json(await sheets.tree(docId, searchParams.get('dir') ?? ''))
  if (pathname === FILE_LIST_PATH) return json(await sheets.files(docId))
  return new Response(null, { status: 404 })
}
