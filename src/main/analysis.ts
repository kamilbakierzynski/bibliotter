import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { DocFormat } from '../shared/types'
import { analyzeDocument, type HtmlFeatures } from './classify'

export interface FileAnalysis extends HtmlFeatures {
  sha: string
}

/** Czyta plik i wyciąga z niego cechy. Zwraca null, gdy pliku nie da się odczytać. */
export type FileAnalyzer = (path: string, format: DocFormat) => Promise<FileAnalysis | null>

export const analyzeFile: FileAnalyzer = async (path, format) => {
  try {
    const buffer = await readFile(path)
    const sha = createHash('sha256').update(buffer).digest('hex')
    return { ...analyzeDocument(format, buffer.toString('utf8')), sha }
  } catch {
    return null // Plik mógł zniknąć albo być zablokowany przez inny program.
  }
}
