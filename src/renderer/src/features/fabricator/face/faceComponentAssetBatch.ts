import type { FabricatorDesktopApi } from '../../../../../shared/fabricator'
import type { FaceComponentImportEntry } from './faceComponentImportModel.ts'

type FaceComponentAssetWriter = Pick<FabricatorDesktopApi, 'saveFaceComponentAsset' | 'deleteFaceComponentAsset'>

export function assertFaceComponentImportActive(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Importação cancelada.')
  error.name = 'AbortError'
  throw error
}

/** Saves a new asset batch in order and removes every attempted generated ID on failure. */
export async function saveFaceComponentAssetBatch(
  writer: FaceComponentAssetWriter,
  modelSlot: number,
  entries: readonly FaceComponentImportEntry[],
  signal?: AbortSignal
): Promise<void> {
  const attemptedIds: string[] = []
  try {
    for (const { asset, dataUrl } of entries) {
      assertFaceComponentImportActive(signal)
      attemptedIds.push(asset.id)
      await writer.saveFaceComponentAsset(modelSlot, asset, dataUrl)
      assertFaceComponentImportActive(signal)
    }
  } catch (reason) {
    await Promise.allSettled(attemptedIds.map((id) => writer.deleteFaceComponentAsset(modelSlot, id)))
    throw reason
  }
}
