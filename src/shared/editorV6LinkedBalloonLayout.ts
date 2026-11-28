/** Reflows a linked balloon in scene pixels before either renderer draws it. */
export function fitEditorV6LinkedBalloon(
  x: number, y: number, width: number, height: number, rotation: number, scalePercent: number
) {
  const scale = Math.max(1, Math.min(2.5, scalePercent / 100))
  const margin = 6
  const stageWidth = 1920 - margin * 2
  const stageHeight = 1080 - margin * 2
  const centerX = (50 + x) * 19.2
  const centerY = (50 + y) * 10.8
  const angle = rotation * Math.PI / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const originalWidth = width * 19.2 * scale
  const originalHeight = height * 10.8 * scale
  const horizontalExtent = originalWidth * cos + originalHeight * sin
  const availableWidth = 2 * Math.min(centerX - margin, 1920 - margin - centerX)
  const clearanceRatio = availableWidth / horizontalExtent
  const minimumSqueeze = 1 / 1.5
  const squeeze = Math.max(minimumSqueeze, Math.min(1, clearanceRatio))
  // Once height grows by 50%, restore width toward the interior. The center clamp
  // below keeps the edge nearest the character pinned to the stage margin.
  const inwardGrowth = Math.max(0, Math.min(1 - minimumSqueeze, minimumSqueeze - clearanceRatio))
  const widthFactor = squeeze + inwardGrowth
  const fittedWidth = originalWidth * widthFactor
  const fittedHeight = originalHeight / squeeze
  const extentX = fittedWidth * cos + fittedHeight * sin
  const extentY = fittedWidth * sin + fittedHeight * cos
  const fit = Math.min(1, stageWidth / extentX, stageHeight / extentY)
  const halfX = extentX * fit / 2
  const halfY = extentY * fit / 2
  const fittedX = Math.max(margin + halfX, Math.min(1920 - margin - halfX, centerX))
  const fittedY = Math.max(margin + halfY, Math.min(1080 - margin - halfY, centerY))
  return {
    x: fittedX === centerX ? x : fittedX / 19.2 - 50,
    y: fittedY === centerY ? y : fittedY / 10.8 - 50,
    width: width * widthFactor * fit,
    height: height / squeeze * fit
  }
}
