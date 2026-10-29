import type { CSSProperties } from 'react'
import { pupilSourceMirrored } from '../../../../shared/facePupilGeometry.ts'
import type { FaceComponentAsset, FaceExpressionTransforms, FaceTransform, ModelPart } from '../../../../shared/fabricator'
import type { ExpressionComposition, ExpressionComponentKind, ExpressionSide } from './expressionPresetModel'
import type { createExpressionPreviewInteraction, PreviewLayerMapping } from './expressionPreviewInteraction'
import { expressionLayerKey as layerKey, type ExpressionLayerKey } from './expressionLayerTransformEdits.ts'

type Props = {
  head: Pick<ModelPart, 'width' | 'height'> | null
  assetId: string | null
  kind: ExpressionComponentKind
  side: ExpressionSide
  transform: FaceTransform
  eyeAsset?: FaceComponentAsset
  eyeTransformOverride?: FaceTransform
  composition: ExpressionComposition
  componentAssets: Record<string, FaceComponentAsset>
  transforms: FaceExpressionTransforms
  eyeMasks: Record<string, string>
  selectedLayer: ExpressionLayerKey
  linkedLayerPairs: Record<ExpressionComponentKind, boolean>
  interaction: ReturnType<typeof createExpressionPreviewInteraction>
}

/** Renders one face asset in the expression editor and owns its mirrored preview geometry. */
export function ExpressionFaceComponentPreview({
  head, assetId, kind, side, transform, eyeAsset, eyeTransformOverride, composition,
  componentAssets, transforms, eyeMasks, selectedLayer, linkedLayerPairs, interaction
}: Props) {
  if (!head || !assetId) return null
  const asset = componentAssets[assetId]
  if (!asset || asset.kind !== kind) return null
  const right = side === 'right'
  const physicallyRight = asset.rightSidePositioned === true

  if (kind !== 'pupil') {
    const mirrored = right && !physicallyRight
    const layer = layerKey(kind, side)
    const pairedSide = right ? 'left' : 'right'
    const pairedLayer = layerKey(kind, pairedSide)
    const movePair = linkedLayerPairs[kind]
    const canDrag = selectedLayer === layer || movePair && selectedLayer === pairedLayer
    const pairedAssetId = kind === 'eye' ? composition.eyes[pairedSide] : composition.eyebrows[pairedSide]
    const pairedAsset = pairedAssetId ? componentAssets[pairedAssetId] : undefined
    const dragMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>> = [{ layer, mirroredX: mirrored, rotation: 0 }]
    if (movePair && pairedAsset) dragMappings.push({
      layer: pairedLayer, mirroredX: pairedSide === 'right' && pairedAsset.rightSidePositioned !== true, rotation: 0
    })
    const x = mirrored ? head.width - transform.x : transform.x
    const rotation = mirrored ? -transform.rotation : transform.rotation
    const imageStyle: CSSProperties = {
      left: `${x / head.width * 100}%`, top: `${transform.y / head.height * 100}%`,
      width: `${asset.width * transform.scaleX / head.width * 100}%`, height: `${asset.height * transform.scaleY / head.height * 100}%`,
      zIndex: kind === 'eyebrow' ? 4 : 2,
      transform: `translate(-50%,-50%) rotate(${rotation}deg) scaleX(${Boolean(transform.flipX) !== mirrored ? -1 : 1})`,
      pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'grab' : undefined, touchAction: canDrag ? 'none' : undefined
    }
    return <img key={`${kind}-${asset.id}-${right}`} className="expression-head-piece" src={asset.dataUrl}
      alt={canDrag ? `Arraste para mover ${kind === 'eyebrow' ? 'a sobrancelha' : 'o olho'}` : ''} style={imageStyle}
      onPointerDown={canDrag ? (event) => interaction.beginLayerDrag(event, dragMappings) : undefined}
      onPointerMove={canDrag ? interaction.moveLayerDrag : undefined} onPointerUp={canDrag ? interaction.endLayerDrag : undefined}
      onPointerCancel={canDrag ? interaction.endLayerDrag : undefined} onLostPointerCapture={canDrag ? interaction.endLayerDrag : undefined} />
  }

  if (!eyeAsset) return null
  const eyeTransform = eyeTransformOverride ?? eyeAsset.defaultTransform
  const eyePhysicallyRight = eyeAsset.rightSidePositioned === true
  const eyeMirrored = right && !eyePhysicallyRight
  const eyeX = eyeMirrored ? head.width - eyeTransform.x : eyeTransform.x
  const eyeRotation = eyeMirrored ? -eyeTransform.rotation : eyeTransform.rotation
  const pupilTransform = transform
  const mirroredPupilX = pupilSourceMirrored(side, physicallyRight)
  const pupilX = mirroredPupilX ? -pupilTransform.x : pupilTransform.x
  const eyeFlip = Boolean(eyeTransform.flipX) !== eyeMirrored
  const eyeFlipDirection = eyeFlip ? -1 : 1
  const maskUrl = eyeMasks[eyeAsset.id] ?? eyeAsset.dataUrl
  const maskStyle: CSSProperties = {
    left: `${eyeX / head.width * 100}%`, top: `${eyeTransform.y / head.height * 100}%`,
    width: `${eyeAsset.width * eyeTransform.scaleX / head.width * 100}%`, height: `${eyeAsset.height * eyeTransform.scaleY / head.height * 100}%`,
    transform: `translate(-50%,-50%) rotate(${eyeRotation}deg) scaleX(${eyeFlipDirection})`,
    // Keep the source alpha mask until the sclera-only mask finishes generating.
    maskImage: `url(${maskUrl})`, WebkitMaskImage: `url(${maskUrl})`
  }
  const pupilStyle: CSSProperties = {
    left: `${50 + pupilX / (eyeFlipDirection * eyeTransform.scaleX * eyeAsset.width) * 100}%`,
    top: `${50 + pupilTransform.y / (eyeAsset.height * eyeTransform.scaleY) * 100}%`,
    width: `${pupilTransform.scaleX * 100}%`, height: `${pupilTransform.scaleY * 100}%`,
    transform: `translate(-50%,-50%) rotate(${pupilTransform.rotation * (right && !eyePhysicallyRight ? -1 : 1) * eyeFlipDirection}deg) scaleX(${Boolean(pupilTransform.flipX) !== eyeFlip ? -1 : 1})`
  }
  const pupilLayer = layerKey('pupil', side)
  const pairedSide = right ? 'left' : 'right'
  const pairedPupilLayer = layerKey('pupil', pairedSide)
  const canDrag = selectedLayer === pupilLayer || linkedLayerPairs.pupil && selectedLayer === pairedPupilLayer
  const pairedPupilId = composition.pupils[pairedSide]
  const pairedEyeId = composition.eyes[pairedSide]
  const pairedPupilAsset = pairedPupilId ? componentAssets[pairedPupilId] : undefined
  const pairedEyeAsset = pairedEyeId ? componentAssets[pairedEyeId] : undefined
  const pairedEyeTransform = transforms[layerKey('eye', pairedSide)]
  const pairedEyeMirrored = pairedSide === 'right' && pairedEyeAsset?.rightSidePositioned !== true
  const pairedEyeRotation = pairedEyeMirrored ? -pairedEyeTransform.rotation : pairedEyeTransform.rotation
  const dragMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>> = [{
    layer: pupilLayer, mirroredX: mirroredPupilX, rotation: eyeRotation
  }]
  if (linkedLayerPairs.pupil && pairedPupilAsset && pairedEyeAsset) dragMappings.push({
    layer: layerKey('pupil', pairedSide),
    mirroredX: pupilSourceMirrored(pairedSide, pairedPupilAsset.rightSidePositioned === true), rotation: pairedEyeRotation
  })
  return <span key={`${kind}-${asset.id}-${right}`} className="expression-head-pupil-mask"
    style={{ ...maskStyle, pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'grab' : undefined, touchAction: canDrag ? 'none' : undefined }}
    onPointerDown={canDrag ? (event) => interaction.beginLayerDrag(event, dragMappings) : undefined}
    onPointerMove={canDrag ? interaction.moveLayerDrag : undefined} onPointerUp={canDrag ? interaction.endLayerDrag : undefined}
    onPointerCancel={canDrag ? interaction.endLayerDrag : undefined} onLostPointerCapture={canDrag ? interaction.endLayerDrag : undefined}>
    <img src={asset.dataUrl} alt={canDrag ? `Arraste para mover a pupila ${right ? 'direita' : 'esquerda'}` : ''} style={pupilStyle} />
  </span>
}
