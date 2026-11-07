import fileViewScript from 'virtual:file-view'
import { FILE_VIEW_CSP, FILE_VIEW_SCRIPT } from './fileSheets'

/** Odpowiedź dla adresu w arkuszu pliku: strona z danymi i skrypt CodeMirrora. Nic więcej nie czyta. */
export function fileViewResponse(pathname: string, page: string): Response {
  if (pathname === '/') {
    return new Response(page, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': FILE_VIEW_CSP, 'Cache-Control': 'no-store' }
    })
  }
  if (pathname === FILE_VIEW_SCRIPT) {
    return new Response(fileViewScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
  }
  return new Response(null, { status: 404 })
}
