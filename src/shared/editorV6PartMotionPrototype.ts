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
  // Fail-fast with the exact authoritative rig-compatibility rules, including
  // unique part identity, pivot and texture selection at progress=0.
  interpolateEditorV6Pose(from, to, 0)
  const frame = (progress: number): EditorV6ExperimentalPartFrame => {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw Error('Progresso de pose inválido para o protótipo.')
    const eased = motionEase(progress)
    const pose = interpolateEditorV6Pose(from, to, eased)
    // Exact layer algorithm from characterLayerRenderer: authored, unique,
    // existing IDs first, followed by any unlisted source parts.
    const partIds = new Set(pose.parts.map(part => part.id))
    const order = (pose.layerOrder ?? []).filter((id, i, all) => all.indexOf(id) === i && partIds.has(id))
    for (const part of pose.parts) if (!order.includes(part.id)) order.push(part.id)
    const parts = new Map(pose.parts.map(part => [part.id, part]))
    const hidden = new Set(pose.hiddenPartIds ?? [])
    return {
      progress: eased,
      width: pose.width,
      height: pose.height,
      parts: order.map((id, index) => {
        const part = parts.get(id)!
        return {
          id,
          sourceDataUrl: part.dataUrl,
          visible: !hidden.has(id),
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
