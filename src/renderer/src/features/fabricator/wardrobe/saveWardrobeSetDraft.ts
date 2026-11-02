import type {
  WardrobeAssetSave,
  WardrobeSet,
  WardrobeSetSave,
  WardrobeSetSummary
} from '../../../../../shared/fabricator'
import { wardrobeSaveAssets } from './wardrobeSaveAssets'

export type SaveWardrobeSetDraftApi = {
  saveWardrobeSet(modelSlot: number, project: WardrobeSetSave, assets: WardrobeAssetSave[]): Promise<void>
  listWardrobeSets(modelSlot: number): Promise<WardrobeSetSummary[]>
  notifyAssetsUpdated(): void
}

export type SavedWardrobeSetDraft = {
  set: WardrobeSet
  sets: WardrobeSetSummary[]
}

/** Persists the draft's current image assets while keeping PNG data outside metadata. */
export async function saveWardrobeSetDraft(
  draft: WardrobeSet,
  modelSlot: number,
  modelName: string | undefined,
  api: SaveWardrobeSetDraftApi,
  updatedAt = new Date().toISOString()
): Promise<SavedWardrobeSetDraft> {
  const set: WardrobeSet = {
    ...draft,
    edition: 1,
    modelSlot,
    modelName: modelName ?? draft.modelName,
    updatedAt
  }
  const serialized: WardrobeSetSave = {
    ...set,
    components: set.components.map(({ dataUrl: _dataUrl, deformationOriginalDataUrl: _originalDataUrl, ...component }) => ({
      ...component,
      renderAboveHair: (component.category === 'oculos' || component.category === 'acessorio-cabeca')
        && component.renderAboveHair === true
    }))
  }

  await api.saveWardrobeSet(modelSlot, serialized, wardrobeSaveAssets(set))
  api.notifyAssetsUpdated()
  const sets = await api.listWardrobeSets(modelSlot)
  return { set, sets }
}
