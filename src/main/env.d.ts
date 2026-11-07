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
