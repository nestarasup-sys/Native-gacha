import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../../shared/customizer'
import type { WardrobeSet } from '../../../shared/fabricator'
import type { HairAppearanceLayerLoader, HairLayerReference } from './characterLayerRenderer'

export type GachaReusableMaterials = Readonly<{
  backStyles: HairLayerReference[]
  frontStyles: HairLayerReference[]
  wardrobeDetails: Record<string, WardrobeSet>
}>
export type GachaReusableMaterialCache = Map<string, Promise<GachaReusableMaterials>>

async function loadGachaReusableMaterials(
  character: CustomizerCharacter,
  modelSlot: number,
  assetProvider: CharacterRenderAssetProvider,
  loadHairAppearanceLayers: HairAppearanceLayerLoader
): Promise<GachaReusableMaterials> {
  const hairAppearance = character.customization.hairAppearance
  const [backStyles, posteriorStyles, fringeStyles] = await Promise.all([
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'back', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'front', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'fringe', {}, assetProvider),
  ])
  const groups = (character.customization.wardrobeGroups ?? [])
    .filter(group => group.modelSlot === modelSlot)
  const sets = new Map<string, Promise<WardrobeSet | null>>()
  for (const group of groups) {
    const key = `${group.modelSlot}:${group.setId}`
    if (!sets.has(key)) sets.set(key, assetProvider.loadWardrobeSet(group.modelSlot, group.setId))
  }
  const wardrobeDetails: Record<string, WardrobeSet> = {}
  await Promise.all([...sets].map(async ([key, request]) => {
    const set = await request
    if (!set) throw new Error(`O personagem referencia um conjunto de roupa indisponível (${key}). A fonte não será modificada.`)
    wardrobeDetails[key] = set
  }))
  return { backStyles, frontStyles: [...posteriorStyles, ...fringeStyles], wardrobeDetails }
}

function reusableMaterialsKey(character: CustomizerCharacter, modelSlot: number): string {
  // Facial presets and interpolation do not change these source materials.
  return JSON.stringify([
    character.id, character.updatedAt, modelSlot, character.customization.hairAppearance,
    (character.customization.wardrobeGroups ?? []).filter(group => group.modelSlot === modelSlot),
  ])
}

export async function loadPreparedCharacterMaterials(
  character: CustomizerCharacter,
  modelSlot: number,
  assetProvider: CharacterRenderAssetProvider,
  loadHairAppearanceLayers: HairAppearanceLayerLoader,
  cache?: GachaReusableMaterialCache
): Promise<GachaReusableMaterials> {
  if (!cache) return loadGachaReusableMaterials(character, modelSlot, assetProvider, loadHairAppearanceLayers)
  const key = reusableMaterialsKey(character, modelSlot)
  let pending = cache.get(key)
  if (!pending) {
    pending = loadGachaReusableMaterials(character, modelSlot, assetProvider, loadHairAppearanceLayers)
    cache.set(key, pending)
    // Bound retained PNG manifests/styles; no session-global unbounded Map.
    if (cache.size > 6) cache.delete(cache.keys().next().value!)
    const request = pending
    void pending.catch(() => {
      if (cache.get(key) === request) cache.delete(key)
    })
  }
  return pending
}
