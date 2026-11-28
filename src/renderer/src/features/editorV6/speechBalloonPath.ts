export type BalloonSide = 'top' | 'right' | 'bottom' | 'left'
export type BalloonKind = 'speech' | 'thought'
export type BalloonRect = { left: number; top: number; right: number; bottom: number }
export type ThoughtBalloonDot = { x: number; y: number; radius: number }

export type BalloonGeometry = {
  side: BalloonSide
  body: BalloonRect
  text: BalloonRect
  thoughtDots: ThoughtBalloonDot[]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function safeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, value) : 1
}

function targetUnit(targetX: number, targetY: number): { x: number; y: number } {
  const x = Number.isFinite(targetX) ? targetX : 0
  const y = Number.isFinite(targetY) ? targetY : -1
  const length = Math.hypot(x, y)
  return length < 0.001 ? { x: 0, y: -1 } : { x: x / length, y: y / length }
}

function sideForTarget(width: number, height: number, x: number, y: number): BalloonSide {
  const horizontal = Math.abs(x) / width
  const vertical = Math.abs(y) / height
  if (horizontal > vertical) return x < 0 ? 'left' : 'right'
  return y < 0 ? 'top' : 'bottom'
}

/** Computes the balloon body and a protected text area in the element's local SVG coordinates. */
export function getBalloonGeometry(
  kind: BalloonKind,
  inputWidth: number,
  inputHeight: number,
  targetX = 0,
  targetY = -1,
  compact = false
): BalloonGeometry {
  const width = safeDimension(inputWidth)
  const height = safeDimension(inputHeight)
  const minimumDimension = Math.min(width, height)
  const target = targetUnit(targetX, targetY)
  const side = sideForTarget(width, height, target.x, target.y)
  const tailDepth = Math.min(minimumDimension * (compact ? 0.16 : 0.23), compact ? 18 : 28)
  const left = -width / 2 + (side === 'left' ? tailDepth : 0)
  const right = width / 2 - (side === 'right' ? tailDepth : 0)
  const top = -height / 2 + (side === 'top' ? tailDepth : 0)
  const bottom = height / 2 - (side === 'bottom' ? tailDepth : 0)
  const body = { left, right, top, bottom }
  const bodyWidth = right - left
  const bodyHeight = bottom - top
  const paddingX = Math.min(kind === 'thought'
    ? clamp(bodyWidth * (compact ? 0.16 : 0.19), 8, 26)
    : clamp(bodyWidth * (compact ? 0.06 : 0.075), 8, 26), bodyWidth * 0.34)
  const paddingY = Math.min(kind === 'thought'
    ? clamp(bodyHeight * (compact ? 0.12 : 0.2), compact ? 5 : 8, compact ? 14 : 24)
    : clamp(bodyHeight * (compact ? 0.08 : 0.14), compact ? 5 : 8, compact ? 12 : 22), bodyHeight * 0.34)
  const text = {
    left: left + paddingX,
    right: right - paddingX,
    top: top + paddingY,
    bottom: bottom - paddingY
  }

  if (kind === 'speech') return { side, body, text, thoughtDots: [] }

  const dotRadii = [minimumDimension * 0.07, minimumDimension * 0.05, minimumDimension * 0.035]
  const distances = [tailDepth * 0.26, tailDepth * 0.56, tailDepth * 0.84]
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  const thoughtDots = dotRadii.map((radius, index): ThoughtBalloonDot => {
    const distance = distances[index]!
    const pointX = centerX + target.x * distance
    const pointY = centerY + target.y * distance
    const x = side === 'left' ? left - distance
      : side === 'right' ? right + distance
        : clamp(pointX, -width / 2 + radius, width / 2 - radius)
    const y = side === 'top' ? top - distance
      : side === 'bottom' ? bottom + distance
        : clamp(pointY, -height / 2 + radius, height / 2 - radius)
    return { x, y, radius }
  })
  return { side, body, text, thoughtDots }
}

/** Draws one closed speech outline with a smooth tail aimed toward the linked character. */
export function createSpeechBalloonPath(
  inputWidth: number,
  inputHeight: number,
  targetX = 0,
  targetY = -1,
  compact = false
): string {
  const width = safeDimension(inputWidth)
  const height = safeDimension(inputHeight)
  const geometry = getBalloonGeometry('speech', width, height, targetX, targetY, compact)
  const { left, right, top, bottom } = geometry.body
  const target = targetUnit(targetX, targetY)
  const bodyWidth = right - left
  const bodyHeight = bottom - top
  const shortSide = Math.min(bodyWidth, bodyHeight)
  const radius = Math.min(shortSide * (compact ? 0.18 : 0.2), bodyWidth / 2, bodyHeight / 2)
  const tailHalfWidth = Math.min(clamp(shortSide * (compact ? 0.09 : 0.105), 5, compact ? 14 : 17), Math.max(0.5, (geometry.side === 'top' || geometry.side === 'bottom' ? bodyWidth : bodyHeight) * 0.24))
  const tailDepth = geometry.side === 'top' ? top + height / 2
    : geometry.side === 'bottom' ? height / 2 - bottom
      : geometry.side === 'left' ? left + width / 2
        : width / 2 - right
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  const baseCenterX = clamp(centerX + target.x * tailDepth * 0.3, left + radius + tailHalfWidth, right - radius - tailHalfWidth)
  const baseCenterY = clamp(centerY + target.y * tailDepth * 0.3, top + radius + tailHalfWidth, bottom - radius - tailHalfWidth)
  const tipInset = Math.min(shortSide * 0.025, 3)
  const tipX = geometry.side === 'top'
    ? clamp(baseCenterX + (target.x / Math.max(0.12, Math.abs(target.y))) * tailDepth * 0.75, -width / 2 + tipInset, width / 2 - tipInset)
    : geometry.side === 'bottom'
      ? clamp(baseCenterX + (target.x / Math.max(0.12, Math.abs(target.y))) * tailDepth * 0.75, -width / 2 + tipInset, width / 2 - tipInset)
      : geometry.side === 'right' ? width / 2 - tipInset : -width / 2 + tipInset
  const tipY = geometry.side === 'left'
    ? clamp(baseCenterY + (target.y / Math.max(0.12, Math.abs(target.x))) * tailDepth * 0.75, -height / 2 + tipInset, height / 2 - tipInset)
    : geometry.side === 'right'
      ? clamp(baseCenterY + (target.y / Math.max(0.12, Math.abs(target.x))) * tailDepth * 0.75, -height / 2 + tipInset, height / 2 - tipInset)
      : geometry.side === 'top' ? -height / 2 + tipInset : height / 2 - tipInset
  const horizontalTail = geometry.side === 'top' || geometry.side === 'bottom'
  const baseStart = horizontalTail ? baseCenterX - tailHalfWidth : baseCenterY - tailHalfWidth
  const baseEnd = horizontalTail ? baseCenterX + tailHalfWidth : baseCenterY + tailHalfWidth
  const curve = Math.min(tailHalfWidth * 0.55, tailDepth * 0.42)
  const tailToTip = geometry.side === 'top'
    ? `C ${baseStart + curve} ${top - curve}, ${tipX - curve} ${tipY + curve}, ${tipX} ${tipY} C ${tipX + curve} ${tipY + curve}, ${baseEnd - curve} ${top - curve}, ${baseEnd} ${top}`
    : geometry.side === 'bottom'
      ? `C ${baseEnd - curve} ${bottom + curve}, ${tipX + curve} ${tipY - curve}, ${tipX} ${tipY} C ${tipX - curve} ${tipY - curve}, ${baseStart + curve} ${bottom + curve}, ${baseStart} ${bottom}`
      : geometry.side === 'right'
        ? `C ${right + curve} ${baseStart + curve}, ${tipX - curve} ${tipY - curve}, ${tipX} ${tipY} C ${tipX - curve} ${tipY + curve}, ${right + curve} ${baseEnd - curve}, ${right} ${baseEnd}`
        : `C ${left - curve} ${baseEnd - curve}, ${tipX + curve} ${tipY + curve}, ${tipX} ${tipY} C ${tipX + curve} ${tipY - curve}, ${left - curve} ${baseStart + curve}, ${left} ${baseStart}`

  if (geometry.side === 'top') return [
    `M ${left + radius} ${top}`, `H ${baseStart}`, tailToTip, `H ${right - radius}`,
    `Q ${right} ${top} ${right} ${top + radius}`, `V ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`, `H ${left + radius}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`, `V ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`, 'Z'
  ].join(' ')

  if (geometry.side === 'right') return [
    `M ${left + radius} ${top}`, `H ${right - radius}`, `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${baseStart}`, tailToTip, `V ${bottom - radius}`, `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `H ${left + radius}`, `Q ${left} ${bottom} ${left} ${bottom - radius}`, `V ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`, 'Z'
  ].join(' ')

  if (geometry.side === 'bottom') return [
    `M ${left + radius} ${top}`, `H ${right - radius}`, `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${bottom - radius}`, `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `H ${baseEnd}`, tailToTip, `H ${left + radius}`, `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `V ${top + radius}`, `Q ${left} ${top} ${left + radius} ${top}`, 'Z'
  ].join(' ')

  return [
    `M ${left + radius} ${top}`, `H ${right - radius}`, `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${bottom - radius}`, `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `H ${left + radius}`, `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `V ${baseEnd}`, tailToTip, `V ${top + radius}`, `Q ${left} ${top} ${left + radius} ${top}`, 'Z'
  ].join(' ')
}

/** Returns only the oval body; thought dots are separate shapes in the same shape group. */
export function createThoughtBalloonPath(inputWidth: number, inputHeight: number, targetX = 0, targetY = -1, compact = false): string {
  const width = safeDimension(inputWidth)
  const height = safeDimension(inputHeight)
  const { body } = getBalloonGeometry('thought', width, height, targetX, targetY, compact)
  const centerX = (body.left + body.right) / 2
  const centerY = (body.top + body.bottom) / 2
  const radiusX = (body.right - body.left) / 2
  const radiusY = (body.bottom - body.top) / 2
  return `M ${centerX - radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX + radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX - radiusX} ${centerY} Z`
}
