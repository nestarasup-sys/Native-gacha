'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function loadFile(name){
  const content=fs.readFileSync(path.join(__dirname,'../electron/domains/fabricator',name),'utf8')
  const js=ts.transpile(content,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const module={exports:{}}
  const injected=name=>name.includes('keyedOperationQueue.ts')?loadFile('../storage/keyedOperationQueue.ts'):name.includes('fabricatorIpcChannels')?{fabricatorIpcChannels:{"listFabricatorPoseSlots":"fabricator:poses:list","getFabricatorExportPoseSlots":"fabricator:poses:export-slots:get","saveFabricatorExportPoseSlots":"fabricator:poses:export-slots:save","loadFabricatorPose":"fabricator:poses:load","saveFabricatorPose":"fabricator:poses:save","deleteFabricatorPose":"fabricator:poses:delete","loadFabricatorPoseDraft":"fabricator:poses:draft:load","saveFabricatorPoseDraft":"fabricator:poses:draft:save","deleteFabricatorPoseDraft":"fabricator:poses:draft:delete","listAnimatorModelSlots":"fabricator:animator:model-slots","listAnimatorAnimations":"fabricator:animator:list","loadAnimatorAnimation":"fabricator:animator:load","saveAnimatorAnimation":"fabricator:animator:save","deleteAnimatorAnimation":"fabricator:animator:delete","loadAnimatorDraft":"fabricator:animator:draft:load","saveAnimatorDraft":"fabricator:animator:draft:save","deleteAnimatorDraft":"fabricator:animator:draft:delete"}}:name.includes('poseReferences.ts')?{assertPoseHasNoReferences:()=>undefined}:name.includes('shared/fabricator')?{resolvePoseCategory:doc=>doc.category??'normal'}:require(name)
  new Function('require','exports','module',js)(injected,module.exports,module)
  return module.exports
}
test('canais IPC de Poses DEV preservam nomes e bloqueiam origem externa antes de acessar dados',async()=>{
 const handlers=new Map()
 const register=loadFile('poseIpc.ts').registerFabricatorPoseHandlers
 const forbid=()=>{throw new Error('Sender não confiável')}
 register({
  ipcMain:{handle:(key,fn)=>handlers.set(key,fn)}, assertTrustedSender:forbid,
  ensureLegacyPoseMigration:async()=>{},isValidModelSlot:()=>true,isValidPoseSlot:()=>true,
  slotCount:10,poseSlotCount:12,poseSlotPath:()=>'',poseModelPath:()=>'',poseDraftPath:()=>'',
  queuePoseWrite:async fn=>fn(),readPoseProject:async()=>null,writePoseProject:async()=>{},
  coordinatePoseReferenceChange:async operation=>operation(),withPoseReferenceSnapshot:async operation=>operation([]),
  readPoseDraft:async()=>null,writePoseDraft:async()=>{},
  files:{readFile:async()=>'',writeFile:async()=>{},mkdir:async()=>{},rename:async()=>{},rm:async()=>{}}
 })
 assert.equal(handlers.size,9)
 assert.ok(handlers.has('fabricator:poses:save'))
 assert.ok(handlers.has('fabricator:poses:draft:load'))
 await assert.rejects(handlers.get('fabricator:poses:save')({},1,1,{},[]),/não confiável/)
})
test('canais IPC do Animador DEV mantêm fila independente e autenticada',async()=>{
 const handlers=new Map()
 const register=loadFile('animatorIpc.ts').registerFabricatorAnimatorHandlers
 const events=[]
 let listReads=0
 let releaseFirst,markFirstStarted
 let failModelThree=true
 const firstGate=new Promise(resolve=>{releaseFirst=resolve})
 const firstStarted=new Promise(resolve=>{markFirstStarted=resolve})
 const api=register({
  ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},assertTrustedSender:e=>{if(!e.trusted)throw Error('Bloqueado')},
  isValidModelSlot:()=>true,isValidAnimatorSlot:()=>true,poseSlotCount:12,
  animatorLibraryPath:()=>'',animatorModelPath:model=>`model-${model}`,animatorSlotPath:(model,slot)=>`model-${model}/slot-${slot}`,animatorDraftPath:model=>`model-${model}/draft`,
  readAnimatorAnimation:async()=>null,writeAnimatorAnimation:async(model,slot)=>{
   events.push(`${model}:${slot}:start`)
   if(model===1&&slot===1){markFirstStarted();await firstGate}
   if(model===3&&failModelThree){failModelThree=false;throw Error('Falha de persistência sintética')}
   events.push(`${model}:${slot}:end`)
  },
  readAnimatorDraft:async()=>null,writeAnimatorDraft:async()=>{},
  files:{readFile:async()=>{listReads++;return ''},readdir:async()=>[],rm:async()=>{}}
 })
 assert.equal(handlers.size,8)
 await assert.rejects(handlers.get('fabricator:animator:save')({trusted:false},1,1,{},[]),/Bloqueado/)
 const first=handlers.get('fabricator:animator:save')({trusted:true},1,1,{},[])
 await firstStarted
 const sameModel=handlers.get('fabricator:animator:save')({trusted:true},1,2,{},[])
 const anotherModel=handlers.get('fabricator:animator:save')({trusted:true},2,1,{},[])
 const listing=handlers.get('fabricator:animator:list')({trusted:true},1)
 assert.equal(api.getPendingWrites().length,2)
 await anotherModel
 assert.deepEqual(events,['1:1:start','2:1:start','2:1:end'])
 assert.equal(listReads,0,'a listagem do mesmo modelo aguarda a gravação ativa')
 releaseFirst()
 await Promise.all([first,sameModel,listing])
 assert.deepEqual(events,['1:1:start','2:1:start','2:1:end','1:1:end','1:2:start','1:2:end'])
 assert.equal(listReads,12)
 await Promise.resolve()
 assert.deepEqual(api.getPendingWrites(),[])
 await assert.rejects(handlers.get('fabricator:animator:save')({trusted:true},3,1,{},[]),/Falha de persistência sintética/)
 await assert.rejects(Promise.all(api.getPendingWrites()),/Falha de persistência sintética/)
 await handlers.get('fabricator:animator:save')({trusted:true},3,1,{},[])
 await new Promise(resolve=>setImmediate(resolve))
 assert.deepEqual(api.getPendingWrites(),[])
})
