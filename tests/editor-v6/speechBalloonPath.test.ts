import { describe, expect, it } from 'vitest'
import { createSpeechBalloonPath, createThoughtBalloonPath, getBalloonGeometry } from '../../src/renderer/src/features/editorV6/speechBalloonPath'

describe('geometria vetorial dos balões do Editor V6', () => {
  it('direciona a cauda da fala para cada lado sem sair dos limites do elemento', () => {
    const targets = [
      { side: 'top', x: 0, y: -1 },
      { side: 'right', x: 1, y: 0 },
      { side: 'bottom', x: 0, y: 1 },
      { side: 'left', x: -1, y: 0 }
    ] as const

    for (const target of targets) {
      const geometry = getBalloonGeometry('speech', 512, 450, target.x, target.y)
      const path = createSpeechBalloonPath(512, 450, target.x, target.y)
      expect(geometry.side).toBe(target.side)
      expect(path.endsWith('Z')).toBe(true)
      expect(path).not.toMatch(/NaN|Infinity/)
      expect(geometry.text.left).toBeGreaterThan(geometry.body.left)
      expect(geometry.text.right).toBeLessThan(geometry.body.right)
      expect(geometry.text.top).toBeGreaterThan(geometry.body.top)
      expect(geometry.text.bottom).toBeLessThan(geometry.body.bottom)
    }
  })

  it('mantém dimensões extremas finitas e uma área útil positiva', () => {
    for (const [width, height] of [[120, 300], [1, 1], [512, 450]]) {
      const path = createSpeechBalloonPath(width, height)
      const geometry = getBalloonGeometry('speech', width, height)
      expect(path).not.toMatch(/NaN|Infinity/)
      expect(geometry.text.right).toBeGreaterThan(geometry.text.left)
      expect(geometry.text.bottom).toBeGreaterThan(geometry.text.top)
    }
  })

  it('desenha pensamento com um contorno oval e trilha de três bolinhas voltada ao personagem', () => {
    const geometry = getBalloonGeometry('thought', 512, 450, 0, -1)
    const outline = createThoughtBalloonPath(512, 450, 0, -1)

    expect(geometry.side).toBe('top')
    expect(geometry.thoughtDots).toHaveLength(3)
    expect(geometry.thoughtDots[0]!.radius).toBeGreaterThan(geometry.thoughtDots[1]!.radius)
    expect(geometry.thoughtDots[1]!.radius).toBeGreaterThan(geometry.thoughtDots[2]!.radius)
    expect(outline).toContain(' A ')
    expect(outline.endsWith('Z')).toBe(true)
    expect(outline).not.toMatch(/NaN|Infinity/)
  })

  it('compacta a cauda e o padding sem reduzir a área útil do texto', () => {
    const standard = getBalloonGeometry('speech', 512, 240, 0, 1)
    const compact = getBalloonGeometry('speech', 512, 240, 0, 1, true)

    expect(compact.body.bottom).toBeGreaterThan(standard.body.bottom)
    expect(compact.text.bottom - compact.text.top).toBeGreaterThan(standard.text.bottom - standard.text.top)
  })
})
