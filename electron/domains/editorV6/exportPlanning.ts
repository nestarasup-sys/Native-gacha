import type { EditorV6Document } from '../../../src/shared/editorV6'
import { editorV6ExportTestSettings, type EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { planEditorV6Export, splitEditorV6ExportParts, type EditorV6ExportOptions, type EditorV6ExportPart } from '../../../src/shared/editorV6Export'

export const EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES = 600

export type EditorV6ExportExecutionPlan = {
  options: EditorV6ExportOptions
  testSettings: EditorV6ExportTestSettings
  requestedParts: EditorV6ExportPart[]
  parts: EditorV6ExportPart[]
  speechInRange: boolean
  mouthLoopBatchFrames: number
  stressWorkerOverride?: string
}

function hasLinkedSpeech(project: EditorV6Document, startFrame: number, endFrame: number): boolean {
  return project.timeline.tracks.some((track) => track.kind === 'speech' && !track.hidden && !track.muted
    && track.blocks.some((block) => Boolean(block.characterId ?? block.state?.characterId)
      && block.startFrame < endFrame && block.startFrame + block.durationFrames > startFrame))
}

/** Resolves user options, stress-harness overrides, and render-part boundaries. */
export function createEditorV6ExportExecutionPlan(
  project: EditorV6Document,
  requestedOptions: EditorV6ExportOptions,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform
): EditorV6ExportExecutionPlan {
  const options: EditorV6ExportOptions = {
    ...requestedOptions,
    mouthLoop: requestedOptions.includeSpeechMouth !== false && (requestedOptions.mouthLoop ?? true)
  }
  const testSettings = editorV6ExportTestSettings(options.testMode)
  const stressWorkerOverride = environment.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    ? environment.GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS
    : undefined
  const stressMouthBatchOverride = environment.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    ? environment.GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES
    : undefined
  // Worker count changes concurrency only. Keep mouth atlas windows identical
  // unless the isolated harness explicitly tests a larger safe batch.
  if (stressMouthBatchOverride !== undefined && !['200', '300', '600', '1200'].includes(stressMouthBatchOverride)) {
    throw Error('O benchmark isolado aceita trechos de boca de 200, 300, 600 ou 1200 quadros.')
  }
  const mouthLoopBatchFrames = Number(stressMouthBatchOverride ?? EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES)
  const requestedParts = planEditorV6Export(options, project.timeline.durationFrames)
  const speechInRange = hasLinkedSpeech(project, options.startFrame, options.endFrame)
  const parts = options.mouthLoop !== false && speechInRange ? splitEditorV6ExportParts(requestedParts, mouthLoopBatchFrames) : requestedParts
  if (stressWorkerOverride !== undefined && (!options.turbo || !/^([2-6])$/.test(stressWorkerOverride))) {
    throw Error('O benchmark isolado do Editor V6 aceita de 2 a 6 renderizadores Turbo.')
  }
  if (stressWorkerOverride !== undefined && Number(stressWorkerOverride) > parts.length) {
    throw Error(`O benchmark pediu ${stressWorkerOverride} renderizadores, mas o plano contém apenas ${parts.length} trechos. Reduza --mouth-batch-frames ou use menos renderizadores.`)
  }
  if (platform !== 'win32') throw Error('Este exportador BGRA está preparado para Windows.')
  return { options, testSettings, requestedParts, parts, speechInRange, mouthLoopBatchFrames, ...(stressWorkerOverride !== undefined ? { stressWorkerOverride } : {}) }
}
