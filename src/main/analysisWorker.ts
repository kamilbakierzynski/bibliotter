import { parentPort } from 'node:worker_threads'
import type { DocFormat } from '../shared/types'
import { analyzeFile } from './analysis'
import { readLinks } from './docLinks'

export interface AnalysisTask {
  id: number
  path: string
  format: DocFormat
  /** Linki dokumentu zamiast cech pliku. */
  job?: 'links'
}

/** Analiza to głównie składanie Markdownu, czyli czysty procesor, więc działa na osobnych wątkach. */
parentPort?.on('message', ({ id, path, format, job }: AnalysisTask) => {
  const result = job === 'links' ? readLinks(path, format) : analyzeFile(path, format)
  void result.then((value) => parentPort?.postMessage({ id, result: value }))
})
