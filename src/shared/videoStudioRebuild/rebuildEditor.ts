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

