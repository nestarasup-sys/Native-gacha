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
})
