import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../../shared/customizer'
import type { WardrobeSet } from '../../../shared/fabricator'
import type { HairAppearanceLayerLoader, HairLayerReference } from './characterLayerRenderer'

export type GachaReusableMaterials = Readonly<{
  backStyles: HairLayerReference[]
  posteriorStyles: HairLayerReference[]
  fringeStyles: HairLayerReference[]
  wardrobeDetails: Record<string, WardrobeSet>
}>
/** A single export/bake session owns this bounded cache and disposes it after
 * preparation. Values never persist between exports or projects. */
export type GachaReusableMaterialCache = Map<string, Promise<GachaReusableMaterials>>

async function loadWardrobeDetails(
  character: CustomizerCharacter,
  modelSlot: number,
  assetProvider: CharacterRenderAssetProvider
): Promise<Record<string, WardrobeSet>> {
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
  return wardrobeDetails
}

async function loadGachaReusableMaterials(
  character: CustomizerCharacter,
  modelSlot: number,
  assetProvider: CharacterRenderAssetProvider,
  loadHairAppearanceLayers: HairAppearanceLayerLoader,
  sharedWardrobe?: Promise<Record<string, WardrobeSet>>
): Promise<GachaReusableMaterials> {
  const hairAppearance = character.customization.hairAppearance
  // Hair layers and wardrobe sources are independent. Load them concurrently
  // instead of waiting for all hair assets before starting wardrobe I/O.
  const [backStyles, posteriorStyles, fringeStyles, wardrobeDetails] = await Promise.all([
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'back', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'front', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'fringe', {}, assetProvider),
    sharedWardrobe ?? loadWardrobeDetails(character, modelSlot, assetProvider)
  ])
  return { backStyles, posteriorStyles, fringeStyles, wardrobeDetails }
}

function wardrobeMaterialsKey(character: CustomizerCharacter, modelSlot: number): string {
  // Removing hair changes the renderer variant, not the clothes. Keep the
  // wardrobe promise identical for the normal and hairless character.
  return JSON.stringify([
    character.id, character.updatedAt, modelSlot,
    (character.customization.wardrobeGroups ?? []).filter(group => group.modelSlot === modelSlot)
  ])
}

function reusableMaterialsKey(character: CustomizerCharacter, modelSlot: number): string {
  // Facial presets and interpolation do not change these source materials.
  return JSON.stringify([
    character.id, character.updatedAt, modelSlot, character.customization.hairAppearance,
    (character.customization.wardrobeGroups ?? []).filter(group => group.modelSlot === modelSlot),
  ])
}

function remember<T extends GachaReusableMaterials>(
  cache: GachaReusableMaterialCache,
  key: string,
  request: Promise<T>
): Promise<T> {
  cache.set(key, request)
  // At most six entries (including small wardrobe-only manifests), scoped to
  // this export. Eviction affects only efficiency, not renderer correctness.
  if (cache.size > 6) cache.delete(cache.keys().next().value!)
  void request.catch(() => {
    if (cache.get(key) === request) cache.delete(key)
  })
  return request
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
  const pending = cache.get(key)
  if (pending) return pending

  // Use the *same* session map for a wardrobe-only sentinel. The material
  // key is always JSON beginning with "[", so the prefix is disjoint.
  const wardrobeKey = 'wardrobe:' + wardrobeMaterialsKey(character, modelSlot)
  let wardrobe = cache.get(wardrobeKey)
  if (!wardrobe) {
    wardrobe = remember(cache, wardrobeKey,
      loadWardrobeDetails(character, modelSlot, assetProvider)
        .then(wardrobeDetails => ({ backStyles: [], posteriorStyles: [], fringeStyles: [], wardrobeDetails })))
  }
  const request = loadGachaReusableMaterials(character, modelSlot, assetProvider,
    loadHairAppearanceLayers, wardrobe.then(materials => materials.wardrobeDetails))
  return remember(cache, key, request)
}
