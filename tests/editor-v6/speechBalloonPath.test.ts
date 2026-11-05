import { describe, expect, it } from 'vitest'
import { createSpeechBalloonPath, createThoughtBalloonPath, createThoughtBalloonSketchPath } from '../../src/renderer/src/features/editorV6/speechBalloonPath'

describe('balão de fala do Editor V6', () => {
  it('desenha caixa arredondada com cauda inferior à esquerda dentro das dimensões do elemento', () => {
    const path = createSpeechBalloonPath(512, 450)

    expect(path).toContain('M -143.5 -225')
    expect(path).toContain('H 143.5')
    expect(path).toContain('V 22.5')
    expect(path).toContain('-204.8 225')
    expect(path.endsWith('Z')).toBe(true)
  })

  it('permite a proporção estreita mantendo as coordenadas finitas', () => {
    const path = createSpeechBalloonPath(120, 300)

    expect(path).not.toMatch(/NaN|Infinity/)
    expect(path).toContain('M -33.6 -150')
    expect(path).toContain('H 33.6')
  })

  it('desenha o pensamento como oval com ponta inferior esquerda e contorno duplo', () => {
    const outline = createThoughtBalloonPath(512, 450)
    const sketch = createThoughtBalloonSketchPath(512, 450)

    expect(outline).toContain('-256 216')
    expect(outline.endsWith('Z')).toBe(true)
    expect(sketch.startsWith('M ')).toBe(true)
    for (const path of [outline, sketch]) {
      expect(path).not.toMatch(/NaN|Infinity/)
      const coordinates = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      coordinates.forEach((coordinate, index) => {
        expect(Math.abs(coordinate)).toBeLessThanOrEqual(index % 2 === 0 ? 256 : 225)
      })
    }
  })
})
