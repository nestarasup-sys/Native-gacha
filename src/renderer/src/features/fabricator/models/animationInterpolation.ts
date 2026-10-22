/** Interpolação determinística de quadros, separada do estado React. */
import type { AnimatorAnimation, AnimatorFrame, AnimatorFrameTransform } from '../../../../../shared/fabricator'

function shortestAngle(from: number, to: number): number { return ((to - from + 540) % 360) - 180 }

export function interpolateFrames(frames: AnimatorFrame[], elapsed: number, mode: AnimatorAnimation['interpolation'], loopMode: AnimatorAnimation['loopMode'], direction: 1 | -1 = 1) {
  const total = frames.reduce((sum, frame) => sum + frame.durationMs, 0)
  let time = Math.max(0, Math.min(total, elapsed))
  let index = 0
  while (index < frames.length - 1 && time >= frames[index].durationMs) { time -= frames[index].durationMs; index++ }
  const from = frames[index]
  const nextIndex = direction > 0 ? (index === frames.length - 1 && loopMode === 'loop' ? 0 : Math.min(frames.length - 1, index + 1)) : Math.max(0, index - 1)
  const to = frames[nextIndex]
  const tRaw = mode === 'stepped' || !to || to === from ? 0 : Math.max(0, Math.min(1, time / Math.max(1, from.durationMs)))
  const t = tRaw * tRaw * (3 - 2 * tRaw)
  const ids = new Set([...Object.keys(from.transforms), ...Object.keys(to.transforms)])
  const transforms: Record<string, AnimatorFrameTransform> = {}
  for (const id of ids) {
    const a = from.transforms[id], b = to.transforms[id] ?? a
    if (!a) { if (b) transforms[id] = b; continue }
    transforms[id] = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      ...(a.width !== undefined || b.width !== undefined ? { width: (a.width ?? b.width!) + ((b.width ?? a.width!) - (a.width ?? b.width!)) * t } : {}),
      ...(a.height !== undefined || b.height !== undefined ? { height: (a.height ?? b.height!) + ((b.height ?? a.height!) - (a.height ?? b.height!)) * t } : {}),
      rotation: a.rotation + shortestAngle(a.rotation, b.rotation) * t,
      ...(a.jointAnchor && b.jointAnchor ? { jointAnchor: { x: a.jointAnchor.x + (b.jointAnchor.x - a.jointAnchor.x) * t, y: a.jointAnchor.y + (b.jointAnchor.y - a.jointAnchor.y) * t } } : {})
    }
  }
  const fromJoints = new Map(from.joints.map((joint) => [joint.id, joint]))
  const toJoints = new Map(to.joints.map((joint) => [joint.id, joint]))
  const joints = [...new Set([...fromJoints.keys(), ...toJoints.keys()])].flatMap((id) => {
    const a = fromJoints.get(id), b = toJoints.get(id) ?? a
    if (!a) return b ? [b] : []
    if (!b) return [a]
    const aPivot = a.pivot ?? { x: (a.parentAnchor.x + a.childAnchor.x) / 2, y: (a.parentAnchor.y + a.childAnchor.y) / 2 }
    const bPivot = b.pivot ?? { x: (b.parentAnchor.x + b.childAnchor.x) / 2, y: (b.parentAnchor.y + b.childAnchor.y) / 2 }
    return [{ ...a, fixed: t < .5 ? a.fixed : b.fixed,
      parentAnchor: { x: a.parentAnchor.x + (b.parentAnchor.x - a.parentAnchor.x) * t, y: a.parentAnchor.y + (b.parentAnchor.y - a.parentAnchor.y) * t },
      childAnchor: { x: a.childAnchor.x + (b.childAnchor.x - a.childAnchor.x) * t, y: a.childAnchor.y + (b.childAnchor.y - a.childAnchor.y) * t },
      pivot: { x: aPivot.x + (bPivot.x - aPivot.x) * t, y: aPivot.y + (bPivot.y - aPivot.y) * t } }]
  })
  return { transforms, joints, frameIndex: index, total }
}

