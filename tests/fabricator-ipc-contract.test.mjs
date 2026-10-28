import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fabricatorIpcChannels, createFabricatorInvoker } from '../src/shared/fabricatorIpcChannels.ts'

async function typescriptFiles(folder) {
 const entries=await readdir(folder,{withFileTypes:true})
 const nested=await Promise.all(entries.map(entry=>{
  const path=resolve(folder,entry.name)
  return entry.isDirectory()?typescriptFiles(path):entry.isFile()&&entry.name.endsWith('.ts')?[path]:[]
 }))
 return nested.flat()
}

test('canais IPC tipados não são duplicados e mantêm compatibilidade legada',()=>{
 const values=Object.values(fabricatorIpcChannels)
 assert.equal(new Set(values).size,values.length)
 assert.ok(values.length>=35)
 assert.equal(fabricatorIpcChannels.listWardrobeSetsDetailed,'fabricator:wardrobe:list-detailed')
 assert.equal(fabricatorIpcChannels.saveFabricatorPose,'fabricator:poses:save')
 assert.equal(fabricatorIpcChannels.saveAnimatorAnimation,'fabricator:animator:save')
 assert.equal(fabricatorIpcChannels.publishFabricatorModelSource,'fabricator:model-source:publish')
})
test('invocação tipada preserva ordem dos argumentos e resultado assíncrono',async()=>{
 const calls=[]
 const invoker=createFabricatorInvoker({invoke:async (channel,...args)=>{calls.push([channel,...args]);return {slot:1}}})
 const result=await invoker('loadFabricatorPose',1,2)
 assert.deepEqual(calls,[['fabricator:poses:load',1,2]])
 assert.deepEqual(result,{slot:1})
})
test('main e preload usam mapa central para canais da biblioteca Fabricador',async()=>{
 const root=resolve('.')
 const files=['electron/preload.ts','electron/main.ts',...await typescriptFiles(resolve(root,'electron/domains/fabricator'))]
 const sources=await Promise.all(files.map(f=>readFile(resolve(root,f),'utf8')))
 const joined=sources.join('\n')
 for(const key of Object.keys(fabricatorIpcChannels)){
  assert.match(joined,new RegExp('(?:fabricatorIpcChannels\\.'+key+'|invokeFabricator\\(\\x27'+key+'\\x27\\))'),key+' está fora do contrato')
 }
})
