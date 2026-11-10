import type { EditorV6ExportReport } from './exportReport'

type Dependencies = {
  report: Pick<EditorV6ExportReport, 'endedAt' | 'milliseconds' | 'deliveryWarning' | 'mainProcessMemory'>
  published: boolean
  started: number
  exportFailure?: unknown
  motionCacheScope: string
  releaseMotionCacheScope?: (scope: string) => void
  memorySampler: ReturnType<typeof setInterval>
  candidate: string
  tempRoot: string
  folder: string
  saveReport: () => Promise<void>
  removeCandidate: (candidate: string) => Promise<unknown>
  removeTempFolder: (tempRoot: string, folder: string) => Promise<unknown>
  now: () => number
  timestamp: () => string
  currentRss: () => number
  clearMemorySampler: (sampler: ReturnType<typeof setInterval>) => void
  formatError: (error: unknown) => string
  warn: (...data: unknown[]) => void
}

/** Releases run-scoped resources and preserves the existing cleanup-error policy. */
export async function cleanupEditorV6ExportRun(dependencies: Dependencies): Promise<void> {
  const {
    report, published, started, exportFailure, motionCacheScope, releaseMotionCacheScope,
    memorySampler, candidate, tempRoot, folder, saveReport, removeCandidate, removeTempFolder,
    now, timestamp, currentRss, clearMemorySampler, formatError, warn
  } = dependencies
  releaseMotionCacheScope?.(motionCacheScope)
  clearMemorySampler(memorySampler)
  const memory = report.mainProcessMemory
  if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, currentRss())
  const cleanupErrors: unknown[] = []
  if (!published) {
    report.endedAt = timestamp()
    report.milliseconds = now() - started
    try { await saveReport() } catch (error) { cleanupErrors.push(error) }
  }
  try { await removeCandidate(candidate) } catch (error) { cleanupErrors.push(error) }
  try { await removeTempFolder(tempRoot, folder) } catch (error) { cleanupErrors.push(error) }
  if (!cleanupErrors.length) return

  const details = cleanupErrors.map(formatError)
  if (published) {
    report.deliveryWarning = [report.deliveryWarning, 'O MP4 foi salvo, mas houve falha ao limpar arquivos temporários.'].filter(Boolean).join(' ')
    try { await saveReport() } catch (error) { warn('Não foi possível registrar a falha de limpeza do Editor V6:', formatError(error)) }
    warn('Falha ao limpar arquivos temporários do Editor V6:', details.join('; '))
    return
  }

  const primary = exportFailure === undefined ? [] : [exportFailure]
  throw new AggregateError(
    [...primary, ...cleanupErrors],
    [exportFailure === undefined ? 'Falha ao limpar arquivos temporários da exportação.' : `A exportação falhou: ${formatError(exportFailure)}.`, `Falha adicional na limpeza: ${details.join('; ')}`].join(' ')
  )
}
