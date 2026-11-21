import type { EditorV6Document, EditorV6VideoLayout } from '../shared/editorV6'
import { editorV6TimelineMediaAudio, planEditorV6Audio } from '../shared/editorV6Export'
import { planEditorV6VideoOverlays } from '../shared/editorV6VideoComposition'
import { engineV6OutputFrameCount, engineV6OutputSampleAt, type EngineV6OutputRange } from './engineTimebase'

export type EngineV6MediaPlan = Readonly<{
  contractVersion: 1
  projectId: string
  sourceRange: EngineV6OutputRange
  outputFrames: number
  videoLayers: readonly Readonly<{
    blockId: string
    mediaId: string
    startFrame: number
    endFrame: number
    sourceInFrame: number
    layout: EditorV6VideoLayout
    startTime: Readonly<{ numerator: number; denominator: 30 }>
    endTime: Readonly<{ numerator: number; denominator: 30 }>
    sourceTime: Readonly<{ numerator: number; denominator: 30 }>
  }>[]
  audioClips: readonly Readonly<{
    clipId: string
    sourceId: string
    sourceInFrame: number
    durationFrames: number
    gain: number
    startTime: Readonly<{ numerator: number; denominator: 30 }>
    endTime: Readonly<{ numerator: number; denominator: 30 }>
    sourceTime: Readonly<{ numerator: number; denominator: 30 }>
  }>[]
}>

function assertRange(project: EditorV6Document, range: EngineV6OutputRange): void {
  if (!project?.id || !range || (range.fps !== 24 && range.fps !== 30)
    || !Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame)
    || range.startFrame < 0 || range.endFrame <= range.startFrame || range.endFrame > project.timeline.durationFrames) {
    throw Error('Intervalo de mídia inválido para a Engine V6.')
  }
}

/** Prepare ID-linked media intervals once; no paths, decoders, DOM or IPC enter this plan. */
export function prepareEngineV6MediaPlan(project: EditorV6Document, range: EngineV6OutputRange): EngineV6MediaPlan {
  assertRange(project, range)
  const mediaById = new Map((project.media ?? []).map(media => [media.id, media]))
  const blocksById = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  for (const track of project.timeline.tracks) {
    if (track.hidden || track.muted || (track.kind !== 'video' && track.kind !== 'audio')) continue
    for (const block of track.blocks) {
      if (!block.mediaId || block.startFrame >= range.endFrame
        || block.startFrame + block.durationFrames <= range.startFrame
        || track.kind === 'audio' && block.audioEnabled === false) continue
      const source = mediaById.get(block.mediaId)
      const expectedKind = track.kind === 'video' ? 'video' : 'audio'
      if (!source || source.kind !== expectedKind || expectedKind === 'audio' && !source.hasAudio) {
        throw Error(`Fonte de ${expectedKind === 'video' ? 'vídeo' : 'áudio'} ausente ou incompatível no bloco ${block.id}.`)
      }
    }
  }
  const mediaIdByAudioBlockId = new Map(project.timeline.tracks.flatMap(track => track.blocks
    .filter(block => block.mediaId && (track.kind === 'audio' || track.kind === 'video'))
    .map(block => [block.id, block.mediaId!] as const)))
  const videoLayers = planEditorV6VideoOverlays(project, range.startFrame, range.endFrame).map(overlay => {
    const block = blocksById.get(overlay.blockId)
    const media = block?.mediaId ? mediaById.get(block.mediaId) : undefined
    if (!block || !media || media.kind !== 'video') throw Error(`Referência de vídeo inválida na Engine V6: ${overlay.blockId}.`)
    const startFrame = overlay.startFrame, endFrame = overlay.endFrame
    return {
      blockId: overlay.blockId, mediaId: media.id, startFrame, endFrame,
      sourceInFrame: overlay.mediaInFrame, layout: { ...overlay.layout },
      startTime: { numerator: startFrame - range.startFrame, denominator: 30 as const },
      endTime: { numerator: endFrame - range.startFrame, denominator: 30 as const },
      sourceTime: { numerator: overlay.mediaInFrame, denominator: 30 as const }
    }
  })
  const audioClips = planEditorV6Audio([
    ...(project.exportAudio ?? []), ...editorV6TimelineMediaAudio(project)
  ], range.startFrame, range.endFrame).map(({ clip, sourceInFrame, durationFrames, delayFrames }) => ({
    clipId: clip.id,
    sourceId: mediaIdByAudioBlockId.get(clip.id) ?? clip.libraryAudioId ?? clip.libraryVideoId ?? clip.id,
    sourceInFrame, durationFrames, gain: clip.gain,
    startTime: { numerator: delayFrames, denominator: 30 as const },
    endTime: { numerator: delayFrames + durationFrames, denominator: 30 as const },
    sourceTime: { numerator: sourceInFrame, denominator: 30 as const }
  }))
  return { contractVersion: 1, projectId: project.id, sourceRange: { ...range },
    outputFrames: engineV6OutputFrameCount(range), videoLayers, audioClips }
}

/** Seek a video layer at an absolute output frame, independent of previous samples. */
export function engineV6MediaSampleAt(plan: EngineV6MediaPlan, outputFrame: number) {
  const sample = engineV6OutputSampleAt(plan.sourceRange, outputFrame)
  const activeVideo = plan.videoLayers.flatMap(layer => {
    if (sample.timelineFrame < layer.startFrame || sample.timelineFrame >= layer.endFrame) return []
    return [{ blockId: layer.blockId, mediaId: layer.mediaId,
      sourceFrame: layer.sourceInFrame + sample.timelineFrame - layer.startFrame,
      layout: layer.layout }]
  })
  return { ...sample, activeVideo }
}
