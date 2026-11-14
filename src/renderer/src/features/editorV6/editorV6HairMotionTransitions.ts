import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import type { EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import { editorV6MotionChangesHairGeometry, editorV6MotionHasCompleteFaceAtlas, editorV6MotionPlans, type EditorV6MotionBakeResult } from '../../../../shared/editorV6Motion'
import type { EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { createEditorV6HairBakeBatch, editorV6HairBakeContentKey, selectEditorV6HairlessTransitionBakes } from './motion/hairBakeBatch'
import { createEditorV6HairMotionBundleAssets, type EditorV6SerializedMotionLayerAtlas } from './editorV6HairMotionBundleAssets'
import { editorV6HairMotionCanvasDataUrl } from './editorV6HairMotionCanvas'

type CaptureTransitionLayers = ReturnType<typeof createEditorV6HairMotionBundleAssets>['captureTransitionLayers']
type HairTransitionBake = {
  result: Pick<EditorV6MotionBakeResult, 'faceAsset'>
  layerCapture: EditorV6SerializedMotionLayerAtlas
}

/** Prepares the hairless motion atlases needed to keep hair continuous through pose changes. */
export async function prepareEditorV6HairMotionTransitions({
  project, rigs, characterById, exportOptions, isCancelled, fabricator, recordStage, captureTransitionLayers
}: {
  project: EditorV6Document
  rigs: readonly EditorV6HairMotionRig[]
  characterById: ReadonlyMap<string, CustomizerCharacter>
  exportOptions: EditorV6ExportOptions
  isCancelled: () => boolean
  fabricator: typeof window.desktop.fabricator
  recordStage: (stage: string, milliseconds: number) => void
  captureTransitionLayers: CaptureTransitionLayers
}): Promise<void> {
  const rigByEndpoint = new Map(rigs.map(rig => [`${rig.elementId}:${rig.assetId}`, rig]))
  const motionBlocks = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  const exportMotionPlans = editorV6MotionPlans(project, { includeSpeechMouth: true }).filter(plan => motionBlocks.get(plan.blockId)?.incomingMotion?.key === plan.key)
  const relevantPlans = selectEditorV6HairlessTransitionBakes(exportMotionPlans, exportOptions, plan => {
    if (editorV6MotionChangesHairGeometry(plan)) return true
    return !editorV6MotionHasCompleteFaceAtlas(plan, motionBlocks.get(plan.blockId)?.incomingMotion)
  })
  if (!relevantPlans.length) return

  const { bakeEditorV6Motion, createEditorV6BakeSession } = await import('./motion/bakeMotion')
  // Reuse renderer material/provider caches only within this export's transition batch.
  const transitionSession = createEditorV6BakeSession(fabricator)
  const hairBakeBatch = createEditorV6HairBakeBatch<HairTransitionBake>()
  const preparedTransitions = await mapConcurrentItems(relevantPlans, async (plan) => {
    if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
    const character = characterById.get(plan.characterId)
    if (!character?.customization.hairAppearance) return undefined
    const fromRig = plan.from.assetId ? rigByEndpoint.get(`${plan.elementId}:${plan.from.assetId}`) : undefined
    const toRig = plan.to.assetId ? rigByEndpoint.get(`${plan.elementId}:${plan.to.assetId}`) : undefined
    if (!fromRig || !toRig) throw Error(`Não foi possível preparar o cabelo durante a troca de pose de ${plan.from.text || character.name}.`)
    // Pose and facial preset interpolate together. The static talk face is
    // baked at native scale; the cyclic mouth overlay resumes after motion.
    // Identical hairless transitions share results only within this export.
    const bakeKey = editorV6HairBakeContentKey({
      planKey: plan.key,
      characterId: character.id,
      characterRevision: character.updatedAt,
      source: character.customization,
      fromCrop: fromRig.sourceCrop,
      toCrop: toRig.sourceCrop,
      fromDimensions: [fromRig.outputWidth, fromRig.outputHeight],
      toDimensions: [toRig.outputWidth, toRig.outputHeight]
    })
    const prepared = await hairBakeBatch.run(bakeKey, async () => {
      // Build this snapshot only for a real bake; reused transitions share
      // the result and do not need another character/customization clone.
      const hairlessCharacter: CustomizerCharacter = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
      let layerCapture: EditorV6SerializedMotionLayerAtlas | undefined
      const bakeStarted = performance.now()
      const result = await bakeEditorV6Motion({
        id: crypto.randomUUID(), plan, character: hairlessCharacter
      }, fabricator, transitionSession, capture => {
        // The baker releases its canvases after callback return. Serialize
        // synchronously before crossing the await boundary.
        layerCapture = {
          frames: capture.frames,
          behindFaceDataUrl: editorV6HairMotionCanvasDataUrl(capture.behindFace),
          faceDataUrl: editorV6HairMotionCanvasDataUrl(capture.face),
          eyesAboveRearHairDataUrl: capture.eyesAboveRearHair ? editorV6HairMotionCanvasDataUrl(capture.eyesAboveRearHair) : null,
          inFrontOfFaceDataUrl: capture.inFrontOfFace ? editorV6HairMotionCanvasDataUrl(capture.inFrontOfFace) : null
        }
      }, {
        from: { ...fromRig.sourceCrop, outputWidth: fromRig.outputWidth, outputHeight: fromRig.outputHeight },
        to: { ...toRig.sourceCrop, outputWidth: toRig.outputWidth, outputHeight: toRig.outputHeight }
      })
      recordStage('bakeHairlessMotionTransition', performance.now() - bakeStarted)
      if (!layerCapture) throw Error(`Não foi possível capturar as camadas sem cabelo da transição de ${character.name}.`)
      // Hair-motion composition consumes only the optional face atlas and the
      // independently captured layers. Do not retain the full motion PNG (or
      // mouthless snapshots) for every transition in this export batch.
      return { result: { faceAsset: result.faceAsset }, layerCapture }
    })
    if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
    return { plan, ...prepared }
  }, isCancelled, 2).finally(() => {
    hairBakeBatch.clear()
    transitionSession.materials.clear()
  })
  for (const transition of preparedTransitions) {
    if (!transition) continue
    captureTransitionLayers(transition.plan, transition.result, transition.layerCapture)
  }
}
