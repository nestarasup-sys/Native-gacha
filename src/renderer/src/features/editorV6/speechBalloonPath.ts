/** Speech bubble with a lower-left tail, contained within the element's existing bounds. */
export function createSpeechBalloonPath(width: number, height: number): string {
  const left = -width / 2
  const right = width / 2
  const top = -height / 2
  const bottom = height / 2
  const radius = Math.max(0, Math.min(width * 0.22, height * 0.25))
  const tailHeight = Math.min(height * 0.2, Math.max(0, height / 2 - radius))
  const bodyBottom = bottom - tailHeight
  const tailStart = left + width * 0.3
  const tailEnd = left + width * 0.1
  const tailJoin = left + width * 0.24

  return [
    `M ${left + radius} ${top}`,
    `H ${right - radius}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${bodyBottom - radius}`,
    `Q ${right} ${bodyBottom} ${right - radius} ${bodyBottom}`,
    `H ${tailStart}`,
    `C ${left + width * 0.2} ${bodyBottom + tailHeight * 0.12}, ${tailEnd} ${bottom - tailHeight * 0.12}, ${tailEnd} ${bottom}`,
    `C ${left + width * 0.13} ${bottom - tailHeight * 0.12}, ${left + width * 0.15} ${bodyBottom + tailHeight * 0.12}, ${tailJoin} ${bodyBottom}`,
    `H ${left + radius}`,
    `Q ${left} ${bodyBottom} ${left} ${bodyBottom - radius}`,
    `V ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    'Z'
  ].join(' ')
}

/** Mixes the speaker title color into white so the balloon stays bright and readable. */
export function speechBalloonFillColor(speakerColor?: string): string {
  const match = /^#([\da-f]{6})$/i.exec(speakerColor ?? '')
  const color = match?.[1] ?? '624d5b'
  const tint = 0.12
  const channels = [0, 2, 4].map((index) => {
    const source = Number.parseInt(color.slice(index, index + 2), 16)
    return Math.round(255 * (1 - tint) + source * tint).toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}
