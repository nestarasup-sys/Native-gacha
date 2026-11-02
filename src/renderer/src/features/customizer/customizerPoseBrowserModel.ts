import { resolvePoseCategory, type FabricatorPoseSummary, type FabricatorSlotSummary } from '../../../../shared/fabricator'

type Pose = NonNullable<FabricatorPoseSummary>

type BuildCustomizerPoseBrowserModelOptions = {
  catalogModels: FabricatorSlotSummary[]
  catalogPoses: FabricatorPoseSummary[]
  selectedModelSlot: number | null
  selectedCategory: string
  selectedPage: number
}

export function buildCustomizerPoseBrowserModel({
  catalogModels,
  catalogPoses,
  selectedModelSlot,
  selectedCategory,
  selectedPage
}: BuildCustomizerPoseBrowserModelOptions) {
  const recoveryModelSlots = new Set(catalogModels.flatMap((model) => model?.recoveryRequired ? [model.slot] : []))
  const availablePoses = catalogPoses
    .filter((pose): pose is Pose => pose?.sourceModelSlot === selectedModelSlot && !recoveryModelSlots.has(pose.sourceModelSlot))
    .sort((left, right) => left.slot - right.slot)
  const categories = ['Parado', 'Sentado', ...new Set(availablePoses
    .map(resolvePoseCategory)
    .filter((category) => category !== 'Parado' && category !== 'Sentado'))]
  const categoryPoses = availablePoses.filter((pose) => resolvePoseCategory(pose) === selectedCategory)
  const pageCount = Math.max(1, Math.ceil(categoryPoses.length / 5))
  const activePage = Math.min(selectedPage, pageCount - 1)
  const visiblePoses = categoryPoses.slice(activePage * 5, activePage * 5 + 5)

  return { availablePoses, categories, pageCount, activePage, visiblePoses }
}

export function adjacentCustomizerPoseCategory(categories: readonly string[], current: string, direction: -1 | 1) {
  const currentIndex = categories.indexOf(current)
  return categories[(currentIndex + direction + categories.length) % categories.length]
}

export function adjacentCustomizerPosePage(currentPage: number, pageCount: number, direction: -1 | 1) {
  return Math.max(0, Math.min(pageCount - 1, currentPage + direction))
}
