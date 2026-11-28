const FONT = 'Arial, sans-serif'
let measurement: CanvasRenderingContext2D | null = null

export type SceneTextFont = { family?: string; weight?: number }
export type FittedSceneText = { fontSize: number; lines: string[] }

function wrapSceneTextDetailed(text: string, width: number, fontSize: number, maxLines: number, font: SceneTextFont): { lines: string[]; overflow: boolean } {
  const lines: string[] = []
  let overflow = false
  const push = (line: string) => { if (lines.length < maxLines) lines.push(line); else overflow = true }
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`, fontSize, font) <= width) { line += ` ${word}`; continue }
      if (line) { push(line); line = '' }
      for (const character of Array.from(word)) {
        if (line && measure(line + character, fontSize, font) > width) { push(line); line = '' }
        line += character
      }
    }
    push(line)
  }
  return { lines, overflow }
}

function measure(text: string, fontSize: number, font: SceneTextFont = {}): number {
  if (typeof document === 'undefined') return Array.from(text).length * fontSize * .55
  if (!measurement) measurement = document.createElement('canvas').getContext('2d')
  if (!measurement) return Array.from(text).length * fontSize * .55
  measurement.font = `${font.weight ?? 600} ${fontSize}px ${font.family ?? FONT}`
  return measurement.measureText(text).width
}

/** All wrapping is explicit SVG text, so preview and captured frames have identical layout. */
export function wrapSceneText(text: string, width: number, fontSize: number, maxLines: number, font: SceneTextFont = {}): string[] {
  const { lines, overflow } = wrapSceneTextDetailed(text, width, fontSize, maxLines, font)
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while (last && measure(`${last}…`, fontSize, font) > width) last = Array.from(last).slice(0, -1).join('')
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

/** Uses the largest readable font that fits every line into the balloon's safe area. */
export function fitSceneText(
  text: string,
  width: number,
  height: number,
  maxFontSize: number,
  minFontSize: number,
  font: SceneTextFont = {},
  lineHeightFactor = 1.22
): FittedSceneText {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const minimum = Math.max(1, Math.min(minFontSize, maxFontSize))
  for (let fontSize = maxFontSize; fontSize > minimum; fontSize = Math.max(minimum, fontSize - 0.5)) {
    const maxLines = Math.max(1, Math.floor(safeHeight / (fontSize * lineHeightFactor)))
    const result = wrapSceneTextDetailed(text, safeWidth, fontSize, maxLines, font)
    if (!result.overflow) return { fontSize, lines: result.lines }
  }
  const maxLines = Math.max(1, Math.floor(safeHeight / (minimum * lineHeightFactor)))
  return { fontSize: minimum, lines: wrapSceneText(text, safeWidth, minimum, maxLines, font) }
}
