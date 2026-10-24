import type { StudioDocument, VideoAudioSettings } from '../studio'
import { isValidVideoMediaClip } from '../videoMedia'
import { videoAudioSettings } from '../videoAudio'

/** All operations return their original document by identity on invalid input,
 * and never rewrite video sources, saved character artwork or CAS assets. */
export function setTextClipContent(studio: StudioDocument, clipId: string, text: string, at: string): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.textClips.find(item=>item.id===clipId)
  if(!timeline||!clip||timeline.trackSettings?.[clip.kind]?.locked
    ||typeof text!=='string'||text.length>2000)return studio
  const source=clip.state??studio.elements.find(item=>item.id===clip.elementId&&item.kind===clip.kind)
  if(!source||source.kind!==clip.kind||source.text===text)return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,textClips:timeline.textClips.map(item=>item.id===clipId
    ? {...item,state:{...source,text}} : item)}}
}

export function moveTextClip(studio: StudioDocument, clipId: string, startFrame: number, at: string): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.textClips.find(item=>item.id===clipId)
  if(!timeline||!clip||timeline.trackSettings?.[clip.kind]?.locked||!Number.isSafeInteger(startFrame)
    ||startFrame<0||startFrame+clip.endFrame-clip.startFrame>timeline.durationFrames
    ||startFrame===clip.startFrame)return studio
  const length=clip.endFrame-clip.startFrame
  return {...studio,updatedAt:at,videoTimeline:{...timeline,textClips:timeline.textClips.map(item=>item.id===clipId
    ? {...item,startFrame,endFrame:startFrame+length}:item)}}
}

export function moveVideoClip(studio: StudioDocument, clipId: string, startFrame: number, at: string): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.videoClips?.find(item=>item.id===clipId)
  const asset=timeline?.videoAssets?.find(item=>item.id===clip?.assetId)
  if(!timeline||!clip||!asset||timeline.trackSettings?.video?.locked
    ||!Number.isSafeInteger(startFrame)||startFrame<0||startFrame===clip.startFrame)return studio
  const candidate={...clip,startFrame,endFrame:startFrame+clip.endFrame-clip.startFrame}
  if(!isValidVideoMediaClip(candidate,asset.durationFrames,timeline.durationFrames))return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,videoClips:timeline.videoClips!.map(item=>item.id===clipId?candidate:item)}}
}

function acceptableAudio(audio: VideoAudioSettings): boolean {
  return Boolean(audio&&typeof audio.muted==='boolean'&&typeof audio.volume==='number'
    &&Number.isFinite(audio.volume)&&audio.volume>=0&&audio.volume<=1)
}

export function setVideoClipAudio(
  studio: StudioDocument, clipId: string, patch: Partial<VideoAudioSettings>, at: string
): StudioDocument {
  const timeline=studio.videoTimeline
  const clip=timeline?.videoClips?.find(item=>item.id===clipId)
  if(!timeline||!clip||timeline.trackSettings?.video?.locked
    ||Object.keys(patch).some(key=>key!=='volume'&&key!=='muted'))return studio
  const current=videoAudioSettings(clip.audio)
  const next={...current,...patch}
  if(!acceptableAudio(next)||(current.volume===next.volume&&current.muted===next.muted))return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,
    videoClips:timeline.videoClips!.map(item=>item.id===clipId?{...item,audio:next}:item)}}
}

export function setProjectVideoAudio(
  studio: StudioDocument, patch: Partial<VideoAudioSettings>, at: string
): StudioDocument {
  const timeline=studio.videoTimeline
  if(!timeline||Object.keys(patch).some(key=>key!=='volume'&&key!=='muted'))return studio
  const current=videoAudioSettings(timeline.videoAudio),next={...current,...patch}
  if(!acceptableAudio(next)||(current.volume===next.volume&&current.muted===next.muted))return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,videoAudio:next}}
}

export function deleteTimelineClip(
  studio: StudioDocument, kind: 'text'|'video', clipId: string, at: string
): StudioDocument {
  const timeline=studio.videoTimeline
  if(!timeline)return studio
  if(kind==='text') {
    const clip=timeline.textClips.find(item=>item.id===clipId)
    if(!clip||timeline.trackSettings?.[clip.kind]?.locked)return studio
    return {...studio,updatedAt:at,videoTimeline:{...timeline,
      textClips:timeline.textClips.filter(item=>item.id!==clipId)}}
  }
  const clip=timeline.videoClips?.find(item=>item.id===clipId)
  if(!clip||timeline.trackSettings?.video?.locked)return studio
  return {...studio,updatedAt:at,videoTimeline:{...timeline,
    videoClips:timeline.videoClips!.filter(item=>item.id!==clipId)}}
}
