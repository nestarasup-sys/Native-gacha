import test from 'node:test'
import assert from 'node:assert/strict'
import { broadcastModelSourceUpdate, subscribeModelSourceUpdate } from '../src/renderer/src/features/fabricator/models/modelSourceEvents.ts'

test('Model Source anuncia apenas o slot alterado e não atinge outros modelos',()=>{
  const bus=new EventTarget()
  const a=[],b=[]
  const unA=subscribeModelSourceUpdate(1, update=>a.push(update),bus)
  const unB=subscribeModelSourceUpdate(2, update=>b.push(update),bus)
  broadcastModelSourceUpdate({slot:1,sourceAssetName:'source-new.png'},bus)
  assert.deepEqual(a,[{slot:1,sourceAssetName:'source-new.png'}])
  assert.deepEqual(b,[])
  unA();unB()
  broadcastModelSourceUpdate({slot:1,sourceAssetName:'source-next.png'},bus)
  assert.equal(a.length,1)
})
test('Model Source rejeita slot inválido antes de emitir evento',()=>{
  const bus=new EventTarget();let count=0
  bus.addEventListener('fabricator:model-source:updated',()=>count++)
  assert.throws(()=>broadcastModelSourceUpdate({slot:0,sourceAssetName:'a'},bus),/Slot/)
  assert.equal(count,0)
})
