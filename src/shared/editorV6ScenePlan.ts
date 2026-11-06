import type { EditorV6Asset, EditorV6Document } from './editorV6'
import { editorV6BlinkChangeFrames } from './editorV6FaceSchedule'
import { editorV6MotionPlans, type EditorV6MotionPlan } from './editorV6Motion'
import { resolveEditorV6SceneAtFrame, type EditorV6ResolvedScene } from './editorV6TimelineScene'

export type EditorV6ScenePlanOptions = Readonly<{ width: number; height: number }>
export type EditorV6SceneMotionPlan = Readonly<Omit<EditorV6MotionPlan, 'samples'> & {
  samples: readonly Readonly<EditorV6MotionPlan['samples'][number]>[]
}>
export type EditorV6FrameSegment = Readonly<{ index: number; startFrame: number; endFrameExclusive: number }>
export type EditorV6SceneFrameIndex = Readonly<{
  /** Sparse event boundaries, never one entry per rendered frame. */
  boundaries: readonly number[]
  /** False means the event cap was exceeded; evaluation then uses the canonical resolver per frame. */
  exact: boolean
  segmentAt: (frame: number) => EditorV6FrameSegment
}>

/** An immutable job plan shared by the export renderer and non-UI scene tools. */
export type EditorV6ScenePlan = Readonly<{
  version: 1
  projectId: string
  projectRevision: string
  fps: 30
  frameCount: number
  width: number
  height: number
  assetIds: readonly string[]
  motionPlans: readonly EditorV6SceneMotionPlan[]
  frameIndex: EditorV6SceneFrameIndex
  resolveAsset: (assetId: string) => EditorV6Asset | undefined
  evaluateFrame: (frame: number) => EditorV6ResolvedScene
}>

const MAX_FRAME_INDEX_BOUNDARIES = 50_000

function positiveDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) throw Error(`A dimensão ${label} do plano de cena é inválida.`)
  return value
}

/** Freeze the worker-owned IPC snapshot in place; image payload strings are never copied. */
function freezeSnapshot<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value
  const object = value as object
  if (seen.has(object)) return value
  seen.add(object)
  for (const child of Object.values(object)) freezeSnapshot(child, seen)
  return Object.freeze(object) as T
}

function compileFrameIndex(document: EditorV6Document, motionPlans: readonly EditorV6MotionPlan[]): EditorV6SceneFrameIndex {
  const frameCount = document.timeline.durationFrames
  const boundaries = new Set<number>([0, frameCount])
  let exact = true
  const add = (frame: number) => {
    if (!exact || !Number.isSafeInteger(frame)) return
    const boundary = Math.min(frameCount, Math.max(0, frame))
    boundaries.add(boundary)
    if (boundaries.size > MAX_FRAME_INDEX_BOUNDARIES) exact = false
  }

  for (const track of document.timeline.tracks) {
    for (const block of track.blocks) {
      add(block.startFrame)
      add(block.startFrame + block.durationFrames)
      if (!exact) break
    }
    if (!exact) break
  }

  const blocksById = new Map(document.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  if (exact) for (const plan of motionPlans) {
    add(plan.startFrame)
    add(plan.endFrame)
    const motion = blocksById.get(plan.blockId)?.incomingMotion
    for (const sample of motion?.frames ?? []) {
      const frame = plan.endFrame + sample.offset
      add(frame)
      add(frame + 1)
      if (!exact) break
    }
    if (!exact) break
  }

  const characterIds = new Set<string>()
  for (const element of document.elements) if (element.kind === 'character' && element.characterId) characterIds.add(element.characterId)
  for (const track of document.timeline.tracks) {
    if (track.characterId) characterIds.add(track.characterId)
    for (const block of track.blocks) if (block.state?.kind === 'character' && block.state.characterId) characterIds.add(block.state.characterId)
  }

  // Blink state is analytic and periodic. Bound the event list before generating
  // it so unusually long projects cannot turn compilation into a per-frame cache.
  const estimatedBlinkEvents = characterIds.size * Math.ceil(frameCount / 82) * 4
  if (exact && boundaries.size + estimatedBlinkEvents <= MAX_FRAME_INDEX_BOUNDARIES) {
    for (const characterId of characterIds) {
      for (const frame of editorV6BlinkChangeFrames(document.id, characterId, frameCount)) {
        add(frame)
        if (!exact) break
      }
      if (!exact) break
    }
  } else exact = false

  const sortedBoundaries = Object.freeze(exact ? [...boundaries].sort((a, b) => a - b) : [0, frameCount])
  const segmentAt = (frame: number): EditorV6FrameSegment => {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frameCount) throw Error(`O quadro ${String(frame)} está fora do índice de cena.`)
    let left = 0, right = sortedBoundaries.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (sortedBoundaries[middle] <= frame) left = middle + 1
      else right = middle
    }
    const index = Math.max(0, left - 1)
    return Object.freeze({ index, startFrame: sortedBoundaries[index], endFrameExclusive: sortedBoundaries[index + 1] ?? frameCount })
  }
  return Object.freeze({ boundaries: sortedBoundaries, exact, segmentAt })
}

/**
 * Compile the validated, worker-owned project snapshot once for an isolated
 * render job. The caller transfers this IPC clone to the scene engine, which
 * freezes it without copying image payload strings. Timeline, motion, speech,
 * background, video, and deterministic blink events form a sparse frame index.
 * Stable adjacent frames reuse one resolved scene object; animated pixels and
 * hair remain evaluated by the renderer for each requested frame.
 */
export function compileEditorV6ScenePlan(document: EditorV6Document, options: EditorV6ScenePlanOptions): EditorV6ScenePlan {
  if (document.schemaVersion !== 1 || !document.id || !Number.isSafeInteger(document.timeline.durationFrames) || document.timeline.durationFrames < 1) {
    throw Error('O snapshot do projeto não pode ser compilado para renderização.')
  }
  const width = positiveDimension(options.width, 'horizontal')
  const height = positiveDimension(options.height, 'vertical')
  const assets = new Map<string, EditorV6Asset>()
  for (const asset of document.assets) {
    if (assets.has(asset.id)) throw Error(`O plano de cena recebeu o asset duplicado ${asset.id}.`)
    assets.set(asset.id, asset)
  }

  const snapshot = freezeSnapshot(document)
  const sourceMotionPlans = editorV6MotionPlans(snapshot)
  const motionPlans = Object.freeze(sourceMotionPlans.map(plan => Object.freeze({
    ...plan,
    samples: Object.freeze(plan.samples.map(sample => Object.freeze({ ...sample })))
  })))
  const frameIndex = compileFrameIndex(snapshot, sourceMotionPlans)
  const assetIds = Object.freeze([...assets.keys()])
  let cachedSegment = -1
  let cachedScene: EditorV6ResolvedScene | undefined

  const evaluateFrame = (frame: number) => {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= snapshot.timeline.durationFrames) {
      throw Error(`O quadro ${String(frame)} está fora do plano de cena.`)
    }
    if (!frameIndex.exact) return resolveEditorV6SceneAtFrame(snapshot, frame)
    const segment = frameIndex.segmentAt(frame)
    if (cachedSegment !== segment.index || !cachedScene) {
      cachedScene = freezeSnapshot(resolveEditorV6SceneAtFrame(snapshot, segment.startFrame))
      cachedSegment = segment.index
    }
    return frame === cachedScene.frame ? cachedScene : Object.freeze({ ...cachedScene, frame })
  }

  return Object.freeze({
    version: 1 as const,
    projectId: snapshot.id,
    projectRevision: snapshot.updatedAt,
    fps: 30 as const,
    frameCount: snapshot.timeline.durationFrames,
    width,
    height,
    assetIds,
    motionPlans,
    frameIndex,
    resolveAsset: (assetId: string) => assets.get(assetId),
    evaluateFrame
  })
}
