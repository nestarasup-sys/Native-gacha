import { describe, expect, it } from 'vitest'
import { motionEndpointScale } from '../../src/renderer/src/features/editorV6/motion/motionEndpointScale'
import type { EditorV6Element } from '../../src/shared/editorV6'

describe('motion endpoint scale', () => {
  it('matches both dimensions of the saved rectangle even when the stage is not 16:9', () => {
    const element = { kind: 'character', width: 18, height: 82, characterCanvasWidth: 45, characterScale: 190, characterWidthScale: 100, characterHeightScale: 100 } as EditorV6Element
    const crop = { width: 160, height: 500 }
    const scale = motionEndpointScale(element, crop)
    expect(scale.x * crop.width).toBeCloseTo(18 * 1.9 * 19.2)
    expect(scale.y * crop.height).toBeCloseTo(82 * 1.9 * 10.8)
  })
})
