import type { StudioDocument } from '../studio'
import { isValidVideoMediaClip, splitVideoMediaClip } from '../videoMedia'

function uniqueClipId(studio: StudioDocument, id: string): boolean {
  const timeline=studio.videoTimeline
  return Boolean(timeline&&id.trim()&&!timeline.textClips.some(clip=>clip.id===id)
    &&!(timeline.videoClips??[]).some(clip=>clip.id===id))
}

/** Split a speech/thought block without changing its author or v1 snapshot. */
export function splitTextClipAt(studio: StudioDocument, clipId: string, frame: number, rightId: string, updatedAt: string): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.textClips.find(item=>item.id===clipId)
  if(!timeline||!clip||!uniqueClipId(studio,rightId)||!Number.isSafeInteger(frame)
    ||frame<=clip.startFrame||frame>=clip.endFrame||timeline.trackSettings?.[clip.kind]?.locked)return studio
  const left={...clip,endFrame:frame}
  const right={...clip,id:rightId,startFrame:frame}
  return {...studio,updatedAt,videoTimeline:{...timeline,
    textClips:timeline.textClips.flatMap(item=>item.id===clipId?[left,right]:[item])}}
}

/** Preserve source PTS, trim boundaries, per-clip audio and transforms. */
export function splitVideoClipAt(studio: StudioDocument, clipId: string, frame: number, rightId: string, updatedAt: string): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.videoClips?.find(item=>item.id===clipId)
  const asset=timeline?.videoAssets?.find(item=>item.id===clip?.assetId)
  if(!timeline||!clip||!asset||!uniqueClipId(studio,rightId)||timeline.trackSettings?.video?.locked
    ||!isValidVideoMediaClip(clip,asset.durationFrames,timeline.durationFrames))return studio
  const halves=splitVideoMediaClip(clip,frame,rightId)
  if(!halves)return studio
  return {...studio,updatedAt,videoTimeline:{...timeline,
    videoClips:timeline.videoClips!.flatMap(item=>item.id===clipId?halves:[item])}}
}
