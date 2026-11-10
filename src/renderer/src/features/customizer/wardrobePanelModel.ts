/** Contratos de peças por painel: nomes esquerda/direita, seleção e miniaturas.
 * Os PNGs continuam fontes permanentes do Fabricador DEV; nenhuma escrita aqui.
 */
import type { FaceComponentAsset, FaceComponentAssetSummary, WardrobeCategory, WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import type { CharacterGender, CustomizerFaceAppearance, CustomizerWardrobeGroup, CustomizerWardrobePaletteKey } from '../../../../shared/customizer'
import type { ClothingGroupCategory } from '../../characters/characterRenderer'

export type WardrobePanel = { id: CustomizerWardrobePaletteKey; label: string; category: ClothingGroupCategory; side: 'left' | 'right' | null; source?: WardrobeCategory[] }
export const upperWardrobePanels: WardrobePanel[] = [
  { id: 'shirt', label: 'Camisa', category: 'camisa', side: null },
  { id: 'jacket', label: 'Jaqueta', category: 'jaqueta', side: null },
  { id: 'upper-left', label: 'Manga superior esquerda', category: 'manga-superior', side: 'left' },
  { id: 'lower-left', label: 'Manga inferior esquerda', category: 'manga-superior', side: 'left' },
  { id: 'upper-right', label: 'Manga superior direita', category: 'manga-superior', side: 'right' },
  { id: 'lower-right', label: 'Manga inferior direita', category: 'manga-superior', side: 'right' }
]
export const upperWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'gloves-left', label: 'Luvas esquerda', category: 'luvas', side: 'left' },
  { id: 'gloves-right', label: 'Luvas direita', category: 'luvas', side: 'right' },
  { id: 'cape', label: 'Capa', category: 'capa', side: null },
  { id: 'skirt', label: 'Saia superior', category: 'saia-superior', side: null, source: ['saia'] }
]
export const accessoryWardrobePanels: WardrobePanel[] = [
  { id: 'glasses', label: 'Óculos', category: 'oculos', side: null },
  { id: 'head-accessory', label: 'Acessório de cabeça', category: 'acessorio-cabeca', side: null }
]
/** Torso accessories have their own Roupas > Acessórios slot, separate from head extras. */
export const torsoAccessoryWardrobePanels: WardrobePanel[] = [
  { id: 'belt', label: 'Cinto e acessório', category: 'cinto', side: null }
]

/** Empty visual slots keep each wardrobe grid at six cards without creating selectable pieces. */
export function emptyWardrobePanelSlotNumbers(panelCount: number): number[] {
  const occupied = Number.isFinite(panelCount) ? Math.max(0, Math.floor(panelCount)) : 0
  return Array.from({ length: Math.max(0, 6 - occupied) }, (_, index) => occupied + index + 1)
}
export const lowerWardrobePanels: WardrobePanel[] = [
  { id: 'pants-left', label: 'Calça', category: 'calca', side: null, source: ['calca-coxa', 'calca-canela'] },
  { id: 'shorts-right', label: 'Bermuda', category: 'calca', side: null, source: ['shorts'] },
  { id: 'sock-left', label: 'Esquerda Meia', category: 'meia', side: 'left' },
  { id: 'sock-right', label: 'Direita Meia', category: 'meia', side: 'right' },
  { id: 'shoe-left', label: 'Esquerda Sapato', category: 'sapato', side: 'left' },
  { id: 'shoe-right', label: 'Direita Sapato', category: 'sapato', side: 'right' }
]
export const lowerWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'lower-skirt', label: 'Saia inferior', category: 'saia-inferior', side: null, source: ['saia'] }
]
function wardrobeComponentSide(component: WardrobeSet['components'][number]): 'left' | 'right' | null {
  if (component.sleeveSide) return component.sleeveSide
  const sideHint = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
  const left = /\besquerd[oa]\b|\bleft\b/.test(sideHint)
  const right = /\bdireit[oa]\b|\bright\b/.test(sideHint)
  return left && !right ? 'left' : right && !left ? 'right' : null
}

function normalizedSleeveName(component: WardrobeSet['components'][number]): string {
  return component.name.toLocaleLowerCase()
    .replace(/\b(?:braço superior|antebraço|manga superior|manga inferior|upper arm|forearm)\b/g, ' ')
    .replace(/\b(?:esquerda|esquerdo|direita|direito|left|right|upper|lower)\b/g, ' ')
    .replace(/[·_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^manga\s+/, '')
    .trim()
}

function isPairedSleeveLower(upper: WardrobeSet['components'][number], lower: WardrobeSet['components'][number]): boolean {
  if (lower.category !== 'manga-inferior' || lower.sleeveSegment === 'upper'
      || wardrobeComponentSide(upper) !== wardrobeComponentSide(lower)) return false
  if (upper.sleevePairId && lower.sleevePairId) return upper.sleevePairId === lower.sleevePairId
  const upperName = normalizedSleeveName(upper)
  return Boolean(upperName) && upperName === normalizedSleeveName(lower)
}

/** Resolves a long sleeve's linked halves, including older sets with matching names but no pair ID. */
export function pairedWardrobeSleeveComponents(
  set: WardrobeSet,
  component: WardrobeSet['components'][number]
): WardrobeSet['components'] {
  if (component.category === 'manga-superior') {
    const lower = set.components.find((candidate) => isPairedSleeveLower(component, candidate))
    return lower ? [component, lower] : [component]
  }
  if (component.category === 'manga-inferior') {
    const upper = set.components.find((candidate) => candidate.category === 'manga-superior' && isPairedSleeveLower(candidate, component))
    return upper ? [upper, component] : [component]
  }
  return [component]
}

/** Select both shoes from the same authored pair from either side panel. */
export function pairedWardrobeShoeComponents(
  set: WardrobeSet,
  component: WardrobeSet['components'][number]
): WardrobeSet['components'] {
  if (component.category !== 'sapato' || !component.sleevePairId || !component.sleeveSide) return [component]
  const oppositeSide = component.sleeveSide === 'left' ? 'right' : 'left'
  const counterpart = set.components.find((candidate) => candidate.category === 'sapato'
    && candidate.sleevePairId === component.sleevePairId
    && candidate.sleeveSide === oppositeSide
    && candidate.sleeveSegment === component.sleeveSegment)
  if (!counterpart) return [component]
  return component.sleeveSide === 'left' ? [component, counterpart] : [counterpart, component]
}

/** Restores a missing forearm entry when an older character only saved the upper sleeve. */
export function restoreMissingPairedWardrobeSleeves(
  groups: readonly CustomizerWardrobeGroup[],
  setsByKey: ReadonlyMap<string, WardrobeSet>
): CustomizerWardrobeGroup[] {
  const restored = [...groups]
  for (const group of groups) {
    if (!group.componentId || group.category !== 'manga-superior') continue
    const set = setsByKey.get(`${group.modelSlot}:${group.setId}`)
    const upper = set?.components.find((component) => component.id === group.componentId)
    if (!set || upper?.category !== 'manga-superior') continue
    const lower = pairedWardrobeSleeveComponents(set, upper).find((component) => component.category === 'manga-inferior')
    if (!lower || restored.some((candidate) => candidate.modelSlot === group.modelSlot
      && candidate.setId === group.setId && candidate.componentId === lower.id)) continue
    restored.push({
      modelSlot: group.modelSlot, setId: group.setId, category: 'manga-superior', componentId: lower.id,
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0,
      ...(group.opacity !== undefined ? { opacity: group.opacity } : {}),
      ...(group.hidden !== undefined ? { hidden: group.hidden } : {}),
      ...(group.colors ? { colors: group.colors } : {})
    })
  }
  return restored
}

export function wardrobeComponentMatchesPanel(component: WardrobeSet['components'][number], panel: WardrobePanel): boolean {
  const pairedLowerSleeve = isSleeveUpperPanel(panel)
    && component.category === 'manga-inferior'
    && component.sleeveSegment !== 'upper'
  const forearmPanel = isSleeveLowerPanel(panel)
    && component.category === 'manga-inferior'
    && component.sleeveSegment !== 'upper'
  if (panel.source ? !panel.source.includes(component.category) : component.category !== panel.category && !pairedLowerSleeve && !forearmPanel) return false
  if (!panel.side) return true
  // Manga/calça imports keep an explicit side even after splitting the piece.
  // Split labels describe the segment ("braço superior", "antebraço") and may
  // no longer contain esquerda/direita; bone IDs are opaque, so inferencing
  // from the label alone incorrectly hid those saved components in the picker.
  return wardrobeComponentSide(component) === panel.side
}

/** Components visible to a picker slot, including a split sleeve's lower half. */
export function wardrobeComponentsForPanel(set: WardrobeSet, panel: WardrobePanel): WardrobeSet['components'] {
  return set.components.filter((component) => wardrobeComponentMatchesPanel(component, panel))
}

function isSleeveUpperPanel(panel: WardrobePanel): boolean {
  return panel.id === 'upper-left' || panel.id === 'upper-right'
}

function isSleeveLowerPanel(panel: WardrobePanel): boolean {
  return panel.id === 'lower-left' || panel.id === 'lower-right'
}

/** Components replaced together when choosing or clearing either half of a linked long sleeve. */
export function wardrobePanelSelectionComponents(set: WardrobeSet, panel: WardrobePanel): WardrobeSet['components'] {
  const visibleComponents = wardrobeComponentsForPanel(set, panel)
  const components = isSleeveUpperPanel(panel)
    ? visibleComponents.filter((component) => component.category === 'manga-superior' && component.sleeveSegment !== 'lower')
    : isSleeveLowerPanel(panel)
      ? visibleComponents.filter((component) => component.category === 'manga-inferior' && component.sleeveSegment !== 'upper')
      : visibleComponents
  const selection = components.flatMap((component) => {
    if (isSleeveUpperPanel(panel) || isSleeveLowerPanel(panel)) return pairedWardrobeSleeveComponents(set, component)
    if (panel.id === 'shoe-left' || panel.id === 'shoe-right') return pairedWardrobeShoeComponents(set, component)
    return [component]
  })
  return [...new Map(selection.map((component) => [component.id, component])).values()]
}

export function wardrobePanelGroupMatchesComponent(
  group: CustomizerWardrobeGroup,
  panel: WardrobePanel,
  modelSlot: number,
  setId: string,
  component: WardrobeSet['components'][number]
): boolean {
  return group.modelSlot === modelSlot && group.setId === setId && group.componentId === component.id
    && (group.category === panel.category
      || component.category === 'manga-inferior' && group.category === 'manga-inferior')
}

export type WardrobePanelCandidate = { summary: WardrobeSetSummary; set: WardrobeSet; component: WardrobeSet['components'][number]; components: WardrobeSet['components']; pairedComponents?: WardrobeSet['components']; headExtraAsset?: FaceComponentAsset }
export type WardrobePanelGenderFilter = { gender: CharacterGender; showOtherGender: boolean }

function wardrobePanelComponentMatchesGender(
  summary: WardrobeSetSummary,
  component: WardrobeSet['components'][number],
  genderFilter: WardrobePanelGenderFilter | undefined
): boolean {
  if (!genderFilter || component.category !== 'camisa' || genderFilter.showOtherGender) return true
  // Roupas DEV opens untagged legacy sets as female, so shirts follow that same default.
  const setGender = summary.previewGender === 'male' ? 'male' : 'female'
  return setGender === genderFilter.gender
}

export function wardrobePanelCandidates(
  panel: WardrobePanel,
  selectedModelSlot: number | null,
  wardrobeSets: WardrobeSetSummary[],
  wardrobeDetails: Record<string, WardrobeSet>,
  faceComponentAssets: FaceComponentAssetSummary[],
  faceComponentDetails: Record<string, FaceComponentAsset>,
  genderFilter?: WardrobePanelGenderFilter
): WardrobePanelCandidate[] {
  const wardrobeCandidates = wardrobeSets
    .filter((summary) => summary.modelSlot === selectedModelSlot)
    .flatMap((summary) => {
      const set = wardrobeDetails[`${summary.modelSlot}:${summary.id}`]
      if (!set) return []
      const components = wardrobeComponentsForPanel(set, panel)
        .filter((component) => wardrobePanelComponentMatchesGender(summary, component, genderFilter))
      if (!components.length) return []
      if (isSleeveUpperPanel(panel)) {
        return components
          .filter((component) => component.category === 'manga-superior' && component.sleeveSegment !== 'lower')
          .map((upper) => {
            const lower = pairedWardrobeSleeveComponents(set, upper).find((component) => component.category === 'manga-inferior')
            const pair = lower ? [upper, lower] : [upper]
            return { summary, set, component: upper, components: pair, pairedComponents: pair }
          })
      }
      if (isSleeveLowerPanel(panel)) {
        return components
          .filter((component) => component.category === 'manga-inferior' && component.sleeveSegment !== 'upper')
          .map((lower) => ({
            summary,
            set,
            component: lower,
            components: [lower],
            pairedComponents: pairedWardrobeSleeveComponents(set, lower)
          }))
      }
      if (panel.id === 'shoe-left' || panel.id === 'shoe-right') {
        return components.map((component) => {
          const pair = pairedWardrobeShoeComponents(set, component)
          return { summary, set, component, components: pair, pairedComponents: pair }
        })
      }
      if (panel.id === 'pants-left') {
        const pantsByPair = new Map<string, typeof components>()
        const unpairedComponents: typeof components = []
        for (const component of components) {
          if (!component.sleevePairId) {
            unpairedComponents.push(component)
            continue
          }
          const pair = pantsByPair.get(component.sleevePairId) ?? []
          pair.push(component)
          pantsByPair.set(component.sleevePairId, pair)
        }
        const pants = [...pantsByPair.values(), ...(unpairedComponents.length ? [unpairedComponents] : [])]
        return pants.map((pair) => ({
          summary,
          set,
          component: pair.find((component) => component.category === 'calca-coxa') ?? pair[0],
          components: pair
        }))
      }
      return components.map((component) => ({ summary, set, component, components: [component] }))
    })

  if (panel.id !== 'glasses' || selectedModelSlot === null) return wardrobeCandidates
  const headExtraCandidates = faceComponentAssets
    .filter((summary) => summary.kind === 'head-extra' && summary.modelSlot === selectedModelSlot)
    .flatMap((summary): WardrobePanelCandidate[] => {
      const asset = faceComponentDetails[summary.id]
      if (!asset || asset.kind !== 'head-extra') return []
      const component: WardrobeSet['components'][number] = { id: asset.id, name: asset.name, category: 'oculos', attachedPartId: 'head', x: 0, y: 0, width: asset.width, height: asset.height, rotation: asset.defaultTransform.rotation, dataUrl: asset.dataUrl }
      const set: WardrobeSet = { schemaVersion: 1, edition: 2, colorMode: asset.colorMode, id: `head-extra:${asset.id}`, modelSlot: summary.modelSlot, modelName: '', name: asset.name, width: asset.width, height: asset.height, components: [component], updatedAt: asset.updatedAt }
      const wardrobeSummary: WardrobeSetSummary = { id: set.id, modelSlot: set.modelSlot, modelName: set.modelName, name: set.name, ...(set.colorMode ? { colorMode: set.colorMode } : {}), updatedAt: set.updatedAt, edition: 2, componentCount: 1 }
      return [{ summary: wardrobeSummary, set, component, components: [component], headExtraAsset: asset }]
    })
  return [...headExtraCandidates, ...wardrobeCandidates]
}

export function createWardrobePanelCandidateIndex({
  panels,
  selectedModelSlot,
  wardrobeSets,
  wardrobeDetails,
  faceComponentAssets,
  faceComponentDetails,
  wardrobeGenderFilter
}: {
  panels: readonly WardrobePanel[]
  selectedModelSlot: number | null
  wardrobeSets: WardrobeSetSummary[]
  wardrobeDetails: Record<string, WardrobeSet>
  faceComponentAssets: FaceComponentAssetSummary[]
  faceComponentDetails: Record<string, FaceComponentAsset>
  wardrobeGenderFilter?: WardrobePanelGenderFilter
}): ReadonlyMap<WardrobePanel['id'], readonly WardrobePanelCandidate[]> {
  const index = new Map<WardrobePanel['id'], readonly WardrobePanelCandidate[]>()
  for (const panel of panels) {
    index.set(panel.id, wardrobePanelCandidates(
      panel,
      selectedModelSlot,
      wardrobeSets,
      wardrobeDetails,
      faceComponentAssets,
      faceComponentDetails,
      wardrobeGenderFilter
    ))
  }
  return index
}

export function isWardrobePanelCandidateSelected(candidate: WardrobePanelCandidate, panel: WardrobePanel, groups: CustomizerWardrobeGroup[], appearance?: CustomizerFaceAppearance): boolean {
  if (candidate.headExtraAsset) return appearance?.modelSlot === candidate.summary.modelSlot && appearance.headExtras?.glasses === candidate.headExtraAsset.id
  return (candidate.pairedComponents ?? candidate.components).some((component) => groups.some((group) => wardrobePanelGroupMatchesComponent(
    group, panel, candidate.summary.modelSlot, candidate.summary.id, component)))
}

