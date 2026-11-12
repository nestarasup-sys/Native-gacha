import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, type EditorV6ExportMouthLoops } from '../../../../shared/editorV6Export'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>

/** Resolves baked speech samples and their mouthless hair-source aliases for export. */
export function createEditorV6ExportMouthLoopResolver(project: Pick<EditorV6Document, 'id' | 'timeline'>, mouthLoops?: EditorV6ExportMouthLoops) {
  const mouthLoopByBlock = new Map<string, EditorV6ExportMouthLoops['states'][number]>()
  const mouthlessSourceAssetById = new Map<string, string>()
  const patchSourceCropByAssetId = new Map<string, NonNullable<EditorV6ExportMouthLoops['states'][number]['facePatchSourceCrop']>>()
  for (const state of mouthLoops?.states ?? []) {
    for (const blockId of state.blockIds) mouthLoopByBlock.set(`${state.elementId}:${blockId}`, state)
    if (state.facePatchSourceCrop) patchSourceCropByAssetId.set(state.assetId, state.facePatchSourceCrop)
    if (state.sourceAssetId) for (const baseAssetId of Object.values(state.baseAssetIds ?? {})) mouthlessSourceAssetById.set(baseAssetId, state.sourceAssetId)
  }

  const hairSourceAssetId = (element: { assetId?: string }) => element.assetId ? mouthlessSourceAssetById.get(element.assetId) ?? element.assetId : undefined
  const applyMouthLoop = (scene: Scene, frame: number) => {
    if (!mouthLoops) return scene
    const scale = editorV6MouthLoopScaleAtFrame(frame, mouthLoops.startFrame, mouthLoops.cycleFrames)
    const sampleIndex = Math.round((scale - 1) / (EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[2] - 1) * 2)
    return { ...scene, elements: scene.elements.map((element) => {
      if (element.kind !== 'character' || !element.characterId) return element
      const faceMode = editorV6FaceModeAtFrame(project.id, project.timeline, element.characterId, frame)
      if (faceMode !== 'talk' && faceMode !== 'talk-blink') return element
      const block = editorV6ClipAtFrame(project.timeline, element.id, frame)?.block
      const state = mouthLoopByBlock.get(`${element.id}:${block?.id ?? element.id}`)
      if (!state || state.characterId !== element.characterId) return element
      if (element.motionSprite) {
        if (!element.mouthPatch && scale > 1.000001) throw Error(`A transição de ${element.text || element.characterId} não tem uma camada facial preparada durante a fala; a exportação foi interrompida para preservar a qualidade.`)
        return element
      }
      const motion = state.frames[sampleIndex] ?? state.frames[0]
      if (!motion?.facePatch) throw Error(`A camada facial de ${element.text || element.characterId} está incompleta; a exportação foi interrompida para evitar um vídeo sem animação de boca.`)
      const mouthlessAssetId = state.baseAssetIds?.[faceMode]
      return { ...element, ...(mouthlessAssetId ? { assetId: mouthlessAssetId } : {}), mouthPatch: { assetId: state.assetId, ...motion.facePatch } }
    }) }
  }

  return { applyMouthLoop, hairSourceAssetId, facePatchSourceCrop: (assetId: string) => patchSourceCropByAssetId.get(assetId) }
}
