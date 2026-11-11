const FONT = 'Arial, sans-serif'
let measurement: CanvasRenderingContext2D | null = null

function measure(text: string, fontSize: number): number {
  if (!measurement && typeof document !== 'undefined') measurement = document.createElement('canvas').getContext('2d')
  if (!measurement) return Array.from(text).length * fontSize * .55
  measurement.font = `600 ${fontSize}px ${FONT}`
  return measurement.measureText(text).width
}

/** All wrapping is explicit SVG text, so preview and captured frames have identical layout. */
export function wrapSceneText(text: string, width: number, fontSize: number, maxLines: number): string[] {
  const lines: string[] = []
  let overflow = false
  const push = (line: string) => { if (lines.length < maxLines) lines.push(line); else overflow = true }
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`, fontSize) <= width) { line += ` ${word}`; continue }
      if (line) { push(line); line = '' }
      for (const character of Array.from(word)) {
        if (line && measure(line + character, fontSize) > width) { push(line); line = '' }
        line += character
      }
    }
    push(line)
  }
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while (last && measure(`${last}…`, fontSize) > width) last = Array.from(last).slice(0, -1).join('')
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}
