import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          shell: resolve(__dirname, 'src/preload/shell.ts'),
          doc: resolve(__dirname, 'src/preload/doc.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()]
  }
})
