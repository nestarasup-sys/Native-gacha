import { describe, expect, it } from 'vitest'
import { editorV6PlaybackFrameAtTime } from '../../src/renderer/src/features/editorV6/editorV6PlaybackModel'

describe('Editor V6 playback clock', () => {
  it('advances on 30 fps boundaries from the current playhead frame', () => {
    expect(editorV6PlaybackFrameAtTime(12, 100, 133, 300)).toBe(12)
    expect(editorV6PlaybackFrameAtTime(12, 100, 134, 300)).toBe(13)
    expect(editorV6PlaybackFrameAtTime(12, 100, 200, 300)).toBe(15)
  })

  it('clamps playback at the timeline duration', () => {
    expect(editorV6PlaybackFrameAtTime(299, 100, 500, 300)).toBe(300)
    expect(editorV6PlaybackFrameAtTime(0, 100, 11_000, 300)).toBe(300)
  })
})
