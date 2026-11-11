import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'

export type ScenePointerEvent = ReactPointerEvent<SVGElement>
export type SceneSurfaceInteraction = {
  start: (event: ScenePointerEvent, id: string) => void
  move: (event: ScenePointerEvent) => void
  end: (event: ScenePointerEvent) => void
}

type ResolvedVideo = NonNullable<EditorV6ResolvedScene['mediaVideo']>
type VideoPlaybackPort = Pick<HTMLVideoElement, 'volume' | 'pause' | 'currentTime' | 'paused' | 'play'>

export function editorV6VideoTargetSeconds(media: ResolvedVideo, frame: number): number {
  return (media.sourceInFrame + frame - media.startFrame) / 30
}

/** Applies the Editor V6 preview's drift thresholds to a video element. */
export function syncEditorV6VideoPlayback(video: VideoPlaybackPort, target: number, playing: boolean): void {
  video.volume = 1
  if (!playing) {
    video.pause()
    if (Math.abs(video.currentTime - target) > .015) {
      try { video.currentTime = target } catch { /* loadedmetadata will retry the paused seek */ }
    }
    return
  }
  if (video.paused) {
    if (Math.abs(video.currentTime - target) > .25) {
      try { video.currentTime = target } catch { /* loadedmetadata will retry the playback seek */ }
    }
    void video.play().catch(() => {})
  } else if (Math.abs(video.currentTime - target) > .18) {
    try { video.currentTime = target } catch { /* The browser will recover at the next timeline update. */ }
  }
}

export const SceneVideoLayer = memo(function SceneVideoLayer({ scene, playing, selectedId, interaction }: {
  scene: EditorV6ResolvedScene
  playing: boolean
  selectedId: string | null
  interaction?: SceneSurfaceInteraction
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const media = scene.mediaVideo
  useEffect(() => {
    const video = ref.current
    if (!video || !media) return
    syncEditorV6VideoPlayback(video, editorV6VideoTargetSeconds(media, scene.frame), playing)
  }, [media?.mediaId, media?.startFrame, media?.sourceInFrame, media?.gain, scene.frame, playing])
  if (!media) return null
  const width = media.layout.width * 19.2, height = media.layout.height * 10.8
  const x = (50 + media.layout.x) * 19.2, y = (50 + media.layout.y) * 10.8
  const target = editorV6VideoTargetSeconds(media, scene.frame)
  return <>
    <foreignObject x={x - width / 2} y={y - height / 2} width={width} height={height} transform={`rotate(${media.layout.rotation} ${x} ${y})`} data-editor-v6-video={media.mediaId}
      style={{ cursor: interaction ? 'move' : undefined, touchAction: 'none' }}
      onPointerDown={interaction ? (event) => interaction.start(event, `media-video:${media.blockId}`) : undefined} onPointerMove={interaction?.move} onPointerUp={interaction?.end} onPointerCancel={interaction?.end}>
      <video ref={ref} src={media.url} muted playsInline preload="auto" data-media-id={media.mediaId} data-target-time={target} onLoadedMetadata={(event) => {
        const video = event.currentTarget, loadedTarget = Number(video.dataset.targetTime)
        try { video.currentTime = loadedTarget } catch { /* The browser will seek when it is ready. */ }
        if (playing) void video.play().catch(() => {})
      }} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
    </foreignObject>
    {selectedId === media.blockId && <rect x={x - width / 2} y={y - height / 2} width={width} height={height} transform={`rotate(${media.layout.rotation} ${x} ${y})`} fill="none" stroke="#e84f88" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
  </>
})
