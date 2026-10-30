import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectCharacterArtwork, auditCharacterContinuity, isPoseSnapshotForModel } from '../src/shared/characterSourceContinuity.ts'
import { selectOriginalModelSource, selectMountedModelSource } from '../src/shared/fabricatorModelViews.ts'
import { MODEL_SKIN_BASE_TONE } from '../src/shared/skinTones.ts'
import { prepareCustomizerArtworkPreview } from '../src/renderer/src/features/customizer/customizerArtworkPreview.ts'

const pic = 'data:image/png;base64,U05BUFNIT1Q='
function model() {
  return {
    schemaVersion:1, slot:1,name:'Original',sourceName:'old.png',
    sourceAssetName:'source-aaaaaaaa.png',sourceDataUrl:pic, width:256,height:384,
    tolerance:74,updatedAt:'2026-10-22T08:00:00Z',joints:[],layerOrder:['body','head'],
    hiddenPartIds:[],parts:[
      {id:'body',name:'Corpo',x:70,y:120,width:100,height:200,rotation:0,dataUrl:pic,sourceTransform:{x:1,y:121,width:100,height:200,rotation:0}},
      {id:'head',name:'Cabeça',x:100,y:25,width:66,height:83,rotation:0,dataUrl:pic,sourceTransform:{x:180,y:5,width:66,height:83,rotation:0}}
    ]
  }
}
function pose(source) {
  return {
    schemaVersion:1,slot:1,name:'Pose montada',sourceModelSlot:source.slot,
    sourceModelName:source.name,sourceModelUpdatedAt:source.updatedAt,
    width:source.width,height:source.height,updatedAt:source.updatedAt,
    category:'Parado',parts:selectMountedModelSource(source).parts,
    joints:[],layerOrder:['body','head'],hiddenPartIds:[]
  }
}
const outfit=()=>({
  schemaVersion:1,id:'coat',modelSlot:1,modelName:'Original',name:'Jaqueta',
  width:256,height:384,updatedAt:'2026-10-22T08:00:00Z',
  components:[{id:'sleeve',name:'Manga',category:'camisa',attachedPartId:'body',
    x:75,y:120,width:60,height:100,rotation:0,dataUrl:pic}]
})
test('alterar Model Source muda a folha, mas não reescreve pose ou roupa do personagem',()=>{
 const old=model()
 const savedPose=pose(old)
 const savedOutfit=outfit()
 const frozenPose=structuredClone(savedPose)
 const frozenOutfit=structuredClone(savedOutfit)
 const updated={...old,sourceAssetName:'source-bbbbbbbb.png',updatedAt:'2026-10-22T10:00:00Z',
   sourceDataUrl:'data:image/png;base64,TkVXLVNPVVJDRQ==',
   parts:old.parts.map(part=>part.id==='head'?{
    ...part,sourceTransform:{...part.sourceTransform,x:190,width:70},dataUrl:'data:image/png;base64,TkVX'}
   :part)}
 assert.equal(selectOriginalModelSource(updated).parts[1].x,190)
 assert.equal(selectCharacterArtwork(updated,savedPose,1).parts[1].x,100)
 assert.equal(selectCharacterArtwork(updated,null,null).sourceAssetName,'source-bbbbbbbb.png')
 const audit=auditCharacterContinuity(updated,savedPose,[savedOutfit])
 assert.equal(audit.compatible,true)
 assert.equal(audit.hasOlderPoseSnapshot,true)
 assert.deepEqual(audit.missingAttachments,[])
 assert.deepEqual(audit.missingPosePieces,[])
 assert.deepEqual(savedPose,frozenPose)
 assert.deepEqual(savedOutfit,frozenOutfit)
})
test('Customizer e Studio rejeitam uma pose de outro slot ou modelo, sem usar PNG errado',()=>{
 const m=model()
 const p=pose(m)
 assert.equal(isPoseSnapshotForModel(p,1,1),true)
 assert.equal(isPoseSnapshotForModel(p,2,1),false)
 assert.equal(selectCharacterArtwork(m,{...p,sourceModelSlot:2},1),null)
 assert.equal(selectCharacterArtwork(m,{...p,slot:2},1),null)
 assert.equal(selectCharacterArtwork(m,null,1),null)
})
test('auditoria mostra anexos órfãos sem apagar roupas ou snapshot antigo',()=>{
 const m=model();const p=pose(m)
 const original=structuredClone(p)
 const o=outfit();o.components.push({...o.components[0],id:'scarf',attachedPartId:'missing'})
 const result=auditCharacterContinuity(m,p,[o])
 assert.deepEqual(result.missingAttachments,['scarf'])
 assert.deepEqual(p,original)
})
test('Customizador e Studio usam a barreira de continuidade compartilhada',async()=>{
 const [artworkSource,studio,page,initialPreview,selection]=await Promise.all([
  readFile('src/renderer/src/features/customizer/customizerArtworkSource.ts','utf8'),
  readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerInitialArtworkPreview.ts','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerCharacterSourceSelection.ts','utf8')
 ])
 assert.match(artworkSource,/selectCharacterArtwork\(sourceProject, pose, poseSlot\)/)
 assert.match(studio,/isPoseSnapshotForModel\(artwork, pose.sourceModelSlot, pose.slot\)/)
 assert.match(page,/useCustomizerInitialArtworkPreview\(/)
 assert.match(initialPreview,/prepareCustomizerArtworkPreview\(/)
 assert.match(selection,/prepareCustomizerArtworkPreview\(/)
})
test('hidratação de roupas tem dono próprio e protege alterações feitas durante a leitura',async()=>{
 const [page,hydration]=await Promise.all([
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerWardrobeHydration.ts','utf8')
 ])
 assert.match(page,/useCustomizerWardrobeHydration\(/)
 assert.match(hydration,/loadWardrobeSet\(group\.modelSlot, group\.setId\)/)
 assert.match(hydration,/window\.confirm\(/,'links só são removidos depois de confirmação explícita')
 assert.match(hydration,/JSON\.stringify\(current\.customization\.wardrobeGroups\) === JSON\.stringify\(groupsToRestore\)/,'migração não sobrescreve roupas editadas durante o carregamento')
})
test('preview inicial restaura modelo/pose e cede a requisição para seleção manual mais recente',async()=>{
 const [page,initialPreview,manualSelection]=await Promise.all([
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerInitialArtworkPreview.ts','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerCharacterSourceSelection.ts','utf8')
 ])
 assert.match(page,/useCustomizerInitialArtworkPreview\(/)
 assert.match(initialPreview,/item\?\.sourceModelSlot === model\.slot && item\.slot === requestedPose/)
 assert.match(initialPreview,/onSourceResolved:/,'a fonte chega aos previews conectados antes da renderização terminar')
 assert.match(initialPreview,/previewLoadRequest\.current === requestId/)
 assert.match(manualSelection,/const requestId = \+\+previewLoadRequest\.current/)
})
test('catálogos faciais ficam isolados e mantêm carregamento legado e cancelamento',async()=>{
 const [page,catalog]=await Promise.all([
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/customizer/useCustomizerFaceCatalog.ts','utf8')
 ])
 assert.match(page,/useCustomizerFaceCatalog\(/)
 assert.match(catalog,/window\.desktop\.fabricator\.listFaceCatalog\(selectedModelSlot\)/)
 assert.match(catalog,/window\.desktop\.fabricator\.listFaceComponentAssets\(selectedModelSlot\)/)
 assert.match(catalog,/loadStandardExpressionEffects\(selectedModelSlot\)/)
 assert.match(catalog,/if \(faceDetails\[key\]\) return/,'detalhes legados já carregados não são buscados novamente')
 assert.match(catalog,/if \(cancelled\) return/,'respostas antigas não atualizam o catálogo após a troca de modelo')
 assert.match(catalog,/!cancelled && activeModule === 'Cabeça'/,'erros de rostos continuam relevantes apenas na área facial')
})
test('controles de aparência ficam em Modelos e as prévias compartilham as cores do modelo base',async()=>{
 const consumers=[
  'src/renderer/src/features/fabricator/PoseWorkspace.tsx',
  'src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx',
  'src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx',
  'src/renderer/src/features/fabricator/face/HeadExtrasWorkspace.tsx',
  'src/renderer/src/features/fabricator/HairWorkspace.tsx',
  'src/renderer/src/features/fabricator/AnimatorWorkspace.tsx',
  'src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx',
  'src/renderer/src/features/fabricator/FaceAnimatorWorkspace.tsx'
 ]
 const [page,modelWorkspace,appearance,context,...workspaces]=await Promise.all([
  readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx','utf8'),
  readFile('src/renderer/src/features/fabricator/FabricatorModelWorkspace.tsx','utf8'),
  readFile('src/renderer/src/features/fabricator/useFabricatorModelAppearance.ts','utf8'),
  readFile('src/renderer/src/features/fabricator/ModelAppearanceContext.tsx','utf8'),
  ...consumers.map(path=>readFile(path,'utf8'))
 ])
 assert.match(page,/useFabricatorModelAppearance\(/)
 assert.match(page,/<FabricatorModelWorkspace\b/)
 assert.equal((modelWorkspace.match(/<ModelSkinTonePicker\b/g) ?? []).length,1,'os controles de pele e contorno aparecem uma vez, no editor de Modelos')
 assert.doesNotMatch(page+modelWorkspace,/fabricator-shared-appearance|scheduleExternalAppearanceSave/,'as áreas secundárias não exibem nem salvam controles de aparência')
 assert.match(page,/ModelAppearanceProvider slot=\{appearanceProject\?\.slot/)
 assert.match(appearance,/loadFabricatorSlot\(visibleAppearanceSlot\)/,'as outras áreas continuam lendo o modelo selecionado para as prévias')
 assert.match(appearance,/appearanceLoadError/)
 assert.doesNotMatch(appearance,/saveFabricatorProject|registerPendingWriteFlusher|appearanceSaveQueue/,'o hook de prévia não grava alterações de modelo')
 assert.match(context,/useModelAppearanceTarget/)
 for(const workspace of workspaces) assert.match(workspace,/useModelAppearanceTarget\(/)
})
test('preview unificado preserva identidade do modelo/pose, cores da personagem e cache do modelo',async()=>{
 const loadedSource={status:'ready',sourceProject:{slot:5,modelSkinTone:'#dba47d',modelOutlineColor:'#352522'},artwork:{width:200,height:300}}
 const cachedModel={slot:5,name:'Modelo em cache'}
 const proportions={scale:1.2,head:1,headWidth:1,headHeight:1,width:1,height:1}
 const bodyDimensions={}
 const extent={width:500,height:600,density:2}
 let loadedArgs
 let renderArgs
 let resolvedSource
 let sampled=0
 const result=await prepareCustomizerArtworkPreview({
  modelSlot:5,poseSlot:3,cachedModel,appearance:{modelSkinTone:'#c88961',modelOutlineColor:'#123456'},
  proportions,bodyDimensions,extent,zoom:1.5,onSourceResolved:source=>{resolvedSource=source}
 },{
  loadSource:async(...args)=>{loadedArgs=args;return loadedSource},
  sampleOriginalSkinTone:async()=>{sampled++;return '#ffccaa'},
  renderBasePreview:async(artwork,options)=>{renderArgs={artwork,options};return 'preview:data'}
 })
 assert.deepEqual(loadedArgs,[5,3,cachedModel])
 assert.equal(resolvedSource,loadedSource,'expõe modelo e arte antes de concluir o render do preview')
 assert.equal(sampled,0,'usa a cor base já salva no modelo sem recapturar o PNG')
 assert.equal(renderArgs.artwork,loadedSource.artwork)
 assert.equal(renderArgs.options.skinTone,'#c88961')
 assert.equal(renderArgs.options.outlineColor,'#123456')
 assert.equal(renderArgs.options.proportions,proportions)
 assert.equal(renderArgs.options.bodyDimensions,bodyDimensions)
 assert.equal(result.previewUrl,'preview:data')
})
test('preview unificado usa a pele base fixa e o contorno-fonte quando a personagem não tem cor própria',async()=>{
 const sourceProject={slot:2,modelSkinTone:undefined,modelOutlineColor:'#352522'}
 let options
 const result=await prepareCustomizerArtworkPreview({
  modelSlot:2,poseSlot:null,appearance:{modelOutlineColor:'inválida'},
  proportions:{},bodyDimensions:{},extent:{width:300,height:400,density:1},zoom:1
 },{
  loadSource:async()=>({status:'ready',sourceProject,artwork:{width:100,height:200}}),
  sampleOriginalSkinTone:async()=>MODEL_SKIN_BASE_TONE,
  renderBasePreview:async(_artwork,previewOptions)=>{options=previewOptions;return 'preview:data'}
 })
 assert.equal(options.skinTone,MODEL_SKIN_BASE_TONE)
 assert.equal(options.outlineColor,'#352522')
 assert.equal(result.status,'ready')
})
test('preview unificado não tenta renderizar uma pose inválida',async()=>{
 const result=await prepareCustomizerArtworkPreview({
  modelSlot:8,poseSlot:4,proportions:{},bodyDimensions:{},extent:{width:300,height:400,density:1},zoom:1
 },{
  loadSource:async()=>({status:'invalid-pose'}),
  sampleOriginalSkinTone:async()=>{throw new Error('não deve ler pele sem fonte válida')},
  renderBasePreview:async()=>{throw new Error('não deve renderizar pose inválida')}
 })
 assert.deepEqual(result,{status:'invalid-pose'})
})
