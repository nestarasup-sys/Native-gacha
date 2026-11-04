import type { EditorV6Document } from './editorV6'
import type { EditorV6MotionFrame } from './editorV6Motion'
import type { EditorV6HairMotionBundle } from './editorV6HairMotion'

export type EditorV6ExportAudio = {
  id: string; name: string; fileName: string; sourceFrames: number
  libraryVideoId?: string
  startFrame: number; sourceInFrame: number; durationFrames: number; gain: number; muted: boolean
}
export type EditorV6ExportOptions = { startFrame: number; endFrame: number; width: number; height: number; turbo: boolean; forceTurbo1080?: boolean; encoder: 'auto' | 'cpu'; mouthLoop?: boolean; mouthLoopCycleFrames?: number; hairAnimationPresetSlot?: number; hairAnimationLoopFrames?: 90 | 120; hairPoseReactionOnly?: boolean; hairPosteriorOnly?: boolean }
/** Keep the UI encoder selector aligned with the validated IPC contract. */
export const EDITOR_V6_ENCODER_CHOICES = [
  { value: 'auto', label: 'Automática · GPU se disponível' },
  { value: 'cpu', label: 'CPU · H.264' }
] as const satisfies ReadonlyArray<{ value: EditorV6ExportOptions['encoder']; label: string }>
export type EditorV6ExportStatus = {
  id: string; state: 'preparing' | 'rendering' | 'joining' | 'validating' | 'completed' | 'cancelled' | 'failed'
  frames: number; totalFrames: number; message: string; fallback: boolean; motionProgress?: { completed: number; total: number }; outputPath?: string; reportPath?: string; error?: string
}
export type EditorV6ExportPart = { index: number; startFrame: number; endFrame: number }
export type EditorV6ExportMouthLoopState = { elementId: string; characterId: string; blockIds: string[]; assetId: string; sourceAssetId?: string; baseAssetIds?: Partial<Record<'talk' | 'talk-blink', string>>; frames: EditorV6MotionFrame[] }
export type EditorV6ExportMouthLoops = { startFrame: number; cycleFrames: number; states: EditorV6ExportMouthLoopState[] }
export const EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES = [1, 1.05, 1.05 * 1.05] as const
export function editorV6MouthLoopScaleAtFrame(frame: number, startFrame: number, cycleFrames: number): number {
  const phase = ((frame - startFrame) % cycleFrames + cycleFrames) % cycleFrames / cycleFrames
  const travel = phase <= .5 ? phase * 2 : (1 - phase) * 2
  const index = Math.round(travel * (EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.length - 1))
  return EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[index]
}
export function planEditorV6Export(options: EditorV6ExportOptions, durationFrames: number): EditorV6ExportPart[] {
  if (!options || typeof options.turbo !== 'boolean') throw Error('Configuração de exportação inválida.')
  if (!Number.isSafeInteger(durationFrames) || durationFrames < 1) throw Error('A duração do documento é inválida.')
  if (!Number.isInteger(options.startFrame) || !Number.isInteger(options.endFrame) || options.startFrame < 0 || options.endFrame > durationFrames || options.endFrame <= options.startFrame) throw Error('Escolha um intervalo válido de quadros para exportar.')
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width < 320 || options.height < 180 || options.width > 1920 || options.height > 1080 || options.width % 2 || options.height % 2 || options.width * 9 !== options.height * 16) throw Error('A resolução precisa ser 16:9, com dimensões pares, entre 320×180 e 1920×1080.')
  if (options.forceTurbo1080 !== undefined && typeof options.forceTurbo1080 !== 'boolean') throw Error('Configuração de Turbo obrigatório inválida.')
  if (options.forceTurbo1080 && (!options.turbo || options.width !== 1920 || options.height !== 1080 || options.endFrame - options.startFrame < 2)) throw Error('Turbo obrigatório exige 1080p e ao menos dois quadros.')
  if (options.encoder !== 'auto' && options.encoder !== 'cpu') throw Error('Codificador inválido.')
  if (options.mouthLoop !== undefined && typeof options.mouthLoop !== 'boolean') throw Error('Configuração de animação da boca inválida.')
  if (!Number.isInteger(options.mouthLoopCycleFrames ?? 30) || (options.mouthLoopCycleFrames ?? 30) < 30 || (options.mouthLoopCycleFrames ?? 30) > 180) throw Error('O ciclo da boca deve durar de 1 a 6 segundos.')
  if (options.hairAnimationPresetSlot !== undefined && (!Number.isInteger(options.hairAnimationPresetSlot) || options.hairAnimationPresetSlot < 1 || options.hairAnimationPresetSlot > 5)) throw Error('Selecione um preset de animação de cabelo válido.')
  if (options.hairAnimationLoopFrames !== undefined && (![90, 120].includes(options.hairAnimationLoopFrames) || !options.hairAnimationPresetSlot)) throw Error('Ciclo do cabelo requer preset ativo e duração de 3 ou 4 segundos.')
  if (options.hairPoseReactionOnly !== undefined && typeof options.hairPoseReactionOnly !== 'boolean') throw Error('Configuração de reação do cabelo inválida.')
  if (options.hairPoseReactionOnly && (!options.hairAnimationPresetSlot || options.hairAnimationLoopFrames !== undefined)) throw Error('Reação após pose requer preset e não pode usar loop contínuo.')
  if (options.hairPosteriorOnly !== undefined && typeof options.hairPosteriorOnly !== 'boolean') throw Error('Configuração de cabelo posterior inválida.')
  if (options.hairPosteriorOnly && !options.hairAnimationPresetSlot) throw Error('Cabelo posterior exclusivo requer preset ativo.')
  if (options.hairPoseReactionOnly && !options.hairPosteriorOnly) throw Error('A reação após pose exige a seleção exclusiva do cabelo posterior.')
  const count = options.endFrame - options.startFrame
  const middle = options.startFrame + Math.floor(count / 2)
  return options.turbo && count >= 2 ? [{ index: 0, startFrame: options.startFrame, endFrame: middle }, { index: 1, startFrame: middle, endFrame: options.endFrame }] : [{ index: 0, startFrame: options.startFrame, endFrame: options.endFrame }]
}
export function planEditorV6Audio(clips: readonly EditorV6ExportAudio[], startFrame: number, endFrame: number) {
  return clips.flatMap((clip) => {
    const start = Math.max(startFrame, clip.startFrame), end = Math.min(endFrame, clip.startFrame + clip.durationFrames)
    return clip.muted || clip.gain === 0 || end <= start ? [] : [{ clip, sourceInFrame: clip.sourceInFrame + start - clip.startFrame, durationFrames: end - start, delayFrames: start - startFrame }]
  })
}
export function splitEditorV6ExportParts(parts: readonly EditorV6ExportPart[], maxFrames: number): EditorV6ExportPart[] {
  if (!Number.isInteger(maxFrames) || maxFrames < 1) throw Error('O tamanho de cada trecho de exportação é inválido.')
  const result: EditorV6ExportPart[] = []
  for (const part of parts) {
    for (let startFrame = part.startFrame; startFrame < part.endFrame; startFrame += maxFrames) {
      result.push({ index: result.length, startFrame, endFrame: Math.min(part.endFrame, startFrame + maxFrames) })
    }
  }
  return result
}
export const editorV6WorkerChannels = { payload: 'editor-v6:export-worker:payload', ready: 'editor-v6:export-worker:ready' } as const
export type EditorV6WorkerPayload = { project: EditorV6Document; width: number; height: number; layeredVideo: boolean; mouthLoops?: EditorV6ExportMouthLoops; hairAnimation?: EditorV6HairMotionBundle }
export type EditorV6WorkerBridge = { payload: () => Promise<EditorV6WorkerPayload>; ready: (error?: string) => Promise<void> }
export type EditorV6FrameTimings = Partial<Record<'sceneResolutionMs' | 'faceCompositionMs' | 'hairCompositionMs' | 'hairMotionPrewarmMs' | 'assetPreparationMs' | 'reactCommitMs' | 'rafWaitMs' | 'ipcDrawMs' | 'captureMs' | 'backgroundCaptureMs' | 'foregroundCaptureMs' | 'frameRoundTripMs' | 'ffmpegWriteMs', number>>
export type EditorV6FrameMetrics = Partial<Record<'hairRasterFrames' | 'hairRasterPixels', number>>
/** A real-project export may legitimately contain audio even with animated hair.
 * The benchmark must verify its MP4 output, not assume a silent test scene.
 */
export function editorV6BenchmarkAudioMatchesExport(audioClips: number, outputHasAudio: boolean): boolean {
  return Number.isSafeInteger(audioClips) && audioClips >= 0 && outputHasAudio === (audioClips > 0)
}
export type EditorV6RenderFrameResult = { reused: boolean; layerReused?: boolean; timings?: EditorV6FrameTimings; metrics?: EditorV6FrameMetrics }
type EditorV6VisualKeyInput = { frame?: number; hairAnimationFrame?: number; background: unknown; elements: EditorV6Document['elements']; mediaVideo?: { mediaId: string; startFrame: number; sourceInFrame: number; layout: { x: number; y: number; width: number; height: number; rotation: number } } }
function editorV6ElementVisualKeys(elements: EditorV6Document['elements']) {
  return elements.map((element) => [element.id, element.kind, element.assetId, element.text, element.x, element.y, element.width, element.height, element.rotation, element.flipX, element.characterScale, element.characterWidthScale, element.characterHeightScale, element.zIndex, element.motionSprite, element.mouthPatch])
}
export function editorV6LayerVisualKeys(scene: Pick<EditorV6VisualKeyInput, 'background' | 'elements' | 'hairAnimationFrame'>) {
  const foreground = editorV6ElementVisualKeys(scene.elements)
  return { background: JSON.stringify(scene.background), foreground: JSON.stringify(scene.hairAnimationFrame === undefined ? foreground : [foreground, scene.hairAnimationFrame]) }
}
export function editorV6VisualKey(scene: EditorV6VisualKeyInput): string {
  const mediaFrame = scene.mediaVideo && scene.frame !== undefined ? scene.mediaVideo.sourceInFrame + scene.frame - scene.mediaVideo.startFrame : null
  const base = [scene.background, mediaFrame === null ? null : [scene.mediaVideo?.mediaId, mediaFrame, scene.mediaVideo?.layout], editorV6ElementVisualKeys(scene.elements)]
  return JSON.stringify(scene.hairAnimationFrame === undefined ? base : [...base, scene.hairAnimationFrame])
}
