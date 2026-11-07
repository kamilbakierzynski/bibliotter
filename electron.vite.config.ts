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

const FILE_VIEW = 'virtual:file-view'
const FILE_VIEW_SOURCE = resolve(__dirname, 'src/fileView')

/**
 * Strona arkusza pliku działa w sesji dokumentów, która czyta tylko adresy swojego dokumentu, więc
 * CodeMirror musi przyjść z procesu głównego jako jeden plik. Wtyczka składa go przy budowaniu main,
 * a w trybie dev zmiana w `src/fileView` przebudowuje main jak każda inna.
 */
function fileView(): Plugin {
  return {
    name: 'bibliotter:file-view',
    resolveId: (source) => (source === FILE_VIEW ? `\0${FILE_VIEW}` : null),
    async load(id) {
      if (id !== `\0${FILE_VIEW}`) return null
      const { rolldown } = await import('rolldown')
      const bundle = await rolldown({ input: resolve(FILE_VIEW_SOURCE, 'main.ts'), platform: 'browser', logLevel: 'warn' })
      try {
        const { output } = await bundle.generate({ format: 'iife', minify: true, inlineDynamicImports: true })
        for (const file of await bundle.watchFiles) {
          if (file.startsWith(FILE_VIEW_SOURCE)) this.addWatchFile(file)
        }
        return `export default ${JSON.stringify(output[0].code)}`
      } finally {
        await bundle.close()
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [fileView()],
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
