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

/** Rounded cloud for thoughts, leaving the lower-left area for its trailing dots. */
export function createThoughtBalloonPath(width: number, height: number): string {
  const left = -width / 2
  const top = -height / 2
  const x = (fraction: number) => left + width * fraction
  const y = (fraction: number) => top + height * fraction
  return [
    `M ${x(.23)} ${y(.18)}`,
    `C ${x(.14)} ${y(.20)} ${x(.10)} ${y(.12)} ${x(.16)} ${y(.07)}`,
    `C ${x(.13)} ${y(.04)} ${x(.28)} ${y(.03)} ${x(.36)} ${y(.08)}`,
    `C ${x(.42)} ${y(.02)} ${x(.55)} ${y(.03)} ${x(.60)} ${y(.11)}`,
    `C ${x(.69)} ${y(.02)} ${x(.82)} ${y(.07)} ${x(.81)} ${y(.20)}`,
    `C ${x(.94)} ${y(.23)} ${x(.94)} ${y(.40)} ${x(.83)} ${y(.46)}`,
    `C ${x(.95)} ${y(.55)} ${x(.87)} ${y(.70)} ${x(.73)} ${y(.68)}`,
    `C ${x(.67)} ${y(.80)} ${x(.56)} ${y(.76)} ${x(.52)} ${y(.68)}`,
    `C ${x(.44)} ${y(.82)} ${x(.31)} ${y(.78)} ${x(.31)} ${y(.68)}`,
    `C ${x(.20)} ${y(.82)} ${x(.08)} ${y(.72)} ${x(.15)} ${y(.61)}`,
    `C ${x(.04)} ${y(.58)} ${x(.06)} ${y(.43)} ${x(.16)} ${y(.39)}`,
    `C ${x(.06)} ${y(.28)} ${x(.12)} ${y(.19)} ${x(.23)} ${y(.18)}`,
    'Z'
  ].join(' ')
}
