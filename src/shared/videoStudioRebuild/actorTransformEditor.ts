import type { StudioDocument, StudioElement } from '../studio'
import { videoCharacterStateAt } from '../videoCharacterTimeline'

export type ActorStagePatch = Partial<Pick<StudioElement, 'x'|'y'|'rotation'|'flipX'|'characterScale'>>

/**
 * Actor-wide stage adjustment for the rebuilt editor. Scene v1 keeps facial
 * appearance, independent PT pupils, wardrobe and all segment artworks intact.
 * Track edits are immutable, undoable and rejected on locked actor lanes.
 */
export function setActorStageTransform(
  studio: StudioDocument,
  actorId: string,
  patch: ActorStagePatch,
  updatedAt: string
): StudioDocument {
  const timeline=studio.videoTimeline
  const actor=studio.elements.find(e=>e.id===actorId&&e.kind==='character')
  if(!timeline||!actor||timeline.trackSettings?.[actorId]?.locked)return studio
  const allowed=['x','y','rotation','flipX','characterScale'] as const
  const keys=Object.keys(patch) as Array<keyof ActorStagePatch>
  if(!keys.length||keys.some(k=>!allowed.includes(k)))return studio
  if(keys.some(key=>{
    const value=patch[key]
    if(key==='flipX')return typeof value!=='boolean'
    return typeof value!=='number'||!Number.isFinite(value)
      ||(key==='characterScale'&&(value<10||value>400))
      ||(key==='rotation'&&(value< -360||value>360))
      ||((key==='x'||key==='y')&&(value< -100||value>100))
  }))return studio
  const base=videoCharacterStateAt(timeline,actorId,0)?.element??actor
  const current=timeline.characterTransforms?.[actorId]??{
    x:base.x,y:base.y,rotation:base.rotation,flipX:base.flipX,
    characterScale:base.characterScale,characterWidthScale:base.characterWidthScale,
    characterHeightScale:base.characterHeightScale,zIndex:base.zIndex
  }
  if(keys.every(key=>current[key]===patch[key]))return studio
  const next={...current,...patch}
  return {
    ...studio,updatedAt,
    elements:studio.elements.map(e=>e.id===actorId?{...e,...patch}:e),
    videoTimeline:{...timeline,characterTransforms:{...timeline.characterTransforms,[actorId]:next}}
  }
}
