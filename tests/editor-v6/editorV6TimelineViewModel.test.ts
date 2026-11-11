import { describe, expect, it } from 'vitest'
import {
  getEditorV6TimelineContentWidth,
  getEditorV6TimelineRulerTicks,
  getEditorV6TimelineTickSeconds,
  getEditorV6TimelineVisibleFrameRange
} from '../../src/renderer/src/features/editorV6/editorV6TimelineViewModel'

describe('modelo de apresentação da timeline do Editor V6', () => {
  it('calcula largura e faixa visível com a margem de renderização', () => {
    const input = { scrollLeft: 500, viewportWidth: 800, heading: 200, pixelsPerSecond: 100, durationFrames: 3000 }

    expect(getEditorV6TimelineContentWidth(input)).toBe(10000)
    expect(getEditorV6TimelineContentWidth({ ...input, durationFrames: 150 })).toBe(600)
    expect(getEditorV6TimelineVisibleFrameRange(input)).toEqual([42, 438])
  })

  it('seleciona intervalos de régua de acordo com a escala', () => {
    expect(getEditorV6TimelineTickSeconds(120)).toBe(0.5)
    expect(getEditorV6TimelineTickSeconds(119)).toBe(1)
    expect(getEditorV6TimelineTickSeconds(34)).toBe(5)
    expect(getEditorV6TimelineTickSeconds(7.9)).toBe(30)
    expect(getEditorV6TimelineTickSeconds(1)).toBe(120)
  })

  it('alinha marcas à escala, limita à duração e retorna lista vazia fora da timeline', () => {
    expect(getEditorV6TimelineRulerTicks([30, 70], 60, 1)).toEqual([1, 2])
    expect(getEditorV6TimelineRulerTicks([70, 200], 90, 1)).toEqual([2, 3])
    expect(getEditorV6TimelineRulerTicks([200, 300], 90, 1)).toEqual([])
  })
})
