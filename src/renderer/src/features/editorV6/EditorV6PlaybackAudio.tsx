import { useEffect, useMemo, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6MediaUrl } from '../../../../shared/editorV6'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'

type AudioClip = {
  id: string
  startFrame: number
  endFrame: number
  mediaInFrame: number
  volume: number
  url: string
}

type AudioNode = { url: string; audio: HTMLAudioElement }
const AUDIO_PRELOAD_FRAMES = 12

function releaseAudio(audio: HTMLAudioElement) {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

function indexAudioClips(projectId: string, media: EditorV6Document['media'], timeline: EditorV6Document['timeline']) {
  const mediaById = new Map((media ?? []).map((item) => [item.id, item]))
  const clips: AudioClip[] = []
  for (const track of timeline.tracks) {
    if (track.hidden || track.muted || (track.kind !== 'audio' && track.kind !== 'video')) continue
    for (const block of track.blocks) {
      const volume = Math.max(0, Math.min(1, block.gain ?? 1))
      if (block.audioEnabled === false || volume === 0) continue
      const source = block.mediaId ? mediaById.get(block.mediaId) : undefined
      if (!source || (track.kind === 'video' && (source.kind !== 'video' || !source.hasAudio))) continue
      const url = source.libraryVideoId
        ? `gacha-video://library/${source.libraryVideoId}`
        : editorV6MediaUrl(projectId, source.fileName, undefined, source.libraryAudioId)
      clips.push({
        id: block.id, startFrame: block.startFrame, endFrame: block.startFrame + block.durationFrames,
        mediaInFrame: block.mediaInFrame ?? 0, volume, url
      })
    }
  }
  clips.sort((left, right) => left.startFrame - right.startFrame)
  let lastEnd = 0
  const maximumEnds = clips.map(({ endFrame }) => (lastEnd = Math.max(lastEnd, endFrame)))
  return { clips, maximumEnds }
}

export function EditorV6PlaybackAudio({ project, playing }: { project: EditorV6Document | null; playing: boolean }) {
  const frame = useEditorV6PlaybackFrame()
  const audioNodes = useRef(new Map<string, AudioNode>())
  const projectId = project?.id
  const media = project?.media
  const timeline = project?.timeline
  const index = useMemo(() => projectId && timeline ? indexAudioClips(projectId, media, timeline) : null, [projectId, media, timeline])

  useEffect(() => () => {
    const nodes = audioNodes.current
    for (const { audio } of nodes.values()) releaseAudio(audio)
    nodes.clear()
  }, [projectId])

  useEffect(() => {
    const nodes = audioNodes.current
    const active = new Set<string>()
    if (index) {
      const preloadThrough = playing ? frame + AUDIO_PRELOAD_FRAMES : frame
      const { clips, maximumEnds } = index
      let left = 0, right = clips.length
      while (left < right) {
        const middle = (left + right) >>> 1
        if (clips[middle].startFrame <= preloadThrough) left = middle + 1
        else right = middle
      }
      for (let position = left - 1; position >= 0 && maximumEnds[position] > frame; position--) {
        const clip = clips[position]
        if (clip.endFrame <= frame) continue
        let node = nodes.get(clip.id)
        if (node && node.url !== clip.url) {
          releaseAudio(node.audio)
          nodes.delete(clip.id)
          node = undefined
        }
        if (!node) {
          if (!playing) continue
          node = { url: clip.url, audio: new Audio(clip.url) }
          nodes.set(clip.id, node)
        }
        active.add(clip.id)
        const { audio } = node
        if (audio.volume !== clip.volume) audio.volume = clip.volume
        const inClip = frame >= clip.startFrame
        const target = (clip.mediaInFrame + Math.max(0, frame - clip.startFrame)) / 30
        if (Math.abs(audio.currentTime - target) > (playing ? .18 : .03)) {
          try { audio.currentTime = target } catch { /* The next playback update retries after metadata. */ }
        }
        if (playing && inClip && audio.paused) void audio.play().catch(() => {})
        else if ((!playing || !inClip) && !audio.paused) audio.pause()
      }
    }
    for (const [id, node] of nodes) {
      if (active.has(id)) continue
      releaseAudio(node.audio)
      nodes.delete(id)
    }
  }, [playing, frame, index])

  return null
}
