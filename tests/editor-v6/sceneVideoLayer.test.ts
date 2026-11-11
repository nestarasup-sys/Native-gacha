import { describe, expect, it, vi } from 'vitest'
import { editorV6VideoTargetSeconds, syncEditorV6VideoPlayback } from '../../src/renderer/src/features/editorV6/SceneVideoLayer'

function video(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    volume: 0.3,
    currentTime: 1,
    paused: true,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as HTMLVideoElement
}

describe('camada de vídeo da cena do Editor V6', () => {
  it('converts the clip source offset and scene frame to seconds', () => {
    expect(editorV6VideoTargetSeconds({ sourceInFrame: 90, startFrame: 60 } as Parameters<typeof editorV6VideoTargetSeconds>[0], 120)).toBe(5)
  })

  it('pauses and seeks the preview when timeline playback is stopped', () => {
    const element = video({ currentTime: 1.5 })
    syncEditorV6VideoPlayback(element, 2, false)
    expect(element.volume).toBe(1)
    expect(element.pause).toHaveBeenCalledOnce()
    expect(element.currentTime).toBe(2)
    expect(element.play).not.toHaveBeenCalled()
  })

  it('seeks large drift before starting and ignores small start drift', () => {
    const distant = video({ currentTime: 1, paused: true })
    syncEditorV6VideoPlayback(distant, 2, true)
    expect(distant.currentTime).toBe(2)
    expect(distant.play).toHaveBeenCalledOnce()

    const close = video({ currentTime: 1.9, paused: true })
    syncEditorV6VideoPlayback(close, 2, true)
    expect(close.currentTime).toBe(1.9)
    expect(close.play).toHaveBeenCalledOnce()
  })

  it('only seeks an already playing video when drift exceeds the playback threshold', () => {
    const distant = video({ currentTime: 1, paused: false })
    syncEditorV6VideoPlayback(distant, 1.2, true)
    expect(distant.currentTime).toBe(1.2)
    expect(distant.play).not.toHaveBeenCalled()

    const close = video({ currentTime: 1.1, paused: false })
    syncEditorV6VideoPlayback(close, 1.2, true)
    expect(close.currentTime).toBe(1.1)
  })

  it('ignores playback promise rejection and unavailable seeks', () => {
    const rejected = video({ currentTime: 2, paused: true, play: vi.fn().mockRejectedValue(new Error('autoplay blocked')) })
    expect(() => syncEditorV6VideoPlayback(rejected, 2, true)).not.toThrow()
    const unavailable = video({ paused: false })
    Object.defineProperty(unavailable, 'currentTime', { get: () => 1, set: () => { throw new Error('not seekable') } })
    expect(() => syncEditorV6VideoPlayback(unavailable, 2, false)).not.toThrow()
  })
})
