/** Compile a portable react plan into genuine Editor V6 images, clips and character tracks. */
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6IntroClip } from '../../../../shared/editorV6Intro'
import type { EditorV6Document, EditorV6Element, EditorV6Asset, EditorV6TimelineTrack } from '../../../../shared/editorV6'
import { createEditorV6Timeline, editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { parseEditorV6Document } from '../../../../shared/editorV6Schema'
import { planEditorV6ReactImport, preflightEditorV6ReactImport, type EditorV6ReactImport, type EditorV6ReactImportPlan } from '../../../../shared/editorV6ReactImport'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6DefaultBalloonPlacement } from '../../../../shared/editorV6BalloonPlacement'
import { editorV6CharacterStageReference } from './editorV6CharacterStageReference'
import { bakeEditorV6FaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets'
import { compileEditorV6ReactCharacterTracks, type EditorV6ReactRenderedCharacterState } from './editorV6ReactCharacterTracks'
import { buildSceneExpressionAppearance, buildSceneExpressionTransforms, appearanceWithPupilsLookingLeft } from '../../characters/sceneExpressionTransforms'
import { resolvePoseCategory, type FaceExpressionPreset } from '../../../../shared/fabricator'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { createPreparedFaceCatalogItemLoader, type PreparedFaceCatalogItemCache } from '../../characters/preparedFaceCatalogItems'
import type { GachaReusableMaterialCache } from '../../characters/preparedCharacterMaterials'
import type { StandardExpressionEffectsCache } from '../../characters/standardExpressionEffects'
import { createEditorV6CharacterSourceBatch } from './motion/characterSourceBatch'

const uuid = () => crypto.randomUUID()
const utc = () => new Date().toISOString()
type Sources = {
  characters: CustomizerCharacter[]
  poseSlots: Map<string, number[]>
  poseRevisions: Map<string, Map<number,string>>
  poseCategories?: Map<string, Map<number,string>>
  selectedPoses?: Map<string, number[]>
  presets: Map<number, Array<{id:string;name:string}>>
}
export type EditorV6ReactPrepared = { document: EditorV6Document; warnings: string[] }
const stageWidth=1920,stageHeight=1080
export async function prepareEditorV6ReactSources(source: EditorV6ReactImport, characters: CustomizerCharacter[]): Promise<Sources> {
  const refSet = new Set(source.cast.map((item)=>item.character.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))
  const targets = characters.filter((item)=>refSet.has(item.id.toLowerCase())||refSet.has(item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))
  const modelSlots=[...new Set(targets.map((item)=>item.customization.modelSlot??1))]
  const [poseRecords,expressionRecords,selectionRecords]=await Promise.all([
    Promise.all(modelSlots.map(async (modelSlot)=>[modelSlot,await window.desktop.fabricator.listFabricatorPoseSlots(modelSlot)] as const)),
    Promise.all(modelSlots.map(async (modelSlot)=>[modelSlot,await window.desktop.fabricator.listFaceExpressionPresets(modelSlot)] as const)),
    Promise.all(modelSlots.map(async (modelSlot)=>[modelSlot,await window.desktop.fabricator.getFabricatorExportPoseSlots(modelSlot)] as const))
  ])
  const posesByModel=new Map(poseRecords)
  const selectionsByModel=new Map(selectionRecords)
  const poseSlots=new Map<string,number[]>(),poseRevisions=new Map<string,Map<number,string>>()
  const poseCategories = new Map<string,Map<number,string>>(), selectedPoses = new Map<string,number[]>()
  for(const character of targets){
    const poseRecords=(posesByModel.get(character.customization.modelSlot??1)??[]).filter((entry)=>entry && entry.sourceModelSlot===(character.customization.modelSlot??1))
    poseSlots.set(character.id,poseRecords.map((entry)=>entry!.slot))
    poseRevisions.set(character.id,new Map(poseRecords.map((entry)=>[entry!.slot,entry!.updatedAt??'missing'])))
    poseCategories.set(character.id,new Map(poseRecords.map((entry)=>[entry!.slot,resolvePoseCategory(entry!)])))
    const saved = selectionsByModel.get(character.customization.modelSlot??1)
    selectedPoses.set(character.id,saved === null || saved === undefined ? poseRecords.slice(0,5).map((entry)=>entry!.slot) : saved.filter((slot):slot is number => slot !== null))
  }
  return {characters,poseSlots,poseRevisions,poseCategories,selectedPoses,presets:new Map(expressionRecords.map(([slot,values])=>[slot,values.map((item)=>({id:item.id,name:item.name}))]))}
}

export async function compileEditorV6ReactImport(
  source: EditorV6ReactImport,
  sources: Sources,
  onProgress: (message:string)=>void=()=>{}
): Promise<EditorV6ReactPrepared> {
  const projectId=uuid()
  const videoIds = new Set<string>()
  for (const video of source.videos) {
    if (!video.videoId) throw new Error('Os vídeos precisam ser resolvidos para IDs antes da compilação.')
    videoIds.add(video.videoId)
  }
  if(source.lines.length+source.cast.length>1000)throw new Error('O V6 permite no máximo 1000 camadas; reduza a quantidade de balões.')
  if(source.beats.length>1000)throw new Error('O projeto contém estados visuais demais para esta importação.')
  preflightEditorV6ReactImport(source, {
    characters:sources.characters,posesByCharacter:sources.poseSlots,poseCategoriesByCharacter:sources.poseCategories,selectedPosesByCharacter:sources.selectedPoses,presetsByModel:sources.presets
  })
  let verified = 0
  const media = await mapConcurrentItems([...videoIds], async (id) => {
    const linked = await window.desktop.editorV6.linkEditorV6LibraryVideo(projectId, id)
    onProgress(`Verificando mídia ${++verified}/${videoIds.size}`)
    return linked
  }, () => false, 3)
  const plan=planEditorV6ReactImport(source,{
    characters:sources.characters,posesByCharacter:sources.poseSlots,poseCategoriesByCharacter:sources.poseCategories,selectedPosesByCharacter:sources.selectedPoses,presetsByModel:sources.presets,media
  })
  const importedBackground=source.backgroundLibraryId ? await window.desktop.editorV6.linkEditorV6LibraryBackground(projectId,source.backgroundLibraryId) : null
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
      startFrame:plan.contentStartFrame + item.startFrame,durationFrames:item.durationFrames,mediaInFrame:0,
      mediaLayout:item.layout??editorV6DefaultVideoLayout(item.video.width,item.video.height),
      ...(item.presentation ? { videoPresentation: item.presentation } : {}),
      audioEnabled:true,gain:1
    })
  }

  const characterById=new Map(sources.characters.map((character)=>[character.id,character]))
  const renderCache=new Map<string, EditorV6ReactRenderedCharacterState & { portraitAspect: number }>()
  const presetCache=new Map<string,FaceExpressionPreset>()
  const referenceSizes=new Map<number,Awaited<ReturnType<typeof editorV6CharacterStageReference>>>()
  const fabricator = window.desktop.fabricator
  const renderSources = createEditorV6CharacterSourceBatch(fabricator, 8)
  const materialCache: GachaReusableMaterialCache = new Map()
  const faceCatalogItemsCache: PreparedFaceCatalogItemCache = new Map()
  const expressionEffectsCache: StandardExpressionEffectsCache = new WeakMap()
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
  async function renderState(actor:EditorV6ReactImportPlan['cast'][number],poseSlot:number|null,expression:string|undefined,gaze:'left'|'right',
    face?: Extract<EditorV6IntroClip, { kind: 'character' }>['face']){
    const cacheKey=actor.characterId+':'+String(poseSlot)+':'+(expression??'base')+':'+gaze+(face ? ':'+JSON.stringify(face) : '')
    const existing=renderCache.get(cacheKey)
    if(existing)return existing
    const character=characterById.get(actor.characterId)!
    const baseAppearance=character.customization.faceAppearance
    if(expression&&!baseAppearance)throw new Error(actor.name+' precisa de uma aparência facial no Customizador para usar presets.')
    const preset=expression?await loadPreset(actor.modelSlot,expression):null
    const loadCatalog = createPreparedFaceCatalogItemLoader(actor.modelSlot, fabricator, faceCatalogItemsCache)
    const appearance=face?.faceAppearance ?? (preset&&baseAppearance?await buildSceneExpressionAppearance(preset,baseAppearance,loadCatalog):baseAppearance)
    const transforms=face?.faceTransforms ?? (preset&&appearance?await buildSceneExpressionTransforms(
      preset,appearance,{},(id)=>window.desktop.fabricator.loadFaceComponentAsset(actor.modelSlot,id),
      loadCatalog,gaze
    ):gaze==='left'&&appearance?await appearanceWithPupilsLookingLeft(appearance,(id)=>window.desktop.fabricator.loadFaceComponentAsset(actor.modelSlot,id))??{}:{})
    const effects=face?.activeExpressionEffects ?? preset?.effects
    const mode = face?.activeFaceMode ?? 'idle'
    const characterCopy:CustomizerCharacter={...character,customization:{...character.customization,poseSlot,faceAppearance:appearance}}
    const renderer=await prepareSavedCharacterRenderer(characterCopy, {
      ...await renderSources.sourceFor(characterCopy), materialCache, faceCatalogItemsCache, expressionEffectsCache
    })
    try{
      const rendered=await renderer.renderToCanvas(appearance,transforms,effects,mode)
      const baked=await bakeEditorV6FaceModeAssets(actor.name,renderer,appearance,transforms,effects,mode,rendered)
      const cropWidth=baked.crop?.width??rendered.width,cropHeight=baked.crop?.height??rendered.height
      if (!referenceSizes.has(actor.modelSlot)) {
        const neutralSource = await renderSources.sourceFor({ ...character, customization: { ...character.customization, poseSlot: null } })
        referenceSizes.set(actor.modelSlot, await editorV6CharacterStageReference(character, neutralSource))
      }
      const ref=referenceSizes.get(actor.modelSlot)!
      const geometry=fitEditorV6CharacterToStage(ref.rendered,ref.crop,rendered,{width:cropWidth,height:cropHeight},stageWidth,stageHeight)
      const base:EditorV6Asset={id:uuid(),category:'character',name:actor.name+' · '+(expression??'base')+' · '+gaze,mimeType:'image/png',dataUrl:baked.dataUrl,timelineSnapshot:true}
      const data={base,extras:baked.extraAssets,faceModeAssetIds:{...baked.assetIds,[mode]:base.id},portraitAspect:cropWidth/cropHeight,...geometry,appearance,transforms,effects,
        collectionId: preset?.collectionId, ...(preset?{presetUpdatedAt:preset.updatedAt}:{})}
      renderCache.set(cacheKey,data)
      document.assets.push(base, ...baked.extraAssets)
      return data
    }finally{renderer.dispose()}
  }

  try {
    const compiledCharacters=await compileEditorV6ReactCharacterTracks({
      actors:plan.cast,
      beats:plan.beats,
      durationFrames:Math.max(1, plan.durationFrames - plan.contentStartFrame),
      characters:sources.characters,
      poseRevisions:sources.poseRevisions,
      renderState,
      onProgress,
      createId:uuid
    })
    // An Intro-only project still needs a base cast for its saved project and JSON export.
    const castStartFrame = Math.min(plan.contentStartFrame, plan.durationFrames - 1)
    for (const track of compiledCharacters.tracks) for (const block of track.blocks) block.startFrame += castStartFrame
    document.elements.push(...compiledCharacters.elements)
    document.timeline.tracks.push(...compiledCharacters.tracks)

    if (plan.intro.length) {
      const actors = new Map(plan.cast.map(actor => [actor.characterId, actor]))
      const intro: EditorV6TimelineTrack = { id: uuid(), kind: 'intro', name: 'Intro', muted: false, locked: false, blocks: [] }
      for (const [index, part] of plan.intro.entries()) {
        const { startFrame, durationFrames } = part
        const timing = { id: uuid(), startFrame, durationFrames }
        if (part.kind === 'black') {
          intro.blocks.push({ ...timing, label: 'Tela preta · ' + part.text.slice(0, 100), intro: { kind: 'black', text: part.text } })
          continue
        }
        const { characterId, text, englishText, expression, flipX, poseSlot, gaze, portraitLayout } = part
        const actor = actors.get(characterId)!
        onProgress(`Preparando Intro: ${actor.name} · ${index + 1}/${plan.intro.length}`)
        const rendered = await renderState(actor, poseSlot, expression, gaze, part.face)
        intro.blocks.push({ ...timing, label: actor.name.slice(0, 120), intro: {
          kind: 'character', characterId, assetId: rendered.base.id, faceModeAssetIds: rendered.faceModeAssetIds, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, portraitAspect: rendered.portraitAspect, text, englishText, expression, poseSlot, flipX,
          face: { faceAppearance: rendered.appearance, faceTransforms: rendered.transforms, activeExpressionEffects: rendered.effects,
            activeExpressionGaze: gaze, activeFaceMode: 'idle', characterCanvasWidth: rendered.characterCanvasWidth,
            activeExpressionCollectionId: rendered.collectionId, ...part.face },
          ...(portraitLayout ? { portraitLayout } : {})
        } })
      }
      document.timeline.tracks.push(intro)
    }
  } finally {
    renderSources.clear()
    materialCache.clear()
    faceCatalogItemsCache.clear()
  }

  const elementByCharacter=new Map(document.elements.filter((item)=>item.kind==='character').map((item)=>[item.characterId!,item]))
  for(const line of plan.lines){
    const actor=elementByCharacter.get(line.characterId)!
    const id=uuid()
    const placement=editorV6DefaultBalloonPlacement(actor,line.height??17)
    const state:EditorV6Element={id,kind:line.kind,characterId:line.characterId,
      attachedCharacterElementId:actor.id,attachmentOriginX:actor.x,attachmentOriginY:actor.y,
      text:line.text,...(line.englishText !== undefined ? {englishText:line.englishText} : {}),x:line.x??placement.x,y:line.y??placement.y,
      width:line.width??30,height:line.height??17,rotation:0,zIndex:100+document.elements.length}
    document.elements.push(state)
    const lane=line.kind==='speech'?speechTrack:thoughtTrack
    lane.blocks.push({id:uuid(),elementId:id,characterId:line.characterId,label:line.text.slice(0,120),
      state,startFrame:plan.contentStartFrame + line.startFrame,durationFrames:line.durationFrames})
  }
  document.timeline=normalizeEditorV6Timeline({...document.timeline,knownElementIds:document.elements.map((item)=>item.id)})
  const trackLimit=document.timeline.tracks.find((item)=>item.blocks.length>1000)
  if(trackLimit)throw new Error('Faixa '+trackLimit.name+' ultrapassou 1000 blocos.')
  return {document:parseEditorV6Document(document),warnings:plan.warnings}
}
