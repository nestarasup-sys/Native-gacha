/** Canais IPC do catálogo de rosto e assets faciais do Fabricador. */
import { basename, dirname, resolve } from 'node:path'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type {
  FaceAssetKind, FaceAssetSave, FaceCatalogItem, FaceCatalogItemSave, FaceCatalogItemSummary,
  FaceComponentAsset, FaceComponentAssetSave, FaceComponentAssetSummary,
  FaceSet, FaceSetSave, FaceSetSummary
} from '../../../src/shared/fabricator'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels.ts'
import {
  assertFaceCatalogItemHasNoReferences, assertFaceComponentHasNoReferences, assertFaceSetHasNoReferences
} from './faceReferences.ts'
import type { FaceReferenceSnapshot } from './faceReferences.ts'

type Dependencies = {
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  isValidFaceCatalogId: (id: string) => boolean
  listFaceSets: (modelSlot: number) => Promise<FaceSetSummary[]>
  readFaceSet: (modelSlot: number, id: string) => Promise<FaceSet | null>
  writeFaceSet: (modelSlot: number, set: FaceSetSave, assets: FaceAssetSave[]) => Promise<void>
  faceModelPath: (modelSlot: number) => string
  faceSetPath: (modelSlot: number, id: string) => string
  listFaceCatalogItems: (modelSlot: number) => Promise<FaceCatalogItemSummary[]>
  readFaceCatalogItem: (modelSlot: number, id: string) => Promise<FaceCatalogItem | null>
  writeFaceCatalogItem: (modelSlot: number, item: FaceCatalogItemSave, assets: FaceAssetSave[]) => Promise<void>
  faceCatalogPath: (modelSlot: number) => string
  faceCatalogItemPath: (modelSlot: number, id: string) => string
  listFaceComponentAssets: (modelSlot: number, kind?: FaceAssetKind) => Promise<FaceComponentAssetSummary[]>
  readFaceComponentAsset: (modelSlot: number, id: string) => Promise<FaceComponentAsset | null>
  writeFaceComponentAsset: (modelSlot: number, asset: FaceComponentAssetSave, dataUrl: string) => Promise<void>
  faceComponentPath: (modelSlot: number) => string
  faceComponentItemPath: (modelSlot: number, id: string) => string
  hasStoredFaceCatalogItem: (modelSlot: number, id: string) => Promise<boolean>
  withReferenceSnapshot: <T>(modelSlot: number, operation: (snapshot: FaceReferenceSnapshot) => Promise<T>) => Promise<T>
  removeDirectory: (path: string) => Promise<void>
}

export function registerFabricatorFaceCatalogHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  deps: Dependencies
): { getPendingWrites: () => Promise<void>[] } {
  const saveQueues = new Map<number, Promise<void>>()
  const queueSave = (modelSlot: number, operation: () => Promise<void>): Promise<void> => {
    const previous = saveQueues.get(modelSlot) ?? Promise.resolve()
    // Keep the raw tail so a failed write remains visible to flush and backup.
    const next = previous.catch(() => undefined).then(operation)
    saveQueues.set(modelSlot, next)
    return next
  }

  ipc.handle('fabricator:face:list', async (event, modelSlot: number): Promise<FaceSetSummary[]> => {
    assertTrustedSender(event)
    return deps.listFaceSets(modelSlot)
  })

  ipc.handle('fabricator:face:load', async (event, modelSlot: number, id: string): Promise<FaceSet | null> => {
    assertTrustedSender(event)
    return deps.readFaceSet(modelSlot, id)
  })

  ipc.handle('fabricator:face:save', async (event, modelSlot: number, set: FaceSetSave, assets: FaceAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Rosto inválido.')
    return queueSave(modelSlot, () => deps.writeFaceSet(modelSlot, set, assets))
  })

  ipc.handle('fabricator:face:delete', async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Rosto inválido.')
    const base = resolve(deps.faceModelPath(modelSlot))
    const target = resolve(deps.faceSetPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `set-${id}`) throw new Error('Caminho de exclusão inválido.')
    return queueSave(modelSlot, () => deps.withReferenceSnapshot(modelSlot, async (snapshot) => {
      await deps.readFaceSet(modelSlot, id)
      assertFaceSetHasNoReferences(snapshot, modelSlot, id)
      await deps.removeDirectory(target)
    }))
  })

  ipc.handle('fabricator:face-catalog:list', async (event, modelSlot: number): Promise<FaceCatalogItemSummary[]> => {
    assertTrustedSender(event)
    return deps.listFaceCatalogItems(modelSlot)
  })

  ipc.handle('fabricator:face-catalog:load', async (event, modelSlot: number, id: string): Promise<FaceCatalogItem | null> => {
    assertTrustedSender(event)
    return deps.readFaceCatalogItem(modelSlot, id)
  })

  ipc.handle('fabricator:face-catalog:save', async (event, modelSlot: number, item: FaceCatalogItemSave, assets: FaceAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Peça facial inválida.')
    return queueSave(modelSlot, () => deps.writeFaceCatalogItem(modelSlot, item, assets))
  })

  ipc.handle('fabricator:face-catalog:delete', async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidFaceCatalogId(id)) throw new Error('Peça facial inválida.')
    const base = resolve(deps.faceCatalogPath(modelSlot))
    const target = resolve(deps.faceCatalogItemPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `item-${id}`) throw new Error('Caminho de exclusão inválido.')
    return queueSave(modelSlot, () => deps.withReferenceSnapshot(modelSlot, async (snapshot) => {
      await deps.readFaceCatalogItem(modelSlot, id)
      assertFaceCatalogItemHasNoReferences(snapshot, modelSlot, id)
      if (!await deps.hasStoredFaceCatalogItem(modelSlot, id)) {
        throw new Error('Esta peça pertence a um conjunto facial legado. Edite e salve a categoria no catálogo antes de excluí-la individualmente.')
      }
      await deps.removeDirectory(target)
    }))
  })

  ipc.handle(fabricatorIpcChannels.listFaceComponentAssets, async (event, modelSlot: number, kind?: FaceAssetKind): Promise<FaceComponentAssetSummary[]> => {
    assertTrustedSender(event)
    return deps.listFaceComponentAssets(modelSlot, kind)
  })

  ipc.handle(fabricatorIpcChannels.loadFaceComponentAsset, async (event, modelSlot: number, id: string): Promise<FaceComponentAsset | null> => {
    assertTrustedSender(event)
    return deps.readFaceComponentAsset(modelSlot, id)
  })

  ipc.handle(fabricatorIpcChannels.saveFaceComponentAsset, async (event, modelSlot: number, asset: FaceComponentAssetSave, dataUrl: string): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Asset facial inválido; use uma imagem PNG.')
    return queueSave(modelSlot, () => deps.writeFaceComponentAsset(modelSlot, asset, dataUrl))
  })

  ipc.handle(fabricatorIpcChannels.deleteFaceComponentAsset, async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Asset facial inválido.')
    const base = resolve(deps.faceComponentPath(modelSlot))
    const target = resolve(deps.faceComponentItemPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `item-${id}`) throw new Error('Caminho de exclusão inválido.')
    return queueSave(modelSlot, () => deps.withReferenceSnapshot(modelSlot, async (snapshot) => {
      const asset = await deps.readFaceComponentAsset(modelSlot, id)
      assertFaceComponentHasNoReferences(snapshot, modelSlot, id, asset?.name ?? id)
      await deps.removeDirectory(target)
    }))
  })

  return { getPendingWrites: () => [...saveQueues.values()] }
}
