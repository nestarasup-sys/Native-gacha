import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { HairStyle } from '../../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../../shared/characterRenderAssets'
import type { GachaReusableMaterialCache } from '../../characters/preparedCharacterMaterials'
import { hairAppearanceStyleIds } from '../../../../shared/hairCategories'
import type { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import type { EditorV6HairMotionGroup } from './editorV6HairMotionGroups'

type CharacterRendererModule = typeof import('../../characters/editorV6CharacterRenderer')
type ResolvedCharacterSource = Awaited<ReturnType<typeof resolveSavedCharacterSource>>
type PreparedRenderer = Awaited<ReturnType<CharacterRendererModule['prepareSavedCharacterRenderer']>>
type HairReference = ReturnType<typeof hairAppearanceStyleIds>[number]
type SourcePart = ResolvedCharacterSource['source']['parts'][number]
type ArtworkPart = ResolvedCharacterSource['artwork']['parts'][number]
type WardrobePair = ReturnType<CharacterRendererModule['createPreparedGachaWardrobePair']>

export type PreparedEditorV6HairMotionCharacterGroup = {
  groupKey: string
  character: CustomizerCharacter
  resolved: ResolvedCharacterSource
  appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']>
  references: HairReference[]
  styles: Map<string, HairStyle | null>
  sourceHeadPart: SourcePart
  targetHeadPart: ArtworkPart
  originalRenderer: PreparedRenderer
  hairlessRenderer: PreparedRenderer
  wardrobePair: WardrobePair
}

export type EditorV6HairMotionCharacterGroupDependencies = {
  resolveSource: (character: CustomizerCharacter) => Promise<ResolvedCharacterSource>
  loadHairStyle: (modelSlot: number, id: string) => Promise<HairStyle | null>
  prepareRenderer: CharacterRendererModule['prepareSavedCharacterRenderer']
  createWardrobePair: CharacterRendererModule['createPreparedGachaWardrobePair']
  assetProvider: CharacterRenderAssetProvider
  materialCache: GachaReusableMaterialCache
  reportStage: (stage: string, milliseconds: number) => void
  isCancelled: () => boolean
}

/** Resolve one character/pose group and prepare its paired normal and hairless renderers. */
export async function prepareEditorV6HairMotionCharacterGroup(
  groupKey: string,
  group: EditorV6HairMotionGroup,
  dependencies: EditorV6HairMotionCharacterGroupDependencies
): Promise<PreparedEditorV6HairMotionCharacterGroup | null> {
  if (dependencies.isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
  const character = group.character
  let stageStarted = performance.now()
  const resolved = await dependencies.resolveSource(character)
  dependencies.reportStage('resolveSavedCharacterSource', performance.now() - stageStarted)
  const appearance = character.customization.hairAppearance
  const references = appearance?.modelSlot === resolved.modelSlot ? hairAppearanceStyleIds(appearance) : []
  if (!appearance || !references.length) return null
  const styleIds = [...new Set(references.map((reference) => reference.id))]
  stageStarted = performance.now()
  const loadedStyles = await Promise.all(styleIds.map(async (id) => [
    id, await dependencies.loadHairStyle(resolved.modelSlot, id)
  ] as const))
  dependencies.reportStage('loadHairStyles', performance.now() - stageStarted)
  const styles = new Map(loadedStyles)
  const sourceHeadPart = resolved.source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHeadPart = resolved.artwork.parts.find((part) => part.id === sourceHeadPart?.id)
  if (!sourceHeadPart || !targetHeadPart) throw Error(`O modelo de ${character.name} não tem uma cabeça disponível para animar o cabelo.`)

  const hairless: CustomizerCharacter = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
  // Pair only the immutable wardrobe painting; each renderer still composes its own character buffers.
  const wardrobePair = dependencies.createWardrobePair()
  const renderSource = {
    source: resolved.source, artwork: resolved.sourceArtwork, assetProvider: dependencies.assetProvider,
    materialCache: dependencies.materialCache, wardrobePair
  }
  stageStarted = performance.now()
  const rendererResults = await Promise.allSettled([
    dependencies.prepareRenderer(character, renderSource),
    dependencies.prepareRenderer(hairless, renderSource)
  ])
  const rendererFailure = rendererResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (rendererFailure) {
    for (const result of rendererResults) if (result.status === 'fulfilled') result.value.dispose()
    wardrobePair.clear()
    throw rendererFailure.reason
  }
  const [originalRenderer, hairlessRenderer] = rendererResults.map((result) =>
    (result as PromiseFulfilledResult<PreparedRenderer>).value
  )
  dependencies.reportStage('prepareCharacterRenderers', performance.now() - stageStarted)
  return {
    groupKey, character, resolved, appearance, references, styles, sourceHeadPart, targetHeadPart,
    originalRenderer, hairlessRenderer, wardrobePair
  }
}
