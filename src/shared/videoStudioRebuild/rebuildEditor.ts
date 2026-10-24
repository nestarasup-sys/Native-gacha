import type { StudioDocument, StudioElement, VideoCharacterState } from '../studio'
import { videoCharacterStateAt } from '../videoCharacterTimeline'

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


/** Delete exactly one authored key. The base state and neighbouring segments
 * remain untouched so undo/redo and PT facial presets remain lossless. */
export function deleteCharacterKey(
  studio: StudioDocument, actorId: string, keyId: string, at: string
): StudioDocument {
  const timeline=studio.videoTimeline
  if(!timeline||!studio.elements.some(e=>e.id===actorId&&e.kind==='character')
    ||timeline.trackSettings?.[actorId]?.locked)return studio
  const key=timeline.characterKeys.find(k=>k.id===keyId&&k.elementId===actorId)
  if(!key)return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,
    characterKeys:timeline.characterKeys.filter(k=>k!==key)}}
}

/** Move a keyframe without rerendering its pose/wardrobe/face or altering PTS.
 * Duplicate boundaries and out-of-range targets are hard rejections. */
export function moveCharacterKey(
  studio: StudioDocument, actorId: string, keyId: string, frame: number, at: string
): StudioDocument {
  const timeline=studio.videoTimeline
  if(!timeline||timeline.trackSettings?.[actorId]?.locked||!Number.isSafeInteger(frame)
    ||frame<1||frame>=timeline.durationFrames)return studio
  const key=timeline.characterKeys.find(k=>k.id===keyId&&k.elementId===actorId)
  if(!key||key.frame===frame||timeline.characterKeys.some(k=>k.elementId===actorId&&k.frame===frame))return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,
    characterKeys:timeline.characterKeys.map(k=>k===key?{...k,frame}:k)
      .sort((a,b)=>a.frame-b.frame||a.elementId.localeCompare(b.elementId))}}
}
