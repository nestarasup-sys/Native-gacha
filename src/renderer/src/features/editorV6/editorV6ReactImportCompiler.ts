/** Compile a portable react plan into genuine Editor V6 images, clips and character tracks. */
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6Asset } from '../../../../shared/editorV6'
import { createEditorV6Timeline, editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { parseEditorV6Document } from '../../../../shared/editorV6Schema'
import { planEditorV6ReactImport, type EditorV6ReactImport, type EditorV6ReactImportPlan } from '../../../../shared/editorV6ReactImport'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6CharacterStageReference } from './editorV6CharacterStageReference'
import { bakeFaceModeAssets } from './faceModeAssets'
import { compileEditorV6ReactCharacterTracks, type EditorV6ReactRenderedCharacterState } from './editorV6ReactCharacterTracks'
import { buildSceneExpressionAppearance, buildSceneExpressionTransforms, appearanceWithPupilsLookingLeft } from '../../characters/sceneExpressionTransforms'
import type { FaceExpressionPreset } from '../../../../shared/fabricator'

const uuid = () => crypto.randomUUID()
const utc = () => new Date().toISOString()
type Sources = {
  characters: CustomizerCharacter[]
  poseSlots: Map<string, number[]>
  poseRevisions: Map<string, Map<number,string>>
  presets: Map<number, Array<{id:string;name:string}>>
}
export type EditorV6ReactPrepared = { document: EditorV6Document; warnings: string[] }
const stageWidth=1920,stageHeight=1080
export async function prepareEditorV6ReactSources(source: EditorV6ReactImport, characters: CustomizerCharacter[]): Promise<Sources> {
  const refSet = new Set(source.cast.map((item)=>item.character.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))
  const targets = characters.filter((item)=>refSet.has(item.id.toLowerCase())||refSet.has(item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))
  const modelSlots=[...new Set(targets.map((item)=>item.customization.modelSlot??1))]
  const [poseRecords,expressionRecords]=await Promise.all([
    Promise.all(modelSlots.map(async (modelSlot)=>[modelSlot,await window.desktop.fabricator.listFabricatorPoseSlots(modelSlot)] as const)),
    Promise.all(modelSlots.map(async (modelSlot)=>[modelSlot,await window.desktop.fabricator.listFaceExpressionPresets(modelSlot)] as const))
  ])
  const posesByModel=new Map(poseRecords)
  const poseSlots=new Map<string,number[]>(),poseRevisions=new Map<string,Map<number,string>>()
  for(const character of targets){
    const poseRecords=(posesByModel.get(character.customization.modelSlot??1)??[]).filter((entry)=>entry && entry.sourceModelSlot===(character.customization.modelSlot??1))
    poseSlots.set(character.id,poseRecords.map((entry)=>entry!.slot))
    poseRevisions.set(character.id,new Map(poseRecords.map((entry)=>[entry!.slot,entry!.updatedAt??'missing'])))
  }
  return {characters,poseSlots,poseRevisions,presets:new Map(expressionRecords.map(([slot,values])=>[slot,values.map((item)=>({id:item.id,name:item.name}))]))}
}

export async function compileEditorV6ReactImport(
  source: EditorV6ReactImport,
  sources: Sources,
  onProgress: (message:string)=>void=()=>{}
): Promise<EditorV6ReactPrepared> {
  const projectId=uuid()
  const media=[], seen=new Set<string>()
  for(const video of source.videos){
    const videoId=video.videoId
    if(!videoId)throw new Error('Os vídeos precisam ser resolvidos para IDs antes da compilação.')
    if(seen.has(videoId))continue
    seen.add(videoId)
    onProgress('Verificando mídia ' + seen.size + '/' + source.videos.length)
    media.push(await window.desktop.editorV6.linkEditorV6LibraryVideo(projectId,videoId))
  }
  const plan=planEditorV6ReactImport(source,{
    characters:sources.characters,posesByCharacter:sources.poseSlots,presetsByModel:sources.presets,media
  })
  const importedBackground=source.backgroundLibraryId ? await window.desktop.editorV6.linkEditorV6LibraryBackground(projectId,source.backgroundLibraryId) : null
  if(plan.lines.length+plan.cast.length>1000)throw new Error('O V6 permite no máximo 1000 camadas; reduza a quantidade de balões.')
  if(plan.beats.length>1000)throw new Error('O projeto contém estados visuais demais para esta importação.')
  const now=utc()
  const document: EditorV6Document={
    schemaVersion:1,id:projectId,title:plan.title,color:'#d7b5cd',createdAt:now,updatedAt:now,
    backgroundColor:plan.backgroundColor,backgroundAssetId:importedBackground?.id??null,backgroundX:0,backgroundY:0,backgroundWidth:100,backgroundHeight:100,backgroundRotation:0,
    assets:importedBackground?[importedBackground]:[],media,elements:[],timeline:createEditorV6Timeline()
  }
  const videoTrack=document.timeline.tracks.find((item)=>item.kind==='video')!
  const speechTrack=document.timeline.tracks.find((item)=>item.kind==='speech')!
  const thoughtTrack=document.timeline.tracks.find((item)=>item.kind==='thought')!
  document.timeline.durationFrames=plan.durationFrames
  for(const item of plan.videos){
    videoTrack.blocks.push({
      id:uuid(),label:item.video.name.slice(0,120),mediaId:item.video.id,
      startFrame:item.startFrame,durationFrames:item.durationFrames,mediaInFrame:0,
      mediaLayout:item.layout??editorV6DefaultVideoLayout(item.video.width,item.video.height),
      audioEnabled:true,gain:1
    })
  }

  const characterById=new Map(sources.characters.map((character)=>[character.id,character]))
  const renderCache=new Map<string,EditorV6ReactRenderedCharacterState>()
  const presetCache=new Map<string,FaceExpressionPreset>()
  const referenceSizes=new Map<number,Awaited<ReturnType<typeof editorV6CharacterStageReference>>>()
  const {prepareSavedCharacterRenderer}=await import('../../characters/editorV6CharacterRenderer')
  const loadPreset=async (model:number,id:string)=>{
    const key=model+':'+id
    const cached=presetCache.get(key)
    if(cached)return cached
    const preset=await window.desktop.fabricator.loadFaceExpressionPreset(model,id)
    if(!preset)throw new Error('Preset de expressão indisponível: '+id)
    presetCache.set(key,preset)
    return preset
  }
  async function renderState(actor:EditorV6ReactImportPlan['cast'][number],poseSlot:number|null,expression:string|undefined,gaze:'left'|'right'){
    const cacheKey=actor.characterId+':'+String(poseSlot)+':'+(expression??'base')+':'+gaze
    const existing=renderCache.get(cacheKey)
    if(existing)return existing
    const character=characterById.get(actor.characterId)!
    const baseAppearance=character.customization.faceAppearance
    if(expression&&!baseAppearance)throw new Error(actor.name+' precisa de uma aparência facial no Customizador para usar presets.')
    const preset=expression?await loadPreset(actor.modelSlot,expression):null
    const appearance=preset&&baseAppearance?await buildSceneExpressionAppearance(preset,baseAppearance,(id)=>window.desktop.fabricator.loadFaceCatalogItem(actor.modelSlot,id)):baseAppearance
    const transforms=preset&&appearance?await buildSceneExpressionTransforms(
      preset,appearance,{},(id)=>window.desktop.fabricator.loadFaceComponentAsset(actor.modelSlot,id),
      (id)=>window.desktop.fabricator.loadFaceCatalogItem(actor.modelSlot,id),gaze
    ):gaze==='left'&&appearance?await appearanceWithPupilsLookingLeft(appearance,(id)=>window.desktop.fabricator.loadFaceComponentAsset(actor.modelSlot,id))??{}:{}
    const effects=preset?.effects
    const characterCopy:CustomizerCharacter={...character,customization:{...character.customization,poseSlot,faceAppearance:appearance}}
    const renderer=await prepareSavedCharacterRenderer(characterCopy)
    try{
      const rendered=await renderer.renderToCanvas(appearance,transforms,effects,'idle')
      const baked=await bakeFaceModeAssets(actor.name,renderer,appearance,transforms,effects,'idle',rendered)
      const cropWidth=baked.crop?.width??rendered.width,cropHeight=baked.crop?.height??rendered.height
      if(!referenceSizes.has(actor.modelSlot))referenceSizes.set(actor.modelSlot,await editorV6CharacterStageReference(character))
      const ref=referenceSizes.get(actor.modelSlot)!
      const geometry=fitEditorV6CharacterToStage(ref.rendered,ref.crop,rendered,{width:cropWidth,height:cropHeight},stageWidth,stageHeight)
      const base:EditorV6Asset={id:uuid(),category:'character',name:actor.name+' · '+(expression??'base')+' · '+gaze,mimeType:'image/png',dataUrl:baked.dataUrl,timelineSnapshot:true}
      const data={base,extras:baked.extraAssets,faceModeAssetIds:{...baked.assetIds,idle:base.id},...geometry,appearance,transforms,effects,...(preset?{presetUpdatedAt:preset.updatedAt}:{})}
      renderCache.set(cacheKey,data)
      document.assets.push(base,...baked.extraAssets)
      return data
    }finally{renderer.dispose()}
  }

  const compiledCharacters=await compileEditorV6ReactCharacterTracks({
    actors:plan.cast,
    beats:plan.beats,
    durationFrames:plan.durationFrames,
    characters:sources.characters,
    poseRevisions:sources.poseRevisions,
    renderState,
    onProgress,
    createId:uuid
  })
  document.elements.push(...compiledCharacters.elements)
  document.timeline.tracks.push(...compiledCharacters.tracks)

  const elementByCharacter=new Map(document.elements.filter((item)=>item.kind==='character').map((item)=>[item.characterId!,item]))
  for(const line of plan.lines){
    const actor=elementByCharacter.get(line.characterId)!
    const id=uuid()
    const state:EditorV6Element={id,kind:line.kind,characterId:line.characterId,
      attachedCharacterElementId:actor.id,attachmentOriginX:actor.x,attachmentOriginY:actor.y,
      text:line.text,x:line.x??Math.max(-31,Math.min(31,actor.x)),y:line.y??(actor.y-23),
      width:line.width??30,height:line.height??17,rotation:0,zIndex:100+document.elements.length}
    document.elements.push(state)
    const lane=line.kind==='speech'?speechTrack:thoughtTrack
    lane.blocks.push({id:uuid(),elementId:id,characterId:line.characterId,label:line.text.slice(0,120),
      state,startFrame:line.startFrame,durationFrames:line.durationFrames})
  }
  const trackLimit=document.timeline.tracks.find((item)=>item.blocks.length>1000)
  if(trackLimit)throw new Error('Faixa '+trackLimit.name+' ultrapassou 1000 blocos.')
  document.timeline=normalizeEditorV6Timeline({...document.timeline,knownElementIds:document.elements.map((item)=>item.id)})
  return {document:parseEditorV6Document(document),warnings:plan.warnings}
}
