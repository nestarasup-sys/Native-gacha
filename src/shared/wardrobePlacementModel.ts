/** Character-only clothing operations. Never writes Fabricador source or PNGs. */
import type { WardrobeCategory, WardrobeComponent, ModelPart } from './fabricator'
import type { CustomizerWardrobeCategory, CustomizerWardrobeGroup } from './customizer'
import { editWardrobeAdjustment } from './wardrobeAdjustment.ts'

type Adjustment = Partial<Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'>>
type Selection = { modelSlot: number; setId: string; category: CustomizerWardrobeCategory; componentId: string }
type Bone = Pick<ModelPart, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation'>

export function toggleWardrobeVisibility(group: CustomizerWardrobeGroup): CustomizerWardrobeGroup {
  if (group.hidden) { const { opacity: _opacity, ...visible } = group; return { ...visible, hidden: false } }
  return { ...group, hidden: true }
}

export function matchesWardrobeComponent(group: CustomizerWardrobeGroup, selected: Selection): boolean {
  return group.modelSlot === selected.modelSlot && group.setId === selected.setId
    && group.category === selected.category
    && (!group.componentId || group.componentId === selected.componentId)
}

/** Expands legacy whole-category placement only when its source component list is known. */
export function updateWardrobeComponentGroups(
  groups: readonly CustomizerWardrobeGroup[],
  displayedGroups: readonly CustomizerWardrobeGroup[],
  selected: Selection,
  operation: 'transform' | 'toggle-hidden',
  patch: Adjustment | undefined,
  sourceCategories: readonly WardrobeCategory[],
  components: readonly WardrobeComponent[] | undefined,
  poseBones: readonly Bone[]
): CustomizerWardrobeGroup[] {
  const displayed = displayedGroups.find(group => matchesWardrobeComponent(group,selected))
  const update = (group: CustomizerWardrobeGroup) =>
    operation === 'toggle-hidden' ? toggleWardrobeVisibility(group)
      : editWardrobeAdjustment(group, poseBones.find(bone => bone.id === group.adjustmentReference?.boneId),
        patch ?? {}, displayed ?? group)
  const updated: CustomizerWardrobeGroup[] = []
  for(const group of groups) {
    if (!matchesWardrobeComponent(group,selected)) { updated.push(group); continue }
    if (group.componentId) { updated.push(update(group)); continue }
    if (!components) { updated.push(group); continue }
    const matches = components.filter(component => sourceCategories.includes(component.category))
    if (!matches.length) { updated.push(group); continue }
    for(const component of matches) {
      const perComponent = { ...group, componentId: component.id }
      updated.push(component.id === selected.componentId ? update(perComponent) : perComponent)
    }
  }
  return updated
}
