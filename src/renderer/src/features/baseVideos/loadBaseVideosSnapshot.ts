import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import { createEmptyBaseVideoDetails } from './baseVideoDetailsModel'

type LoadBaseVideosSnapshotDependencies = {
  listLibrary: () => Promise<VideoLibraryItem[]>
  listDetails: () => Promise<BaseVideoDetails[]>
  listCategories: () => Promise<BaseVideoCategory[]>
}

export type BaseVideosSnapshot = {
  items: VideoLibraryItem[]
  detailsById: Record<string, BaseVideoDetails>
  categories: BaseVideoCategory[]
}

/** Loads a consistent UI snapshot, keeping library items and their metadata keyed by media ID. */
export async function loadBaseVideosSnapshot({
  listLibrary,
  listDetails,
  listCategories
}: LoadBaseVideosSnapshotDependencies): Promise<BaseVideosSnapshot> {
  const [items, savedDetails, categories] = await Promise.all([listLibrary(), listDetails(), listCategories()])
  const savedById = Object.fromEntries(savedDetails.map((details) => [details.videoId, details]))
  const detailsById = Object.fromEntries(items.map((item) => [
    item.id,
    savedById[item.id] ?? createEmptyBaseVideoDetails(item.id)
  ]))

  return { items, detailsById, categories }
}
