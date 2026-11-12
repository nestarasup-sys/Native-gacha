import type { EditorV6Document } from '../../../../shared/editorV6'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'
import type { EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionBundle, EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import { measureFaceModeCrop } from './faceModeAssets'
import { editorV6ExportTestSettings } from '../../../../shared/editorV6ExportTestModes'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { createEditorV6HairPreparationReuse } from './motion/hairPreparationReuse'
import { createEditorV6HairSourceBatch } from './motion/hairSourceBatch'
import type { GachaReusableMaterialCache } from '../../characters/preparedCharacterMaterials'
import { collectEditorV6HairMotionTargets } from './editorV6HairMotionTargets'
import { groupEditorV6HairMotionTargets } from './editorV6HairMotionGroups'
import { prepareEditorV6HairMotionCharacterGroup } from './editorV6HairMotionCharacterGroup'
import { prepareEditorV6HairMotionGroupSurfaces } from './editorV6HairMotionGroupSurfaces'
import { createEditorV6HairMotionBundleAssets } from './editorV6HairMotionBundleAssets'
import { createEditorV6ExportStageProfiler } from './editorV6ExportStageProfiler'
import { editorV6HairMotionCanvasDataUrl as canvasDataUrl } from './editorV6HairMotionCanvas'
import { prepareEditorV6HairMotionTransitions } from './editorV6HairMotionTransitions'
import { prepareEditorV6HairMotionLayers } from './editorV6HairMotionLayers'

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
    const prepared = await prepareEditorV6HairMotionCharacterGroup(groupKey, group, {
      resolveSource: async (character) => resolveSavedCharacterSource(character, await rawSources.sourceFor(character)),
      loadHairStyle: (modelSlot, id) => currentExportReuse.loadStyle(modelSlot, id, () => window.desktop.fabricator.loadHairStyle(modelSlot, id)),
      prepareRenderer: prepareSavedCharacterRenderer,
      createWardrobePair: createPreparedGachaWardrobePair,
      assetProvider: window.desktop.fabricator,
      materialCache,
      reportStage,
      isCancelled
    })
    if (!prepared) return
    const { character, appearance, references, styles, sourceHeadPart, targetHeadPart, originalRenderer, hairlessRenderer, wardrobePair } = prepared
    let groupStageStarted: number
    try {
      groupStageStarted = performance.now()
      const descriptors = await prepareEditorV6HairMotionLayers({
        character, references, styles, sourceHead: sourceHeadPart, targetHead: targetHeadPart,
        resolveColors: part => resolvedHairColors(appearance, part),
        prepareTexture: ({ modelSlot, styleId, side, part, colors, dataUrl }) => currentExportReuse.prepareTexture(
          modelSlot, styleId, side, part, colors,
          async () => {
            if (!Object.keys(colors).length) return dataUrl
            const tinted = await loadCharacterTintedImage(dataUrl, colors)
            const canvas = document.createElement('canvas'); canvas.width = tinted.naturalWidth; canvas.height = tinted.naturalHeight
            const context = canvas.getContext('2d')
            if (!context) throw Error('Não foi possível recolorir uma camada de cabelo para a exportação.')
            try {
              context.drawImage(tinted, 0, 0)
              return canvasDataUrl(canvas)
            } finally { canvas.width = canvas.height = 1 }
          }
        ),
        addTexture
      })
      if (!descriptors.length) return
      reportStage('prepareHairLayers', groupStageStarted)

      const groupRigs = await prepareEditorV6HairMotionGroupSurfaces({
        group: prepared,
        targets: group.targets,
        layers: descriptors,
        mouthLoop: exportOptions.mouthLoop,
        encodeFaceCropPng: testSettings.encodeFaceCropPng,
        addSurface,
        encodeCanvas: canvasDataUrl,
        measureFaceModeCrop,
        reportStage,
        isCancelled
      })
      rigs.push(...groupRigs)
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
