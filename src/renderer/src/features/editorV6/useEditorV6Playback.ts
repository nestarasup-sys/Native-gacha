import { useCallback, useEffect, useState } from 'react'
import { getEditorV6PlaybackFrame, setEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { editorV6PlaybackFrameAtTime } from './editorV6PlaybackModel'
import { recordEditorV6PlaybackFrame } from '../../ui/performanceDiagnostics'

/** Owns playhead synchronization and the animation-frame loop for one active project. */
export function useEditorV6Playback(activeProjectId: string | null, durationFrames: number) {
  const [playheadFrame, setPlayheadFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const publishPlayheadFrame = useCallback((frame: number, syncEditor = true) => {
    const nextFrame = Math.max(0, Math.floor(frame))
    setEditorV6PlaybackFrame(nextFrame)
    if (syncEditor) setPlayheadFrame((current) => current === nextFrame ? current : nextFrame)
  }, [])

  const pausePlayback = useCallback(() => {
    publishPlayheadFrame(getEditorV6PlaybackFrame())
    setIsPlaying(false)
  }, [publishPlayheadFrame])

  const resetPlayback = useCallback(() => {
    publishPlayheadFrame(0)
    setIsPlaying(false)
  }, [publishPlayheadFrame])

  const startPlayback = useCallback(() => {
    if (getEditorV6PlaybackFrame() >= durationFrames) publishPlayheadFrame(0)
    setIsPlaying(true)
  }, [durationFrames, publishPlayheadFrame])

  useEffect(() => {
    if (!isPlaying) return
    const initialFrame = getEditorV6PlaybackFrame()
    const started = performance.now()
    let animation = 0
    const tick = (now: number) => {
      const frame = editorV6PlaybackFrameAtTime(initialFrame, started, now, durationFrames)
      const publishStarted = performance.now()
      publishPlayheadFrame(frame, frame >= durationFrames)
      recordEditorV6PlaybackFrame(frame, now, performance.now() - publishStarted)
      if (frame >= durationFrames) setIsPlaying(false)
      else animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [isPlaying, durationFrames, activeProjectId, publishPlayheadFrame])

  return { playheadFrame, isPlaying, publishPlayheadFrame, pausePlayback, resetPlayback, startPlayback }
}
