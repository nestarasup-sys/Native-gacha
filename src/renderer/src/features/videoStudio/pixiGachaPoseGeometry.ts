import type { ModelPart } from '../../../../shared/fabricator'
import { mixPoseArtwork, type PoseArtwork } from '../../../../shared/videoCharacterInterpolation'

/** Small, image-free representation safe to send across worker threads. */
export type GachaPoseGeometry = Readonly<{
  width: number
  height: number
  parts: ReadonlyArray<Pick<ModelPart, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'jointAnchor'>>
  joints?: PoseArtwork['joints']
  layerOrder?: string[]
  hiddenPartIds?: string[]
}>

/**
 * Textures (dataUrl/chromaBaseDataUrl) can be several megabytes per part.
 * Never serialize them into a Worker on every RAF. Keep originals on the GPU
 * side and send only geometry and numeric joint positions once.
 */
export function stripGachaPoseTextures(pose: PoseArtwork): PoseArtwork {
  return {
    width: pose.width, height: pose.height,
    parts: pose.parts.map(part => ({
      id: part.id,
      name: part.name,
      x: part.x, y: part.y, width: part.width, height: part.height,
      rotation: part.rotation,
      dataUrl: '',
      ...(part.jointAnchor ? { jointAnchor: { ...part.jointAnchor } } : {}),
    })),
    joints: pose.joints?.map(joint => ({ ...joint,
      parentAnchor: { ...joint.parentAnchor }, childAnchor: { ...joint.childAnchor },
      ...(joint.pivot ? { pivot: { ...joint.pivot } } : {}),
    })),
    layerOrder: pose.layerOrder ? [...pose.layerOrder] : undefined,
    hiddenPartIds: pose.hiddenPartIds ? [...pose.hiddenPartIds] : undefined,
  }
}

export function interpolateGachaPoseGeometry(from: PoseArtwork, to: PoseArtwork, progress: number): GachaPoseGeometry {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error('Progresso de pose Gacha inválido.')
  }
  const mixed = mixPoseArtwork(from, to, progress)
  return {
    width: mixed.width, height: mixed.height,
    parts: mixed.parts.map(p => ({
      id:p.id,x:p.x,y:p.y,width:p.width,height:p.height,
      rotation:p.rotation,
      ...(p.jointAnchor ? { jointAnchor:p.jointAnchor } : {}),
    })),
    joints: mixed.joints,
    layerOrder: mixed.layerOrder,
    hiddenPartIds: mixed.hiddenPartIds,
  }
}

/**
 * Reattach original PNG references after Worker interpolation, matching the
 * canonical mixPoseArtwork midpoint selection for discrete source art.
 * Only numeric fields travel back from the worker.
 */
export function restoreGachaPoseTextures(
  from: PoseArtwork, to: PoseArtwork, progress: number, geometry: GachaPoseGeometry,
): PoseArtwork {
  const left = new Map(from.parts.map(part => [part.id, part]))
  const right = new Map(to.parts.map(part => [part.id, part]))
  const preferLeft = progress < .5
  return {
    width: geometry.width, height: geometry.height,
    parts: geometry.parts.map(transform => {
      const original = (preferLeft ? left.get(transform.id) ?? right.get(transform.id)
        : right.get(transform.id) ?? left.get(transform.id))
      if (!original) throw new Error('Parte interpolada ausente dos endpoints Gacha: ' + transform.id)
      return { ...original, ...transform }
    }),
    joints: geometry.joints, layerOrder: geometry.layerOrder, hiddenPartIds: geometry.hiddenPartIds,
  }
}
