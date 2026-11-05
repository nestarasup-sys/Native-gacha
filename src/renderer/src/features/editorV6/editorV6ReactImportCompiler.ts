/** Compile a portable react plan into genuine Editor V6 images, clips and character tracks. */
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6Asset, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../../../shared/editorV6'
import { createEditorV6Timeline, editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { parseEditorV6Document } from '../../../../shared/editorV6Schema'
import { planEditorV6ReactImport, type EditorV6ReactImport, type EditorV6ReactImportPlan } from '../../../../shared/editorV6ReactImport'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets'
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
const track = (kind: EditorV6TimelineTrack['kind'], name: string, characterId?: string): EditorV6TimelineTrack => ({
  id:uuid(),kind,name,muted:false,locked:false,blocks:[],...(characterId?{characterId}:{})
})

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
  for(const video of source.videos) if(!seen.has(video.videoId)){
    seen.add(video.videoId)
    onProgress('Verificando mídia ' + seen.size + '/' + new Set(source.videos.map((item)=>item.videoId)).size)
    media.push(await window.desktop.editorV6.linkEditorV6LibraryVideo(projectId,video.videoId))
  }
  const plan=planEditorV6ReactImport(source,{
    characters:sources.characters,posesByCharacter:sources.poseSlots,presetsByModel:sources.presets,media
  })
  const importedBackground=source.backgroundLibraryId ? await window.desktop.editorV6.linkEditorV6LibraryBackground(source.backgroundLibraryId) : null
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
  const renderCache=new Map<string,{base:EditorV6Asset;extras:EditorV6Asset[];faceModeAssetIds:EditorV6Element['faceModeAssetIds'];width:number;height:number;characterCanvasWidth:number;appearance:EditorV6Element['faceAppearance'];transforms:EditorV6Element['faceTransforms'];effects:EditorV6Element['activeExpressionEffects'];presetUpdatedAt?:string}>()
  const presetCache=new Map<string,FaceExpressionPreset>()
  const referenceSizes=new Map<string,{width:number;height:number;cropWidth:number;cropHeight:number}>()
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
      if(!referenceSizes.has(actor.characterId))referenceSizes.set(actor.characterId,{width:rendered.width,height:rendered.height,cropWidth,cropHeight})
      const ref=referenceSizes.get(actor.characterId)!
      const geometry=fitEditorV6CharacterToStage({width:ref.width,height:ref.height},{width:ref.cropWidth,height:ref.cropHeight},rendered,{width:cropWidth,height:cropHeight},stageWidth,stageHeight)
      const base:EditorV6Asset={id:uuid(),category:'character',name:actor.name+' · '+(expression??'base')+' · '+gaze,mimeType:'image/png',dataUrl:baked.dataUrl,timelineSnapshot:true}
      const data={base,extras:baked.extraAssets,faceModeAssetIds:{...baked.assetIds,idle:base.id},...geometry,appearance,transforms,effects,...(preset?{presetUpdatedAt:preset.updatedAt}:{})}
      renderCache.set(cacheKey,data)
      document.assets.push(base,...baked.extraAssets)
      return data
    }finally{renderer.dispose()}
  }

  for(const actor of plan.cast){
    const actorBeats=plan.beats.filter((item)=>item.characterId===actor.characterId).sort((a,b)=>a.startFrame-b.startFrame)
    const initial=actorBeats.find((item)=>item.startFrame===0)
    if(!initial)throw new Error('Personagem sem estado inicial: '+actor.name)
    let poseSlot:number|null=initial.poseSlot===undefined?null:initial.poseSlot
    let expression=initial.expression,gaze:'left'|'right'=initial.gaze??'right'
    const id=uuid()
    const character=characterById.get(actor.characterId)!
    const lane=track('character',actor.name,actor.characterId)
    document.timeline.tracks.push(lane)
    const baseGeometry={id,kind:'character' as const,characterId:actor.characterId,characterSourceUpdatedAt:character.updatedAt,
      faceRendererVersion:EDITOR_V6_FACE_RENDER_VERSION,activeFaceMode:'idle' as const,
      activeExpressionCollectionId:'standard',text:actor.name,x:actor.x,y:actor.y,rotation:0,zIndex:document.elements.length+1,
      characterScale:actor.scale??100,characterWidthScale:100,characterHeightScale:100,flipX:actor.flipX??false
    }
    for(let i=0;i<actorBeats.length;i++){
      const beat=actorBeats[i]
      if(beat.poseSlot!==undefined)poseSlot=beat.poseSlot
      if(beat.expression!==undefined)expression=beat.expression
      if(beat.gaze!==undefined)gaze=beat.gaze
      onProgress('Preparando '+actor.name+': estado '+(i+1)+'/'+actorBeats.length)
      const image=await renderState(actor,poseSlot,expression,gaze)
      const poseRevision=poseSlot===null?undefined:sources.poseRevisions.get(actor.characterId)?.get(poseSlot)??'missing'
      const state:EditorV6Element={
        ...baseGeometry,assetId:image.base.id,faceModeAssetIds:image.faceModeAssetIds,poseSlot,
        ...(poseRevision?{poseSourceRevision:poseRevision}:{}),
        ...(image.appearance?{faceAppearance:image.appearance,expressionBase:baseGeometry.activeFaceMode?{appearance:structuredClone(character.customization.faceAppearance??image.appearance),transforms:{}}:undefined}:{}),
        faceTransforms:image.transforms,activeExpressionEffects:image.effects,
        activeExpressionPresetId:expression??null,activeExpressionPresetUpdatedAt:image.presetUpdatedAt,
        activeExpressionGaze:gaze,characterCanvasWidth:image.characterCanvasWidth,width:image.width,height:image.height
      }
      const next=actorBeats[i+1]?.startFrame??plan.durationFrames
      if(next<=beat.startFrame)continue
      lane.blocks.push({id:uuid(),elementId:id,state,label:actor.name,startFrame:beat.startFrame,durationFrames:next-beat.startFrame,motionEnabled:false})
      if(!i)document.elements.push(state)
    }
    if(!lane.blocks.length)throw new Error('Personagem sem imagens visuais: '+actor.name)
    // Resolve the initial state from the actual first block, even if a duplicate zero-time beat existed.
    const baseIndex=document.elements.findIndex((element)=>element.id===id)
    if(baseIndex>=0)document.elements[baseIndex]=lane.blocks[0].state!
  }

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
