/**
 * Native output canvas dimensions measured by the hairless character renderer
 * during export preparation, before transition baking starts.
 *
 * The transition bake only needs these sizes and the already-measured full
 * face-mode crops to lay out its atlas. Do not re-render the two endpoint
 * expressions solely to rediscover dimensions/crops.
 */
export type HairBakeEndpointCrop = {
  left: number
  top: number
  width: number
  height: number
  outputWidth?: number
  outputHeight?: number
}
export function resolvedHairBakeEndpointDimensions(
  crops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }
): { firstWidth: number; firstHeight: number; lastWidth: number; lastHeight: number } | null {
  if (!crops) return null
  const values = [crops.from.outputWidth, crops.from.outputHeight, crops.to.outputWidth, crops.to.outputHeight]
  if (!values.every(value => Number.isSafeInteger(value) && value! > 0 && value! <= 16_384)) return null
  return {
    firstWidth: crops.from.outputWidth!,
    firstHeight: crops.from.outputHeight!,
    lastWidth: crops.to.outputWidth!,
    lastHeight: crops.to.outputHeight!
  }
}
