import type { FabricatorProject } from './fabricator'
import { interpolateEditorV6Pose, motionEase } from './editorV6MotionInterpolation'

type Artwork = Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'layerOrder' | 'hiddenPartIds'> &
  Partial<Pick<FabricatorProject, 'joints'>>

export type EditorV6PartMotionCommand = Readonly<{
  id: string
  sourceDataUrl: string
  visible: boolean
  order: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
}>

export type EditorV6ExperimentalPartFrame = Readonly<{
  progress: number
  width: number
  height: number
  parts: readonly EditorV6PartMotionCommand[]
}>

/**
 * R31: compile the *geometry portion* of the existing Fabricator pose renderer
 * into an explicit, deterministic draw-list. No images are decoded; no DOM,
 * WebGL, Canvas or persisted state is touched. This is an experimental IR,
 * NOT an RGBA-equivalent character renderer.
 *
 * Real production character images also apply skin/outline tint, joint bridge
 * painting, wardrobes, eyes, face, alpha, front/rear hair and source halos.
 * Those operators must be implemented and tested before the IR can replace
 * even one real motion atlas. Never silently use this in MP4 export.
 */
export function compileEditorV6PartMotionPrototype(from: Artwork, to: Artwork) {
  // Keep the authoritative interpolation and pivot math unchanged. Only
  // precompile immutable ID/order/visibility metadata, which otherwise costs
  // repeated Map/Set creation and linear includes() scans on every frame.
  interpolateEditorV6Pose(from, to, 0)
  const partIndexes = new Map(from.parts.map((part, index) => [part.id, index]))
  const targetIds = new Set(to.parts.map(part => part.id))
  if (partIndexes.size !== from.parts.length || targetIds.size !== to.parts.length) {
    throw Error('R37: o rig contém IDs de peças duplicados.')
  }
  const orderFor = (artwork: Artwork): number[] => {
    const ordered = new Set<string>()
    for (const id of artwork.layerOrder ?? []) if (partIndexes.has(id)) ordered.add(id)
    for (const part of from.parts) ordered.add(part.id)
    return [...ordered].map(id => partIndexes.get(id)!)
  }
  const fromOrder = orderFor(from), toOrder = orderFor(to)
  const fromHidden = new Set(from.hiddenPartIds ?? [])
  const toHidden = new Set(to.hiddenPartIds ?? [])
  const frame = (progress: number): EditorV6ExperimentalPartFrame => {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw Error('Progresso de pose inválido para o protótipo.')
    const eased = motionEase(progress)
    const pose = interpolateEditorV6Pose(from, to, eased)
    const order = eased < 0.5 ? fromOrder : toOrder
    const hidden = eased < 0.5 ? fromHidden : toHidden
    return {
      progress: eased,
      width: pose.width,
      height: pose.height,
      parts: order.map((partIndex, index) => {
        const part = pose.parts[partIndex]
        return {
          id: part.id,
          sourceDataUrl: part.dataUrl,
          visible: !hidden.has(part.id),
          order: index,
          x: part.x,
          y: part.y,
          width: part.width,
          height: part.height,
          rotation: part.rotation
        }
      })
    }
  }
  return {
    frame,
    // The IR deliberately cannot be selected by production code. There is no
    // compositing backend or visual parity proof yet.
    exportReady: false as const,
    unimplementedVisualOperators: [
      'body-skin-and-outline-tint',
      'joint-bridges',
      'wardrobe-and-accessory-layering',
      'face-mouth-and-blink-composition',
      'front-rear-fringe-hair-and-halos',
      'rgba-alpha-and-crop-parity'
    ] as const
  }
}
