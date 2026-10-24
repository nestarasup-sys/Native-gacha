'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const {EventEmitter}=require('node:events')
const load=file=>ts.transpile(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
})

test('independent media utility exposes rational AV frames and real cancel/seek semantics',()=>{
  let onMessage,clock=0n
  const messages=[]
  const processStub={
    parentPort:{on:(type,fn)=>{assert.equal(type,'message');onMessage=fn},postMessage:(data)=>messages.push(data)},
    hrtime:{bigint:()=>clock}
  }
  new Function('process','exports',load('electron/videoStudioRebuild/mediaUtility.ts'))(processStub,{})
  const send=(id,op,extra={})=>{
    onMessage({data:{id,op,sessionId:'scene-1',...extra}})
    return messages.at(-1)
  }
  assert.equal(send(1,'sync',{frame:600,playing:true}).result.frame,600)
  clock=1500000000n
  assert.equal(send(2,'status').result.frame,690)
  assert.equal(send(3,'cancel').result.playing,false)
  clock=9000000000n
  assert.equal(send(4,'status').result.frame,690)
  assert.equal(send(5,'seek',{frame:50}).result.frame,50)
  assert.equal(send(6,'sync',{frame:80,audioFrame:120,playing:true}).result.audioMaster,true)
  assert.equal(send(7,'close').result.frame,0)
  assert.equal(send(8,'seek',{frame:-1}).ok,false)
})

test('media supervisor owns a subprocess, validates IPC, rejects on death and starts fresh',async()=>{
  let spawned=0,killCount=0,child=null
  class FakeChild extends EventEmitter {
    killed=false
    postMessage(message){
      if(message.op==='status')this.emit('message',{id:message.id,ok:true,result:{frame:140,playing:false,audioMaster:false}})
    }
    kill(){this.killed=true;killCount++}
  }
  const electron={
    utilityProcess:{fork:(file,args,options)=>{
      spawned++
      assert.ok(file.endsWith('media-engine-worker.js'))
      assert.equal(options.serviceName,'Gacha Video AV Clock')
      child=new FakeChild()
      return child
    }},
    app:{on(){}}
  }
  const mod={exports:{}}
  new Function('require','module','exports','__dirname',load('electron/videoStudioRebuild/mediaSupervisor.ts'))(
    name=>{if(name==='electron')return electron;if(name==='node:path')return require('node:path');throw Error(name)},
    mod,mod.exports,'C:\\fake\\out\\main'
  )
  const supervisor=new mod.exports.VideoMediaEngineSupervisor()
  assert.deepEqual(await supervisor.call({op:'status',sessionId:'example'}),{frame:140,playing:false,audioMaster:false})
  await assert.rejects(supervisor.call({op:'seek',sessionId:'example',frame:-15}),/Contrato AV/)
  const pending=supervisor.call({op:'seek',sessionId:'example',frame:20})
  child.emit('exit',9)
  await assert.rejects(pending,/Processo de mídia terminou/)
  assert.equal((await supervisor.call({op:'status',sessionId:'example'})).frame,140)
  assert.equal(spawned,2)
  supervisor.dispose()
  assert.equal(killCount,1)
  await assert.rejects(supervisor.call({op:'status',sessionId:'example'}),/descartado/)
})
