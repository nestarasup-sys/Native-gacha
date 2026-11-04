import { describe, expect, it } from 'vitest'
import { resolvedHairBakeEndpointDimensions } from '../../src/renderer/src/features/editorV6/motion/hairBakeEndpointGeometry'

const crop = { left: 15, top: 20, width: 120, height: 170, outputWidth: 320, outputHeight: 400 }
describe('Editor V6 first-export hair bake endpoints', () => {
  it('reuses exact pre-rendered endpoint dimensions without changing source crop or rounding', () => {
    const from = { ...crop, outputWidth: 400 }
    const to = { ...crop, outputWidth: 480, outputHeight: 600 }
    const beforeFrom = JSON.stringify(from), beforeTo = JSON.stringify(to)
    expect(resolvedHairBakeEndpointDimensions({ from, to })).toEqual({
      firstWidth: 400, firstHeight: 400, lastWidth: 480, lastHeight: 600
    })
    expect(JSON.stringify(from)).toBe(beforeFrom)
    expect(JSON.stringify(to)).toBe(beforeTo)
  })
  it('retains the full-render fallback for normal/legacy transition requests', () => {
    expect(resolvedHairBakeEndpointDimensions()).toBeNull()
    expect(resolvedHairBakeEndpointDimensions({ from: crop, to: { left: 0, top: 0, width: 300, height: 400 } })).toBeNull()
    expect(resolvedHairBakeEndpointDimensions({ from: crop, to: { ...crop, outputWidth: 0 } })).toBeNull()
    expect(resolvedHairBakeEndpointDimensions({ from: crop, to: { ...crop, outputHeight: Number.NaN } })).toBeNull()
    expect(resolvedHairBakeEndpointDimensions({ from: crop, to: { ...crop, outputWidth: 16_385 } })).toBeNull()
    expect(resolvedHairBakeEndpointDimensions({ from: crop, to: { ...crop, outputWidth: 300.5 } })).toBeNull()
  })
})
