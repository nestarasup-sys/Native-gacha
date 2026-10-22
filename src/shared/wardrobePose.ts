import type { FabricatorProject, ModelPart, WardrobeBinding, WardrobeComponent, WardrobeSet } from './fabricator'

type Point = { x: number; y: number }

function referenceFrame(bone: ModelPart) {
  const source = bone.sourceTransform
  return {
    x: source?.x ?? bone.x,
    y: source?.y ?? bone.y,
    width: Math.max(1, source?.width ?? bone.width),
    height: Math.max(1, source?.height ?? bone.height),
    rotation: source?.rotation ?? 0
  }
}

/** Capture the complete fitted garment transform in the bone's original local frame. */
export function bindWardrobeComponent(component: WardrobeComponent, bone: ModelPart): WardrobeBinding {
  const frame = referenceFrame(bone)
  const boneCenter = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
  const garmentCenter = { x: component.x + component.width / 2, y: component.y + component.height / 2 }
  const radians = -frame.rotation * Math.PI / 180
  const dx = garmentCenter.x - boneCenter.x
  const dy = garmentCenter.y - boneCenter.y
  return {
    version: 1,
    boneId: bone.id,
    boneWidth: frame.width,
    boneHeight: frame.height,
    boneRotation: frame.rotation,
    localCenterX: (dx * Math.cos(radians) - dy * Math.sin(radians)) / frame.width,
    localCenterY: (dx * Math.sin(radians) + dy * Math.cos(radians)) / frame.height,
    widthRatio: component.width / frame.width,
    heightRatio: component.height / frame.height,
    relativeRotation: component.rotation - frame.rotation
  }
}

/** Move old separated-sheet placements onto the original sheet without changing their fitted bone ratios. */
export function rebaseWardrobeSetToOriginalSheet(set: WardrobeSet, model: Pick<FabricatorProject, 'parts' | 'width' | 'height'>): WardrobeSet {
  if (set.edition !== 2) return set
  const projectBinding = (binding: WardrobeBinding, frame: ReturnType<typeof referenceFrame>) => {
    const radians = frame.rotation * Math.PI / 180
    const dx = binding.localCenterX * frame.width, dy = binding.localCenterY * frame.height
    const width = binding.widthRatio * frame.width, height = binding.heightRatio * frame.height
    return { x: frame.x + frame.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians) - width / 2,
      y: frame.y + frame.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians) - height / 2,
      width, height, rotation: frame.rotation + binding.relativeRotation }
  }
  return { ...set, edition: 1, width: model.width, height: model.height, components: set.components.map((component) => {
    const bone = model.parts.find((part) => part.id === component.attachedPartId)
    const binding = component.binding
    if (!bone || !binding || binding.boneId !== bone.id || binding.boneWidth <= 0 || binding.boneHeight <= 0
      || ![binding.boneWidth, binding.boneHeight, binding.boneRotation, binding.localCenterX, binding.localCenterY,
        binding.widthRatio, binding.heightRatio, binding.relativeRotation].every(Number.isFinite)
      || binding.widthRatio <= 0 || binding.heightRatio <= 0) return component
    const frame = referenceFrame(bone)
    const placement = projectBinding(binding, frame)
    // Recover the old source frame from its frozen binding, not from the new
    // model or an assumed ordering of ten hardcoded body rectangles.
    const radians = binding.boneRotation * Math.PI / 180
    const dx = binding.localCenterX * binding.boneWidth, dy = binding.localCenterY * binding.boneHeight
    const oldFrame = {
      x: component.x + component.width / 2 - dx * Math.cos(radians) + dy * Math.sin(radians) - binding.boneWidth / 2,
      y: component.y + component.height / 2 - dx * Math.sin(radians) - dy * Math.cos(radians) - binding.boneHeight / 2,
      width: binding.boneWidth, height: binding.boneHeight, rotation: binding.boneRotation
    }
    const origin = projectBinding(bindWardrobeComponent({ ...component,
      x: component.originX ?? component.x, y: component.originY ?? component.y,
      width: component.originWidth ?? component.width, height: component.originHeight ?? component.height, rotation: 0
    }, { ...bone, sourceTransform: oldFrame }), frame)
    const projected = { ...component, ...placement,
      originX: origin.x, originY: origin.y, originWidth: origin.width, originHeight: origin.height }
    return { ...projected, binding: bindWardrobeComponent(projected, bone) }
  }) }
}

export type WardrobePoseTransform = {
  origin: Point
  localLeft: number
  localTop: number
  renderWidth: number
  renderHeight: number
  localRotation: number
  matrix: string
  scaleX: number
  scaleY: number
}

/** Pose seam coverage is based on the complete visible outfit, not one picker slot. */
export function wardrobePosePadding(component: WardrobeComponent, outfit: readonly WardrobeComponent[]): { kneeOverlap: number; edgePadding: number } {
  const hasThighAndCalf = outfit.some((piece) => piece.category === 'calca-coxa')
    && outfit.some((piece) => piece.category === 'calca-canela')
  return {
    kneeOverlap: hasThighAndCalf && (component.category === 'calca-coxa' || component.category === 'calca-canela') ? 18 : 0,
    edgePadding: component.category === 'manga-superior' || component.category === 'manga-inferior'
      ? Math.max(8, Math.min(14, Math.round(Math.min(component.width, component.height) * .06))) : 0
  }
}

/**
 * Map a garment from the source sheet into the posed bone's local frame.
 * The garment's own x/y/width/height/rotation are intentionally kept in this
 * calculation so manual fitting and non-uniform scaling survive every pose.
 */
export function mapWardrobeComponentToPose(
  component: WardrobeComponent,
  sourceBone: ModelPart,
  poseBone: ModelPart,
  kneeOverlap = 0,
  edgePadding = 0
): WardrobePoseTransform {
  // The edited original sheet is the authoring coordinate system, never the
  // mounted model. Compute its local frame even when a legacy binding is absent.
  const current = bindWardrobeComponent(component, sourceBone)
  const binding = component.binding?.boneId === sourceBone.id ? component.binding : null
  // The sheet's X/Y, size and rotation win over a stale saved binding. Reading
  // must not rewrite a manifest or any PNG; rebind only when the user saves.
  const coherent = binding !== null
    && Math.abs(binding.localCenterX - current.localCenterX) < 1e-5
    && Math.abs(binding.localCenterY - current.localCenterY) < 1e-5
    && Math.abs(binding.widthRatio - current.widthRatio) < 1e-5
    && Math.abs(binding.heightRatio - current.heightRatio) < 1e-5
    && Math.abs(binding.relativeRotation - current.relativeRotation) < 1e-5
    && Math.abs(binding.boneWidth - current.boneWidth) < 1e-5
    && Math.abs(binding.boneHeight - current.boneHeight) < 1e-5
    && Math.abs(binding.boneRotation - current.boneRotation) < 1e-5
  // An explicitly fixed garment keeps its frozen local placement if the
  // source sheet changes. Report it as stale in Roupas DEV, never silently
  // re-anchor it to a different part geometry while drawing Customizador.
  const frame = component.glue?.sourceFrame
  const source = sourceBone.sourceTransform
  const now = { x: source?.x ?? sourceBone.x, y: source?.y ?? sourceBone.y,
    width: source?.width ?? sourceBone.width, height: source?.height ?? sourceBone.height,
    rotation: source?.rotation ?? sourceBone.rotation }
  const frameChanged = frame && (Math.abs(frame.x-now.x)>1e-5 || Math.abs(frame.y-now.y)>1e-5
    || Math.abs(frame.width-now.width)>1e-5 || Math.abs(frame.height-now.height)>1e-5
    || Math.abs(frame.rotation-now.rotation)>1e-5)
  const frozen = component.glue?.mode === 'fixed' && frameChanged && binding
  return mapBoundWardrobeComponentToPose(frozen || (coherent && binding) || current, poseBone, kneeOverlap, edgePadding)
}

function mapBoundWardrobeComponentToPose(binding: WardrobeBinding, poseBone: ModelPart, kneeOverlap: number, edgePadding: number): WardrobePoseTransform {
  const scaleX = Math.max(0.0001, poseBone.width / binding.boneWidth)
  const scaleY = Math.max(0.0001, poseBone.height / binding.boneHeight)
  // Local coordinates stay in ORIGINAL bone pixels. Scale the bone axes BEFORE
  // rotating the garment: R(pose) * S(pose/source) * R(garment-relative).
  // Resizing the image first and rotating it afterwards incorrectly swaps this
  // multiplication order for non-uniform scales and rotated clothes.
  const localCenter = { x: binding.localCenterX * binding.boneWidth, y: binding.localCenterY * binding.boneHeight }
  const radians = poseBone.rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const matrix = [cosine * scaleX, sine * scaleX, -sine * scaleY, cosine * scaleY, 0, 0]
    .map((value) => Number(value.toFixed(8))).join(',')
  // Keep overlap/padding in output-pose pixels, including when scaling changes.
  const overlap = Math.max(0, kneeOverlap) / scaleY
  const edgeX = Math.max(0, edgePadding) / scaleX
  const edgeY = Math.max(0, edgePadding) / scaleY
  const width = Math.max(1, binding.widthRatio * binding.boneWidth) + edgeX * 2
  const height = Math.max(1, binding.heightRatio * binding.boneHeight) + edgeY * 2
  return {
    origin: { x: poseBone.x + poseBone.width / 2, y: poseBone.y + poseBone.height / 2 },
    localLeft: localCenter.x - width / 2,
    localTop: localCenter.y - (height + overlap) / 2,
    renderWidth: width,
    renderHeight: height + overlap,
    localRotation: binding.relativeRotation,
    matrix: `matrix(${matrix})`, scaleX, scaleY
  }
}

/** Convert a screen-space drag back into the wardrobe sheet's source axes. */
export function poseDeltaToSource(delta: Point, sourceBone: ModelPart, poseBone: ModelPart): Point {
  const sourceRotation = (sourceBone.sourceTransform?.rotation ?? 0) * Math.PI / 180
  const poseRotation = -poseBone.rotation * Math.PI / 180
  const scaleX = poseBone.width / Math.max(1, sourceBone.sourceTransform?.width ?? sourceBone.width)
  const scaleY = poseBone.height / Math.max(1, sourceBone.sourceTransform?.height ?? sourceBone.height)
  const poseLocal = { x: delta.x * Math.cos(poseRotation) - delta.y * Math.sin(poseRotation), y: delta.x * Math.sin(poseRotation) + delta.y * Math.cos(poseRotation) }
  const unscaled = { x: poseLocal.x / Math.max(0.0001, scaleX), y: poseLocal.y / Math.max(0.0001, scaleY) }
  return { x: unscaled.x * Math.cos(sourceRotation) - unscaled.y * Math.sin(sourceRotation), y: unscaled.x * Math.sin(sourceRotation) + unscaled.y * Math.cos(sourceRotation) }
}
