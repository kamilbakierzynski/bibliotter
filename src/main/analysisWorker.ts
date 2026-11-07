import { parentPort } from 'node:worker_threads'
import type { DocFormat } from '../shared/types'
import { analyzeFile } from './analysis'

export interface AnalysisTask {
  id: number
  path: string
  format: DocFormat
}

/** Analiza to głównie składanie Markdownu, czyli czysty procesor, więc działa na osobnych wątkach. */
parentPort?.on('message', ({ id, path, format }: AnalysisTask) => {
  void analyzeFile(path, format).then((analysis) => parentPort?.postMessage({ id, analysis }))
})
