/** Contratos de peças por painel: nomes esquerda/direita, seleção e miniaturas.
 * Os PNGs continuam fontes permanentes do Fabricador DEV; nenhuma escrita aqui.
 */
import type { FaceComponentAsset, FaceComponentAssetSummary, WardrobeCategory, WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import type { CustomizerFaceAppearance, CustomizerWardrobeGroup, CustomizerWardrobePaletteKey } from '../../../../shared/customizer'
import type { ClothingGroupCategory } from '../../characters/characterRenderer'

export type WardrobePanel = { id: CustomizerWardrobePaletteKey; label: string; category: ClothingGroupCategory; side: 'left' | 'right' | null; source?: WardrobeCategory[] }
export const upperWardrobePanels: WardrobePanel[] = [
  { id: 'shirt', label: 'Camisa', category: 'camisa', side: null },
  { id: 'jacket', label: 'Jaqueta', category: 'jaqueta', side: null },
  { id: 'upper-left', label: 'Manga superior esquerda', category: 'manga-superior', side: 'left' },
  { id: 'upper-right', label: 'Manga superior direita', category: 'manga-superior', side: 'right' },
  { id: 'lower-left', label: 'Manga inferior esquerda', category: 'manga-inferior', side: 'left' },
  { id: 'lower-right', label: 'Manga inferior direita', category: 'manga-inferior', side: 'right' }
]
export const upperWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'gloves-left', label: 'Luvas esquerda', category: 'luvas', side: 'left' },
  { id: 'gloves-right', label: 'Luvas direita', category: 'luvas', side: 'right' },
  { id: 'cape', label: 'Capa', category: 'capa', side: null },
  { id: 'belt', label: 'Cinto', category: 'cinto', side: null },
  { id: 'skirt', label: 'Saia superior', category: 'saia-superior', side: null, source: ['saia'] }
]
export const accessoryWardrobePanels: WardrobePanel[] = [
  { id: 'glasses', label: 'Óculos', category: 'oculos', side: null },
  { id: 'head-accessory', label: 'Acessório de cabeça', category: 'acessorio-cabeca', side: null }
]
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
export function wardrobeComponentMatchesPanel(component: WardrobeSet['components'][number], panel: WardrobePanel): boolean {
  if (panel.source ? !panel.source.includes(component.category) : component.category !== panel.category) return false
  if (!panel.side) return true
  const sideHint = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
  const left = /\besquerd[oa]\b|\bleft\b/.test(sideHint)
  const right = /\bdireit[oa]\b|\bright\b/.test(sideHint)
  return panel.side === 'left' ? left && !right : right && !left
}

export type WardrobePanelCandidate = { summary: WardrobeSetSummary; set: WardrobeSet; component: WardrobeSet['components'][number]; components: WardrobeSet['components']; headExtraAsset?: FaceComponentAsset }

export function wardrobePanelCandidates(
  panel: WardrobePanel,
  selectedModelSlot: number | null,
  wardrobeSets: WardrobeSetSummary[],
  wardrobeDetails: Record<string, WardrobeSet>,
  faceComponentAssets: FaceComponentAssetSummary[],
  faceComponentDetails: Record<string, FaceComponentAsset>
): WardrobePanelCandidate[] {
  const wardrobeCandidates = wardrobeSets
    .filter((summary) => summary.modelSlot === selectedModelSlot)
    .flatMap((summary) => {
      const set = wardrobeDetails[`${summary.modelSlot}:${summary.id}`]
      if (!set) return []
      const components = set.components.filter((component) => wardrobeComponentMatchesPanel(component, panel))
      if (!components.length) return []
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
      const set: WardrobeSet = { schemaVersion: 1, edition: 2, id: `head-extra:${asset.id}`, modelSlot: summary.modelSlot, modelName: '', name: asset.name, width: asset.width, height: asset.height, components: [component], updatedAt: asset.updatedAt }
      const wardrobeSummary: WardrobeSetSummary = { id: set.id, modelSlot: set.modelSlot, modelName: set.modelName, name: set.name, updatedAt: set.updatedAt, edition: 2, componentCount: 1 }
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
  faceComponentDetails
}: {
  panels: readonly WardrobePanel[]
  selectedModelSlot: number | null
  wardrobeSets: WardrobeSetSummary[]
  wardrobeDetails: Record<string, WardrobeSet>
  faceComponentAssets: FaceComponentAssetSummary[]
  faceComponentDetails: Record<string, FaceComponentAsset>
}): ReadonlyMap<WardrobePanel['id'], readonly WardrobePanelCandidate[]> {
  const index = new Map<WardrobePanel['id'], readonly WardrobePanelCandidate[]>()
  for (const panel of panels) {
    index.set(panel.id, wardrobePanelCandidates(
      panel,
      selectedModelSlot,
      wardrobeSets,
      wardrobeDetails,
      faceComponentAssets,
      faceComponentDetails
    ))
  }
  return index
}

export function isWardrobePanelCandidateSelected(candidate: WardrobePanelCandidate, panel: WardrobePanel, groups: CustomizerWardrobeGroup[], appearance?: CustomizerFaceAppearance): boolean {
  if (candidate.headExtraAsset) return appearance?.modelSlot === candidate.summary.modelSlot && appearance.headExtras?.glasses === candidate.headExtraAsset.id
  return candidate.components.every((component) => groups.some((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && group.componentId === component.id))
}

