import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { EnvironmentModuleNode, Plugin } from 'vite'

const SHELL_MODULE = /\/src\/renderer\/src\/(?:shell|motion)\//

/** Czy zmiana dotyka powłoki: wprost albo przez moduł, z którego powłoka korzysta. */
function feedsShell(module: EnvironmentModuleNode, seen = new Set<EnvironmentModuleNode>()): boolean {
  if (seen.has(module)) return false
  seen.add(module)
  return SHELL_MODULE.test(module.file ?? '') || [...module.importers].some((importer) => feedsShell(importer, seen))
}

/**
 * Powłoka trzyma stan poza Reactem: elementy, sprężyny i nasłuchy. Podmiana modułu na gorąco dałaby
 * jego drugą, pustą kopię, a komponenty padłyby na niej, więc zmiana w powłoce przeładowuje stronę.
 * Komponenty i style zostają przy zwykłym HMR. Układ przeżywa przeładowanie dzięki `shell/hot.ts`.
 */
function reloadShell(): Plugin {
  return {
    name: 'bibliotter:reload-shell',
    hotUpdate({ modules }) {
      if (!modules.some((module) => feedsShell(module))) return
      this.environment.hot.send({ type: 'full-reload' })
      return []
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          libraryWorker: resolve(__dirname, 'src/main/libraryWorker.ts'),
          analysisWorker: resolve(__dirname, 'src/main/analysisWorker.ts'),
          searchWorker: resolve(__dirname, 'src/main/searchWorker.ts'),
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
    plugins: [react(), reloadShell()]
  }
})
