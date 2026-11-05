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

/** Oval thought balloon with a pointed lower-left tail, sized to the existing element bounds. */
export function createThoughtBalloonPath(width: number, height: number): string {
  const left = -width / 2
  const top = -height / 2
  const x = (fraction: number) => left + width * fraction
  const y = (fraction: number) => top + height * fraction
  return [
    `M ${x(.52)} ${y(.06)}`,
    `C ${x(.68)} ${y(.01)} ${x(.89)} ${y(.04)} ${x(.96)} ${y(.19)}`,
    `C ${x(1)} ${y(.29)} ${x(.99)} ${y(.48)} ${x(.90)} ${y(.60)}`,
    `C ${x(.83)} ${y(.70)} ${x(.69)} ${y(.77)} ${x(.57)} ${y(.80)}`,
    `C ${x(.43)} ${y(.83)} ${x(.29)} ${y(.79)} ${x(.20)} ${y(.71)}`,
    `C ${x(.15)} ${y(.67)} ${x(.12)} ${y(.62)} ${x(.08)} ${y(.60)}`,
    `C ${x(.07)} ${y(.69)} ${x(.05)} ${y(.79)} ${x(0)} ${y(.98)}`,
    `C ${x(.06)} ${y(.87)} ${x(.11)} ${y(.76)} ${x(.14)} ${y(.65)}`,
    `C ${x(.06)} ${y(.55)} ${x(.04)} ${y(.42)} ${x(.09)} ${y(.30)}`,
    `C ${x(.15)} ${y(.16)} ${x(.33)} ${y(.07)} ${x(.52)} ${y(.06)}`,
    'Z'
  ].join(' ')
}

/** A second slightly irregular outline gives the thought balloon a hand-drawn look. */
export function createThoughtBalloonSketchPath(width: number, height: number): string {
  const left = -width / 2
  const top = -height / 2
  const x = (fraction: number) => left + width * fraction
  const y = (fraction: number) => top + height * fraction
  return [
    `M ${x(.48)} ${y(.04)}`,
    `C ${x(.66)} ${y(0)} ${x(.88)} ${y(.03)} ${x(.94)} ${y(.16)}`,
    `C ${x(.99)} ${y(.28)} ${x(.97)} ${y(.46)} ${x(.87)} ${y(.59)}`,
    `C ${x(.79)} ${y(.69)} ${x(.67)} ${y(.75)} ${x(.56)} ${y(.77)}`,
    `C ${x(.42)} ${y(.80)} ${x(.28)} ${y(.76)} ${x(.19)} ${y(.68)}`,
    `C ${x(.14)} ${y(.64)} ${x(.11)} ${y(.59)} ${x(.09)} ${y(.57)}`,
    `C ${x(.08)} ${y(.68)} ${x(.04)} ${y(.81)} ${x(.025)} ${y(.94)}`
  ].join(' ')
}
