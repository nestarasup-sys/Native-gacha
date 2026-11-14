import type { EditorV6Element } from '../../../../shared/editorV6'
import { createEditorV6HairMotionHeadPathInterpolator, editorV6HairMotionHeadPathDelta, editorV6HairMotionHeadPathPoint, type EditorV6HairMotionHeadPathPoint, type EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]
type ResolvedHairRig = { rig: EditorV6HairMotionRig; element: SceneElement }
type HeadPathTransition = {
  fromElement: EditorV6Element
  toElement: EditorV6Element
  from?: EditorV6HairMotionRig
  to?: EditorV6HairMotionRig
  physicsFrom?: EditorV6HairMotionRig
  physicsTo?: EditorV6HairMotionRig
}
type HeadPathTransitionSample = { transition?: HeadPathTransition; poseSample?: { progress: number } }
type TransitionLayerFlip = { id: string; from: boolean; to: boolean }

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
  const transitionPathInterpolators = new WeakMap<object, (progress: number) => EditorV6HairMotionHeadPathPoint>()
  const transitionLayerFlips = new WeakMap<object, readonly TransitionLayerFlip[]>()

  const recordLayerFlip = (elementId: string, layerId: string, frame: number, flipX: boolean) => {
    const key = `${elementId}:${layerId}`
    const changes = flipChanges.get(key) ?? []
    if (changes.length === 0 || changes[changes.length - 1].flipX !== flipX) changes.push({ frame, flipX })
    if (changes.length) flipChanges.set(key, changes)
  }

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
      const elements = new Map<string, SceneElement>()
      for (const element of resolved.elements) if (element.kind === 'character') elements.set(element.id, element)
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
        const canInterpolateTransitionLayerFlips = Boolean(transition && transitionSample && transition.from && transition.to)
        const canInterpolateTransitionPath = Boolean(transition && transitionSample && transition.physicsFrom && transition.physicsTo)
        const easedProgress = transitionSample ? motionEase(transitionSample.progress) : undefined
        let resolvedRig: ResolvedHairRig | undefined
        if (!canInterpolateTransitionLayerFlips || !canInterpolateTransitionPath) resolvedRig = hairRigAtFrame(element, frame)
        let pathPoint: EditorV6HairMotionHeadPathPoint
        if (canInterpolateTransitionPath && transition && easedProgress !== undefined && transition.physicsFrom && transition.physicsTo) {
          let interpolatePath = transitionPathInterpolators.get(transition)
          if (!interpolatePath) {
            interpolatePath = createEditorV6HairMotionHeadPathInterpolator(transition.fromElement, transition.toElement, transition.physicsFrom, transition.physicsTo)
            transitionPathInterpolators.set(transition, interpolatePath)
          }
          pathPoint = interpolatePath(easedProgress)
        } else if (resolvedRig) pathPoint = editorV6HairMotionHeadPathPoint(resolvedRig.element, resolvedRig.rig)
        else pathPoint = { centerX: (50 + element.x) / 100, centerY: (50 + element.y) / 100, localX: 0, rotation: element.rotation, flipX: Boolean(element.flipX) }
        path[frame] = !previous || frame === 0
          ? 0
          // Transition atlas crops are visual-only; physics follows authored transforms and pose geometry.
          : path[frame - 1] + editorV6HairMotionHeadPathDelta(previous, pathPoint)
        previousPoints.set(elementId, pathPoint)

        if (canInterpolateTransitionLayerFlips && transition && transition.from && transition.to && easedProgress !== undefined) {
          let layerFlips = transitionLayerFlips.get(transition)
          if (!layerFlips) {
            layerFlips = transition.from.layers.map(layer => {
              const matching = transition.to!.layers.find(candidate => candidate.id === layer.id && candidate.side === layer.side)
              return { id: layer.id, from: layer.flipX, to: matching?.flipX ?? layer.flipX }
            })
            transitionLayerFlips.set(transition, layerFlips)
          }
          for (const layer of layerFlips) recordLayerFlip(elementId, layer.id, frame, easedProgress < .5 ? layer.from : layer.to)
        } else {
          const layers = resolvedRig?.rig.layers
          if (layers) for (const layer of layers) recordLayerFlip(elementId, layer.id, frame, layer.flipX)
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
