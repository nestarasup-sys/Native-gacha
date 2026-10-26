import type { EditorV6Document } from './editorV6'

export type EditorV6ExportAudio = {
  id: string; name: string; fileName: string; sourceFrames: number
  startFrame: number; sourceInFrame: number; durationFrames: number; gain: number; muted: boolean
}
export type EditorV6ExportOptions = { startFrame: number; endFrame: number; width: number; height: number; turbo: boolean; encoder: 'auto' | 'cpu' }
export type EditorV6ExportStatus = {
  id: string; state: 'preparing' | 'rendering' | 'joining' | 'validating' | 'completed' | 'cancelled' | 'failed'
  frames: number; totalFrames: number; message: string; fallback: boolean; outputPath?: string; reportPath?: string; error?: string
}
export type EditorV6ExportPart = { index: number; startFrame: number; endFrame: number }
export function planEditorV6Export(options: EditorV6ExportOptions, durationFrames: number): EditorV6ExportPart[] {
  if (!options || typeof options.turbo !== 'boolean') throw Error('Configuração de exportação inválida.')
  if (!Number.isInteger(options.startFrame) || !Number.isInteger(options.endFrame) || options.startFrame < 0 || options.endFrame > durationFrames || options.endFrame <= options.startFrame) throw Error('Escolha um intervalo válido de quadros para exportar.')
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width < 320 || options.height < 180 || options.width > 1920 || options.height > 1080 || options.width % 2 || options.height % 2 || options.width * 9 !== options.height * 16) throw Error('A resolução precisa ser 16:9, com dimensões pares, entre 320×180 e 1920×1080.')
  if (options.encoder !== 'auto' && options.encoder !== 'cpu') throw Error('Codificador inválido.')
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
export const editorV6WorkerChannels = { payload: 'editor-v6:export-worker:payload', ready: 'editor-v6:export-worker:ready' } as const
export type EditorV6WorkerPayload = { project: EditorV6Document; width: number; height: number }
export type EditorV6WorkerBridge = { payload: () => Promise<EditorV6WorkerPayload>; ready: (error?: string) => Promise<void> }
export function editorV6VisualKey(scene: { background: unknown; elements: EditorV6Document['elements'] }): string {
  return JSON.stringify([scene.background, scene.elements.map((element) => [element.id, element.kind, element.assetId, element.text, element.x, element.y, element.width, element.height, element.rotation, element.flipX, element.characterScale, element.characterWidthScale, element.characterHeightScale, element.zIndex, element.motionSprite])])
}
