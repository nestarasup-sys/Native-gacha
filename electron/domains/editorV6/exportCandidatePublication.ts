import type { EditorV6ExportReport } from './exportReport'
import { addEditorV6PhaseTime } from './exportMetrics'
import { publishEditorV6Output } from './exportArtifacts'

type Dependencies = {
  report: EditorV6ExportReport
  candidate: string
  outputPath: string
  id: string
  started: number
  memorySampler: ReturnType<typeof setInterval>
  signal: AbortSignal
  saveReport: () => Promise<void>
  publish?: typeof publishEditorV6Output
  now?: () => number
  timestamp?: () => string
  currentRss?: () => number
  clearMemorySampler?: (sampler: ReturnType<typeof setInterval>) => void
  formatError?: (error: unknown) => string
}

/** Publishes a validated candidate and commits its terminal report state. */
export async function publishEditorV6ExportCandidate(dependencies: Dependencies): Promise<void> {
  const {
    report, candidate, outputPath, id, started, memorySampler, signal, saveReport,
    publish = publishEditorV6Output,
    now = () => performance.now(),
    timestamp = () => new Date().toISOString(),
    currentRss = () => process.memoryUsage().rss,
    clearMemorySampler = sampler => clearInterval(sampler),
    formatError = error => error instanceof Error ? error.message : String(error)
  } = dependencies

  signal.throwIfAborted()
  report.state = 'publishing'
  await saveReport()
  signal.throwIfAborted()

  const publicationStarted = now()
  let publication: Awaited<ReturnType<typeof publishEditorV6Output>>
  try { publication = await publish(candidate, outputPath, id) }
  finally { addEditorV6PhaseTime(report, 'publication', publicationStarted, now) }

  report.outputPath = publication.outputPath
  report.deliveryWarning = [report.deliveryWarning, publication.warning].filter(Boolean).join(' ') || undefined
  report.state = 'completed'
  report.endedAt = timestamp()
  report.milliseconds = now() - started
  clearMemorySampler(memorySampler)
  const memory = report.mainProcessMemory
  if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, currentRss())
  try { await saveReport() }
  catch (error) {
    report.deliveryWarning = [report.deliveryWarning, `Vídeo salvo, mas não foi possível atualizar o relatório: ${formatError(error)}`].filter(Boolean).join(' ')
  }
}
