/** Character-only clothing operations. Never writes Fabricador source or PNGs. */
import type { WardrobeCategory, WardrobeComponent, ModelPart } from './fabricator'
import type { CustomizerWardrobeCategory, CustomizerWardrobeGroup } from './customizer'
import { editWardrobeAdjustment } from './wardrobeAdjustment.ts'

type Adjustment = Partial<Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'>>
type Selection = { modelSlot: number; setId: string; category: CustomizerWardrobeCategory; componentId: string }
type Bone = Pick<ModelPart, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation'>

/** Keep a character's picker slot aligned with the source component after its category changes. */
export function wardrobeGroupCategoryForSource(
  sourceCategory: WardrobeCategory,
  currentCategory: CustomizerWardrobeCategory
): CustomizerWardrobeCategory {
  if (sourceCategory === 'calca-coxa' || sourceCategory === 'calca-canela' || sourceCategory === 'shorts') return 'calca'
  if (sourceCategory === 'saia' && (currentCategory === 'saia-superior' || currentCategory === 'saia-inferior')) return currentCategory
  return sourceCategory
}

export function toggleWardrobeVisibility(group: CustomizerWardrobeGroup): CustomizerWardrobeGroup {
  if (group.hidden) { const { opacity: _opacity, ...visible } = group; return { ...visible, hidden: false } }
  return { ...group, hidden: true }
}

export function matchesWardrobeComponent(group: CustomizerWardrobeGroup, selected: Selection): boolean {
  if (group.modelSlot !== selected.modelSlot || group.setId !== selected.setId) return false
  // Category is editable catalog metadata. Once a character stores a stable
  // component ID, that ID remains the identity even if the category changes.
  if (group.componentId) return group.componentId === selected.componentId
  return group.category === selected.category
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

/** All per-component palette mutations are isolated from Fabricador manifests. */
export function recolorWardrobeComponents(
  groups: readonly CustomizerWardrobeGroup[],
  modelSlot: number, setId: string, _category: CustomizerWardrobeCategory,
  componentIds: readonly string[],
  change: { kind: 'replace'; colors: NonNullable<CustomizerWardrobeGroup['colors']> }
    | { kind: 'role'; role: keyof NonNullable<CustomizerWardrobeGroup['colors']>; value: string }
    | { kind: 'clear' }
): CustomizerWardrobeGroup[] {
  const ids = new Set(componentIds)
  return groups.map(group => {
    if (group.modelSlot !== modelSlot || group.setId !== setId
        || !group.componentId || !ids.has(group.componentId)) return group
    if (change.kind === 'clear') { const { colors: _colors, ...rest } = group; return rest }
    return { ...group, colors: change.kind === 'replace' ? change.colors
      : { ...group.colors, [change.role]: change.value } }
  })
}

/** Replace one Customizer picker slot without removing opposite-side garments. */
export function selectWardrobePanelComponents(
  groups: readonly CustomizerWardrobeGroup[],
  modelSlot: number,
  category: CustomizerWardrobeCategory,
  panelComponentKeys: readonly string[],
  next: { modelSlot: number; setId: string; componentIds: readonly string[]; colors?: CustomizerWardrobeGroup['colors'] } | null
): CustomizerWardrobeGroup[] {
  const known = new Set(panelComponentKeys)
  const after = groups.filter(group => {
    if (group.modelSlot !== modelSlot) return true
    if (!group.componentId) return group.category !== category // Legacy category-wide entry for this slot.
    return !known.has(`${group.modelSlot}:${group.setId}:${group.componentId}`)
  })
  if (next) after.push(...next.componentIds.map(componentId => ({
    modelSlot:next.modelSlot,setId:next.setId,category,componentId,
    offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0,
    ...(next.colors ? {colors:next.colors} : {})
  })))
  return after
}
