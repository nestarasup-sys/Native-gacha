import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceExpressionEffects, FaceExpressionPreset } from '../../../../shared/fabricator'
import { faceRenderGeometry } from '../../characters/characterGeometry.ts'
import type { TrimmedImage } from '../../characters/transparentImageTrim.ts'
import { buildEditorV6ExpressionAppearance, buildEditorV6ExpressionTransforms, resolveEditorV6ExpressionBase } from './expressionTransforms.ts'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION, editorV6FaceModeForElement } from './faceModeAssets.ts'
import { editorV6CharacterRefreshStateSignature } from './editorV6CharacterRefreshModel.ts'
import { resolveRefreshedFaceAppearance } from './editorV6RefreshAppearance.ts'
import type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshResult, EditorV6CharacterRefreshTarget } from './editorV6CharacterRefreshTypes'
export { planEditorV6CharacterRefresh } from './editorV6CharacterRefreshPlan'
export type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshPlan, EditorV6CharacterRefreshResult, EditorV6CharacterRefreshTarget } from './editorV6CharacterRefreshTypes'

function memoizedPromise<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>, maxEntries = 96): Promise<T> {
  const existing = cache.get(key)
  if (existing) return existing
  const pending = Promise.resolve().then(load)
  cache.set(key, pending)
  if (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined && oldestKey !== key) cache.delete(oldestKey)
  }
  void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key) })
  return pending
}

/** Rebuild outdated snapshots with per-refresh asset/source caches and bounded renderer lifetimes. */
export async function renderEditorV6CharacterRefresh(
  groups: EditorV6CharacterRefreshGroup[],
  stageWidth: number,
  stageHeight: number,
  isCancelled: () => boolean
): Promise<EditorV6CharacterRefreshResult | null> {
  if (!groups.length) return { nextElements: new Map(), nextBlocks: new Map(), expectedElementStates: new Map(), expectedBlockStates: new Map(), refreshedAssets: [], staleAssetIds: new Set() }
  const [{ prepareSavedCharacterRenderer }, { resolveSavedCharacterSource }] = await Promise.all([
    import('../../characters/editorV6CharacterRenderer'),
    import('../../characters/characterSourceResolver')
  ])
  const nextElements = new Map<string, EditorV6Element>()
  const nextBlocks = new Map<string, EditorV6Element>()
  const expectedElementStates = new Map<string, string>()
  const expectedBlockStates = new Map<string, string>()
  const refreshedAssets: EditorV6Asset[] = []
  const staleAssetIds = new Set<string>()
  const expressionPresetCache = new Map<string, ReturnType<typeof window.desktop.fabricator.loadFaceExpressionPreset>>()
  const faceCatalogCache = new Map<string, ReturnType<typeof window.desktop.fabricator.loadFaceCatalogItem>>()
  const faceComponentCache = new Map<string, ReturnType<typeof window.desktop.fabricator.loadFaceComponentAsset>>()
  const sourceCache = new Map<string, ReturnType<typeof resolveSavedCharacterSource>>()
  const materialCache: import('../../characters/editorV6CharacterRenderer').GachaReusableMaterialCache = new Map()
  type RefreshRenderJob = {
    character: CustomizerCharacter
    targets: EditorV6CharacterRefreshTarget[]
    poseRevision?: string
    modelRevision: string
    wardrobeRevision?: string
    hairRevision?: string
    headExtraRevision?: string
    eyeRevision?: string
    sourceKey: string
    characterCopy: CustomizerCharacter
    appearance: CustomizerFaceAppearance | undefined
    expressionBase: ReturnType<typeof resolveEditorV6ExpressionBase> | undefined
    faceTransforms: EditorV6FaceTransforms | undefined
    effects: FaceExpressionEffects | undefined
    faceMode: EditorV6FaceRenderMode
    preset: FaceExpressionPreset | null
  }
  const rendererGroups = new Map<string, RefreshRenderJob[]>()
  const poseReferenceCrops = new Map<string, TrimmedImage | null>()

  for (const { character, state, targets, poseRevision, modelRevision, wardrobeRevision, hairRevision, headExtraRevision, eyeRevision } of groups) {
    if (isCancelled()) return null
    for (const target of targets) {
      if (target.state.assetId) staleAssetIds.add(target.state.assetId)
      for (const id of Object.values(target.state.faceModeAssetIds ?? {})) if (id) staleAssetIds.add(id)
      const expectedStates = target.kind === 'element' ? expectedElementStates : expectedBlockStates
      expectedStates.set(target.id, editorV6CharacterRefreshStateSignature(target.state))
    }
    const sourceAppearance = character.customization.faceAppearance
    const appearanceFallback = sourceAppearance ?? state.faceAppearance ?? state.expressionBase?.appearance
    const previousBase = appearanceFallback ? resolveEditorV6ExpressionBase(state, appearanceFallback) : undefined
    const sceneTransforms = Object.fromEntries(Object.entries(state.faceTransforms ?? {}).filter(([key]) => !key.startsWith('expression-component:') && !key.startsWith('expression:')))
    const expressionBase = sourceAppearance ? { appearance: structuredClone(sourceAppearance), transforms: sceneTransforms } : previousBase
    const preset = state.activeExpressionPresetId
      ? await memoizedPromise(expressionPresetCache, `${character.customization.modelSlot ?? 1}:${state.activeExpressionPresetId}`, () => window.desktop.fabricator.loadFaceExpressionPreset(character.customization.modelSlot ?? 1, state.activeExpressionPresetId!))
      : null
    const appearance = preset && expressionBase?.appearance
      ? await buildEditorV6ExpressionAppearance(preset, expressionBase.appearance, (id) => memoizedPromise(faceCatalogCache, `${preset.modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceCatalogItem(preset.modelSlot, id)))
      : resolveRefreshedFaceAppearance(state, character) ?? expressionBase?.appearance
    const faceTransforms = preset && appearance && expressionBase
      ? await buildEditorV6ExpressionTransforms(preset, appearance, expressionBase.transforms,
        (id) => memoizedPromise(faceComponentCache, `${preset.modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceComponentAsset(preset.modelSlot, id)),
        (id) => memoizedPromise(faceCatalogCache, `${preset.modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceCatalogItem(preset.modelSlot, id)), state.activeExpressionGaze ?? 'right')
      : sourceAppearance ? expressionBase?.transforms ?? state.faceTransforms : state.faceTransforms ?? expressionBase?.transforms
    const effects = preset?.effects ?? state.activeExpressionEffects
    const faceMode = editorV6FaceModeForElement(state, appearance)
    const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot: state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot, faceAppearance: appearance } }
    const sourceKey = JSON.stringify([character.id, character.updatedAt, characterCopy.customization.modelSlot ?? 1, characterCopy.customization.poseSlot, modelRevision ?? null, poseRevision ?? null, wardrobeRevision ?? null, hairRevision ?? null, headExtraRevision ?? null, eyeRevision ?? null])
    // Legacy face sets bake state into a single image, so their complete appearance is part of the renderer identity.
    const rendererKey = JSON.stringify([sourceKey, appearance?.modelSlot ?? null, appearance?.setId ? appearance : null])
    const job: RefreshRenderJob = { character, targets, ...(poseRevision ? { poseRevision } : {}), modelRevision, ...(wardrobeRevision ? { wardrobeRevision } : {}), ...(hairRevision ? { hairRevision } : {}), ...(headExtraRevision ? { headExtraRevision } : {}), ...(eyeRevision ? { eyeRevision } : {}), sourceKey, characterCopy, appearance, expressionBase, faceTransforms, effects, faceMode, preset }
    const rendererJobs = rendererGroups.get(rendererKey) ?? []
    rendererJobs.push(job)
    rendererGroups.set(rendererKey, rendererJobs)
  }

  // Keep resolved model/pose data only until the last renderer that needs it.
  const sourceUseCounts = new Map<string, number>()
  for (const rendererJobs of rendererGroups.values()) {
    const sourceKey = rendererJobs[0].sourceKey
    sourceUseCounts.set(sourceKey, (sourceUseCounts.get(sourceKey) ?? 0) + 1)
  }
  for (const rendererJobs of rendererGroups.values()) {
    if (isCancelled()) return null
    const firstJob = rendererJobs[0]
    const source = await memoizedPromise(sourceCache, firstJob.sourceKey, () => resolveSavedCharacterSource(firstJob.characterCopy), 8)
    const renderer = await prepareSavedCharacterRenderer(firstJob.characterCopy, { ...source, artwork: source.sourceArtwork, assetProvider: window.desktop.fabricator, materialCache })
    type FaceBake = { rendered: { width: number; height: number }; crop: TrimmedImage | null; faceModeAssetIds: Partial<Record<EditorV6FaceRenderMode, string>> }
    const faceVariants = new Map<string, FaceBake>()
    try {
      for (const { character, targets, poseRevision, modelRevision, wardrobeRevision, hairRevision, headExtraRevision, eyeRevision, appearance, expressionBase, faceTransforms, effects, faceMode, preset } of rendererJobs) {
        if (isCancelled()) break
        // One bake already contains idle/blink/talk/talk-blink. Reuse it for states that differ only in active mode.
        const variantKey = JSON.stringify([appearance ?? null, faceTransforms ?? null, effects ?? null])
        let variant = faceVariants.get(variantKey)
        if (!variant?.faceModeAssetIds[faceMode]) {
          const rendered = await renderer.renderToCanvas(appearance, faceTransforms, effects, faceMode)
          const baked = await bakeFaceModeAssets(character.name, renderer, appearance, faceTransforms, effects, faceMode, rendered)
          const baseAssetId = crypto.randomUUID()
          const faceModeAssetIds = { ...baked.assetIds, [faceMode]: baseAssetId }
          refreshedAssets.push({ id: baseAssetId, category: 'character', name: character.name, mimeType: 'image/png', dataUrl: baked.dataUrl, timelineSnapshot: true }, ...baked.extraAssets)
          variant = { rendered: { width: rendered.width, height: rendered.height }, crop: baked.crop, faceModeAssetIds }
          faceVariants.set(variantKey, variant)
        }
        const { rendered, crop, faceModeAssetIds } = variant
        const assetId = faceModeAssetIds[faceMode]
        if (!assetId) throw new Error(`Não foi possível preparar a variante facial ${faceMode} de ${character.name}.`)
        for (const target of targets) {
          const poseKey = JSON.stringify([target.state.id, character.customization.modelSlot ?? 1, target.state.poseSlot === undefined ? character.customization.poseSlot ?? null : target.state.poseSlot])
          if (!poseReferenceCrops.has(poseKey)) poseReferenceCrops.set(poseKey, crop)
          const geometry = faceRenderGeometry(target.state, rendered, crop, stageWidth, stageHeight, poseReferenceCrops.get(poseKey))
          const next: EditorV6Element = {
            ...target.state, assetId, faceModeAssetIds, ...geometry,
            ...(appearance ? { faceAppearance: appearance } : {}),
            ...(expressionBase ? { expressionBase } : {}),
            ...(faceTransforms ? { faceTransforms } : {}),
            ...(effects ? { activeExpressionEffects: effects } : { activeExpressionEffects: undefined }),
            characterSourceUpdatedAt: character.updatedAt,
            faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
            ...(poseRevision ? { poseSourceRevision: poseRevision } : {}),
            ...(modelRevision ? { modelSourceRevision: modelRevision } : {}),
            wardrobeSourceRevision: wardrobeRevision,
            hairSourceRevision: hairRevision,
            headExtraSourceRevision: headExtraRevision,
            eyeSourceRevision: eyeRevision,
            ...(preset ? { activeExpressionPresetUpdatedAt: preset.updatedAt } : {})
          }
          if (target.kind === 'element') nextElements.set(target.id, next)
          else nextBlocks.set(target.id, next)
        }
      }
    } finally { renderer.dispose() }
    const sourceUsers = (sourceUseCounts.get(firstJob.sourceKey) ?? 1) - 1
    if (sourceUsers > 0) sourceUseCounts.set(firstJob.sourceKey, sourceUsers)
    else { sourceUseCounts.delete(firstJob.sourceKey); sourceCache.delete(firstJob.sourceKey) }
    if (isCancelled()) return null
  }

  return { nextElements, nextBlocks, expectedElementStates, expectedBlockStates, refreshedAssets, staleAssetIds }
}
