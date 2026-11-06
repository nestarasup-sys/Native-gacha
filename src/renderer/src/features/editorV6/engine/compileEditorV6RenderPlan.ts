import type { EditorV6Asset, EditorV6Document } from '../../../../../shared/editorV6'
import { editorV6MotionPlans, type EditorV6MotionPlan } from '../../../../../shared/editorV6Motion'
import { resolveEditorV6SceneAtFrame, type EditorV6ResolvedScene } from '../../../../../shared/editorV6TimelineScene'

export type EditorV6RenderPlanOptions = Readonly<{ width: number; height: number }>
export type EditorV6RenderMotionPlan = Readonly<Omit<EditorV6MotionPlan, 'samples'> & {
  samples: readonly Readonly<EditorV6MotionPlan['samples'][number]>[]
}>

/** A renderer-owned, immutable handle for deterministic frame evaluation. */
export type EditorV6RenderPlan = Readonly<{
  version: 1
  projectId: string
  projectRevision: string
  fps: 30
  frameCount: number
  width: number
  height: number
  assetIds: readonly string[]
  motionPlans: readonly EditorV6RenderMotionPlan[]
  resolveAsset: (assetId: string) => EditorV6Asset | undefined
  evaluateFrame: (frame: number) => EditorV6ResolvedScene
}>

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

/**
 * Compile the validated, worker-owned project snapshot once for an isolated
 * render job. The Electron export adapter validates the document before this
 * renderer process receives it. This compiler takes ownership of that IPC
 * clone, freezes its object graph in place, indexes asset IDs and motion
 * transitions up front, and never copies image payloads or persists derived
 * state. Frame evaluation is integer-only and rejects out-of-range input
 * instead of silently clamping it.
 */
export function compileEditorV6RenderPlan(document: EditorV6Document, options: EditorV6RenderPlanOptions): EditorV6RenderPlan {
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
  const motionPlans = Object.freeze(editorV6MotionPlans(snapshot).map(plan => Object.freeze({
    ...plan,
    samples: Object.freeze(plan.samples.map(sample => Object.freeze({ ...sample })))
  })))
  const assetIds = Object.freeze([...assets.keys()])
  const evaluateFrame = (frame: number) => {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= snapshot.timeline.durationFrames) {
      throw Error(`O quadro ${String(frame)} está fora do plano de cena.`)
    }
    return resolveEditorV6SceneAtFrame(snapshot, frame)
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
    resolveAsset: (assetId: string) => assets.get(assetId),
    evaluateFrame
  })
}
