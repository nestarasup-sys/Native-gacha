import type { EditorV6Document } from '../../../src/shared/editorV6'
import { editorV6ExportTestSettings, type EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { planEditorV6Export, splitEditorV6ExportParts, type EditorV6ExportOptions, type EditorV6ExportPart } from '../../../src/shared/editorV6Export'

export const EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES = 300

export type EditorV6ExportExecutionPlan = {
  options: EditorV6ExportOptions
  testSettings: EditorV6ExportTestSettings
  requestedParts: EditorV6ExportPart[]
  parts: EditorV6ExportPart[]
  speechInRange: boolean
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
  const options: EditorV6ExportOptions = { ...requestedOptions, mouthLoop: true }
  const testSettings = editorV6ExportTestSettings(options.testMode)
  const stressWorkerOverride = environment.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    ? environment.GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS
    : undefined
  // Four stress renderers need 150-frame mouth-loop windows to expose all lanes
  // during short harness runs; authored timeline frames stay unchanged.
  const mouthLoopBatchFrames = stressWorkerOverride === '4' ? Math.floor(EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES / 2) : EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES
  const requestedParts = planEditorV6Export(options, project.timeline.durationFrames)
  const speechInRange = hasLinkedSpeech(project, options.startFrame, options.endFrame)
  const parts = speechInRange ? splitEditorV6ExportParts(requestedParts, mouthLoopBatchFrames) : requestedParts
  if (stressWorkerOverride !== undefined && (!options.turbo || !/^([2-4])$/.test(stressWorkerOverride))) {
    throw Error('O benchmark isolado do Editor V6 aceita de 2 a 4 renderizadores Turbo.')
  }
  if (platform !== 'win32') throw Error('Este exportador BGRA está preparado para Windows.')
  return { options, testSettings, requestedParts, parts, speechInRange, ...(stressWorkerOverride !== undefined ? { stressWorkerOverride } : {}) }
}
