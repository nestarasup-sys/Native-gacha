import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, type EditorV6ExportMouthLoops } from '../../../../shared/editorV6Export'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { hairMotionPoseReactionIsActive } from '../../../../shared/hairMotionEngine'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>

/** Resolves baked speech samples and their mouthless hair-source aliases for export. */
export function createEditorV6ExportMouthLoopResolver(
  project: Pick<EditorV6Document, 'id' | 'timeline'> & Partial<Pick<EditorV6Document, 'elements'>>,
  mouthLoops?: EditorV6ExportMouthLoops,
  hairPoseReactionEnds: ReadonlyMap<string, readonly number[]> = new Map()
) {
  const canonicalAssetIds = new Map((project.elements ?? []).filter(element => element.kind === 'character').map(element => [element.id, element.assetId]))
  const mouthLoopByBlock = new Map<string, EditorV6ExportMouthLoops['states'][number]>()
  const mouthlessSourceAssetById = new Map<string, string>()
  const patchSourceCropByAssetId = new Map<string, NonNullable<EditorV6ExportMouthLoops['states'][number]['facePatchSourceCrop']>>()
  for (const state of mouthLoops?.states ?? []) {
    for (const blockId of state.blockIds) mouthLoopByBlock.set(`${state.elementId}:${blockId}`, state)
    if (state.facePatchSourceCrop) patchSourceCropByAssetId.set(state.assetId, state.facePatchSourceCrop)
    for (const [mode, baseAssetId] of Object.entries(state.baseAssetIds ?? {})) {
      if (baseAssetId) mouthlessSourceAssetById.set(baseAssetId, state.baseSourceAssetIds?.[mode as 'talk' | 'talk-blink'] ?? state.sourceAssetId ?? baseAssetId)
    }
  }

  const hairSourceAssetId = (element: { assetId?: string }) => element.assetId ? mouthlessSourceAssetById.get(element.assetId) ?? element.assetId : undefined
  const applyMouthLoop = (scene: Scene, frame: number) => {
    if (scene.intro || (!mouthLoops && !hairPoseReactionEnds.size)) return scene
    let sampleIndex: number | undefined
    const resolveElement = (element: Scene['elements'][number]) => {
      if (element.kind !== 'character' || !element.characterId) return element
      // Pose and preset share the baked sprite; mouth animation is held at 1x.
      // No extra per-sample face atlas is required during the transition.
      if (element.motionSprite) return element

      const reacting = hairMotionPoseReactionIsActive(hairPoseReactionEnds.get(element.id) ?? [], frame)
      if (!mouthLoops && !reacting) return element
      const faceMode = editorV6FaceModeAtFrame(project.timeline, element.characterId, frame, { blinking: scene.blinkElementId === element.id })
      if (faceMode !== 'talk' && faceMode !== 'talk-blink') {
        if (!reacting || faceMode !== 'blink') return element
        const block = editorV6ClipAtFrame(project.timeline, element.id, frame)?.block
        const idleAssetId = block?.state?.assetId ?? canonicalAssetIds.get(element.id)
        return idleAssetId ? { ...element, assetId: idleAssetId } : element
      }
      if (!mouthLoops) {
        const talkAssetId = reacting ? element.faceModeAssetIds?.talk : undefined
        return talkAssetId ? { ...element, assetId: talkAssetId } : element
      }
      const block = editorV6ClipAtFrame(project.timeline, element.id, frame)?.block
      const state = mouthLoopByBlock.get(`${element.id}:${block?.id ?? element.id}`)
      if (!state || state.characterId !== element.characterId) return element
      // Hold a single 1x sample with open eyes while rear hair settles.
      const mode = reacting ? 'talk' : faceMode
      if (!reacting && sampleIndex === undefined) {
        const scale = editorV6MouthLoopScaleAtFrame(frame, mouthLoops.startFrame, mouthLoops.cycleFrames)
        sampleIndex = Math.round((scale - 1) / (EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[2] - 1) * 2)
      }
      const motion = state.frames[reacting ? 0 : sampleIndex!] ?? state.frames[0]
      if (!motion?.facePatch) throw Error(`A camada facial de ${element.text || element.characterId} está incompleta; a exportação foi interrompida para evitar um vídeo sem animação de boca.`)
      const mouthlessAssetId = state.baseAssetIds?.[mode]
      return { ...element, ...(mouthlessAssetId ? { assetId: mouthlessAssetId } : {}), mouthPatch: { assetId: state.assetId, ...motion.facePatch } }
    }
    let elements: Scene['elements'] | undefined
    for (let index = 0; index < scene.elements.length; index++) {
      const element = resolveElement(scene.elements[index])
      if (element !== scene.elements[index]) {
        elements ??= scene.elements.slice()
        elements[index] = element
      }
    }
    return elements ? { ...scene, elements } : scene
  }

  return { applyMouthLoop, hairSourceAssetId, facePatchSourceCrop: (assetId: string) => patchSourceCropByAssetId.get(assetId) }
}
