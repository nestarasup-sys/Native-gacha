import type { EditorV6Asset, EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'
import { faceRenderGeometry } from '../../characters/characterGeometry.ts'
import type { TrimmedImage } from '../../characters/transparentImageTrim.ts'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets.ts'
import { editorV6CharacterRefreshStateSignature } from './editorV6CharacterRefreshModel.ts'
import { prepareEditorV6CharacterRefreshJob } from './editorV6CharacterRefreshJob'
import type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshRenderJob, EditorV6CharacterRefreshResult } from './editorV6CharacterRefreshTypes'
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
  const rendererGroups = new Map<string, EditorV6CharacterRefreshRenderJob[]>()
  const poseReferenceCrops = new Map<string, TrimmedImage | null>()

  for (const group of groups) {
    if (isCancelled()) return null
    const { targets } = group
    for (const target of targets) {
      if (target.state.assetId) staleAssetIds.add(target.state.assetId)
      for (const id of Object.values(target.state.faceModeAssetIds ?? {})) if (id) staleAssetIds.add(id)
      const expectedStates = target.kind === 'element' ? expectedElementStates : expectedBlockStates
      expectedStates.set(target.id, editorV6CharacterRefreshStateSignature(target.state))
    }
    const job = await prepareEditorV6CharacterRefreshJob(group, {
      loadPreset: (modelSlot, id) => memoizedPromise(expressionPresetCache, `${modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceExpressionPreset(modelSlot, id)),
      loadFaceCatalogItem: (modelSlot, id) => memoizedPromise(faceCatalogCache, `${modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceCatalogItem(modelSlot, id)),
      loadFaceComponentAsset: (modelSlot, id) => memoizedPromise(faceComponentCache, `${modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceComponentAsset(modelSlot, id))
    })
    const rendererJobs = rendererGroups.get(job.rendererKey) ?? []
    rendererJobs.push(job)
    rendererGroups.set(job.rendererKey, rendererJobs)
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
