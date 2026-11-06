import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, type EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import { editorV6MotionChangesHairGeometry, editorV6MotionHasCompleteFaceAtlas, editorV6MotionPlans, type EditorV6MotionBakeResult, type EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import { hairAppearanceStyleIds } from '../../../../shared/hairCategories'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer, EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import type { EditorV6MotionLayerAtlasCapture } from './motion/bakeMotion'
import { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import { measureFaceModeCrop } from './faceModeAssets'
import { editorV6ExportTestSettings } from '../../../../shared/editorV6ExportTestModes'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { createEditorV6HairBakeBatch, editorV6HairBakeContentKey, selectEditorV6HairlessTransitionBakes } from './motion/hairBakeBatch'
import { createEditorV6HairPreparationReuse, editorV6HairFaceSurfaceKey } from './motion/hairPreparationReuse'
import { createEditorV6HairSourceBatch } from './motion/hairSourceBatch'
import type { GachaReusableMaterialCache } from '../../characters/preparedCharacterMaterials'

type MotionTarget = { elementId: string; state: EditorV6Element; assetId: string; faceMode: EditorV6FaceRenderMode }

function faceMode(value: EditorV6Element['activeFaceMode']): EditorV6FaceRenderMode {
  return value === 'blink' || value === 'talk' ? value : 'idle'
}

function targetsForState(elementId: string, state: EditorV6Element): MotionTarget[] {
  if (state.kind !== 'character' || !state.characterId || !state.assetId) return []
  const targets: MotionTarget[] = [{ elementId, state, assetId: state.assetId, faceMode: faceMode(state.activeFaceMode) }]
  for (const [mode, assetId] of Object.entries(state.faceModeAssetIds ?? {})) {
    if (!assetId || !['idle', 'blink', 'talk', 'talk-blink'].includes(mode)) continue
    targets.push({ elementId, state, assetId, faceMode: mode as EditorV6FaceRenderMode })
  }
  return targets
}

/**
 * Keep the historical full-document behavior for calls without an export range.
 * For an MP4 range, the initial scene is always retained (legacy fallback),
 * while only timeline states whose *effective* interval touches the export
 * are prepared. Character states hold until the next character state, even
 * if an older file has a short stored durationFrames. Consequently an
 * in-progress transition still has BOTH its endpoint portraits.
 *
 * No written timeline or snapshot is ever changed by this selection.
 */
export function selectEditorV6HairTargetStates(
  project: EditorV6Document,
  range?: Readonly<{ startFrame: number; endFrame: number }>
): EditorV6Element[] {
  const states: EditorV6Element[] = [...project.elements]
  for (const track of project.timeline.tracks) {
    if (!range) {
      for (const block of track.blocks) if (block.state) states.push(block.state)
      continue
    }
    const blocks = track.kind === 'character'
      ? [...track.blocks].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))
      : track.blocks
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      if (!block.state || block.startFrame >= range.endFrame) continue
      const end = track.kind === 'character'
        ? blocks[index + 1]?.startFrame ?? project.timeline.durationFrames
        : block.startFrame + block.durationFrames
      if (end > range.startFrame) states.push(block.state)
    }
  }
  return states
}

export function collectEditorV6HairMotionTargets(
  project: EditorV6Document,
  range?: Readonly<{ startFrame: number; endFrame: number }>
): MotionTarget[] {
  const targets = new Map<string, MotionTarget>()
  const states = selectEditorV6HairTargetStates(project, range)
  for (const state of states) {
    for (const target of targetsForState(state.id, state)) {
      const key = `${target.elementId}:${target.assetId}`
      const existing = targets.get(key)
      if (existing && existing.state.characterId !== target.state.characterId) throw Error('Um retrato do Editor V6 está associado a mais de um personagem.')
      if (!existing) targets.set(key, target)
    }
  }
  return [...targets.values()]
}

function canvasDataUrl(canvas: HTMLCanvasElement): string {
  if (!canvas.width || !canvas.height) throw Error('Uma camada do personagem ficou vazia ao preparar a animação de cabelo.')
  return canvas.toDataURL('image/png')
}

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
  const stageStats = new Map<string, { samples: number; totalMilliseconds: number; maxMilliseconds: number }>()
  const recordStage = (stage: string, milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return
    const current = stageStats.get(stage) ?? { samples: 0, totalMilliseconds: 0, maxMilliseconds: 0 }
    current.samples += 1
    current.totalMilliseconds += milliseconds
    current.maxMilliseconds = Math.max(current.maxMilliseconds, milliseconds)
    stageStats.set(stage, current)
    diagnostics?.onStage?.(stage, milliseconds)
  }
  const reportStage = (stage: string, started: number) => recordStage(stage, performance.now() - started)
  let stageStarted = performance.now()
  const targets = collectEditorV6HairMotionTargets(project, exportOptions)
  reportStage('collectTargets', stageStarted)
  if (!targets.length) throw Error('Este projeto ainda não tem personagens preparados para animar o cabelo.')
  stageStarted = performance.now()
  const characters = await window.desktop.customizer.listCustomizerCharacters()
  reportStage('loadCustomizerCharacters', stageStarted)
  if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
  const characterById = new Map(characters.map(character => [character.id, character]))
  const groups = new Map<string, { character: CustomizerCharacter; targets: MotionTarget[] }>()
  for (const target of targets) {
    const character = characterById.get(target.state.characterId!)
    if (!character || !character.customization.hairAppearance) continue
    const poseSlot = target.state.poseSlot === undefined ? character.customization.poseSlot : target.state.poseSlot
    const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot } }
    const key = `${character.id}:${poseSlot ?? 'base'}`
    const group = groups.get(key) ?? { character: characterCopy, targets: [] }
    group.targets.push(target)
    groups.set(key, group)
  }
  if (!groups.size) throw Error('Nenhum personagem usado neste projeto tem cabelo selecionado no Customizador.')

  const surfaces: EditorV6HairMotionBundle['surfaces'] = []
  const textures: EditorV6HairMotionBundle['textures'] = []
  const rigs: EditorV6HairMotionRig[] = []
  const motionTransitions: EditorV6HairMotionTransition[] = []
  const surfaceIds = new Map<string, string>(), textureIds = new Map<string, string>()
  const addSurface = (key: string, dataUrl: string) => {
    const existing = surfaceIds.get(key)
    if (existing) return existing
    const id = `surface-${surfaces.length + 1}`
    surfaceIds.set(key, id); surfaces.push({ id, dataUrl })
    return id
  }
  const addTexture = (key: string, dataUrl: string) => {
    const existing = textureIds.get(key)
    if (existing) return existing
    const id = `texture-${textures.length + 1}`
    textureIds.set(key, id); textures.push({ id, dataUrl })
    return id
  }

  type SerializedMotionLayerAtlas = Pick<EditorV6MotionLayerAtlasCapture, 'frames'> & {
    behindFaceDataUrl: string
    faceDataUrl: string
    inFrontOfFaceDataUrl: string | null
  }
  const captureTransitionLayers = (plan: EditorV6MotionPlan, result: Pick<EditorV6MotionBakeResult, 'faceAsset'>, capture: SerializedMotionLayerAtlas) => {
    const behindFaceSurfaceId = addSurface(`motion:${plan.key}:behind-face`, capture.behindFaceDataUrl)
    const faceSurfaceId = addSurface(`motion:${plan.key}:face`, capture.faceDataUrl)
    const overlaySurfaceId = capture.inFrontOfFaceDataUrl ? addSurface(`motion:${plan.key}:front-face`, capture.inFrontOfFaceDataUrl) : null
    const faceAtlasSurfaceId = result.faceAsset ? addSurface(`motion:${plan.key}:face-atlas`, result.faceAsset.dataUrl) : null
    motionTransitions.push({
      elementId: plan.elementId, key: plan.key, startFrame: plan.startFrame, endFrame: plan.endFrame,
      behindFaceSurfaceId, faceSurfaceId, overlaySurfaceId, faceAtlasSurfaceId,
      frames: capture.frames
    })
  }

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
      let baseSurfaceId: string | undefined, overlaySurfaceId: string | null | undefined
      const cropByFace = new Map<string, { left: number; top: number; width: number; height: number }>()
      // Only immutable encoded face PNGs are reusable within this pose.
      const faceSurfacesByInput = new Map<string, string>()
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
        const existingFaceSurfaceId = faceSurfacesByInput.get(faceRenderKey)
        let sourceCrop = cropByFace.get(faceKey)
        groupStageStarted = performance.now()
        const [originalFrame, splitFrame] = await Promise.all([
          sourceCrop ? Promise.resolve(null) : originalRenderer.renderToCanvas(currentAppearance, faceTransforms, effects, mode),
          existingFaceSurfaceId ? Promise.resolve(null) : hairlessRenderer.renderLayersToCanvas(currentAppearance, faceTransforms, effects, mode, hideMouthForExportLoop ? { mouthLayer: 'without-mouth' } : undefined)
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
        const poseKey = JSON.stringify([poseSurfaceKey, state.poseSlot, sourceHeadPart.width, sourceHeadPart.height, targetHeadPart.x, targetHeadPart.y, targetHeadPart.width, targetHeadPart.height])
        if (splitFrame) {
          preparedGeometry ??= {
            artworkWidth: splitFrame.width, artworkHeight: splitFrame.height,
            outputWidth: splitFrame.outputWidth, outputHeight: splitFrame.outputHeight,
            shapeScaleX: splitFrame.shapeScaleX, shapeScaleY: splitFrame.shapeScaleY
          }
          baseSurfaceId ??= addSurface(`${poseKey}:base`, canvasDataUrl(splitFrame.behindFace))
          if (overlaySurfaceId === undefined) overlaySurfaceId = splitFrame.inFrontOfFace
            ? addSurface(`${poseKey}:overlay`, canvasDataUrl(splitFrame.inFrontOfFace)) : null
        }
        if (!baseSurfaceId || !preparedGeometry) throw Error('A camada estática do personagem não foi preparada.')
        let faceSurfaceId = existingFaceSurfaceId
        if (!faceSurfaceId) {
          if (!splitFrame) throw Error('A camada do rosto não foi preparada.')
          groupStageStarted = performance.now()
          faceSurfaceId = addSurface(`${poseKey}:face:${target.assetId}`, canvasDataUrl(splitFrame.face))
          faceSurfacesByInput.set(faceRenderKey, faceSurfaceId)
          reportStage('serializeFaceSurface', groupStageStarted)
        }
        rigs.push({
          elementId: target.elementId, assetId: target.assetId, characterId: target.state.characterId!,
          poseSlot: character.customization.poseSlot ?? null,
          baseSurfaceId, faceSurfaceId, overlaySurfaceId: overlaySurfaceId ?? null,
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

  const rigByEndpoint = new Map(rigs.map(rig => [`${rig.elementId}:${rig.assetId}`, rig]))
  const motionBlocks = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  const exportMotionPlans = editorV6MotionPlans(project).filter(plan => motionBlocks.get(plan.blockId)?.incomingMotion?.key === plan.key)
  const relevantPlans = selectEditorV6HairlessTransitionBakes(exportMotionPlans, exportOptions, plan => {
    if (editorV6MotionChangesHairGeometry(plan)) return true
    return !editorV6MotionHasCompleteFaceAtlas(plan, motionBlocks.get(plan.blockId)?.incomingMotion)
  })
  if (relevantPlans.length) {
    const { bakeEditorV6Motion, createEditorV6BakeSession } = await import('./motion/bakeMotion')
    // Reuse renderer material/provider caches only within this export's transition batch.
    const transitionSession = createEditorV6BakeSession(window.desktop.fabricator)
    const hairBakeBatch = createEditorV6HairBakeBatch<{ result: EditorV6MotionBakeResult; layerCapture: SerializedMotionLayerAtlas }>()
    const preparedTransitions = await mapConcurrentItems(relevantPlans, async (plan) => {
      if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
      const character = characterById.get(plan.characterId)
      if (!character?.customization.hairAppearance) return undefined
      const fromRig = plan.from.assetId ? rigByEndpoint.get(`${plan.elementId}:${plan.from.assetId}`) : undefined
      const toRig = plan.to.assetId ? rigByEndpoint.get(`${plan.elementId}:${plan.to.assetId}`) : undefined
      if (!fromRig || !toRig) throw Error(`Não foi possível preparar o cabelo durante a troca de pose de ${plan.from.text || character.name}.`)
      const hairlessCharacter: CustomizerCharacter = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
      const mouthScaleSamples = exportOptions.mouthLoop && plan.samples.some(sample => sample.faceMode === 'talk')
        ? plan.samples.map(sample => sample.faceMode === 'talk'
          ? editorV6MouthLoopScaleAtFrame(plan.endFrame + sample.offset, exportOptions.startFrame, exportOptions.mouthLoopCycleFrames ?? 30)
          : EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[0])
        : undefined
      const facialMotion = mouthScaleSamples?.some(scale => scale > 1) ? mouthScaleSamples : undefined
      // Same visual transition may occur several times in a single timeline.
      // Share only within THIS export's batch; mouth scales depend on absolute
      // frame and are part of the key. No cross-export reuse is introduced.
      const bakeKey = editorV6HairBakeContentKey({
        planKey: plan.key,
        characterId: character.id,
        characterRevision: character.updatedAt,
        source: character.customization,
        fromCrop: fromRig.sourceCrop,
        toCrop: toRig.sourceCrop,
        fromDimensions: [fromRig.outputWidth, fromRig.outputHeight],
        toDimensions: [toRig.outputWidth, toRig.outputHeight],
        mouthScaleSamples: facialMotion
      })
      const prepared = await hairBakeBatch.run(bakeKey, async () => {
        let layerCapture: SerializedMotionLayerAtlas | undefined
        const bakeStarted = performance.now()
        const result = await bakeEditorV6Motion({
          id: crypto.randomUUID(), plan, character: hairlessCharacter,
          ...(facialMotion ? { mouthScaleSamples: facialMotion } : {})
        }, window.desktop.fabricator, transitionSession, capture => {
          // The baker releases its canvases after callback return. Serialize
          // synchronously before crossing the await boundary.
          layerCapture = {
            frames: capture.frames,
            behindFaceDataUrl: canvasDataUrl(capture.behindFace),
            faceDataUrl: canvasDataUrl(capture.face),
            inFrontOfFaceDataUrl: capture.inFrontOfFace ? canvasDataUrl(capture.inFrontOfFace) : null
          }
        }, {
          from: { ...fromRig.sourceCrop, outputWidth: fromRig.outputWidth, outputHeight: fromRig.outputHeight },
          to: { ...toRig.sourceCrop, outputWidth: toRig.outputWidth, outputHeight: toRig.outputHeight }
        })
        recordStage('bakeHairlessMotionTransition', performance.now() - bakeStarted)
        if (!layerCapture) throw Error(`Não foi possível capturar as camadas sem cabelo da transição de ${character.name}.`)
        return { result, layerCapture }
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
  const totalDataUrlCharacters = [...surfaces, ...textures].reduce((sum, item) => sum + item.dataUrl.length, 0)
  if (totalDataUrlCharacters > 96_000_000) throw Error('As poses sem cabelo preparadas para a animação excedem o limite seguro de memória da exportação. Desative o preset experimental ou reduza o número de transições no trecho.')
  const preparationProfile = { totalMilliseconds: performance.now() - preparationStarted,
    stages: [...stageStats].map(([name, stage]) => ({ name, ...stage })),
    counts: { surfaces: surfaces.length, textures: textures.length, rigs: rigs.length, motionTransitions: motionTransitions.length, encodedCharacters: totalDataUrlCharacters } }
  return { presetSlot, preset, preparationProfile, ...(exportOptions.hairAnimationLoopFrames ? { loopFrames: exportOptions.hairAnimationLoopFrames } : {}), ...(exportOptions.hairPoseReactionOnly ? { poseReactionOnly: true } : {}), ...(exportOptions.hairPosteriorOnly ? { posteriorOnly: true } : {}), surfaces, textures, rigs, motionTransitions }
}
