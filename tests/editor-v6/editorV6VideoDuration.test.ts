import { describe, expect, it, vi } from 'vitest'
import type { VideoLibraryItem } from '../../src/shared/mediaLibrary'
import { recognizeEditorV6VideoDuration, type EditorV6VideoDurationDependencies } from '../../src/renderer/src/features/editorV6/editorV6VideoDuration'

function videoItem(overrides: Partial<VideoLibraryItem> = {}): VideoLibraryItem {
  return { id: 'video-1', name: 'Lua', available: true, durationFrames: null, createdAt: '', size: 1024, ...overrides } as VideoLibraryItem
}

function fakeVideo(duration: number, behavior: 'metadata' | 'error' | 'none' = 'metadata') {
  const element: any = {
    duration, preload: '', muted: false, src: '', onloadedmetadata: null, onerror: null,
    pause: vi.fn(), removeAttribute: vi.fn((name: string) => { if (name === 'src') element.src = '' }),
    load: vi.fn(() => {
      if (element.src && behavior === 'metadata') element.onloadedmetadata?.(new Event('loadedmetadata'))
      if (element.src && behavior === 'error') element.onerror?.(new Event('error'))
    })
  }
  return element as HTMLVideoElement
}

function dependencies(element: HTMLVideoElement, setTimeout = vi.fn((_callback: () => void, _milliseconds: number) => 7)) {
  const createVideo = vi.fn(() => element)
  const finishImport = vi.fn(async (id: string, frames: number) => videoItem({ id, durationFrames: frames }))
  const clearTimeout = vi.fn()
  const adapters: EditorV6VideoDurationDependencies = { createVideo, finishImport, setTimeout, clearTimeout }
  return { adapters, createVideo, finishImport, setTimeout, clearTimeout }
}

describe('reconhecimento da duração de vídeo no Editor V6', () => {
  it('returns an already measured item without creating a video or calling IPC', async () => {
    const { adapters, createVideo, finishImport } = dependencies(fakeVideo(2))
    const ready = videoItem({ durationFrames: 90 })
    await expect(recognizeEditorV6VideoDuration(ready, adapters)).resolves.toBe(ready)
    expect(createVideo).not.toHaveBeenCalled()
    expect(finishImport).not.toHaveBeenCalled()
  })

  it('reads metadata, rounds up to 30 fps and always releases the video resource', async () => {
    const element = fakeVideo(1.01)
    const { adapters, finishImport, clearTimeout } = dependencies(element)
    await expect(recognizeEditorV6VideoDuration(videoItem(), adapters)).resolves.toMatchObject({ id: 'video-1', durationFrames: 31 })
    expect(element.preload).toBe('metadata')
    expect(element.muted).toBe(true)
    expect(element.src).toBe('')
    expect(element.pause).toHaveBeenCalledOnce()
    expect(element.removeAttribute).toHaveBeenCalledWith('src')
    expect(element.load).toHaveBeenCalledTimes(2)
    expect(element.onloadedmetadata).toBeNull()
    expect(element.onerror).toBeNull()
    expect(clearTimeout).toHaveBeenCalledWith(7)
    expect(finishImport).toHaveBeenCalledWith('video-1', 31)
  })

  it('preserves media error text, cleans handlers and rejects invalid durations', async () => {
    const failed = fakeVideo(0, 'error')
    const failureDeps = dependencies(failed)
    await expect(recognizeEditorV6VideoDuration(videoItem(), failureDeps.adapters)).rejects.toThrow('Não foi possível ler “Lua”.')
    expect(failed.pause).toHaveBeenCalledOnce()
    expect(failed.onerror).toBeNull()

    for (const duration of [0, Number.NaN, 60 * 60 * 24 + 1]) {
      const invalid = fakeVideo(duration)
      const invalidDeps = dependencies(invalid)
      await expect(recognizeEditorV6VideoDuration(videoItem(), invalidDeps.adapters)).rejects.toThrow('A duração de “Lua” não é válida.')
      expect(invalid.pause).toHaveBeenCalledOnce()
      expect(invalidDeps.finishImport).not.toHaveBeenCalled()
    }
  })

  it('rejects metadata timeout with the existing error and clears the timer on completion', async () => {
    let onTimeout: (() => void) | undefined
    const timer = vi.fn((callback: () => void) => { onTimeout = callback; return 9 })
    const element = fakeVideo(0, 'none')
    const { adapters, finishImport, clearTimeout } = dependencies(element, timer)
    const pending = recognizeEditorV6VideoDuration(videoItem(), adapters)
    onTimeout!()
    await expect(pending).rejects.toThrow('Não foi possível reconhecer a duração de “Lua”.')
    expect(clearTimeout).toHaveBeenCalledWith(9)
    expect(element.pause).toHaveBeenCalledOnce()
    expect(finishImport).not.toHaveBeenCalled()
  })
})
