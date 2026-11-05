import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6MediaAsset } from '../../src/shared/editorV6'
import { EDITOR_V6_REACT_IMPORT_FORMAT, parseEditorV6ReactImport, planEditorV6ReactImport, resolveEditorV6ReactVideos, secondsToFrame } from '../../src/shared/editorV6ReactImport'

const idA='123e4567-e89b-42d3-a456-426614174001'
const idB='123e4567-e89b-42d3-a456-426614174002'
const videoId='123e4567-e89b-42d3-a456-426614174003'
const actors=[
  {id:idA,name:'Chloé',customization:{modelSlot:1,poseSlot:1,faceAppearance:{modelSlot:1}}},
  {id:idB,name:'Luka',customization:{modelSlot:1,poseSlot:1,faceAppearance:{modelSlot:1}}}
] as unknown as CustomizerCharacter[]
const video:EditorV6MediaAsset={id:videoId,libraryVideoId:videoId,name:'TikTok 01',fileName:videoId+'.mp4',kind:'video',mimeType:'video/mp4',sourceFrames:180,hasAudio:true,width:1080,height:1920,sizeBytes:20000}
const sample=()=>parseEditorV6ReactImport({
  format:EDITOR_V6_REACT_IMPORT_FORMAT,title:'React sem reescrita',seed:7,
  cast:[{character:'Chloé',x:-30,y:15},{character:'Luka',x:-10,y:15}],
  videos:[{videoId,startSeconds:0}],durationSeconds:31,
  lines:[
    {character:'Chloé',kind:'speech',text:'Texto exato!\nSegunda linha.',startSeconds:6,durationSeconds:3},
    {character:'Luka',kind:'thought',text:'Isso é segredo.',startSeconds:10,durationSeconds:2}
  ],
  beats:[{character:'Chloé',startSeconds:6,expression:'espantada'},{character:'Chloé',startSeconds:9,expression:'normal'}]
})
const references=()=>({
  characters:actors,
  posesByCharacter:new Map([[idA,[1,2,3]],[idB,[1,2,3]]]),
  presetsByModel:new Map([[1,[{id:'exp-surprise',name:'espantada'},{id:'exp-normal',name:'normal'},{id:'exp-smile',name:'feliz'}]]]),
  media:[video]
})
describe('JSON portátil do Editor V6',()=>{
  it('identifica vídeo pelo número ou nome real da Base de Vídeos',()=>{
    const parsed=sample()
    const library=[{id:videoId,name:'Clipe Principal.mp4',mimeType:'video/mp4' as const,extension:'mp4' as const,size:20000,durationFrames:180,createdAt:'2026-01-01T00:00:00.000Z',available:true}]
    const details=[{videoId,videoNumber:7,description:'',timeline:'unspecified' as const}]
    const numbered={...parsed,videos:[{videoNumber:7,startSeconds:0}]}
    expect(resolveEditorV6ReactVideos(numbered,library,details).videos[0].videoId).toBe(videoId)
    const named={...parsed,videos:[{videoName:'Clipe Principal.mp4',startSeconds:0}]}
    expect(resolveEditorV6ReactVideos(named,library,details).videos[0].videoId).toBe(videoId)
    expect(()=>resolveEditorV6ReactVideos({...parsed,videos:[{videoNumber:9,startSeconds:0}]},library,details)).toThrow(/não encontrado/)
  })
  it('valida formato, mantém texto original e aplica os defaults',()=>{
    const parsed=sample()
    expect(parsed.autoPoseEverySeconds).toBe(15)
    expect(parsed.autoListenerGaze).toBe(true)
    expect(parsed.lines[0].text).toBe('Texto exato!\nSegunda linha.')
    expect(()=>parseEditorV6ReactImport({...parsed,format:'schema_version: 3'})).toThrow()
  })
  it('usa o frame da primeira fala pós-vídeo sem atraso e permite continuidade depois do MP4',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    expect(plan.videos[0].durationFrames).toBe(180)
    expect(plan.lines[0].startFrame).toBe(180)
    expect(plan.lines[0].durationFrames).toBe(90)
    expect(plan.durationFrames).toBeGreaterThanOrEqual(360)
  })
  it('usa PT para ouvintes somente quando há fala e restaura ao terminar',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    const gaze=plan.beats.filter((b)=>b.characterId===idB&&b.gaze!==undefined)
    expect(gaze.some((b)=>b.startFrame===180&&b.gaze==='left')).toBe(true)
    expect(gaze.some((b)=>b.startFrame===270&&b.gaze==='right')).toBe(true)
    expect(gaze.some((b)=>b.startFrame===300&&b.gaze==='left')).toBe(false)
  })
  it('não vira quem está no lado oposto da TV',()=>{
    const parsed=sample()
    const opposite={...parsed,cast:[parsed.cast[0],{...parsed.cast[1],x:30}]}
    const beats=planEditorV6ReactImport(opposite,references()).beats
    expect(beats.some((beat)=>beat.characterId===idB&&beat.startFrame===180&&beat.gaze==='left')).toBe(false)
  })
  it('escolhe poses iniciais distintas quando disponíveis e só uma troca por intervalo',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    const initials=plan.beats.filter((b)=>b.startFrame===0)
    expect(new Set(initials.map((item)=>item.poseSlot)).size).toBe(2)
    expect(plan.beats.filter((b)=>b.startFrame===450&&b.poseSlot!==undefined).length).toBe(1)
    expect(plan.beats.every((b)=>b.startFrame>=0&&b.startFrame<plan.durationFrames)).toBe(true)
  })
  it('reconhece personagens sem acento e rejeita referências ausentes ou repetidas',()=>{
    const parsed=sample()
    expect(planEditorV6ReactImport({...parsed,cast:[{...parsed.cast[0],character:'Chloe'},parsed.cast[1]]},references()).cast[0].characterId).toBe(idA)
    expect(()=>planEditorV6ReactImport({...parsed,cast:[parsed.cast[0],{...parsed.cast[0]}]},references())).toThrow(/repetido/)
    expect(()=>planEditorV6ReactImport({...parsed,videos:[{videoId:'00000000-0000-4000-8000-000000000000',startSeconds:0}]},references())).toThrow(/não encontrado/)
  })
  it('rejeita vídeo simultâneo, pose inexistente e preserva precisão de quadro',()=>{
    const parsed=sample()
    expect(()=>planEditorV6ReactImport({...parsed,videos:[...parsed.videos,{videoId,startSeconds:1}]},references())).toThrow(/sobrepõem/)
    expect(()=>planEditorV6ReactImport({...parsed,beats:[{character:'Luka',startSeconds:2,poseSlot:50}]},references())).toThrow(/Pose/)
    expect(secondsToFrame(1.01)).toBe(31)
  })
})
