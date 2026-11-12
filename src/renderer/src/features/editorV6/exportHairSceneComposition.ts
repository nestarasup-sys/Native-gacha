import type { EditorV6Asset } from '../../../../shared/editorV6'
import type { EditorV6FrameMetrics, EditorV6FrameTimings, EditorV6WorkerPayload } from '../../../../shared/editorV6Export'
import { interpolateEditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { expandEditorV6HairCrop } from './editorV6HairMotionGeometry'
import type { createEditorV6ExportHairFrameComposer } from './exportHairFrameComposer'
import type { createEditorV6ExportHairMotionPlanIndex } from './exportHairMotionPlanIndex'
import type { createEditorV6ExportHairRigAtFrame } from './exportHairRigAtFrame'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]
type HairPlanIndex = ReturnType<typeof createEditorV6ExportHairMotionPlanIndex>
type HairRigAtFrame = ReturnType<typeof createEditorV6ExportHairRigAtFrame>['hairRigAtFrame']
type HairFrameComposer = ReturnType<typeof createEditorV6ExportHairFrameComposer>
type HairAnimation = EditorV6WorkerPayload['hairAnimation']

type Options = {
  animation?: HairAnimation
  planIndex: HairPlanIndex
  hairRigAtFrame: HairRigAtFrame
  hairSourceAssetId: (element: Pick<SceneElement, 'assetId'>) => string | undefined
  facePatchSourceCrop?: (assetId: string) => { left: number; top: number; width: number; height: number } | undefined
  composeHairFrame: HairFrameComposer['composeHairFrame']
  composeMotionHairFrame: HairFrameComposer['composeMotionHairFrame']
}

type ComposeInput = {
  composedScene: Scene
  originalElements: ReadonlyMap<string, SceneElement>
  frame: number
  activeHair: boolean
  riggedElementIds: ReadonlySet<string>
  assetsById: Map<string, EditorV6Asset>
  renderAssetsById: Map<string, EditorV6Asset>
  hairSurfaceDataById: ReadonlyMap<string, string>
  timings: EditorV6FrameTimings
  metrics: EditorV6FrameMetrics
}

const HAIR_DETAIL_KEYS = ['hairMotionStateMs', 'hairLayerDrawMs', 'hairSurfaceComposeMs', 'hairCanvasClearMs', 'hairRigInterpolationMs', 'hairMeshContextCheckMs', 'hairMeshStateSetupMs', 'hairMeshPositionMs', 'hairMeshUploadMs', 'hairMeshTextureUploadMs', 'hairMeshDrawMs', 'hairCanvasBlitMs'] as const

/** Resolves which characters need raster hair and composes their export-frame surfaces. */
export function createEditorV6ExportHairSceneComposer(options: Options) {
  const { animation, planIndex, hairRigAtFrame, hairSourceAssetId } = options
  const patchSourceCrop = options.facePatchSourceCrop ?? (() => undefined)
  const { hairRigs, expressionOnlyPlansByElement, hairTransitionIndex } = planIndex

  const hasAnimatedHair = (element: SceneElement, frame: number): boolean => element.kind === 'character' && Boolean(
    element.motionSprite
      ? !animation?.poseReactionOnly && Boolean(hairRigAtFrame(element, frame)?.rig.layers.length)
      : hairSourceAssetId(element) && (hairRigs.get(`${element.id}:${hairSourceAssetId(element)}`)?.layers.length ?? 0) > 0
  )

  const compose = ({ composedScene, originalElements, frame, activeHair, riggedElementIds, assetsById, renderAssetsById, hairSurfaceDataById, timings, metrics }: ComposeInput) => {
    let renderScene = composedScene
    const rasterCanvases = new Map<string, HTMLCanvasElement>()
    if (!activeHair) return { renderScene, rasterCanvases }

    const started = performance.now()
    const detailBefore = Object.fromEntries(HAIR_DETAIL_KEYS.map(key => [key, timings[key] ?? 0])) as Record<typeof HAIR_DETAIL_KEYS[number], number>
    const animatedElements: typeof composedScene.elements = []

    for (const element of composedScene.elements) {
      if (!riggedElementIds.has(element.id)) { animatedElements.push(element); continue }
      const original = originalElements.get(element.id)
      if (!original) { animatedElements.push(element); continue }
      if (original.motionSprite) {
        const indexed = hairTransitionIndex.get(original.id, frame)
        const transition = indexed?.transition
        const transitionFrame = indexed?.atlasFrame
        const poseSample = indexed?.poseSample
        if (!transition?.from || !transition.to || !transitionFrame || !poseSample || !transition.atlas) {
          const expressionPlan = expressionOnlyPlansByElement.get(original.id)?.find(plan => frame > plan.startFrame && frame < plan.endFrame)
          const resolvedHairRig = expressionPlan ? hairRigAtFrame(original, frame) : undefined
          const rig = resolvedHairRig?.rig
          if (!rig) { animatedElements.push(element); continue }
          rasterCanvases.set(element.id, options.composeHairFrame(rig, resolvedHairRig.element, frame, timings, metrics))
          const geometry = expandEditorV6HairCrop(original, { width: rig.outputWidth, height: rig.outputHeight }, rig.sourceCrop)
          const patch = original.mouthPatch
          const patchCrop = patch ? patchSourceCrop(patch.assetId) ?? rig.sourceCrop : rig.sourceCrop
          const mouthPatch = patch ? {
            ...patch,
            x: (patchCrop.left + patch.x * patchCrop.width) / rig.outputWidth,
            y: (patchCrop.top + patch.y * patchCrop.height) / rig.outputHeight,
            width: patch.width * patchCrop.width / rig.outputWidth,
            height: patch.height * patchCrop.height / rig.outputHeight
          } : undefined
          animatedElements.push({ ...element, assetId: undefined, motionSprite: undefined, ...geometry, mouthPatch })
          continue
        }

        const rigInterpolationStarted = performance.now()
        const rig = interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(poseSample.progress))
        timings.hairRigInterpolationMs = (timings.hairRigInterpolationMs ?? 0) + performance.now() - rigInterpolationStarted
        rasterCanvases.set(element.id, options.composeMotionHairFrame(element.id, rig, original, frame, { atlas: transition.atlas }, transitionFrame, timings, metrics))
        let mouthPatch: typeof element.mouthPatch = undefined
        if (transitionFrame.facePatch && transition.atlas.faceAtlasSurfaceId) {
          const faceSurfaceId = transition.atlas.faceAtlasSurfaceId
          let faceAsset = assetsById.get(faceSurfaceId)
          if (!faceAsset) {
            const dataUrl = hairSurfaceDataById.get(faceSurfaceId)
            if (!dataUrl) throw Error('A exportação perdeu as expressões faciais da troca de pose.')
            faceAsset = { id: faceSurfaceId, category: 'character', name: `${element.text || 'Personagem'} · rosto da transição`, mimeType: 'image/png', dataUrl, timelineSnapshot: true }
            assetsById.set(faceSurfaceId, faceAsset)
          }
          // Re-register the cached face atlas for this frame after the render asset view is rebuilt.
          renderAssetsById.set(faceSurfaceId, faceAsset)
          mouthPatch = { assetId: faceSurfaceId, ...transitionFrame.facePatch }
        }
        const crop = transitionFrame.crop
        const geometryStarted = performance.now()
        const geometry = expandEditorV6HairCrop({ ...element, ...transitionFrame }, { width: rig.outputWidth, height: rig.outputHeight }, crop)
        if (mouthPatch) mouthPatch = { ...mouthPatch, x: (crop.left + mouthPatch.x * crop.width) / rig.outputWidth, y: (crop.top + mouthPatch.y * crop.height) / rig.outputHeight, width: mouthPatch.width * crop.width / rig.outputWidth, height: mouthPatch.height * crop.height / rig.outputHeight }
        timings.hairRigInterpolationMs = (timings.hairRigInterpolationMs ?? 0) + performance.now() - geometryStarted
        animatedElements.push({ ...element, assetId: undefined, motionSprite: undefined, ...geometry, rotation: transitionFrame.rotation, flipX: transitionFrame.flipX, mouthPatch })
        continue
      }

      const sourceAssetId = hairSourceAssetId(original)
      const rig = sourceAssetId ? hairRigs.get(`${element.id}:${sourceAssetId}`) : undefined
      if (!rig) { animatedElements.push(element); continue }
      rasterCanvases.set(element.id, options.composeHairFrame(rig, original, frame, timings, metrics))
      const geometry = expandEditorV6HairCrop(original, { width: rig.outputWidth, height: rig.outputHeight }, rig.sourceCrop)
      const patch = original.mouthPatch
      const patchCrop = patch ? patchSourceCrop(patch.assetId) ?? rig.sourceCrop : rig.sourceCrop
      const mouthPatch = patch ? {
        ...patch,
        x: (patchCrop.left + patch.x * patchCrop.width) / rig.outputWidth,
        y: (patchCrop.top + patch.y * patchCrop.height) / rig.outputHeight,
        width: patch.width * patchCrop.width / rig.outputWidth,
        height: patch.height * patchCrop.height / rig.outputHeight
      } : undefined
      animatedElements.push({ ...element, ...geometry, assetId: undefined, mouthPatch })
    }

    renderScene = { ...composedScene, elements: animatedElements }
    timings.hairCompositionMs = performance.now() - started
    const instrumented = HAIR_DETAIL_KEYS.reduce((total, key) => total + (timings[key] ?? 0) - detailBefore[key], 0)
    timings.hairCompositionOtherMs = Math.max(0, timings.hairCompositionMs - instrumented)
    return { renderScene, rasterCanvases }
  }

  return { hasAnimatedHair, compose }
}
