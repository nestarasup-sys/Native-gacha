import type { CustomizerWardrobeGroup } from '../../../../../shared/customizer'
import type { FabricatorProject, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { mapWardrobeComponentToPose } from '../../../../../shared/wardrobePose.ts'

const wardrobeCategories: Record<CustomizerWardrobeGroup['category'], readonly string[]> = {
  camisa: ['camisa'], jaqueta: ['jaqueta'], 'manga-superior': ['manga-superior'], 'manga-inferior': ['manga-inferior'],
  luvas: ['luvas'], capa: ['capa'], cinto: ['cinto'], saia: ['saia'], 'saia-superior': ['saia'], 'saia-inferior': ['saia'],
  calca: ['calca-coxa', 'calca-canela', 'shorts'], shorts: ['shorts'], meia: ['meia'], sapato: ['sapato'], oculos: ['oculos'], 'acessorio-cabeca': ['acessorio-cabeca']
}

export type AnimatorGarmentLayer = {
  key: string
  dataUrl: string
  originX: number
  originY: number
  centerX: number
  centerY: number
  matrix: string
  localLeft: number
  localTop: number
  width: number
  height: number
  rotation: number
  groupX: number
  groupY: number
  groupScaleX: number
  groupScaleY: number
  groupRotation: number
  opacity: number
  zIndex: number
}

/** Resolve character garments onto an animation pose while preserving each saved piece's own fit. */
export function buildAnimatorGarmentLayers({
  rigProject,
  displayProject,
  wardrobeGroups,
  wardrobeDetails,
  layerIndex,
  layerStride
}: {
  rigProject: FabricatorProject | null
  displayProject: FabricatorProject | null
  wardrobeGroups: readonly CustomizerWardrobeGroup[]
  wardrobeDetails: Readonly<Record<string, WardrobeSet>>
  layerIndex: ReadonlyMap<string, number>
  layerStride: number
}): AnimatorGarmentLayer[] {
  if (!rigProject || !displayProject) return []

  // A pose can contain many outfit pieces; index each skeleton once per preview calculation.
  const sourceParts = firstPartById(rigProject)
  const displayParts = firstPartById(displayProject)
  const entries: AnimatorGarmentLayer[] = []
  let sequence = 0

  for (const group of wardrobeGroups) {
    if (group.modelSlot !== rigProject.slot) continue
    const set = wardrobeDetails[`${group.modelSlot}:${group.setId}`]
    if (!set) continue
    const acceptedCategories = wardrobeCategories[group.category]
    const components = set.components.filter((component) => acceptedCategories.includes(component.category)
      && (!group.componentId || group.componentId === component.id))
    const mapped: Array<{
      component: WardrobeComponent
      transform: ReturnType<typeof mapWardrobeComponentToPose>
      layer: number
    }> = []

    for (const component of components) {
      const sourceBone = sourceParts.get(component.attachedPartId)
      const poseBone = displayParts.get(component.attachedPartId)
      if (!sourceBone || !poseBone) continue
      // Automatic knee and sleeve expansion was removed by the shared wardrobe-fit rule.
      mapped.push({
        component,
        transform: mapWardrobeComponentToPose(component, sourceBone, poseBone),
        layer: layerIndex.get(poseBone.id) ?? 0
      })
    }

    if (!mapped.length) continue
    const centerX = mapped.reduce((sum, item) => sum + item.transform.origin.x / mapped.length, 0)
    const centerY = mapped.reduce((sum, item) => sum + item.transform.origin.y / mapped.length, 0)
    for (const item of mapped) {
      entries.push({
        key: `${group.setId}:${group.category}:${item.component.id}`,
        dataUrl: item.component.dataUrl,
        originX: item.transform.origin.x,
        originY: item.transform.origin.y,
        centerX,
        centerY,
        matrix: item.transform.matrix,
        localLeft: item.transform.localLeft,
        localTop: item.transform.localTop,
        width: item.transform.renderWidth,
        height: item.transform.renderHeight,
        rotation: item.transform.localRotation,
        groupX: group.offsetX,
        groupY: group.offsetY,
        groupScaleX: group.scaleX,
        groupScaleY: group.scaleY,
        groupRotation: group.rotation,
        opacity: Math.min(1, Math.max(0, group.opacity ?? 1)),
        zIndex: item.layer * layerStride + 4 + sequence % Math.max(1, layerStride - 8)
      })
      sequence++
    }
  }

  return entries
}

function firstPartById(project: FabricatorProject): Map<string, FabricatorProject['parts'][number]> {
  const parts = new Map<string, FabricatorProject['parts'][number]>()
  for (const part of project.parts) {
    if (!parts.has(part.id)) parts.set(part.id, part)
  }
  return parts
}
