// Uruchamia Vitest na Node wbudowanym w Electron. Tylko ten Node ma SQLite z FTS5,
// więc testy działają w tym samym środowisku co apka.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const vitestEntry = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const { status } = spawnSync(electronPath, [vitestEntry, 'run', ...process.argv.slice(2)], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
})
process.exitCode = status ?? 1
