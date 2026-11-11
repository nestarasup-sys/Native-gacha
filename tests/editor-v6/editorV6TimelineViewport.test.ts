import { describe, expect, it } from 'vitest'
import {
  clampEditorV6TimelineZoom,
  getEditorV6TimelineCenterSeconds,
  getEditorV6TimelineFitZoom,
  getEditorV6TimelineFollowScroll,
  getEditorV6TimelineScrollForZoom
} from '../../src/renderer/src/features/editorV6/editorV6TimelineViewport'

describe('cálculos de viewport da timeline do Editor V6', () => {
  it('limita o zoom e preserva o ponto central ao mudar a escala', () => {
    const viewport = { scrollLeft: 300, clientWidth: 1000, heading: 200 }
    const center = getEditorV6TimelineCenterSeconds(viewport, 80)

    expect(center).toBe(8.75)
    expect(getEditorV6TimelineScrollForZoom(viewport, center, 120)).toBe(650)
    expect(clampEditorV6TimelineZoom(0)).toBe(0.25)
    expect(clampEditorV6TimelineZoom(1200)).toBe(960)
  })

  it('calcula zoom para encaixar toda a duração na área visível', () => {
    expect(getEditorV6TimelineFitZoom(1000, 200, 300)).toBe(78.8)
    expect(getEditorV6TimelineFitZoom(100, 200, 300)).toBe(0.1)
  })

  it('acompanha o playhead apenas quando ele cruza os limites da viewport', () => {
    const viewport = { scrollLeft: 0, clientWidth: 1000, heading: 200 }

    expect(getEditorV6TimelineFollowScroll(viewport, 30, 30)).toBeNull()
    expect(getEditorV6TimelineFollowScroll(viewport, 30, 630)).toBe(330)
    expect(getEditorV6TimelineFollowScroll({ ...viewport, scrollLeft: 500 }, 30, 0)).toBe(0)
  })
})
