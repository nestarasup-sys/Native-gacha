import type { FabricatorProject, FabricatorProjectSave, ModelPart, WardrobeCategory } from '../../../../../shared/fabricator'
import { suggestWardrobeBone } from './boneSelection'

/** Mapping and serialization helpers shared by the wardrobe editing surface. */
export function getBodyLayer(model: FabricatorProject | null, partId: string): number {
  if (!model) return 0
  const order = model.layerOrder ?? model.parts.map((part) => part.id)
  const layer = order.indexOf(partId)
  return layer >= 0 ? layer : Math.max(0, model.parts.findIndex((part) => part.id === partId))
}
export function serializeModel(model: FabricatorProject): FabricatorProjectSave {
  const { sourceDataUrl: _sourceDataUrl, parts, ...metadata } = model
  return { ...metadata, parts: parts.map(({ dataUrl: _dataUrl, chromaBaseDataUrl: _chromaBaseDataUrl, ...part }) => part) }
}
export function guessBone(category: WardrobeCategory, x: number, width: number, model: FabricatorProject): ModelPart | undefined {
  return suggestWardrobeBone(category, x, width, model).bone ?? undefined
}

