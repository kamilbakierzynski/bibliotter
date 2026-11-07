/// <reference types="vite/types/importMeta.d.ts" />

declare module '*?inline' {
  const url: string
  export default url
}

declare module '*?asset' {
  const path: string
  export default path
}

declare module '*?raw' {
  const text: string
  export default text
}

/** Skrypt strony arkusza pliku: CodeMirror złożony w jeden plik przez wtyczkę w `electron.vite.config.ts`. */
declare module 'virtual:file-view' {
  const code: string
  export default code
}
