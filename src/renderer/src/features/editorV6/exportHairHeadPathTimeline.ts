import type { EditorV6Element } from '../../../../shared/editorV6'
import { editorV6HairMotionHeadPathDelta, editorV6HairMotionHeadPathPoint, interpolateEditorV6HairMotionHeadPathPoint, type EditorV6HairMotionHeadPathPoint, type EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]
type ResolvedHairRig = { rig: EditorV6HairMotionRig; element: SceneElement }
type HeadPathTransition = {
  fromElement: EditorV6Element
  toElement: EditorV6Element
  physicsFrom?: EditorV6HairMotionRig
  physicsTo?: EditorV6HairMotionRig
}
type HeadPathTransitionSample = { transition?: HeadPathTransition; poseSample?: { progress: number } }

type Options = {
  animatedElementIds: readonly string[]
  hasHairAnimation: boolean
  resolveScene: (frame: number) => Scene
  getTransitionSample: (elementId: string, frame: number) => HeadPathTransitionSample | undefined
  hairRigAtFrame: (element: SceneElement, frame: number) => ResolvedHairRig | undefined
}

/** Builds grow-only per-frame head paths and indexes layer flip changes for export. */
export function createEditorV6HairHeadPathTimeline({ animatedElementIds, hasHairAnimation, resolveScene, getTransitionSample, hairRigAtFrame }: Options) {
  let capacity = 0
  let latestFrame = -1
  const paths = new Map(animatedElementIds.map((id) => [id, new Float32Array(0)]))
  const previousPoints = new Map<string, EditorV6HairMotionHeadPathPoint>()
  const flipChanges = new Map<string, Array<{ frame: number; flipX: boolean }>>()

  const ensure = (targetFrame: number) => {
    if (!hasHairAnimation || targetFrame <= latestFrame) return
    if (targetFrame + 1 > capacity) {
      const nextCapacity = Math.max(1024, 2 ** Math.ceil(Math.log2(targetFrame + 1)))
      for (const [id, previous] of paths) {
        const next = new Float32Array(nextCapacity)
        next.set(previous)
        paths.set(id, next)
      }
      capacity = nextCapacity
    }

    for (let frame = latestFrame + 1; frame <= targetFrame; frame += 1) {
      const resolved = resolveScene(frame)
      const elements = new Map(resolved.elements.filter((element) => element.kind === 'character').map((element) => [element.id, element]))
      for (const elementId of animatedElementIds) {
        const path = paths.get(elementId)!
        const element = elements.get(elementId)
        if (!element) {
          path[frame] = frame > 0 ? path[frame - 1] : 0
          continue
        }
        const previous = previousPoints.get(elementId)
        const indexed = getTransitionSample(elementId, frame)
        const transition = indexed?.transition
        const transitionSample = indexed?.poseSample
        const resolvedRig = hairRigAtFrame(element, frame)
        const pathPoint = transition && transitionSample && transition.physicsFrom && transition.physicsTo
          ? interpolateEditorV6HairMotionHeadPathPoint(transition.fromElement, transition.toElement, transition.physicsFrom, transition.physicsTo, motionEase(transitionSample.progress))
          : resolvedRig
            ? editorV6HairMotionHeadPathPoint(resolvedRig.element, resolvedRig.rig)
            : { centerX: (50 + element.x) / 100, centerY: (50 + element.y) / 100, localX: 0, rotation: element.rotation, flipX: Boolean(element.flipX) }
        path[frame] = !previous || frame === 0
          ? 0
          // Transition atlas crops are visual-only; physics follows authored transforms and pose geometry.
          : path[frame - 1] + editorV6HairMotionHeadPathDelta(previous, pathPoint)
        previousPoints.set(elementId, pathPoint)

        for (const layer of resolvedRig?.rig.layers ?? []) {
          const key = `${elementId}:${layer.id}`
          const changes = flipChanges.get(key) ?? []
          if (changes.length === 0 || changes[changes.length - 1].flipX !== layer.flipX) changes.push({ frame, flipX: layer.flipX })
          if (changes.length) flipChanges.set(key, changes)
        }
      }
    }
    latestFrame = targetFrame
  }

  const headXAtFrame = (elementId: string, frame: number) => {
    ensure(frame)
    return paths.get(elementId)?.[frame] ?? 0
  }

  const pieceFlipXAtFrame = (elementId: string, pieceId: string, frame: number, fallback: boolean) => {
    const changes = flipChanges.get(`${elementId}:${pieceId}`)
    if (!changes?.length || frame < changes[0].frame) return fallback
    let low = 0
    let high = changes.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (changes[middle].frame <= frame) low = middle
      else high = middle - 1
    }
    return changes[low].flipX
  }

  return { headXAtFrame, pieceFlipXAtFrame }
}
