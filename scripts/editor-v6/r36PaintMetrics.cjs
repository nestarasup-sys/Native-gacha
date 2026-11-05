/**
 * R36 experimental offscreen-paint marker reader and BGRA scene comparator.
 * All measurements use one immutable NativeImage readback per source. A DOM
 * frame counter is NOT considered proof that the corresponding bitmap matches.
 */
const TOKEN_CELLS = 6
const TOKEN_CELL_SIZE = 4
const TOKEN_STRIP_WIDTH = TOKEN_CELLS * TOKEN_CELL_SIZE
function analyzeR36Readback(image, sceneWidth, sceneHeight) {
  const size = image.getSize()
  if (!Number.isSafeInteger(sceneWidth) || !Number.isSafeInteger(sceneHeight) ||
    sceneWidth < 1 || sceneHeight < 1 || !size ||
    size.width < sceneWidth + TOKEN_STRIP_WIDTH || size.height < sceneHeight) {
    return { width: size?.width ?? 0, height: size?.height ?? 0, bitmap: null, token: null }
  }
  const bitmap = image.toBitmap({ scaleFactor: 1 })
  if (bitmap.length !== size.width * size.height * 4) {
    return { width: size.width, height: size.height, bitmap: null, token: null }
  }
  let token = 0
  for (let bit = 0; bit < 24; bit++) {
    const x = sceneWidth + bit % TOKEN_CELLS * TOKEN_CELL_SIZE + 2
    const y = Math.floor(bit / TOKEN_CELLS) * TOKEN_CELL_SIZE + 2
    const offset = (y * size.width + x) * 4
    if (bitmap[offset + 3] < 254) return { ...size, bitmap, token: null }
    if (bitmap[offset + 2] > 127) token |= 1 << bit
  }
  return { width: size.width, height: size.height, bitmap, token }
}
function compareR36ScenePixels(left, right, sceneWidth, sceneHeight) {
  if (!left.bitmap || !right.bitmap || left.width !== right.width || left.height !== right.height) return null
  let differingPixels = 0
  for (let y = 0; y < sceneHeight; y++) {
    const aRow = y * left.width * 4, bRow = y * right.width * 4
    for (let x = 0; x < sceneWidth; x++) {
      const a = aRow + x * 4, b = bRow + x * 4
      if (left.bitmap[a] !== right.bitmap[b] || left.bitmap[a + 1] !== right.bitmap[b + 1] ||
        left.bitmap[a + 2] !== right.bitmap[b + 2] || left.bitmap[a + 3] !== right.bitmap[b + 3]) differingPixels++
    }
  }
  return differingPixels
}
module.exports = { analyzeR36Readback, compareR36ScenePixels, TOKEN_STRIP_WIDTH }
