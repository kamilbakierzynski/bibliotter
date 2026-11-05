import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          cli: resolve(__dirname, 'src/main/cli.ts'),
          mcp: resolve(__dirname, 'src/main/mcp.ts')
        }
      }
    }
  },
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
