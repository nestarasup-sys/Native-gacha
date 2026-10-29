import { pupilSourceMirrored } from '../../../../../shared/facePupilGeometry.ts'
import type { FaceComponentAsset, FaceComponentKind, ModelPart } from '../../../../../shared/fabricator'
import { fitClosedEyeToOpen } from './faceImportAlignment.ts'
import { partCategory, type FacePartId } from './faceComponentImportModel.ts'

type PreviewStyle = Record<string, string>

export type FacePartPreviewModel = {
  key: string
  assetId: string
  imageAsset: FaceComponentAsset
  label: string
  style: PreviewStyle
  canDrag: boolean
  drag: { invertX: boolean; pupil: boolean; rotation?: number }
  pupilMask?: {
    style: PreviewStyle
    pupilStyle: PreviewStyle
    drag: { invertX: boolean; pupil: true; rotation: number }
  }
}

/** Builds the visual and drag geometry for one eye, pupil, closed eye, or eyebrow layer. */
export function createFacePartPreviewModel({
  id,
  mirror,
  overrides,
  selectedAssets,
  details,
  linked,
  head,
  eyeMasks,
  activePreviewKey
}: {
  id: FacePartId
  mirror: boolean
  overrides: Partial<Record<FacePartId, string>>
  selectedAssets: Partial<Record<FacePartId, string>>
  details: Readonly<Record<string, FaceComponentAsset>>
  linked: Readonly<Record<FaceComponentKind, boolean>>
  head: ModelPart
  eyeMasks: Readonly<Record<string, string | undefined>>
  activePreviewKey: string | null
}): FacePartPreviewModel | null {
  const category = partCategory(id)
  const rightSide = id.endsWith('right')
  const leftId = overrides[category.parts[0]] ?? selectedAssets[category.parts[0]]
  const ownId = overrides[id] ?? selectedAssets[id]
  const assetId = ownId ?? (rightSide && mirror && linked[category.kind] ? leftId : undefined)
  const asset = assetId ? details[assetId] : undefined
  const leftAsset = leftId ? details[leftId] : undefined
  if (!asset || !assetId) return null

  // A saved right-side asset owns its own pixels; mirroring only fills an empty linked side.
  const imageAsset = rightSide && mirror && linked[category.kind] && !ownId ? leftAsset ?? asset : asset
  const openEyeId = rightSide ? selectedAssets['eye-right'] ?? selectedAssets['eye-left'] : selectedAssets['eye-left']
  const openEye = category.kind === 'eye-closed' && openEyeId ? details[openEyeId] : undefined
  const leftOpen = details[selectedAssets['eye-left'] ?? '']
  const renderedOpenEye = openEye && rightSide && linked.eye && leftOpen
    ? { ...openEye, width: leftOpen.width } : openEye
  const transform = renderedOpenEye
    ? fitClosedEyeToOpen({ ...asset, width: imageAsset.width }, renderedOpenEye, head, rightSide)
    : asset.defaultTransform
  const physicalRight = rightSide && asset.rightSidePositioned === true
  const rightEyeId = selectedAssets['eye-right']
  const leftEyeId = selectedAssets['eye-left']
  const eyeAsset = category.kind === 'pupil' ? details[rightSide && rightEyeId ? rightEyeId : leftEyeId ?? ''] : undefined
  const eyeTransform = eyeAsset?.defaultTransform
  const pupilEyeImage = rightSide && linked.eye ? leftOpen ?? eyeAsset : eyeAsset
  const eyeWidth = eyeAsset && pupilEyeImage ? pupilEyeImage.width * eyeTransform!.scaleX : head.width * .19
  const eyeHeight = eyeAsset && pupilEyeImage ? pupilEyeImage.height * eyeTransform!.scaleY : head.height * .17

  let localX = transform.x
  let localY = transform.y
  if (category.kind === 'pupil') {
    const eyeX = eyeTransform?.x ?? head.width * .37
    localX = (rightSide && (!rightEyeId || !eyeAsset?.rightSidePositioned) ? head.width - eyeX : eyeX)
      + (pupilSourceMirrored(rightSide ? 'right' : 'left', physicalRight) ? -transform.x : transform.x)
    localY = (eyeTransform?.y ?? head.height * .46) + transform.y
  }

  const mirroredPosition = rightSide && !physicalRight && category.kind !== 'pupil'
  const x = mirroredPosition ? head.width - localX : localX
  const shouldFlip = Boolean(transform.flipX) !== (rightSide && !physicalRight && category.kind !== 'pupil')
  const width = category.kind === 'pupil' ? eyeWidth * transform.scaleX : imageAsset.width * transform.scaleX
  const height = category.kind === 'pupil' ? eyeHeight * transform.scaleY : imageAsset.height * transform.scaleY
  const style: PreviewStyle = {
    left: `${x / head.width * 100}%`,
    top: `${localY / head.height * 100}%`,
    width: `${width / head.width * 100}%`,
    height: `${height / head.height * 100}%`,
    transform: `translate(-50%,-50%) rotate(${transform.rotation * (mirroredPosition ? -1 : 1)}deg) scaleX(${shouldFlip ? -1 : 1})`
  }
  const dragKey = `${id}:${assetId}`
  const canDrag = dragKey === activePreviewKey && !openEye
  const model: FacePartPreviewModel = {
    key: `${id}-${assetId}`,
    assetId,
    imageAsset,
    label: category.names[rightSide ? 1 : 0],
    style,
    canDrag,
    drag: {
      invertX: mirroredPosition || category.kind === 'pupil' && pupilSourceMirrored(rightSide ? 'right' : 'left', physicalRight),
      pupil: category.kind === 'pupil'
    }
  }

  if (category.kind !== 'pupil' || !eyeAsset || !eyeTransform) return model

  const eyePartId = rightSide ? 'eye-right' : 'eye-left'
  const selectedEyeId = overrides[eyePartId] ?? selectedAssets[eyePartId] ?? (rightSide ? selectedAssets['eye-left'] : undefined)
  const sideEye = selectedEyeId ? details[selectedEyeId] : undefined
  if (!sideEye) return model

  // The pupil mask follows the selected eye asset so preview clipping matches Presets DEV.
  const maskImage = sideEye
  const maskTransform = sideEye.defaultTransform
  const eyePhysicalRight = rightSide && sideEye.rightSidePositioned === true
  const eyeMirrored = rightSide && !eyePhysicalRight
  const eyeX = eyeMirrored ? head.width - maskTransform.x : maskTransform.x
  const eyeRotation = maskTransform.rotation * (eyeMirrored ? -1 : 1)
  const eyeFlip = Boolean(maskTransform.flipX) !== eyeMirrored
  const maskStyle: PreviewStyle = {
    left: `${eyeX / head.width * 100}%`,
    top: `${maskTransform.y / head.height * 100}%`,
    width: `${maskImage.width * maskTransform.scaleX / head.width * 100}%`,
    height: `${maskImage.height * maskTransform.scaleY / head.height * 100}%`,
    transform: `translate(-50%,-50%) rotate(${eyeRotation}deg) scaleX(${eyeFlip ? -1 : 1})`,
    maskImage: `url(${eyeMasks[maskImage.id] ?? maskImage.dataUrl})`,
    WebkitMaskImage: `url(${eyeMasks[maskImage.id] ?? maskImage.dataUrl})`
  }
  const pupilOffsetX = pupilSourceMirrored(rightSide ? 'right' : 'left', physicalRight) ? -transform.x : transform.x
  const eyeFlipDirection = eyeFlip ? -1 : 1
  const pupilRotation = transform.rotation * (rightSide && !physicalRight ? -1 : 1) * eyeFlipDirection
  const pupilFlip = Boolean(transform.flipX) !== eyeFlip
  const pupilStyle: PreviewStyle = {
    left: `${50 + pupilOffsetX / (eyeFlipDirection * eyeTransform.scaleX * maskImage.width) * 100}%`,
    top: `${50 + transform.y / (eyeTransform.scaleY * maskImage.height) * 100}%`,
    width: `${transform.scaleX * 100}%`,
    height: `${transform.scaleY * 100}%`,
    transform: `translate(-50%,-50%) rotate(${pupilRotation}deg) scaleX(${pupilFlip ? -1 : 1})`
  }

  model.pupilMask = {
    style: maskStyle,
    pupilStyle,
    drag: {
      invertX: pupilSourceMirrored(rightSide ? 'right' : 'left', physicalRight),
      pupil: true,
      rotation: eyeRotation
    }
  }
  return model
}
