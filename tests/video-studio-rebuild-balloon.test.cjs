'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/src/features/videoStudioRebuild/balloonCanvas.ts'),'utf8')
const js=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
const mod={exports:{}}
new Function('module','exports',js)(mod,mod.exports)
const {createPreviewBalloonCanvas,previewBalloonKey}=mod.exports
test('authored speech and thought text rasterize on demand without encoding PNG',()=>{
  const calls=[]
  const ctx=new Proxy({}, {get(_,key){
    if(key==='measureText')return text=>({width:text.length*15})
    if(key==='fillText')return (...args)=>calls.push(args)
    return ()=>undefined
  },set(){return true}})
  const old=global.document
  global.document={createElement:name=>{assert.equal(name,'canvas');return{width:0,height:0,getContext:type=>{
    assert.equal(type,'2d');return ctx
  }}}}
  try{
    const bubble={kind:'speech',text:'Olá mundo '+('muito longo '.repeat(25)),speakerColor:'#ffeecc'}
    const canvas=createPreviewBalloonCanvas(bubble)
    assert.equal(canvas.width,512);assert.equal(canvas.height,256)
    assert.ok(calls.length>1,'long speech must wrap')
    assert.ok(calls.length<=6,'bounded text raster')
    const same={...bubble,x:20}
    assert.equal(previewBalloonKey(bubble),previewBalloonKey(same),'position changes only GPU geometry')
    assert.notEqual(previewBalloonKey(bubble),previewBalloonKey({...bubble,text:'outro'}))
    calls.length=0
    createPreviewBalloonCanvas({...bubble,kind:'thought',text:'pensando'})
    assert.equal(calls[0][0],'pensando')
    assert.throws(()=>createPreviewBalloonCanvas({...bubble,kind:'character'}),/Balão/)
  }finally{global.document=old}
})
