import type { EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { splitEditorV6ExportParts } from '../../../src/shared/editorV6Export'
import { EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES } from './exportPlanning'
import type { EditorV6ExportPartReport } from './exportPartRenderer'
import type { EditorV6ExportReport } from './exportReport'

export type EditorV6ExportAttempt = (parts: EditorV6ExportPart[], encoder: string, maxParallelism?: number) => Promise<EditorV6ExportPartReport[]>

type Dependencies = {
  options: EditorV6ExportOptions
  plannedParts: EditorV6ExportPart[]
  requestedPartCount: number
  stressWorkerOverride?: string
  speechInRange: boolean
  encoder: string
  signal: AbortSignal
  report: Pick<EditorV6ExportReport, 'attempts' | 'fallback'>
  progress: (patch: Partial<EditorV6ExportStatus>) => void
  renderAttempt: EditorV6ExportAttempt
  finishMeasured: (parts: EditorV6ExportPartReport[]) => Promise<unknown>
  selectFallbackEncoder: (encoder: string) => Promise<string>
  formatError: (error: unknown) => string
}

/** Applies the existing Turbo policy and retries a failed eligible export with one CPU renderer. */
export async function renderEditorV6ExportWithFallback(dependencies: Dependencies): Promise<unknown> {
  const {
    options, plannedParts, requestedPartCount, stressWorkerOverride, speechInRange, encoder,
    signal, report, progress, renderAttempt, finishMeasured, selectFallbackEncoder, formatError
  } = dependencies
  const turboParallelism = stressWorkerOverride ? Number(stressWorkerOverride) : options.turbo ? 2 : 1

  try {
    return await finishMeasured(await renderAttempt(plannedParts, encoder, turboParallelism))
  } catch (error) {
    signal.throwIfAborted()
    const attempt = report.attempts.at(-1)
    if (attempt) attempt.error = formatError(error)
    if (options.forceTurbo1080) throw Error(`Turbo obrigatório falhou: ${formatError(error)}`)
    if (!options.turbo || requestedPartCount < 2) throw error

    report.fallback = true
    progress({ message: 'O Turbo falhou. Reiniciando com um renderizador e CPU…', fallback: true })
    const safeEncoder = await selectFallbackEncoder(encoder)
    if (!safeEncoder) throw Error('Nenhum codificador H.264 de fallback pôde ser iniciado.')
    const safePart = [{ index: 0, startFrame: options.startFrame, endFrame: options.endFrame }]
    const safeParts = speechInRange ? splitEditorV6ExportParts(safePart, EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES) : safePart
    return await finishMeasured(await renderAttempt(safeParts, safeEncoder, 1))
  }
}
