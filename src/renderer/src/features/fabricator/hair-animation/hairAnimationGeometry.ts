import type { HairAsset, HairTransform, ModelPart } from '../../../../../shared/fabricator'

/** Use the same head-relative fit saved by Cabelos Dev. */
export function hairAnimationGeometry(head: Pick<ModelPart, 'width' | 'height'>, asset: Pick<HairAsset, 'width' | 'height'>, transform: HairTransform) {
  return {
    left: `${transform.x / head.width * 100}%`, top: `${transform.y / head.height * 100}%`,
    width: `${asset.width * transform.scaleX / head.width * 100}%`, height: `${asset.height * transform.scaleY / head.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scaleX(${transform.flipX ? -1 : 1})`
  }
}
