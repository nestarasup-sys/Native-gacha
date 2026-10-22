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
  const injected=name=>name.includes('shared/fabricator')?{resolvePoseCategory:doc=>doc.category??'normal'}:require(name)
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
 let queue=Promise.resolve(),ops=0
 register({
  ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},assertTrustedSender:e=>{if(!e.trusted)throw Error('Bloqueado')},
  isValidModelSlot:()=>true,isValidAnimatorSlot:()=>true,poseSlotCount:12,
  animatorLibraryPath:()=>'',animatorModelPath:()=>'',animatorSlotPath:()=>'',animatorDraftPath:()=>'',
  readAnimatorAnimation:async()=>null,writeAnimatorAnimation:async()=>{ops++},
  readAnimatorDraft:async()=>null,writeAnimatorDraft:async()=>{},
  getQueue:()=>queue,setQueue:value=>{queue=value},
  files:{readFile:async()=>'',readdir:async()=>[],rm:async()=>{}}
 })
 assert.equal(handlers.size,8)
 await assert.rejects(handlers.get('fabricator:animator:save')({trusted:false},1,1,{},[]),/Bloqueado/)
 await handlers.get('fabricator:animator:save')({trusted:true},1,1,{},[])
 assert.equal(ops,1)
 await queue
})
