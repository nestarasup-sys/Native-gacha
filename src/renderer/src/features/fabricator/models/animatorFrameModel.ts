import { applyCurrentModelSkinContours } from '../../../../../shared/fabricatorModelViews.ts'
import { partJointAnchor } from '../../../../../shared/modelRig.ts'
import { rotatePointAroundOrigin } from './geometry.ts'
import type {
  AnimatorAnimation,
  AnimatorAnimationDraft,
  AnimatorAnimationSave,
  AnimatorFrameTransform,
  FabricatorPose,
  FabricatorProject,
  JointLink,
  PosePart
} from '../../../../../shared/fabricator'

export type AnimatorFrameState = {
  animation: AnimatorAnimation | null
  transforms: Record<string, AnimatorFrameTransform>
  joints: JointLink[]
  frameId: string
}

export function makePoseProject(source: FabricatorProject, pose: FabricatorPose): FabricatorProject {
  return {
    ...source,
    width: pose.width,
    height: pose.height,
    parts: applyCurrentModelSkinContours(pose.parts, source.parts),
    joints: pose.joints,
    layerOrder: pose.layerOrder,
    hiddenPartIds: pose.hiddenPartIds
  }
}

export function projectFromAnimation(animation: AnimatorAnimation, currentModel?: FabricatorProject | null): FabricatorProject {
  return {
    schemaVersion: 1,
    chromaVersion: 0,
    slot: animation.sourceModelSlot,
    name: animation.sourceModelName,
    sourceName: animation.sourceModelName,
    sourceAssetName: '',
    sourceDataUrl: '',
    width: animation.width,
    height: animation.height,
    tolerance: 0,
    parts: applyCurrentModelSkinContours(animation.parts, currentModel?.parts ?? []),
    joints: animation.joints,
    layerOrder: animation.layerOrder,
    hiddenPartIds: animation.hiddenPartIds,
    updatedAt: animation.sourceModelUpdatedAt
  }
}

export function transformsFromProject(project: Pick<FabricatorProject, 'parts'>): Record<string, AnimatorFrameTransform> {
  return Object.fromEntries(project.parts.map((part) => [part.id, {
    x: part.x,
    y: part.y,
    width: part.width,
    height: part.height,
    rotation: part.rotation,
    ...(part.jointAnchor ? { jointAnchor: { ...part.jointAnchor } } : {})
  }]))
}

export function applyFrameState(base: FabricatorProject, transforms: Record<string, AnimatorFrameTransform>, joints: JointLink[]): FabricatorProject {
  return {
    ...base,
    parts: base.parts.map((part) => {
      const transform = transforms[part.id]
      return transform ? {
        ...part,
        x: transform.x,
        y: transform.y,
        width: transform.width ?? part.width,
        height: transform.height ?? part.height,
        rotation: transform.rotation,
        ...(transform.jointAnchor ? { jointAnchor: transform.jointAnchor } : {})
      } : part
    }),
    joints
  }
}

export function rotateFramePart(
  base: FabricatorProject,
  state: AnimatorFrameState,
  partId: string,
  delta: number,
  includeChildren: boolean
): AnimatorFrameState {
  if (!delta) return state
  const project = applyFrameState(base, state.transforms, state.joints)
  const selected = project.parts.find((part) => part.id === partId)
  if (!selected) return state
  const origin = partJointAnchor(selected, project.joints) ?? { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 }
  const affected = new Set([partId])
  if (includeChildren) {
    let changed = true
    while (changed) {
      changed = false
      for (const joint of project.joints) {
        if (joint.fixed && affected.has(joint.parentPartId) && !affected.has(joint.childPartId)) {
          affected.add(joint.childPartId)
          changed = true
        }
      }
    }
  }
  const nextParts = project.parts.map((part) => {
    if (!affected.has(part.id)) return part
    const center = rotatePointAroundOrigin({ x: part.x + part.width / 2, y: part.y + part.height / 2 }, origin, delta)
    const anchor = partJointAnchor(part, project.joints)
    const jointAnchor = anchor ?? { x: part.x + part.width / 2, y: part.y + part.height / 2 }
    return {
      ...part,
      x: center.x - part.width / 2,
      y: center.y - part.height / 2,
      rotation: part.rotation + delta,
      jointAnchor: rotatePointAroundOrigin(jointAnchor, origin, delta)
    }
  })
  const nextById = new Map(nextParts.map((part) => [part.id, part]))
  const nextJoints = project.joints.map((joint) => {
    const parent = nextById.get(joint.parentPartId)
    const child = nextById.get(joint.childPartId)
    const parentAnchor = parent ? partJointAnchor(parent, project.joints) ?? joint.parentAnchor : joint.parentAnchor
    const childAnchor = child ? partJointAnchor(child, project.joints) ?? joint.childAnchor : joint.childAnchor
    return {
      ...joint,
      parentAnchor,
      childAnchor,
      pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 }
    }
  })
  return { ...state, transforms: transformsFromProject({ parts: nextParts }), joints: nextJoints }
}

export function moveFramePart(
  base: FabricatorProject,
  state: AnimatorFrameState,
  partId: string,
  dx: number,
  dy: number,
  includeChildren: boolean
): AnimatorFrameState {
  const project = applyFrameState(base, state.transforms, state.joints)
  const affected = new Set([partId])
  if (includeChildren) {
    let changed = true
    while (changed) {
      changed = false
      for (const joint of project.joints) {
        if (joint.fixed && affected.has(joint.parentPartId) && !affected.has(joint.childPartId)) {
          affected.add(joint.childPartId)
          changed = true
        }
      }
    }
  }
  const transforms = { ...state.transforms }
  for (const part of project.parts) if (affected.has(part.id)) {
    const current = transforms[part.id]
    transforms[part.id] = {
      ...current,
      x: current.x + dx,
      y: current.y + dy,
      ...(current.jointAnchor ? { jointAnchor: { x: current.jointAnchor.x + dx, y: current.jointAnchor.y + dy } } : {})
    }
  }
  const joints = state.joints.map((joint) => {
    const parentAnchor = affected.has(joint.parentPartId) ? { x: joint.parentAnchor.x + dx, y: joint.parentAnchor.y + dy } : joint.parentAnchor
    const childAnchor = affected.has(joint.childPartId) ? { x: joint.childAnchor.x + dx, y: joint.childAnchor.y + dy } : joint.childAnchor
    return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
  })
  return { ...state, transforms, joints }
}

export function centerProjectOnCanvas(project: FabricatorProject, width: number, height: number): FabricatorProject {
  const offsetX = (width - project.width) / 2
  const offsetY = (height - project.height) / 2
  return {
    ...project,
    width,
    height,
    parts: project.parts.map((part) => ({
      ...part,
      x: part.x + offsetX,
      y: part.y + offsetY,
      ...(part.jointAnchor ? { jointAnchor: { x: part.jointAnchor.x + offsetX, y: part.jointAnchor.y + offsetY } } : {})
    })),
    joints: project.joints.map((joint) => ({
      ...joint,
      parentAnchor: { x: joint.parentAnchor.x + offsetX, y: joint.parentAnchor.y + offsetY },
      childAnchor: { x: joint.childAnchor.x + offsetX, y: joint.childAnchor.y + offsetY },
      ...(joint.pivot ? { pivot: { x: joint.pivot.x + offsetX, y: joint.pivot.y + offsetY } } : {})
    }))
  }
}

export function isCoreAnimatorPart(part: PosePart | undefined): boolean {
  return Boolean(part && /tronco|corpo|cabeça|cabeca/i.test(part.name))
}

export function serializeAnimation(animation: AnimatorAnimation): AnimatorAnimationSave {
  return { ...animation, parts: animation.parts.map(({ dataUrl: _dataUrl, ...part }) => part) }
}

export function serializeAnimatorDraft(
  animation: AnimatorAnimation,
  editingSlot: number | null,
  current: AnimatorFrameState,
  dirtyFrame: boolean
): AnimatorAnimationDraft {
  return {
    editingSlot,
    animation: { ...serializeAnimation(animation), slot: undefined } as unknown as AnimatorAnimationDraft['animation'],
    currentTransforms: current.transforms,
    currentJoints: current.joints,
    selectedFrameId: current.frameId,
    dirtyFrame,
    updatedAt: new Date().toISOString()
  }
}
