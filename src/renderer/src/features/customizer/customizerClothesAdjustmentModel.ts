import type { WardrobeCategory, WardrobeSet } from '../../../../shared/fabricator'
import type { CustomizerWardrobeCategory, CustomizerWardrobeGroup } from '../../../../shared/customizer'

export type ClothingAdjustEntry = {
  group: CustomizerWardrobeGroup
  component: WardrobeSet['components'][number]
  set: WardrobeSet
  pairStart: boolean
}

type ScopeDefinition = { id: CustomizerWardrobeCategory; source: WardrobeCategory[] }

/** Orders applied pieces by set, category, source layer and left/right pair. */
export function buildClothesAdjustmentEntries(
  groups: CustomizerWardrobeGroup[],
  wardrobeDetails: Record<string, WardrobeSet>,
  scopeDefinitions: ScopeDefinition[]
): ClothingAdjustEntry[] {
  const scopeCategoryIds = new Set(scopeDefinitions.map((item) => item.id))
  const selectedGroups = groups.filter((group) => scopeCategoryIds.has(group.category))
  const setOrder = new Map<string, number>()
  selectedGroups.forEach((group) => {
    const key = `${group.modelSlot}:${group.setId}`
    if (!setOrder.has(key)) setOrder.set(key, setOrder.size)
  })
  const sideOrder = (component: WardrobeSet['components'][number]) => {
    const side = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
    const isLeft = /\besquerd[oa]\b|\bleft\b/.test(side)
    const isRight = /\bdireit[oa]\b|\bright\b/.test(side)
    return isLeft && !isRight ? 0 : isRight && !isLeft ? 1 : 2
  }
  const sorted = selectedGroups.flatMap((group) => {
    const set = wardrobeDetails[`${group.modelSlot}:${group.setId}`]
    if (!set) return []
    const definition = scopeDefinitions.find((item) => item.id === group.category)
    const acceptedCategories = definition?.source ?? []
    const parts = group.componentId
      ? set.components.filter((component) => component.id === group.componentId)
      : set.components.filter((component) => acceptedCategories.includes(component.category))
    return parts.map((component) => ({
      group: { ...group, componentId: component.id },
      component,
      set,
      categoryOrder: scopeDefinitions.findIndex((item) => item.id === group.category),
      sourceOrder: acceptedCategories.indexOf(component.category)
    }))
  }).filter((entry, index, list) => list.findIndex((candidate) => candidate.group.modelSlot === entry.group.modelSlot && candidate.group.setId === entry.group.setId && candidate.group.category === entry.group.category && candidate.component.id === entry.component.id) === index)
    .sort((a, b) => {
      const setKeyA = `${a.group.modelSlot}:${a.group.setId}`
      const setKeyB = `${b.group.modelSlot}:${b.group.setId}`
      const setOrderDifference = (setOrder.get(setKeyA) ?? 0) - (setOrder.get(setKeyB) ?? 0)
      if (setOrderDifference) return setOrderDifference
      const categoryOrderDifference = a.categoryOrder - b.categoryOrder
      if (categoryOrderDifference) return categoryOrderDifference
      const sourceOrderDifference = a.sourceOrder - b.sourceOrder
      if (sourceOrderDifference) return sourceOrderDifference
      return sideOrder(a.component) - sideOrder(b.component)
    })

  const arePairSiblings = (a: (typeof sorted)[number], b: (typeof sorted)[number]) =>
    a.group.modelSlot === b.group.modelSlot && a.group.setId === b.group.setId && a.group.category === b.group.category && sideOrder(a.component) === 0 && sideOrder(b.component) === 1
  return sorted.map((entry, index, entries) => ({
    group: entry.group,
    component: entry.component,
    set: entry.set,
    pairStart: sideOrder(entry.component) === 0 && entries.slice(index + 1).some((candidate) => arePairSiblings(entry, candidate))
  }))
}
