import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import { loadSkinTintedImage } from '../../characters/characterRenderer'

/**
 * Derive GPU-ready body-part artwork using the *same* skin tone transform as
 * the existing Canvas Gacha compositor (renderArtworkWithHair). No secondary
 * shader/palette math or visual approximation is permitted at this boundary.
 *
 * This is a pure transformation of authored poses: the returned part data URLs
 * are prepared images, but originals, joints, ordering and geometry stay
 * unchanged. On a decoding failure the caller must keep the Canvas renderer.
 */
export async function preparePixiSkinToneArtwork(
  poses: readonly PoseArtwork[],
  skinTone?: string,
  tintImage: (dataUrl: string, tone: string) => Promise<Pick<HTMLImageElement, 'src'>> = loadSkinTintedImage,
): Promise<readonly PoseArtwork[]> {
  if (!skinTone) return poses
  const tinted = new Map<string, Promise<string>>()
  const textureUrl = (dataUrl: string): Promise<string> => {
    let pending = tinted.get(dataUrl)
    if (!pending) {
      pending = tintImage(dataUrl, skinTone).then(image => {
        if (!image.src) throw new Error('Uma textura de pele Gacha ficou vazia.')
        return image.src
      })
      tinted.set(dataUrl, pending)
    }
    return pending
  }
  return Promise.all(poses.map(async pose => ({
    ...pose,
    parts: await Promise.all(pose.parts.map(async part => ({
      ...part, dataUrl: await textureUrl(part.dataUrl),
    }))),
  })))
}
