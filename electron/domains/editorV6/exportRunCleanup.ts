import type { EditorV6ExportReport } from './exportReport'

type Dependencies = {
  report: Pick<EditorV6ExportReport, 'endedAt' | 'milliseconds' | 'deliveryWarning' | 'mainProcessMemory' | 'cleanup'>
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
  const cleanupStarted = now()
  const cleanupErrors: unknown[] = []
  try { releaseMotionCacheScope?.(motionCacheScope) } catch (error) { cleanupErrors.push(error) }
  clearMemorySampler(memorySampler)
  const memory = report.mainProcessMemory
  if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, currentRss())
  if (!published) {
    report.endedAt = timestamp()
    report.milliseconds = now() - started
  }
  try { await removeCandidate(candidate) } catch (error) { cleanupErrors.push(error) }
  try {
    if (await removeTempFolder(tempRoot, folder) === false) throw Error('A pasta temporária não passou na verificação de segurança para remoção.')
  } catch (error) { cleanupErrors.push(error) }

  const details = cleanupErrors.map(formatError)
  report.cleanup = { milliseconds: now() - cleanupStarted, errors: details }
  if (published) {
    if (details.length) report.deliveryWarning = [report.deliveryWarning, 'O MP4 foi salvo, mas houve falha ao limpar arquivos temporários.'].filter(Boolean).join(' ')
    try { await saveReport() } catch (error) {
      const warning = `Vídeo salvo, mas o relatório final da limpeza não pôde ser gravado: ${formatError(error)}`
      report.deliveryWarning = [report.deliveryWarning, warning].filter(Boolean).join(' ')
      warn(warning)
    }
    if (details.length) warn('Falha ao limpar arquivos temporários do Editor V6:', details.join('; '))
    return
  }

  try { await saveReport() } catch (error) { cleanupErrors.push(error) }
  if (!cleanupErrors.length) return
  const primary = exportFailure === undefined ? [] : [exportFailure]
  throw new AggregateError(
    [...primary, ...cleanupErrors],
    [exportFailure === undefined ? 'Falha ao limpar arquivos temporários da exportação.' : `A exportação falhou: ${formatError(exportFailure)}.`, `Falha adicional na limpeza: ${cleanupErrors.map(formatError).join('; ')}`].join(' ')
  )
}
