import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from 'electron'
import type { Annotation, OverlayEvent } from '../shared/annotations'
import type { DocThumb, LibrarySnapshot, ShellApi, ViewerKey, ViewerState } from '../shared/types'

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const forward = (_event: IpcRendererEvent, payload: Payload): void => listener(payload)
  ipcRenderer.on(channel, forward)
  return () => ipcRenderer.removeListener(channel, forward)
}

const api: ShellApi = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  addRoot: () => ipcRenderer.invoke('library:add-root'),
  addPaths: (paths) => ipcRenderer.invoke('library:add-paths', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  removeRoot: (path) => ipcRenderer.invoke('library:remove-root', path),
  linkFolder: () => ipcRenderer.invoke('library:link-folder'),
  unlinkFolder: (folder) => ipcRenderer.invoke('library:unlink-folder', folder),
  search: (query) => ipcRenderer.invoke('library:search', query),
  setStatus: (docId, status) => ipcRenderer.invoke('doc:set-status', docId, status),
  setClassification: (docId, classification) =>
    ipcRenderer.invoke('doc:set-classification', docId, classification),
  openDoc: (docId) => ipcRenderer.invoke('viewer:open', docId),
  closeDoc: (docId) => ipcRenderer.invoke('viewer:close', docId),
  reloadDoc: (docId) => ipcRenderer.invoke('viewer:reload', docId),
  setViewerLayout: (placements) => ipcRenderer.invoke('viewer:layout', placements),
  captureDoc: (docId) => ipcRenderer.invoke('viewer:capture', docId),
  setCurrentDoc: (docId) => ipcRenderer.invoke('viewer:set-current', docId),
  focusDoc: (docId) => ipcRenderer.send('viewer:focus', docId),
  wheelDoc: (docId, wheel) => ipcRenderer.send('viewer:wheel', docId, wheel),
  placeLayer: (bounds) => ipcRenderer.send('layer:place', bounds),
  focusLayer: () => ipcRenderer.send('layer:focus'),
  revealDoc: (docId) => ipcRenderer.invoke('doc:reveal', docId),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  listAnnotations: () => ipcRenderer.invoke('annotations:list'),
  createAnnotation: (docId, input) => ipcRenderer.invoke('annotations:create', docId, input),
  replyAnnotation: (id, text) => ipcRenderer.invoke('annotations:reply', id, text),
  setAnnotationStatus: (id, status) => ipcRenderer.invoke('annotations:set-status', id, status),
  setAnnotationAudience: (id, audience) => ipcRenderer.invoke('annotations:set-audience', id, audience),
  deleteAnnotation: (id) => ipcRenderer.invoke('annotations:delete', id),
  setOverlayMode: (docId, mode) => ipcRenderer.send('viewer:set-mode', docId, mode),
  focusAnnotation: (docId, id) => ipcRenderer.send('viewer:focus-annotation', docId, id),
  trackOverlay: (docId, on) => ipcRenderer.send('viewer:track', docId, on),
  selectionAction: (docId, action) => ipcRenderer.send('viewer:selection', docId, action),
  setTheme: (mode) => ipcRenderer.send('window:set-theme', mode),
  requestThumbs: (docIds) => ipcRenderer.send('thumbs:request', docIds),
  onViewerState: (listener) => subscribe<ViewerState>('viewer:state', listener),
  onLibraryChanged: (listener) => subscribe<LibrarySnapshot>('library:changed', listener),
  onAnnotationsChanged: (listener) => subscribe<Annotation[]>('annotations:changed', listener),
  onOverlayEvent: (listener) =>
    subscribe<{ docId: string; event: OverlayEvent }>('viewer:overlay-event', ({ docId, event }) =>
      listener(docId, event)
    ),
  onViewerKey: (listener) => subscribe<ViewerKey>('viewer:key', listener),
  onViewerFocus: (listener) => subscribe<string>('viewer:focus', listener),
  onThumb: (listener) => subscribe<DocThumb>('thumbs:ready', listener)
}

contextBridge.exposeInMainWorld('api', api)
