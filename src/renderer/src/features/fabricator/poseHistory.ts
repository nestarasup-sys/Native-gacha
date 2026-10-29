import type { JointLink, PosePart } from '../../../../shared/fabricator'

export type PoseHistory<Project> = { undo: Project[]; redo: Project[] }
export type PoseHistoryDirection = 'undo' | 'redo'
export type PoseHistoryRestore<Project> = { history: PoseHistory<Project>; project: Project }

export const POSE_HISTORY_LIMIT = 50

export function createPoseHistory<Project>(): PoseHistory<Project> {
  return { undo: [], redo: [] }
}

function keepRecent<Project>(entries: Project[], limit: number): Project[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : POSE_HISTORY_LIMIT
  return safeLimit ? entries.slice(-safeLimit) : []
}

/** Keeps immutable project versions by reference so image data is not copied for every edit. */
export function rememberPoseProject<Project>(history: PoseHistory<Project>, project: Project, limit = POSE_HISTORY_LIMIT): PoseHistory<Project> {
  return { undo: keepRecent([...history.undo, project], limit), redo: [] }
}

export function restorePoseProject<Project>(
  history: PoseHistory<Project>,
  current: Project,
  direction: PoseHistoryDirection,
  limit = POSE_HISTORY_LIMIT
): PoseHistoryRestore<Project> | null {
  const stack = history[direction]
  if (!stack.length) return null

  const project = stack[stack.length - 1]
  const nextHistory = direction === 'undo'
    ? { undo: history.undo.slice(0, -1), redo: keepRecent([...history.redo, current], limit) }
    : { undo: keepRecent([...history.undo, current], limit), redo: history.redo.slice(0, -1) }
  return { history: nextHistory, project }
}

type Point = { x: number; y: number }

function samePoint(left: Point | undefined, right: Point | undefined): boolean {
  return left === right || Boolean(left && right && left.x === right.x && left.y === right.y)
}

function samePartGeometry(left: PosePart, right: PosePart): boolean {
  return left.id === right.id
    && left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
    && left.rotation === right.rotation
    && samePoint(left.jointAnchor, right.jointAnchor)
}

function sameJointGeometry(left: JointLink, right: JointLink): boolean {
  return left.id === right.id
    && left.parentPartId === right.parentPartId
    && left.childPartId === right.childPartId
    && left.fixed === right.fixed
    && left.suggested === right.suggested
    && samePoint(left.parentAnchor, right.parentAnchor)
    && samePoint(left.childAnchor, right.childAnchor)
    && samePoint(left.pivot, right.pivot)
}

/** Checks only fields changed by a canvas move or rotation; PNG payloads are never serialized. */
export function hasPoseGestureChanged(
  before: { parts: PosePart[]; joints: JointLink[] },
  after: { parts: PosePart[]; joints: JointLink[] }
): boolean {
  if (before.parts.length !== after.parts.length || before.joints.length !== after.joints.length) return true
  return before.parts.some((part, index) => !samePartGeometry(part, after.parts[index]))
    || before.joints.some((joint, index) => !sameJointGeometry(joint, after.joints[index]))
}
