/** Exact readback comparison for staged GPU migration; no user files or PNG serialization.
 * Transparent-black RGB is ignored only when *both* pixels have alpha zero,
 * because GPU premultiplication can change invisible RGB values.
 */
export type GachaPixelParity = Readonly<{
  pixels: number
  changedPixels: number
  changedRatio: number
  meanWorstChannelError: number
  p99WorstChannelError: number
  maxChannelError: number
  maxAllowedError: number
}>
export function compareGachaPixels(
  reference: Uint8Array | Uint8ClampedArray,
  gpu: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxAllowedError = 12,
): GachaPixelParity {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width * height * 4 !== reference.length || reference.length !== gpu.length) {
    throw new Error('Dimensões RGBA incompatíveis no teste de paridade Gacha.')
  }
  if (!Number.isFinite(maxAllowedError) || maxAllowedError < 0 || maxAllowedError > 255) {
    throw new Error('Tolerância de paridade RGBA inválida.')
  }
  const pixels = width * height
  const errors = new Uint32Array(256)
  let changedPixels = 0, sum = 0, maxChannelError = 0
  for (let offset = 0; offset < reference.length; offset += 4) {
    // Invisible RGB has no visual meaning when both pixels are transparent.
    if (reference[offset + 3] === 0 && gpu[offset + 3] === 0) {
      errors[0]++
      continue
    }
    let worst = 0
    for (let channel = 0; channel < 4; channel++) {
      const error = Math.abs(reference[offset + channel] - gpu[offset + channel])
      if (error > worst) worst = error
    }
    errors[worst]++
    if (worst > maxAllowedError) changedPixels++
    sum += worst
    if (worst > maxChannelError) maxChannelError = worst
  }
  const target = Math.ceil(pixels * .99)
  let cumulative = 0, p99WorstChannelError = 0
  for (let error = 0; error < errors.length; error++) {
    cumulative += errors[error]
    if (cumulative >= target) { p99WorstChannelError = error; break }
  }
  return {
    pixels, changedPixels, changedRatio: changedPixels / pixels,
    meanWorstChannelError: sum / pixels, p99WorstChannelError,
    maxChannelError, maxAllowedError,
  }
}
