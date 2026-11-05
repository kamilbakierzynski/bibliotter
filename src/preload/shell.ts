import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Annotation, OverlayEvent } from '../shared/annotations'
import type { LibrarySnapshot, ShellApi, ViewerState } from '../shared/types'

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const forward = (_event: IpcRendererEvent, payload: Payload): void => listener(payload)
  ipcRenderer.on(channel, forward)
  return () => ipcRenderer.removeListener(channel, forward)
}

const api: ShellApi = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  addRoot: () => ipcRenderer.invoke('library:add-root'),
  removeRoot: (path) => ipcRenderer.invoke('library:remove-root', path),
  linkFolder: () => ipcRenderer.invoke('library:link-folder'),
  unlinkFolder: (folder) => ipcRenderer.invoke('library:unlink-folder', folder),
  search: (query) => ipcRenderer.invoke('library:search', query),
  setStatus: (docId, status) => ipcRenderer.invoke('doc:set-status', docId, status),
  setClassification: (docId, classification) =>
    ipcRenderer.invoke('doc:set-classification', docId, classification),
  openDoc: (docId) => ipcRenderer.invoke('viewer:open', docId),
  closeDoc: () => ipcRenderer.invoke('viewer:close'),
  reloadDoc: () => ipcRenderer.invoke('viewer:reload'),
  revealDoc: (docId) => ipcRenderer.invoke('doc:reveal', docId),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  setViewerBounds: (bounds) => ipcRenderer.send('viewer:set-bounds', bounds),
  listAnnotations: () => ipcRenderer.invoke('annotations:list'),
  createAnnotation: (docId, input) => ipcRenderer.invoke('annotations:create', docId, input),
  replyAnnotation: (id, text) => ipcRenderer.invoke('annotations:reply', id, text),
  setAnnotationStatus: (id, status) => ipcRenderer.invoke('annotations:set-status', id, status),
  setAnnotationAudience: (id, audience) => ipcRenderer.invoke('annotations:set-audience', id, audience),
  deleteAnnotation: (id) => ipcRenderer.invoke('annotations:delete', id),
  setOverlayMode: (mode) => ipcRenderer.send('viewer:set-mode', mode),
  focusAnnotation: (id) => ipcRenderer.send('viewer:focus-annotation', id),
  onViewerState: (listener) => subscribe<ViewerState>('viewer:state', listener),
  onLibraryChanged: (listener) => subscribe<LibrarySnapshot>('library:changed', listener),
  onAnnotationsChanged: (listener) => subscribe<Annotation[]>('annotations:changed', listener),
  onOverlayEvent: (listener) => subscribe<OverlayEvent>('viewer:overlay-event', listener)
}

contextBridge.exposeInMainWorld('api', api)
