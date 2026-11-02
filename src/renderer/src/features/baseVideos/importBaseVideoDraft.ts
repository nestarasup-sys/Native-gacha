import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import { createEmptyBaseVideoDetails } from './baseVideoDetailsModel'

type ImportBaseVideoDraftDependencies = {
  importVideo: () => Promise<VideoLibraryItem | null>
  saveDetails: (details: BaseVideoDetails) => Promise<void>
  publishToSession: (item: VideoLibraryItem, details: BaseVideoDetails) => void
  recognizeDuration: (item: VideoLibraryItem) => Promise<VideoLibraryItem>
  updateSessionItem: (item: VideoLibraryItem) => void
  deleteIncompleteImport: (videoId: string) => Promise<void>
  setError: (message: string) => void
  logCleanupFailure: (reason: unknown) => void
}

/** Coordinates Media Library import, Base Videos metadata, draft publication and compensation. */
export async function importBaseVideoDraft({
  importVideo,
  saveDetails,
  publishToSession,
  recognizeDuration,
  updateSessionItem,
  deleteIncompleteImport,
  setError,
  logCleanupFailure
}: ImportBaseVideoDraftDependencies): Promise<void> {
  let importedItem: VideoLibraryItem | null = null
  try {
    importedItem = await importVideo()
    if (!importedItem) return

    const details = createEmptyBaseVideoDetails(importedItem.id)
    await saveDetails(details)
    publishToSession(importedItem, details)

    try {
      const readyItem = await recognizeDuration(importedItem)
      updateSessionItem(readyItem)
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'O vídeo foi importado como rascunho, mas não foi possível reconhecer sua duração.')
    }
  } catch (reason) {
    if (importedItem) {
      await deleteIncompleteImport(importedItem.id).catch(logCleanupFailure)
    }
    setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o vídeo.')
  }
}
