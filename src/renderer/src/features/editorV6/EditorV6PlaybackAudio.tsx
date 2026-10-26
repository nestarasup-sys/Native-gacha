import { useEffect, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6MediaUrl } from '../../../../shared/editorV6'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'

type AudioClip = {
  id: string
  startFrame: number
  durationFrames: number
  mediaInFrame: number
  gain: number
  muted: boolean
  trackMuted: boolean
  audio: HTMLAudioElement
}

export function EditorV6PlaybackAudio({ project, playing }: { project: EditorV6Document | null; playing: boolean }) {
  const frame = useEditorV6PlaybackFrame()
  const audioNodes = useRef<Map<string, HTMLAudioElement>>(new Map())
  const clips = useRef<AudioClip[]>([])

  useEffect(() => {
    const previous = audioNodes.current
    const next = new Map<string, HTMLAudioElement>()
    const nextClips: AudioClip[] = []
    if (project) {
      const mediaById = new Map((project.media ?? []).map((media) => [media.id, media]))
      for (const track of project.timeline.tracks) {
        if (track.kind !== 'audio' && track.kind !== 'video') continue
        for (const block of track.blocks) {
          const media = block.mediaId ? mediaById.get(block.mediaId) : undefined
          if (!media || (track.kind === 'video' && (media.kind !== 'video' || !media.hasAudio))) continue
          const audio = previous.get(block.id) ?? new Audio(editorV6MediaUrl(project.id, media.fileName, media.kind === 'video' ? media.libraryVideoId : undefined))
          audio.preload = 'auto'
          audio.volume = Math.max(0, Math.min(1, block.gain ?? 1))
          next.set(block.id, audio)
          nextClips.push({
            id: block.id,
            startFrame: block.startFrame,
            durationFrames: block.durationFrames,
            mediaInFrame: block.mediaInFrame ?? 0,
            gain: block.gain ?? 1,
            muted: block.audioEnabled === false || (block.gain ?? 1) === 0,
            trackMuted: track.muted || Boolean(track.hidden),
            audio
          })
        }
      }
    }
    for (const [id, audio] of previous) {
      if (next.has(id)) continue
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioNodes.current = next
    clips.current = nextClips
  }, [project?.id, project?.media, project?.timeline])

  useEffect(() => {
    for (const clip of clips.current) {
      const active = frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames
      const shouldPlay = playing && active && !clip.muted && !clip.trackMuted
      const target = (clip.mediaInFrame + frame - clip.startFrame) / 30
      clip.audio.volume = Math.max(0, Math.min(1, clip.gain))
      if (shouldPlay) {
        if (clip.audio.paused || Math.abs(clip.audio.currentTime - target) > .18) {
          if (Math.abs(clip.audio.currentTime - target) > .18) {
            try { clip.audio.currentTime = target } catch { /* metadata is still loading */ }
          }
          if (clip.audio.paused) void clip.audio.play().catch(() => {})
        }
      } else {
        clip.audio.pause()
        if (!playing && active && Math.abs(clip.audio.currentTime - target) > .03) {
          try { clip.audio.currentTime = target } catch { /* metadata is still loading */ }
        }
      }
    }
  }, [playing, frame, project?.id])

  useEffect(() => () => {
    for (const audio of audioNodes.current.values()) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioNodes.current.clear()
    clips.current = []
  }, [])

  return null
}
