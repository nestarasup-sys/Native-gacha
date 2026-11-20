import { describe, expect, it } from 'vitest'
import { buildEditorV6VideoComposition } from '../../electron/domains/editorV6/exportVideoComposition'
import {
  EDITOR_V6_TIMELINE_FRAMES_PER_SECOND,
  editorV6VideoSecondsFromFrames,
  editorV6VideoSourceFrameAtTimelineFrame,
  type EditorV6VideoOverlay
} from '../../src/shared/editorV6VideoComposition'

describe('Editor V6 media timebase shared by preview and export', () => {
  it('maps a timeline frame into its original media frame without rounding', () => {
    expect(EDITOR_V6_TIMELINE_FRAMES_PER_SECOND).toBe(30)
    expect(editorV6VideoSourceFrameAtTimelineFrame(45, 60, 90)).toBe(75)
    expect(editorV6VideoSourceFrameAtTimelineFrame(45, 60, 60)).toBe(45)
    expect(editorV6VideoSecondsFromFrames(75)).toBe(2.5)
    expect(editorV6VideoSecondsFromFrames(1)).toBeCloseTo(1 / 30, 12)
  })

  it('uses that same timebase for FFmpeg seek, duration and overlay boundaries', () => {
    // A 60-frame export part begins before the clip; the source starts 47 frames in.
    const clip: EditorV6VideoOverlay = {
      blockId: 'clip-a',
      fileName: 'clip.mp4',
      mediaInFrame: 47,
      startFrame: 90,
      endFrame: 150,
      layout: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    }
    const result = buildEditorV6VideoComposition({
      clips: [clip], mediaPaths: ['clip.mp4'], partStartFrame: 60,
      width: 1920, height: 1080, layeredVideo: true
    })
    expect(result.videoInputs).toEqual(['-ss', String(47 / 30), '-t', '2', '-i', 'clip.mp4'])
    expect(result.filterArgs[1]).toContain('setpts=PTS-STARTPTS+1/TB')
    expect(result.filterArgs[1]).toContain("enable='gte(t,1)*lt(t,3)'")
    expect(result.rawHeight).toBe(2160)
  })
})
