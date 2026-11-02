import type {
  FabricatorHistoryState,
  FabricatorProject,
  FabricatorSlotSummary,
  WardrobeCatalogListing
} from '../../../../../shared/fabricator'

type LoadWardrobeWorkspaceSnapshotDependencies = {
  listSlots: () => Promise<FabricatorSlotSummary[]>
  loadModel: (slot: number) => Promise<FabricatorProject | null>
  listWardrobeSets: (slot: number) => Promise<WardrobeCatalogListing>
  loadHistory: (slot: number) => Promise<FabricatorHistoryState | null>
  recoverReference: (reference: FabricatorProject, history: FabricatorHistoryState) => FabricatorProject
}

export type WardrobeWorkspaceSnapshot =
  | { kind: 'redirect'; models: FabricatorSlotSummary[]; targetSlot: number }
  | { kind: 'loaded'; models: FabricatorSlotSummary[]; model: FabricatorProject | null; catalog: WardrobeCatalogListing }

/** Loads one wardrobe session and recovers its read-only source reference from history when available. */
export async function loadWardrobeWorkspaceSnapshot(
  targetSlot: number,
  { listSlots, loadModel, listWardrobeSets, loadHistory, recoverReference }: LoadWardrobeWorkspaceSnapshotDependencies
): Promise<WardrobeWorkspaceSnapshot> {
  const [models, reference, catalog] = await Promise.all([
    listSlots(),
    loadModel(targetSlot),
    listWardrobeSets(targetSlot)
  ])
  const firstAvailableModel = models.find((slot) => slot)

  if (!reference && firstAvailableModel && firstAvailableModel.slot !== targetSlot) {
    return { kind: 'redirect', models, targetSlot: firstAvailableModel.slot }
  }

  let model = reference
  if (reference) {
    try {
      const history = await loadHistory(targetSlot)
      if (history) model = recoverReference(reference, history)
    } catch {
      // Keep calibration available when history is missing or cannot be read.
    }
  }

  return { kind: 'loaded', models, model, catalog }
}
