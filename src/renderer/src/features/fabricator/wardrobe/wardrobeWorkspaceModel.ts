import type { FabricatorProject, FabricatorProjectSave, WardrobeCategory, WardrobeComponent, WardrobeSetSummary } from '../../../../../shared/fabricator'

export const wardrobeCategoryNames: Record<WardrobeCategory, string> = {
  camisa: 'Camisas', jaqueta: 'Jaquetas', 'manga-superior': 'Mangas superiores', 'manga-inferior': 'Mangas inferiores', luvas: 'Luvas', capa: 'Capa', cinto: 'Cinto', oculos: 'Óculos', 'acessorio-cabeca': 'Acessórios de cabeça', saia: 'Saia', 'calca-coxa': 'Calças · coxas', 'calca-canela': 'Calças · canelas', shorts: 'Shorts', meia: 'Meias', sapato: 'Sapatos'
}

export const wardrobeCategories = Object.keys(wardrobeCategoryNames) as WardrobeCategory[]

export function wardrobeSetPresentation(kind: WardrobeSetSummary['importKind']) {
  if (kind?.startsWith('torso-grid-')) return { title: 'Tronco', className: 'grid-import' }
  if (kind === 'sleeve-grid-3x4') return { title: 'Mangas', className: 'sleeves-import' }
  if (kind === 'pants-grid-3x4') return { title: 'Calças', className: 'pants-import' }
  if (kind === 'shoe-grid-3x4') return { title: 'Sapatos', className: 'shoes-import' }
  return { title: 'Completo', className: 'complete-import' }
}

export function getWardrobeBodyLayer(model: FabricatorProject | null, partId: string): number {
  if (!model) return 0
  const order = model.layerOrder ?? model.parts.map((part) => part.id)
  const layer = order.indexOf(partId)
  return layer >= 0 ? layer : Math.max(0, model.parts.findIndex((part) => part.id === partId))
}

export function serializeWardrobeReferenceModel(model: FabricatorProject): FabricatorProjectSave {
  const { sourceDataUrl: _sourceDataUrl, parts, ...metadata } = model
  return { ...metadata, parts: parts.map(({ dataUrl: _dataUrl, chromaBaseDataUrl: _chromaBaseDataUrl, ...part }) => part) }
}

export function isLongJointSplitCandidate(component: WardrobeComponent | null | undefined): component is WardrobeComponent {
  if (!component?.sleevePairId || component.sleeveSegment !== 'whole') return false
  if (component.sleeveJointSplit === 'leg') return component.category === 'calca-coxa'
  if (component.sleeveJointSplit === 'arm') return component.category === 'manga-superior'
  return /^(Manga longa|Calça longa)/i.test(component.name)
}

export function wardrobeImageCounterpart(component: WardrobeComponent | null | undefined, components: readonly WardrobeComponent[]): WardrobeComponent | undefined {
  if (!component?.sleevePairId || !component.sleeveSide) return undefined
  return components.find((candidate) => candidate.id !== component.id
    && candidate.sleevePairId === component.sleevePairId
    && candidate.sleeveSide !== component.sleeveSide
    && candidate.sleeveSegment === component.sleeveSegment)
}
