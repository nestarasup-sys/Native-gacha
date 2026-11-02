import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'

type CreateBaseVideoCategoryDependencies = {
  name: string
  videoId: string
  createCategory: (name: string) => Promise<BaseVideoCategory>
  appendCategory: (category: BaseVideoCategory) => void
  assignCategory: (videoId: string, categoryId: string) => void
  clearName: () => void
}

/** Persists a category before publishing it locally and assigning its video. */
export async function createBaseVideoCategory({
  name,
  videoId,
  createCategory,
  appendCategory,
  assignCategory,
  clearName
}: CreateBaseVideoCategoryDependencies): Promise<BaseVideoCategory> {
  const category = await createCategory(name)
  appendCategory(category)
  assignCategory(videoId, category.id)
  clearName()
  return category
}

type RenameBaseVideoCategoryDependencies = {
  categoryId: string
  name: string
  renameCategory: (categoryId: string, name: string) => Promise<BaseVideoCategory>
  replaceCategory: (category: BaseVideoCategory) => void
  finishEditing: () => void
}

/** Replaces local category data and closes rename mode only after persistence succeeds. */
export async function renameBaseVideoCategory({
  categoryId,
  name,
  renameCategory,
  replaceCategory,
  finishEditing
}: RenameBaseVideoCategoryDependencies): Promise<BaseVideoCategory> {
  const category = await renameCategory(categoryId, name)
  replaceCategory(category)
  finishEditing()
  return category
}

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
