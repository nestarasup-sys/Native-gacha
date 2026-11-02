import type { BaseVideoDetails } from '../../../../shared/baseVideos'

type DeleteBaseVideoCategoryDependencies = {
  categoryId: string
  detailsById: Readonly<Record<string, BaseVideoDetails>>
  flushPendingSave: (videoId: string) => Promise<unknown>
  deleteCategory: (categoryId: string) => Promise<void>
  clearCategoryAssignment: (videoId: string) => void
}

/** Flushes referenced metadata before deleting its category, then clears its assignments. */
export async function deleteBaseVideoCategory({
  categoryId,
  detailsById,
  flushPendingSave,
  deleteCategory,
  clearCategoryAssignment
}: DeleteBaseVideoCategoryDependencies): Promise<string[]> {
  const assignedVideoIds = Object.entries(detailsById)
    .filter(([, details]) => details.categoryId === categoryId)
    .map(([videoId]) => videoId)

  for (const videoId of assignedVideoIds) await flushPendingSave(videoId)
  await deleteCategory(categoryId)
  for (const videoId of assignedVideoIds) clearCategoryAssignment(videoId)

  return assignedVideoIds
}
