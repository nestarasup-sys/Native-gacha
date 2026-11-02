import { describe, expect, it } from 'vitest'
import { chooseMotionAtlasLayout } from '../../src/renderer/src/features/editorV6/motion/motionAtlasLayout'

describe('layout do atlas de movimento', () => {
  it('evita a grade 3x3 que desperdiça duas células nas sete amostras', () => {
    const layout = chooseMotionAtlasLayout(7, 744, 1217, 4096, 8_000_000)

    expect(layout).toMatchObject({ columns: 4, rows: 2, width: 2976, height: 2434, pixels: 7_243_584, ratio: 1 })
    expect(3 * 744 * 3 * 1217).toBeGreaterThan(8_000_000)
  })

  it('orienta a grade conforme o formato da imagem', () => {
    expect(chooseMotionAtlasLayout(7, 1217, 744, 4096, 8_000_000))
      .toMatchObject({ columns: 2, rows: 4, width: 2434, height: 2976, ratio: 1 })
  })

  it('sinaliza quando a resolução nativa excede o orçamento sem aprovar um atlas acima dos limites', () => {
    const layout = chooseMotionAtlasLayout(7, 1600, 1600, 4096, 8_000_000)

    expect(layout.ratio).toBeLessThan(1)
    expect(layout.width * layout.height).toBeGreaterThan(8_000_000)
    expect(layout.width * layout.ratio).toBeLessThanOrEqual(4096)
    expect(layout.height * layout.ratio).toBeLessThanOrEqual(4096)
    expect(layout.pixels * layout.ratio ** 2).toBeLessThanOrEqual(8_000_000)
  })

  it('rejeita dimensões inválidas antes de procurar uma grade', () => {
    expect(() => chooseMotionAtlasLayout(0, 100, 100, 4096, 8_000_000)).toThrow(RangeError)
    expect(() => chooseMotionAtlasLayout(1, 0, 100, 4096, 8_000_000)).toThrow(RangeError)
    expect(() => chooseMotionAtlasLayout(1, 100, 100, Number.NaN, 8_000_000)).toThrow(RangeError)
  })
})
