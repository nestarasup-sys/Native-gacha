import type { EditorV6Element } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../../../shared/editorV6Motion'
import { unionMotionCrops as unionCrop, type MotionPixelCrop as Crop } from './motionPixelAnalysis'
import { createTransparentMotionPatch } from './motionCanvasRegions'
import { prepareEditorV6MouthlessBaseAssets } from './motionMouthlessBaseAssets'
import { buildEditorV6IsolatedMouthAtlas } from './motionIsolatedMouthAtlas'
import { detectEditorV6LegacyMouthBounds } from './motionLegacyMouthBounds'
import { buildEditorV6LegacyMouthAtlas } from './motionLegacyMouthAtlas'
import type { EditorV6MotionFrameRenderer } from './motionFrameRenderer'
import type { createEditorV6MotionRigPreparer } from './motionRigPreparation'

type MotionRigMetrics = ReturnType<ReturnType<typeof createEditorV6MotionRigPreparer>['metrics']>

type Dependencies = {
  request: EditorV6MotionBakeRequest
  from: EditorV6Element
  to: EditorV6Element
  samePose: boolean
  captureLayerAtlases: boolean
  render: EditorV6MotionFrameRenderer
  elapsedMilliseconds: () => number
  rigMetrics: () => MotionRigMetrics
  prepareMouthlessBaseAssets?: typeof prepareEditorV6MouthlessBaseAssets
  buildIsolatedMouthAtlas?: typeof buildEditorV6IsolatedMouthAtlas
  detectLegacyMouthBounds?: typeof detectEditorV6LegacyMouthBounds
  buildLegacyMouthAtlas?: typeof buildEditorV6LegacyMouthAtlas
  createCanvas?: () => HTMLCanvasElement
  createTransparentPatch?: typeof createTransparentMotionPatch
}

/** Handles the single-pose speech path and its isolated/legacy mouth implementations. */
export async function bakeEditorV6StaticMouthLoop({
  request,
  from,
  to,
  samePose,
  captureLayerAtlases,
  render,
  elapsedMilliseconds,
  rigMetrics,
  prepareMouthlessBaseAssets = prepareEditorV6MouthlessBaseAssets,
  buildIsolatedMouthAtlas = buildEditorV6IsolatedMouthAtlas,
  detectLegacyMouthBounds = detectEditorV6LegacyMouthBounds,
  buildLegacyMouthAtlas = buildEditorV6LegacyMouthAtlas,
  createCanvas = () => document.createElement('canvas'),
  createTransparentPatch = createTransparentMotionPatch
}: Dependencies): Promise<EditorV6MotionBakeResult | null> {
  const scales = request.mouthScaleSamples
  if (captureLayerAtlases || !scales || !samePose || JSON.stringify(from) !== JSON.stringify(to)
    || !request.plan.samples.every((sample) => sample.faceMode === from.activeFaceMode)) return null

  const baseline = await render(0, from.activeFaceMode, 1, true)
  if (baseline.mouthCanvas && baseline.mouthCrop) {
    const { sourceCrop, isolatedBaseline, assets: mouthlessBaseAssets } = await prepareMouthlessBaseAssets({ from, baseline, render })
    const isolatedPatches: Array<{ canvas: HTMLCanvasElement; crop: Crop }> = []
    let mouthAtlas: HTMLCanvasElement | undefined
    try {
      const baselineMouthCrop = isolatedBaseline.mouthCrop!
      isolatedPatches.push({ canvas: createTransparentPatch(isolatedBaseline.mouthCanvas!, baselineMouthCrop), crop: baselineMouthCrop })
      for (let index = 1; index < scales.length; index++) {
        const comparison = await render(0, from.activeFaceMode, scales[index], index === scales.length - 1, baseline.renderer)
        try {
          if (!comparison.mouthCanvas || !comparison.mouthCrop) throw Error('Não foi possível isolar a peça da boca para o ciclo de fala.')
          if (index === scales.length - 1 && comparison.mouthCrop.fingerprint === baselineMouthCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
          isolatedPatches.push({ canvas: createTransparentPatch(comparison.mouthCanvas, comparison.mouthCrop), crop: comparison.mouthCrop })
        } finally { comparison.dispose() }
      }
      const mouthUnion = isolatedPatches.reduce((bounds, patch) => unionCrop(bounds, patch.crop), isolatedPatches[0].crop)
      for (const patch of isolatedPatches) {
        const normalized = createCanvas()
        normalized.width = mouthUnion.width + 4
        normalized.height = mouthUnion.height + 4
        const normalizedContext = normalized.getContext('2d')!
        normalizedContext.drawImage(patch.canvas, 2, 2, patch.crop.width, patch.crop.height,
          2 + patch.crop.left - mouthUnion.left, 2 + patch.crop.top - mouthUnion.top, patch.crop.width, patch.crop.height)
        patch.canvas.width = patch.canvas.height = 1
        patch.canvas = normalized
        patch.crop = mouthUnion
      }
      const packed = buildIsolatedMouthAtlas({
        patches: isolatedPatches,
        sampleOffsets: request.plan.samples.map((sample) => sample.offset),
        sourceCrop,
        key: request.plan.key,
        rotation: from.rotation,
        flipX: Boolean(from.flipX),
        maxAtlasPixels: request.maxAtlasPixels
      })
      mouthAtlas = packed.atlas
      const count = request.plan.samples.length
      return {
        asset: packed.asset,
        assetRole: 'face-atlas', mouthIsolationMode: 'isolated-piece', mouthlessBaseAssets,
        motion: packed.motion,
        metrics: { milliseconds: elapsedMilliseconds(), ...rigMetrics(), samples: count, atlasPixels: packed.atlasPixels }
      }
    } finally {
      isolatedPatches.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
      if (mouthAtlas) mouthAtlas.width = mouthAtlas.height = 1
      baseline.dispose()
      isolatedBaseline.dispose()
    }
  }

  const { sourceCrop, changedBounds } = await detectLegacyMouthBounds({ baseline, scales, faceMode: from.activeFaceMode, render })
  const packed = await buildLegacyMouthAtlas({
    sourceCrop,
    changedBounds,
    samples: request.plan.samples,
    scales,
    from,
    key: request.plan.key,
    maxAtlasPixels: request.maxAtlasPixels,
    render: (faceMode, mouthScale) => render(0, faceMode, mouthScale)
  })
  return {
    asset: packed.asset,
    assetRole: 'face-atlas', mouthIsolationMode: 'legacy-patch', motion: packed.motion,
    metrics: { milliseconds: elapsedMilliseconds(), preparedRigs: rigMetrics().preparedRigs, reusedRigs: rigMetrics().reusedRigs, samples: request.plan.samples.length, atlasPixels: packed.atlasPixels }
  }
}
