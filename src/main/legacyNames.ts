import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { moveLegacyDataDir } from './config'

/**
 * Apka nazywała się HTML Docs, a profil Electrona brał nazwę z pola `name` w package.json.
 * Ten moduł importujemy pierwszy, bo inne moduły już przy imporcie sięgają po dane i profil.
 */
const LEGACY_PROFILE = 'html-docs-app'

/** Electron zakłada folder profilu, zanim ruszy ten kod, czasem z plikiem portu debugowania. Używany profil ma `Local State`. */
const isUnused = (folder: string): boolean => !existsSync(join(folder, 'Local State'))

function moveLegacyProfile(): void {
  // Test z własnym profilem nie może zabrać profilu użytkownika.
  if (app.commandLine.hasSwitch('user-data-dir')) return
  const profile = app.getPath('userData')
  const legacy = join(app.getPath('appData'), LEGACY_PROFILE)
  if (dirname(profile) !== dirname(legacy) || !existsSync(legacy)) return
  if (existsSync(profile) && !isUnused(profile)) return
  try {
    if (existsSync(profile)) rmSync(profile, { recursive: true })
    renameSync(legacy, profile)
  } catch {
    app.setPath('userData', legacy)
  }
}

moveLegacyProfile()
moveLegacyDataDir()
