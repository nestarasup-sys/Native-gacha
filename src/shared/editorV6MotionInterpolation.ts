import type { CustomizerFaceAppearance, FaceComponentPartId } from './customizer'
import type { EditorV6Element, EditorV6FaceTransforms } from './editorV6'
import type { FaceExpressionEffect, FaceExpressionEffects, FaceTransform, FabricatorProject } from './fabricator'
type CatalogArtwork = Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'layerOrder' | 'hiddenPartIds'> & Partial<Pick<FabricatorProject, 'joints'>>
export const motionEase = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
export const motionLerp = (from: number, to: number, t: number) => from + (to - from) * t
export const motionAngle = (from: number, to: number, t: number) => from + (((to - from + 540) % 360) - 180) * t
const point = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: motionLerp(a.x, b.x, t), y: motionLerp(a.y, b.y, t) })
export function interpolateEditorV6Pose(from: CatalogArtwork, to: CatalogArtwork, t: number): CatalogArtwork {
  const targets = new Map(to.parts.map((part) => [part.id, part]))
  if (from.width !== to.width || from.height !== to.height || from.parts.length !== to.parts.length || from.parts.some((part) => !targets.has(part.id))) throw Error('As duas poses precisam pertencer ao mesmo rig e tamanho de modelo.')
  const targetJoints = new Map(to.joints?.map((joint) => [joint.id, joint]))
  return { ...from, layerOrder: t < .5 ? from.layerOrder : to.layerOrder, hiddenPartIds: t < .5 ? from.hiddenPartIds : to.hiddenPartIds,
    parts: from.parts.map((a) => { const b = targets.get(a.id)!; return { ...(t < .5 ? a : b), x: motionLerp(a.x, b.x, t), y: motionLerp(a.y, b.y, t), width: motionLerp(a.width, b.width, t), height: motionLerp(a.height, b.height, t), rotation: motionAngle(a.rotation, b.rotation, t), ...(a.jointAnchor && b.jointAnchor ? { jointAnchor: point(a.jointAnchor, b.jointAnchor, t) } : {}) } }),
    joints: from.joints?.map((a) => { const b = targetJoints.get(a.id) ?? a; return { ...a, parentAnchor: point(a.parentAnchor, b.parentAnchor, t), childAnchor: point(a.childAnchor, b.childAnchor, t), ...(a.pivot && b.pivot ? { pivot: point(a.pivot, b.pivot, t) } : {}) } }) }
}
function faceTransform(a: FaceTransform, b: FaceTransform, t: number): FaceTransform { return { ...a, ...point(a, b, t), scaleX: motionLerp(a.scaleX, b.scaleX, t), scaleY: motionLerp(a.scaleY, b.scaleY, t), rotation: motionAngle(a.rotation, b.rotation, t), flipX: t < .5 ? a.flipX : b.flipX } }
export function interpolateEditorV6Face(from: EditorV6Element, to: EditorV6Element, t: number) {
  const a = from.faceAppearance, b = to.faceAppearance
  let appearance: CustomizerFaceAppearance | undefined = t < .5 ? a : b
  if (a && b) {
    const transforms: NonNullable<CustomizerFaceAppearance['transforms']> = {}
    for (const key of new Set([...Object.keys(a.transforms ?? {}), ...Object.keys(b.transforms ?? {})])) {
      const id = key as keyof typeof transforms, left = a.transforms?.[id] ?? b.transforms?.[id], right = b.transforms?.[id] ?? left
      if (left && right) transforms[id] = faceTransform(left, right, t)
    }
    const components = { ...appearance?.components }
    for (const key of new Set([...Object.keys(a.components ?? {}), ...Object.keys(b.components ?? {})])) {
      const part = key as FaceComponentPartId, left = a.components?.[part]?.transform, right = b.components?.[part]?.transform
      const selected = components[part]
      if (selected && left && right) components[part] = { ...selected, transform: faceTransform(left, right, t) }
    }
    appearance = { ...appearance!, components, transforms, noseOpacity: motionLerp(a.noseOpacity ?? 1, b.noseOpacity ?? 1, t), mouthBlushEnabled: a.mouthBlushEnabled || b.mouthBlushEnabled,
      mouthBlushOpacity: motionLerp(a.mouthBlushEnabled ? a.mouthBlushOpacity ?? .6 : 0, b.mouthBlushEnabled ? b.mouthBlushOpacity ?? .6 : 0, t) }
  }
  const transforms: EditorV6FaceTransforms = {}
  for (const key of new Set([...Object.keys(from.faceTransforms ?? {}), ...Object.keys(to.faceTransforms ?? {})])) {
    const left = from.faceTransforms?.[key] ?? { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, right = to.faceTransforms?.[key] ?? { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    transforms[key] = { x: motionLerp(left.x, right.x, t), y: motionLerp(left.y, right.y, t), width: motionLerp(left.width, right.width, t), height: motionLerp(left.height, right.height, t), rotation: motionAngle(left.rotation, right.rotation, t), ...(left.sourceTransformOverride || right.sourceTransformOverride ? { sourceTransformOverride: faceTransform(left.sourceTransformOverride ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, right.sourceTransformOverride ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, t) } : {}) }
  }
  const effects = {} as FaceExpressionEffects
  const empty: FaceExpressionEffect = { enabled: false, color: '#000000', opacity: 0, softness: 0, size: 0, offsetY: 0 }
  for (const key of ['blush', 'shadow', 'mouthBlush'] as const) {
    const left = from.activeExpressionEffects?.[key] ?? empty, right = to.activeExpressionEffects?.[key] ?? empty
    const effect = { ...(t < .5 ? left : right), enabled: left.enabled || right.enabled }
    for (const name of ['opacity', 'softness', 'size', 'offsetX', 'offsetY', 'aspectRatio', 'width', 'height', 'rotation'] as const) effect[name] = motionLerp(name === 'opacity' && !left.enabled ? 0 : left[name] ?? 0, name === 'opacity' && !right.enabled ? 0 : right[name] ?? 0, t)
    const color = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) : [0, 0, 0]
    const aa = color(left.color), bb = color(right.color)
    effect.color = '#' + aa.map((value, index) => Math.round(motionLerp(value, bb[index], t)).toString(16).padStart(2, '0')).join('')
    effects[key] = effect
  }
  return { appearance, transforms, effects: from.activeExpressionEffects || to.activeExpressionEffects ? effects : undefined, mode: t < .5 ? from.activeFaceMode : to.activeFaceMode }
}
