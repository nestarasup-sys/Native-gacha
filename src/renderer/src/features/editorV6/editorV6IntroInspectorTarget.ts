import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6IntroCharacterElement, editorV6IntroFrameFromGeometry } from '../../../../shared/editorV6Intro'
import { EDITOR_V6_SOURCE_FRAME_VERSION } from './editorV6SourceFrame'
import { findEditorV6TimelineClip } from '../../../../shared/editorV6TimelineCore'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { buildSceneExpressionAppearance, buildSceneExpressionTransforms } from '../../characters/sceneExpressionTransforms'

/** Older Intro projects stored the rendered preset image and its ID only. */
export async function normalizeEditorV6IntroPoseFace(element: EditorV6Element, character: CustomizerCharacter): Promise<EditorV6Element> {
  if (element.faceAppearance || !element.activeExpressionPresetId) return element
  const model = character.customization.modelSlot ?? 1
  const base = character.customization.faceAppearance
  const fabricator = window.desktop.fabricator
  const preset = await fabricator.loadFaceExpressionPreset(model, element.activeExpressionPresetId)
  if (!base || !preset) throw Error(`A expressão de ${character.name} não está disponível. Escolha outro preset antes de trocar a pose.`)
  const catalog = (id: string) => fabricator.loadFaceCatalogItem(model, id)
  const appearance = await buildSceneExpressionAppearance(preset, base, catalog)
  const gaze = element.activeExpressionGaze ?? 'right'
  const transforms = await buildSceneExpressionTransforms(preset, appearance, {}, id => fabricator.loadFaceComponentAsset(model, id), catalog, gaze)
  return { ...element, faceAppearance: appearance, faceTransforms: transforms, activeExpressionEffects: preset.effects,
    activeExpressionGaze: gaze, activeExpressionCollectionId: preset.collectionId ?? 'standard',
    expressionBase: { appearance: base, transforms: {} } }
}

export function editorV6IntroInspectorTarget(project: EditorV6Document, block: EditorV6TimelineBlock): EditorV6Element | null {
  const intro = block.intro
  if (intro?.kind !== 'character') return null
  const base = project.elements.find(element => element.kind === 'character' && element.characterId === intro.characterId)
  const snapshot = [base, ...project.timeline.tracks.flatMap(track => track.kind === 'character' && track.characterId === intro.characterId
    ? track.blocks.map(item => item.state) : [])].find(state => state?.assetId === intro.assetId)
  const defaults = {
    faceAppearance: snapshot?.faceAppearance, faceTransforms: snapshot?.faceTransforms,
    activeFaceMode: snapshot?.activeFaceMode, activeExpressionEffects: snapshot?.activeExpressionEffects,
    expressionBase: snapshot?.expressionBase, activeExpressionGaze: snapshot?.activeExpressionGaze,
    activeExpressionCollectionId: snapshot?.activeExpressionCollectionId
  }
  const state = editorV6IntroCharacterElement(block)!
  return {
    ...defaults, ...state,
    ...((state.faceRendererVersion ?? 0) >= EDITOR_V6_SOURCE_FRAME_VERSION ? { characterCanvasWidth: state.width } : {}),
    poseSlot: intro.poseSlot === undefined ? snapshot?.poseSlot ?? base?.poseSlot : intro.poseSlot,
    faceModeAssetIds: intro.faceModeAssetIds ?? snapshot?.faceModeAssetIds,
    activeExpressionPresetId: intro.expression ?? null
  }
}

/** Run the normal appearance command against the selected portrait and publish its result to the Intro clip. */
export function editEditorV6IntroAppearance(
  project: EditorV6Document, blockId: string,
  transform: (working: EditorV6Document) => EditorV6Document
): EditorV6Document {
  const clip = findEditorV6TimelineClip(project.timeline, blockId)
  const intro = clip?.block.intro
  if (!clip || clip.track.locked || intro?.kind !== 'character') return project
  const before = editorV6IntroInspectorTarget(project, clip.block)!
  const working = { ...project, elements: [...project.elements, before] }
  const result = transform(working)
  const edited = result.elements.find(element => element.id === blockId)
  if (!edited) return project
  const original = project.assets.find(asset => asset.id === before.assetId)
  const rendered = result.assets.find(asset => asset.id === edited.assetId)
  const image = rendered && rendered !== original && rendered.dataUrl !== original?.dataUrl
    ? { ...rendered, id: crypto.randomUUID(), timelineSnapshot: true } : undefined
  if (!image && edited === before) return project
  const { faceAppearance, faceTransforms, activeFaceMode, activeExpressionEffects, activeExpressionGaze,
    activeExpressionCollectionId, characterCanvasWidth, expressionBase, poseSlot, faceRendererVersion } = edited
  const previousAssets = new Set(project.assets.map(asset => asset.id))
  const additions = result.assets.filter(asset => !previousAssets.has(asset.id))
  const faceModeAssetIds = Object.fromEntries(Object.entries(edited.faceModeAssetIds ?? {}).map(([mode, id]) =>
    [mode, image && id === edited.assetId ? image.id : id]))
  const state = { ...intro, poseSlot, faceModeAssetIds, faceRendererVersion,
    ...(image || additions.length ? {
      portraitAspect: edited.width * 19.2 / (edited.height * 10.8),
      portraitFrame: editorV6IntroFrameFromGeometry(intro, before, edited)
    } : {}),
    expression: edited.activeExpressionPresetId ?? undefined,
    assetId: image?.id ?? intro.assetId, face: { faceAppearance, faceTransforms, activeFaceMode,
      activeExpressionEffects, activeExpressionGaze, activeExpressionCollectionId, characterCanvasWidth, expressionBase } }
  return {
    ...project, updatedAt: result.updatedAt === project.updatedAt ? new Date().toISOString() : result.updatedAt,
    assets: [...project.assets, ...additions, ...(image ? [image] : [])],
    timeline: { ...project.timeline, tracks: project.timeline.tracks.map(track => track.id === clip.track.id
      ? { ...track, blocks: track.blocks.map(block => block.id === blockId ? { ...block, intro: state } : block) } : track) }
  }
}
