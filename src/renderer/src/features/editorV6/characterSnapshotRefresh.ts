import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceExpressionEffects, FaceExpressionPreset } from '../../../../shared/fabricator'
import { faceRenderGeometry, type TrimmedImage } from '../../characters/characterGeometry'
import { buildEditorV6ExpressionAppearance, buildEditorV6ExpressionTransforms, resolveEditorV6ExpressionBase } from './expressionTransforms'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION, editorV6FaceModeForElement } from './faceModeAssets'

export type EditorV6CharacterRefreshTarget = { kind: 'element' | 'block'; id: string; state: EditorV6Element }
export type EditorV6CharacterRefreshGroup = {
  character: CustomizerCharacter
  state: EditorV6Element
  targets: EditorV6CharacterRefreshTarget[]
  poseRevision?: string
}
export type EditorV6CharacterRefreshPlan = {
  groups: EditorV6CharacterRefreshGroup[]
  missingCharacterNames: string[]
}
export type EditorV6CharacterRefreshResult = {
  nextElements: Map<string, EditorV6Element>
  nextBlocks: Map<string, EditorV6Element>
  refreshedAssets: EditorV6Asset[]
  staleAssetIds: Set<string>
}

const poseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`

/** Collect only the character snapshots that no longer match their sources. */
export function planEditorV6CharacterRefresh(
  project: EditorV6Document,
  availableCharacters: CustomizerCharacter[],
  poseRevisions: Record<string, string>
): EditorV6CharacterRefreshPlan {
  const characters = new Map(availableCharacters.map((character) => [character.id, character]))
  const groups = new Map<string, EditorV6CharacterRefreshGroup>()
  const missingCharacterNames = new Set<string>()
  const addTarget = (kind: EditorV6CharacterRefreshTarget['kind'], id: string, state: EditorV6Element) => {
    if (state.kind !== 'character' || !state.characterId || !state.assetId) return
    const character = characters.get(state.characterId)
    if (!character) {
      if (state.faceRendererVersion !== EDITOR_V6_FACE_RENDER_VERSION) missingCharacterNames.add(state.text)
      return
    }
    const poseSlot = state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot
    const poseRevision = typeof poseSlot === 'number'
      ? poseRevisions[poseRevisionKey(character.customization.modelSlot ?? 1, poseSlot)] ?? 'missing'
      : undefined
    const poseChanged = typeof poseSlot === 'number' && state.poseSourceRevision !== poseRevision
    if (!poseChanged && state.faceRendererVersion === EDITOR_V6_FACE_RENDER_VERSION && state.characterSourceUpdatedAt === character.updatedAt) return
    const signature = JSON.stringify([character.id, character.updatedAt, EDITOR_V6_FACE_RENDER_VERSION, poseRevision, poseSlot,
      state.faceAppearance, state.expressionBase, state.faceTransforms, state.activeFaceMode, state.activeExpressionPresetId,
      state.activeExpressionPresetUpdatedAt, state.activeExpressionGaze, state.activeExpressionEffects])
    const group = groups.get(signature) ?? { character, state, targets: [], ...(poseRevision ? { poseRevision } : {}) }
    group.targets.push({ kind, id, state })
    groups.set(signature, group)
  }
  for (const element of project.elements) addTarget('element', element.id, element)
  for (const track of project.timeline.tracks) {
    for (const block of track.blocks) if (block.state && block.elementId) addTarget('block', block.id, block.state)
  }
  return { groups: [...groups.values()], missingCharacterNames: [...missingCharacterNames] }
}

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
  if (!groups.length) return { nextElements: new Map(), nextBlocks: new Map(), refreshedAssets: [], staleAssetIds: new Set() }
  const [{ prepareSavedCharacterRenderer }, { resolveSavedCharacterSource }] = await Promise.all([
    import('../../characters/editorV6CharacterRenderer'),
    import('../../characters/characterSourceResolver')
  ])
  const nextElements = new Map<string, EditorV6Element>()
  const nextBlocks = new Map<string, EditorV6Element>()
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

  for (const { character, state, targets, poseRevision } of groups) {
    if (isCancelled()) return null
    for (const target of targets) {
      if (target.state.assetId) staleAssetIds.add(target.state.assetId)
      for (const id of Object.values(target.state.faceModeAssetIds ?? {})) if (id) staleAssetIds.add(id)
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
      : state.faceAppearance ?? expressionBase?.appearance
    const faceTransforms = preset && appearance && expressionBase
      ? await buildEditorV6ExpressionTransforms(preset, appearance, expressionBase.transforms,
        (id) => memoizedPromise(faceComponentCache, `${preset.modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceComponentAsset(preset.modelSlot, id)),
        (id) => memoizedPromise(faceCatalogCache, `${preset.modelSlot}:${id}`, () => window.desktop.fabricator.loadFaceCatalogItem(preset.modelSlot, id)), state.activeExpressionGaze ?? 'right')
      : sourceAppearance ? expressionBase?.transforms ?? state.faceTransforms : state.faceTransforms ?? expressionBase?.transforms
    const effects = preset?.effects ?? state.activeExpressionEffects
    const faceMode = editorV6FaceModeForElement(state, appearance)
    const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot: state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot, faceAppearance: appearance } }
    const sourceKey = JSON.stringify([character.id, character.updatedAt, characterCopy.customization.modelSlot ?? 1, characterCopy.customization.poseSlot, poseRevision ?? null])
    // Legacy face sets bake state into a single image, so their complete appearance is part of the renderer identity.
    const rendererKey = JSON.stringify([sourceKey, appearance?.modelSlot ?? null, appearance?.setId ? appearance : null])
    const job: RefreshRenderJob = { character, targets, ...(poseRevision ? { poseRevision } : {}), sourceKey, characterCopy, appearance, expressionBase, faceTransforms, effects, faceMode, preset }
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
    const renderer = await prepareSavedCharacterRenderer(firstJob.characterCopy, { ...source, assetProvider: window.desktop.fabricator, materialCache })
    type FaceBake = { rendered: { width: number; height: number }; crop: TrimmedImage | null; faceModeAssetIds: Partial<Record<EditorV6FaceRenderMode, string>> }
    const faceVariants = new Map<string, FaceBake>()
    try {
      for (const { character, targets, poseRevision, appearance, expressionBase, faceTransforms, effects, faceMode, preset } of rendererJobs) {
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
          const geometry = faceRenderGeometry(target.state, rendered, crop, stageWidth, stageHeight)
          const next: EditorV6Element = {
            ...target.state, assetId, faceModeAssetIds, ...geometry,
            ...(appearance ? { faceAppearance: appearance } : {}),
            ...(expressionBase ? { expressionBase } : {}),
            ...(faceTransforms ? { faceTransforms } : {}),
            ...(effects ? { activeExpressionEffects: effects } : { activeExpressionEffects: undefined }),
            characterSourceUpdatedAt: character.updatedAt,
            faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
            ...(poseRevision ? { poseSourceRevision: poseRevision } : {}),
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

  return { nextElements, nextBlocks, refreshedAssets, staleAssetIds }
}
