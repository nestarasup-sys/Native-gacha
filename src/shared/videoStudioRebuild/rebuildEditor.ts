import type { StudioDocument, StudioElement, VideoCharacterState } from '../studio'
import { videoCharacterStateAt } from '../videoCharacterTimeline'
import { isValidVideoMediaClip, splitVideoMediaClip } from '../videoMedia'

/** New UI edit command, kept separate from the 2,500-line legacy editor. */
export function splitCharacterAt(studio: StudioDocument, actorId: string, frame: number, keyId: string, updatedAt: string): StudioDocument {
  const timeline=studio.videoTimeline
  const actor=studio.elements.find(e=>e.id===actorId&&e.kind==='character')
  if(!timeline||!actor||!Number.isSafeInteger(frame)||frame<1||frame>=timeline.durationFrames
    ||!keyId.trim()||timeline.trackSettings?.[actorId]?.locked)return studio
  if(timeline.characterKeys.some(k=>k.elementId===actorId&&k.frame===frame))return studio
  const state: VideoCharacterState|undefined=videoCharacterStateAt(timeline,actorId,frame)
  if(!state)return studio
  const element:StudioElement=state.element
  const key={
    id:keyId,elementId:actorId,frame,
    poseSlot:element.poseSlot??null,
    expressionCollectionId:element.activeExpressionCollectionId??null,
    expressionPresetId:element.activeExpressionPresetId??null,
    faceMode:element.activeFaceMode??'idle' as const,
    state,
  }
  return {
    ...studio,
    updatedAt,
    videoTimeline:{...timeline,characterKeys:[...timeline.characterKeys,key].sort((a,b)=>a.frame-b.frame||a.elementId.localeCompare(b.elementId))}
  }
}


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
