import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'
import type { EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import { hairAppearanceStyleIds } from '../../../../shared/hairCategories'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer, EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import { measureFaceModeCrop } from './faceModeAssets'
import { editorV6ExportTestSettings } from '../../../../shared/editorV6ExportTestModes'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { createEditorV6HairPreparationReuse, editorV6HairFaceSurfaceKey } from './motion/hairPreparationReuse'
import { createEditorV6HairSourceBatch } from './motion/hairSourceBatch'
import type { GachaReusableMaterialCache } from '../../characters/preparedCharacterMaterials'
import { collectEditorV6HairMotionTargets } from './editorV6HairMotionTargets'
import { groupEditorV6HairMotionTargets } from './editorV6HairMotionGroups'
import { createEditorV6HairMotionBundleAssets } from './editorV6HairMotionBundleAssets'
import { createEditorV6ExportStageProfiler } from './editorV6ExportStageProfiler'
import { editorV6HairMotionCanvasDataUrl as canvasDataUrl } from './editorV6HairMotionCanvas'
import { prepareEditorV6HairMotionTransitions } from './editorV6HairMotionTransitions'

export { collectEditorV6HairMotionTargets, selectEditorV6HairTargetStates } from './editorV6HairMotionTargets'

/** Build disposable, export-only split character layers from the current saved character/catalog snapshots. */
export async function prepareEditorV6HairMotionBundle(
  project: EditorV6Document,
  presetSlot: number,
  preset: HairMotionPreset,
  exportOptions: EditorV6ExportOptions,
  isCancelled: () => boolean = () => false,
  diagnostics?: { onStage?: (stage: string, milliseconds: number) => void }
): Promise<EditorV6HairMotionBundle> {
  if (!Number.isInteger(presetSlot) || presetSlot < 1 || presetSlot > 5) throw Error('Selecione um preset de animação de cabelo válido.')
  const preparationStarted = performance.now()
  const testSettings = editorV6ExportTestSettings(exportOptions.testMode)
  const stageProfiler = createEditorV6ExportStageProfiler(diagnostics?.onStage)
  const recordStage = stageProfiler.record
  const reportStage = stageProfiler.report
  let stageStarted = performance.now()
  const targets = collectEditorV6HairMotionTargets(project, exportOptions)
  reportStage('collectTargets', stageStarted)
  if (!targets.length) throw Error('Este projeto ainda não tem personagens preparados para animar o cabelo.')
  stageStarted = performance.now()
  const characters = await window.desktop.customizer.listCustomizerCharacters()
  reportStage('loadCustomizerCharacters', stageStarted)
  if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
  const characterById = new Map(characters.map(character => [character.id, character]))
  const groups = groupEditorV6HairMotionTargets(targets, characterById)
  if (!groups.size) throw Error('Nenhum personagem usado neste projeto tem cabelo selecionado no Customizador.')

  const { surfaces, textures, motionTransitions, addSurface, addTexture, captureTransitionLayers } = createEditorV6HairMotionBundleAssets()
  const rigs: EditorV6HairMotionRig[] = []

  // One small material cache per current export preparation (bounded in the
  // renderer material loader). Share wardrobe/hair manifests across poses;
  // never reuse any characters/materials from an earlier export.
  const materialCache: GachaReusableMaterialCache = new Map()
  const currentExportReuse = createEditorV6HairPreparationReuse()
  const rawSources = createEditorV6HairSourceBatch(window.desktop.fabricator)
  const [{ prepareSavedCharacterRenderer, createPreparedGachaWardrobePair }, { loadCharacterTintedImage, resolvedHairColors }] = await Promise.all([
    import('../../characters/editorV6CharacterRenderer'), import('../../characters/characterRenderer')
  ])
  // Pose renderers are independent, while their source/material promises are
  // shared through the bounded export-local caches above. Prepare at most two
  // pose groups at once to overlap renderer construction without an unbounded
  // canvas/texture memory spike.
  await mapConcurrentItems([...groups.entries()], async ([groupKey, group]) => {
    if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
    const character = group.character
    let groupStageStarted = performance.now()
    const resolved = await resolveSavedCharacterSource(character, await rawSources.sourceFor(character))
    reportStage('resolveSavedCharacterSource', groupStageStarted)
    const appearance = character.customization.hairAppearance
    const references = appearance?.modelSlot === resolved.modelSlot ? hairAppearanceStyleIds(appearance) : []
    if (!references.length) return
    const styleIds = [...new Set(references.map(reference => reference.id))]
    groupStageStarted = performance.now()
    const loadedStyles = await Promise.all(styleIds.map(async id => [id, await currentExportReuse.loadStyle(resolved.modelSlot, id, () => window.desktop.fabricator.loadHairStyle(resolved.modelSlot, id))] as const))
    reportStage('loadHairStyles', groupStageStarted)
    const styles = new Map(loadedStyles)
    const sourceHeadPart = resolved.source.parts.find(part => /cabe[çc]a|head/i.test(part.name))
    const targetHeadPart = resolved.artwork.parts.find(part => part.id === sourceHeadPart?.id)
    if (!sourceHeadPart || !targetHeadPart) throw Error(`O modelo de ${character.name} não tem uma cabeça disponível para animar o cabelo.`)

    const hairless: CustomizerCharacter = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
    // Paint the wardrobe only once for the normal and hairless renderers
    // of THIS pose. Both compose their own character body buffers.
    const wardrobePair = createPreparedGachaWardrobePair()
    const renderSource = { source: resolved.source, artwork: resolved.sourceArtwork, assetProvider: window.desktop.fabricator, materialCache, wardrobePair }
    groupStageStarted = performance.now()
    const rendererResults = await Promise.allSettled([
      prepareSavedCharacterRenderer(character, renderSource),
      prepareSavedCharacterRenderer(hairless, renderSource)
    ])
    const rendererFailure = rendererResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rendererFailure) {
      for (const result of rendererResults) if (result.status === 'fulfilled') result.value.dispose()
      wardrobePair.clear()
      throw rendererFailure.reason
    }
    const [originalRenderer, hairlessRenderer] = rendererResults.map((result) => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>>).value)
    reportStage('prepareCharacterRenderers', groupStageStarted)
    try {
      groupStageStarted = performance.now()
      const descriptors: EditorV6HairMotionLayer[] = []
      for (const [index, reference] of references.entries()) {
        const style = styles.get(reference.id), original = style?.[reference.side], baseTransform = style?.transforms[reference.side]
        if (!original || !baseTransform) throw Error(`Não foi possível carregar a peça ${reference.part} do cabelo de ${character.name}.`)
        const override = character.customization.partOverrides?.[`head:${reference.part}`]
        if (override?.hidden) continue
        const transform = override ? {
          ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0),
          scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1),
          rotation: baseTransform.rotation + (override.rotation ?? 0)
        } : baseTransform
        const colors = resolvedHairColors(appearance, reference.part)
        const dataUrl = await currentExportReuse.prepareTexture(
          resolved.modelSlot, reference.id, reference.side, reference.part, colors,
          async () => {
            if (!Object.keys(colors).length) return original.dataUrl
            const tinted = await loadCharacterTintedImage(original.dataUrl, colors)
            const canvas = document.createElement('canvas'); canvas.width = tinted.naturalWidth; canvas.height = tinted.naturalHeight
            const context = canvas.getContext('2d')
            if (!context) throw Error('Não foi possível recolorir uma camada de cabelo para a exportação.')
            try {
              context.drawImage(tinted, 0, 0)
              return canvasDataUrl(canvas)
            } finally { canvas.width = canvas.height = 1 }
          }
        )
        descriptors.push({
          id: `${reference.part}:${index}`,
          textureId: addTexture(`${character.id}:${reference.id}:${reference.side}:${reference.part}`, dataUrl),
          side: reference.side, width: original.width, height: original.height,
          x: transform.x * targetHeadPart.width / sourceHeadPart.width - targetHeadPart.width / 2,
          y: transform.y * targetHeadPart.height / sourceHeadPart.height - targetHeadPart.height / 2,
          scaleX: transform.scaleX * targetHeadPart.width / sourceHeadPart.width,
          scaleY: transform.scaleY * targetHeadPart.height / sourceHeadPart.height,
          rotation: transform.rotation, flipX: Boolean(transform.flipX),
          phase: index * 1.2 + (reference.side === 'back' ? 0 : 1.2)
        })
      }
      if (!descriptors.length) return
      reportStage('prepareHairLayers', groupStageStarted)

      const poseSurfaceKey = JSON.stringify([groupKey, character.updatedAt, appearance?.modelSlot, appearance?.parts, character.customization.partOverrides])
      let baseSurfaceId: string | undefined
      const cropByFace = new Map<string, { left: number; top: number; width: number; height: number }>()
      // Only immutable encoded face PNGs are reusable within this pose.
      const faceSurfacesByInput = new Map<string, string>()
      const overlaySurfacesByInput = new Map<string, string | null>()
      const eyesSurfacesByInput = new Map<string, string | null>()
      let preparedGeometry: Pick<EditorV6HairMotionRig, 'artworkWidth' | 'artworkHeight' | 'outputWidth' | 'outputHeight' | 'shapeScaleX' | 'shapeScaleY'> | undefined
      for (const target of group.targets) {
        if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
        const state = target.state
        const currentAppearance = state.faceAppearance ?? state.expressionBase?.appearance ?? character.customization.faceAppearance
        const faceTransforms = state.faceTransforms ?? state.expressionBase?.transforms
        const effects = state.activeExpressionEffects
        const mode = target.faceMode
        const hideMouthForExportLoop = Boolean(exportOptions.mouthLoop && (mode === 'talk' || mode === 'talk-blink') && hairlessRenderer.canIsolateMouth(currentAppearance))
        const faceKey = JSON.stringify([currentAppearance, faceTransforms, effects])
        const faceRenderKey = editorV6HairFaceSurfaceKey(faceKey, mode, hideMouthForExportLoop)
        const poseKey = JSON.stringify([poseSurfaceKey, state.poseSlot, sourceHeadPart.width, sourceHeadPart.height, targetHeadPart.x, targetHeadPart.y, targetHeadPart.width, targetHeadPart.height, targetHeadPart.rotation])
        const faceSurfaceKey = JSON.stringify([poseKey, faceRenderKey])
        const existingFaceSurfaceId = faceSurfacesByInput.get(faceSurfaceKey)
        const hasOverlaySurface = overlaySurfacesByInput.has(faceSurfaceKey)
        const hasEyesSurface = eyesSurfacesByInput.has(faceSurfaceKey)
        let sourceCrop = cropByFace.get(faceKey)
        groupStageStarted = performance.now()
        const [originalFrame, splitFrame] = await Promise.all([
          sourceCrop ? Promise.resolve(null) : originalRenderer.renderToCanvas(currentAppearance, faceTransforms, effects, mode),
          existingFaceSurfaceId && hasOverlaySurface && hasEyesSurface ? Promise.resolve(null) : hairlessRenderer.renderLayersToCanvas(currentAppearance, faceTransforms, effects, mode, hideMouthForExportLoop ? { mouthLayer: 'without-mouth' } : undefined)
        ])
        reportStage('renderHairlessFaceTarget', groupStageStarted)
        if (!sourceCrop) {
          // Snapshots use the union of face modes, not the bounds of one frame.
          const cropStarted = performance.now()
          const crop = await measureFaceModeCrop(character.name, originalRenderer, currentAppearance, faceTransforms, effects, mode, originalFrame!, testSettings.encodeFaceCropPng)
          sourceCrop = crop ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height }
            : { left: 0, top: 0, width: originalFrame!.width, height: originalFrame!.height }
          cropByFace.set(faceKey, sourceCrop)
          reportStage('measureFaceModeCrop', cropStarted)
        }
        if (splitFrame) {
          preparedGeometry ??= {
            artworkWidth: splitFrame.width, artworkHeight: splitFrame.height,
            outputWidth: splitFrame.outputWidth, outputHeight: splitFrame.outputHeight,
            shapeScaleX: splitFrame.shapeScaleX, shapeScaleY: splitFrame.shapeScaleY
          }
          baseSurfaceId ??= addSurface(`${poseKey}:base`, canvasDataUrl(splitFrame.behindFace))
          if (!hasOverlaySurface) {
            const overlayDataUrl = splitFrame.inFrontOfFace ? canvasDataUrl(splitFrame.inFrontOfFace) : null
            overlaySurfacesByInput.set(faceSurfaceKey, overlayDataUrl ? addSurface(`${poseKey}:${faceRenderKey}:overlay`, overlayDataUrl) : null)
          }
          if (!hasEyesSurface) {
            const eyesDataUrl = splitFrame.eyesAboveRearHair ? canvasDataUrl(splitFrame.eyesAboveRearHair) : null
            eyesSurfacesByInput.set(faceSurfaceKey, eyesDataUrl ? addSurface(`${poseKey}:${faceRenderKey}:raised-eyes`, eyesDataUrl) : null)
          }
        }
        if (!baseSurfaceId || !preparedGeometry) throw Error('A camada estática do personagem não foi preparada.')
        let faceSurfaceId = existingFaceSurfaceId
        if (!faceSurfaceId) {
          if (!splitFrame) throw Error('A camada do rosto não foi preparada.')
          groupStageStarted = performance.now()
          faceSurfaceId = addSurface(`${poseKey}:face:${target.assetId}`, canvasDataUrl(splitFrame.face))
          faceSurfacesByInput.set(faceSurfaceKey, faceSurfaceId)
          reportStage('serializeFaceSurface', groupStageStarted)
        }
        const overlaySurfaceId = overlaySurfacesByInput.get(faceSurfaceKey) ?? null
        const eyesAboveRearHairSurfaceId = eyesSurfacesByInput.get(faceSurfaceKey) ?? null
        rigs.push({
          elementId: target.elementId, assetId: target.assetId, characterId: target.state.characterId!,
          poseSlot: character.customization.poseSlot ?? null,
          baseSurfaceId, faceSurfaceId, eyesAboveRearHairSurfaceId: eyesAboveRearHairSurfaceId ?? null, overlaySurfaceId: overlaySurfaceId ?? null,
          ...preparedGeometry,
          sourceCrop, sourceHead: { width: sourceHeadPart.width, height: sourceHeadPart.height },
          targetHead: { x: targetHeadPart.x, y: targetHeadPart.y, width: targetHeadPart.width, height: targetHeadPart.height, rotation: targetHeadPart.rotation },
          layers: descriptors
        })
      }
    } finally { originalRenderer.dispose(); hairlessRenderer.dispose(); wardrobePair.clear() }
  }, isCancelled, 2)
  if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
  materialCache.clear()
  currentExportReuse.clear()
  rawSources.clear()
  if (!rigs.length) throw Error('Nenhum personagem do projeto tem uma camada de cabelo visível para animar.')

  await prepareEditorV6HairMotionTransitions({
    project, rigs, characterById, exportOptions, isCancelled, fabricator: window.desktop.fabricator,
    recordStage, captureTransitionLayers
  })
  const totalDataUrlCharacters = [...surfaces, ...textures].reduce((sum, item) => sum + item.dataUrl.length, 0)
  if (totalDataUrlCharacters > 96_000_000) throw Error('As poses sem cabelo preparadas para a animação excedem o limite seguro de memória da exportação. Desative o preset experimental ou reduza o número de transições no trecho.')
  const preparationProfile = { totalMilliseconds: performance.now() - preparationStarted,
    stages: stageProfiler.snapshot(),
    counts: { surfaces: surfaces.length, textures: textures.length, rigs: rigs.length, motionTransitions: motionTransitions.length, encodedCharacters: totalDataUrlCharacters } }
  return { presetSlot, preset, preparationProfile, ...(exportOptions.hairAnimationLoopFrames ? { loopFrames: exportOptions.hairAnimationLoopFrames } : {}), ...(exportOptions.hairPoseReactionOnly ? { poseReactionOnly: true } : {}), ...(exportOptions.hairPosteriorOnly ? { posteriorOnly: true } : {}), surfaces, textures, rigs, motionTransitions }
}
