/// <reference types="vite/types/importMeta.d.ts" />

declare module '*.css'

declare module '*.svg' {
  const url: string
  export default url
}
