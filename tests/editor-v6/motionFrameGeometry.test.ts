import { describe, expect, it } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import { interpolateEditorV6MotionFrameGeometry, resolveEditorV6MotionElementScales } from '../../src/renderer/src/features/editorV6/motion/motionFrameGeometry'

function character(overrides: Record<string, unknown> = {}): EditorV6Element {
  return { kind: 'character', x: 0, y: 0, width: 100, height: 100, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, rotation: 0, flipX: false, ...overrides } as unknown as EditorV6Element
}

describe('Editor V6 motion frame geometry', () => {
  it('retains source endpoint scale for legacy characters whose saved rectangle is unchanged', () => {
    const from = character(), to = character()
    const scales = resolveEditorV6MotionElementScales(from, to, { left: 0, top: 0, width: 100, height: 100 }, { left: 20, top: 10, width: 200, height: 80 })

    expect(scales).toEqual({ from: { x: 19.2, y: 10.8 }, to: { x: 19.2, y: 10.8 } })
  })

  it('uses the target scale when the actor size changes or a source canvas width exists', () => {
    const from = character(), to = character({ characterWidthScale: 150 })
    const crops = [{ left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 200, height: 80 }]
    expect(resolveEditorV6MotionElementScales(from, to, ...crops).to).toEqual({ x: 14.4, y: 13.5 })
    expect(resolveEditorV6MotionElementScales(from, character({ characterCanvasWidth: 400 }), ...crops).to).toEqual({ x: 9.6, y: 13.5 })
  })

  it('interpolates rotated crop geometry and switches horizontal flip at the midpoint', () => {
    const from = character({ x: 0.2, y: 0.3, rotation: 350, flipX: false })
    const to = character({ x: 0.8, y: 0.9, rotation: 10, flipX: true })
    const fromCrop = { left: 10, top: 20, width: 40, height: 60 }
    const toCrop = { left: 30, top: 50, width: 80, height: 100 }
    const endpointScales = { from: { x: 2, y: 3 }, to: { x: 4, y: 5 } }
    const crop = { left: 15, top: 25, width: 20, height: 30 }

    const beforeMidpoint = interpolateEditorV6MotionFrameGeometry({ from, to, fromCrop, toCrop, endpointScales, crop, progress: 0.25 })
    const afterMidpoint = interpolateEditorV6MotionFrameGeometry({ from, to, fromCrop, toCrop, endpointScales, crop, progress: 0.75 })

    expect(beforeMidpoint.rotation).toBe(355)
    expect(beforeMidpoint.flipX).toBe(false)
    expect(beforeMidpoint.width).toBeCloseTo(20 * 2.5 / 19.2)
    expect(beforeMidpoint.height).toBeCloseTo(30 * 3.5 / 10.8)
    expect(beforeMidpoint.x).toBeCloseTo(0.35 + (-52.5 * Math.cos(355 * Math.PI / 180) + 97.5 * Math.sin(355 * Math.PI / 180)) / 19.2)
    expect(beforeMidpoint.y).toBeCloseTo(0.45 + (-52.5 * Math.sin(355 * Math.PI / 180) - 97.5 * Math.cos(355 * Math.PI / 180)) / 10.8)
    expect(afterMidpoint.rotation).toBe(365)
    expect(afterMidpoint.flipX).toBe(true)
  })
})
