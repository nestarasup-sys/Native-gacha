import type { JointLink, ModelPart } from '../../../../../shared/fabricator'
import { createPartJointAnchorResolver, isTorsoPart } from '../../../../../shared/modelRig.ts'

export type FabricatorJointMarker = {
  part: ModelPart
  anchor: { x: number; y: number }
  offset: number
  fixed: boolean
  selected: boolean
}

type AnchoredPart = {
  part: ModelPart
  anchor: { x: number; y: number }
  groupKey: string
}

type AnchorGroup = {
  count: number
  firstIndexByPartId: Map<string, number>
}

/** Builds canvas anchors and their display offsets with indexed passes over joints and parts. */
export function buildFabricatorJointMarkers(
  parts: ModelPart[],
  joints: JointLink[],
  selectedPartIds: readonly string[]
): FabricatorJointMarker[] {
  const resolveAnchor = createPartJointAnchorResolver(joints)
  const groups = new Map<string, AnchorGroup>()
  const anchoredParts: AnchoredPart[] = []

  for (const part of parts) {
    const anchor = resolveAnchor(part)
    const groupKey = `${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { count: 0, firstIndexByPartId: new Map() }
      groups.set(groupKey, group)
    }
    if (!group.firstIndexByPartId.has(part.id)) group.firstIndexByPartId.set(part.id, group.count)
    group.count += 1
    anchoredParts.push({ part, anchor, groupKey })
  }

  const fixedChildIds = new Set<string>()
  for (const joint of joints) if (joint.fixed) fixedChildIds.add(joint.childPartId)
  const selectedIds = new Set(selectedPartIds)
  const markers: Array<FabricatorJointMarker & { order: number }> = []
  for (const [order, item] of anchoredParts.entries()) {
    if (isTorsoPart(item.part)) continue
    const group = groups.get(item.groupKey)!
    const groupIndex = group.firstIndexByPartId.get(item.part.id) ?? 0
    markers.push({
      part: item.part,
      anchor: item.anchor,
      offset: (groupIndex - (group.count - 1) / 2) * 20,
      fixed: fixedChildIds.has(item.part.id),
      selected: selectedIds.has(item.part.id),
      order
    })
  }
  markers.sort((left, right) => Number(left.selected) - Number(right.selected) || left.order - right.order)
  return markers.map(({ order: _order, ...marker }) => marker)
}
