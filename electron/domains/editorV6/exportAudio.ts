import type { EditorV6Document } from '../../../src/shared/editorV6'
import { planEditorV6Audio, type EditorV6ExportAudio } from '../../../src/shared/editorV6Export'

type PlannedAudioClip = ReturnType<typeof planEditorV6Audio>[number]

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Resolves timeline audio blocks into export clips while honoring track and block visibility. */
export function editorV6TimelineMediaAudio(project: EditorV6Document): EditorV6ExportAudio[] {
  const media = new Map((project.media ?? []).filter((asset) => asset.hasAudio).map((asset) => [asset.id, asset]))
  return project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => {
    const asset = block.mediaId ? media.get(block.mediaId) : undefined
    if (!asset || (track.kind !== 'audio' && !(track.kind === 'video' && asset.kind === 'video')) || track.muted || track.hidden || block.audioEnabled === false) return []
    return [{ id: block.id, name: asset.name, fileName: asset.fileName, ...(asset.libraryVideoId ? { libraryVideoId: asset.libraryVideoId } : {}), ...(asset.libraryAudioId ? { libraryAudioId: asset.libraryAudioId } : {}), sourceFrames: asset.sourceFrames, startFrame: block.startFrame, sourceInFrame: block.mediaInFrame ?? 0, durationFrames: block.durationFrames, gain: block.gain ?? 1, muted: false }]
  }))
}

/** Combines project-level audio with visible audio-enabled timeline media in the same order as export. */
export function planEditorV6ProjectAudio(project: EditorV6Document, startFrame: number, endFrame: number): PlannedAudioClip[] {
  return planEditorV6Audio([...(project.exportAudio ?? []), ...editorV6TimelineMediaAudio(project)], startFrame, endFrame)
}

/** Builds strict and damaged-source recovery filter graphs for audio mixed onto the final video. */
export function editorV6AudioFilterGraphs(audio: readonly PlannedAudioClip[], totalFrames: number) {
  const strict = audio.map((item, index) => `[${index + 1}:a:0]atrim=start=${item.sourceInFrame / 30}:duration=${item.durationFrames / 30},asetpts=N/SR/TB,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${item.clip.gain},adelay=${item.delayFrames * 1600}S:all=1[a${index}]`)
  const recoverable = audio.map((item, index) => `[${index + 1}:a:0]atrim=start=${item.sourceInFrame / 30}:duration=${item.durationFrames / 30},asetpts=PTS-STARTPTS,aresample=48000:async=48000:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${item.clip.gain},adelay=${item.delayFrames * 1600}S:all=1[a${index}]`)
  if (audio.length) {
    const inputs = audio.map((_item, index) => `[a${index}]`).join('')
    const mix = `${inputs}amix=inputs=${audio.length}:normalize=0:duration=longest:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=${totalFrames / 30},atrim=duration=${totalFrames / 30},asetpts=N/SR/TB[mix]`
    strict.push(mix)
    recoverable.push(mix)
  }
  return { strict, recoverable }
}

export function editorV6AudioDecodeFailureSource(error: unknown, audio: readonly PlannedAudioClip[]) {
  const stream = /aist#(\d+):\d+\/([a-z0-9_]+)/i.exec(errorMessage(error))
  const clip = stream ? audio[Number(stream[1]) - 1]?.clip : undefined
  return { clip, codec: stream?.[2]?.toUpperCase() }
}

export function isEditorV6AudioDecodeRateFailure(error: unknown) {
  const details = errorMessage(error)
  return /FFmpeg\/FFprobe terminou com c[oó]digo 69:/i.test(details) && /Decode error rate .* exceeds maximum/i.test(details)
}

export function isEditorV6AudioPacketDecodeFailure(error: unknown) {
  return /(?:Error submitting packet to decoder|Invalid data found when processing input|Input buffer exhausted before END element found|Decode error rate .* exceeds maximum)/i.test(errorMessage(error))
}
