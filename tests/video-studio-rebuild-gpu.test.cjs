'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function setup(){
  const log={uploads:0,subUploads:0,draws:0,deleted:0,programs:0,lost:false}
  const gl=new Proxy({},{
    get(target,k) {
      const constants={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,
        STATIC_DRAW:6,BLEND:7,ONE:8,ONE_MINUS_SRC_ALPHA:9,FLOAT:10,TRIANGLE_STRIP:11,TEXTURE_2D:12,
        TEXTURE0:13,TEXTURE1:25,RGBA:14,UNSIGNED_BYTE:15,LINEAR:16,TEXTURE_MIN_FILTER:17,TEXTURE_MAG_FILTER:18,
        TEXTURE_WRAP_S:19,TEXTURE_WRAP_T:20,CLAMP_TO_EDGE:21,UNPACK_PREMULTIPLY_ALPHA_WEBGL:22,UNPACK_FLIP_Y_WEBGL:24,
        COLOR_BUFFER_BIT:23}
      if(Object.hasOwn(constants,k))return constants[k]
      if(k==='getShaderParameter'||k==='getProgramParameter')return()=>true
      if(k==='createProgram')return()=>{log.programs++;return {}}
      if(k==='createShader'||k==='createBuffer'||k==='createTexture')return()=>({})
      if(k==='getAttribLocation')return()=>0
      if(k==='getUniformLocation')return()=>({})
      if(k==='texImage2D')return()=>{log.uploads++}
      if(k==='texSubImage2D')return()=>{log.subUploads++}
      if(k==='drawArrays')return()=>{log.draws++}
      if(k==='deleteTexture')return()=>{log.deleted++}
      return()=>undefined
    }
  })
  const events=new Map()
  const canvas={width:960,height:540,
    getContext:(type)=>{assert.equal(type,'webgl2');return gl},
    addEventListener:(k,fn)=>events.set(k,fn),
    removeEventListener:(k)=>events.delete(k)}
  const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer/src/features/videoStudioRebuild/gachaGpuStage.ts'),'utf8')
  const js=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('module','exports','require',js)(mod,mod.exports,name=>{
    if(name==='../../../../shared/videoStageGeometry')return {videoStageRect:(x,y,w,h)=>({centerX:960+19.2*x,centerY:540+10.8*y,width:w*19.2,height:h*10.8})}
    throw Error('Unexpected '+name)
  })
  return {Stage:mod.exports.GachaGpuStage,canvas,log,events}
}
const sprite=(id,w=16,h=16,dynamic=false)=>({
  textureId:id,source:{width:w,height:h},dynamic,
  element:{x:0,y:0,width:30,height:30,rotation:0,flipX:false}
})

test('WebGL2 renders sprite layers with stable retained GPU textures and no PNG serialization',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,4096)
  // Decoded image objects are memoized in previewTransport; reuse the same
  // TexImageSource to model unchanged retained artwork across two frames.
  const body=sprite('body'),left=sprite('pupil-left'),right=sprite('pupil-right')
  stage.draw([body,left,right],'#122333')
  assert.equal(log.draws,3)
  assert.equal(log.uploads,3)
  stage.draw([body,left])
  assert.equal(log.draws,5)
  assert.equal(log.uploads,3)
  assert.equal(stage.stats().textureCount,3)
  stage.dispose()
  assert.equal(log.deleted,3)
})

test('GPU byte budget evicts least-recently-used source and video updates in same texture',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,2048)
  stage.draw([sprite('head'),sprite('eyes')])
  stage.draw([sprite('head')])
  stage.draw([sprite('mouth')])
  assert.ok(stage.stats().retainedEstimatedBytes<=2048)
  const video=sprite('video',8,8,true)
  const uploadedBefore=log.uploads
  stage.draw([video])
  stage.draw([video])
  assert.equal(log.uploads,uploadedBefore+1,'first video frame allocates once')
  assert.equal(log.subUploads,1,'subsequent video frame only changes pixels')
  assert.equal(stage.stats().textureCount<=2,true)
  assert.throws(()=>stage.draw([sprite('huge',200,200)]),/orçamento/)
  stage.dispose()
})

test('GPU context loss clears leases and restore permits rebuilding textures',()=>{
  const {Stage,canvas,events,log}=setup(),stage=new Stage(canvas,4096)
  stage.draw([sprite('one')])
  events.get('webglcontextlost')({preventDefault(){}})
  assert.equal(stage.stats().retainedEstimatedBytes,0)
  stage.draw([sprite('ignored')])
  events.get('webglcontextrestored')()
  stage.draw([sprite('restored')])
  assert.equal(stage.stats().textureCount,1)
  assert.equal(stage.stats().contextLost,false)
  assert.equal(log.programs,2,'GPU shaders and buffers must be recreated after context recovery')
  stage.dispose()
})

test('revised eye replaces just its GPU texture; stable body remains resident',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,4096)
  const body={width:16,height:16},oldEye={width:16,height:16},newEye={width:8,height:8}
  const layer=(id,source)=>({textureId:id,source,element:{x:0,y:0,width:30,height:30,rotation:0,flipX:false}})
  stage.draw([layer('body',body),layer('eye-left',oldEye)])
  stage.draw([layer('body',body),layer('eye-left',oldEye)])
  assert.equal(log.uploads,2)
  stage.draw([layer('body',body),layer('eye-left',newEye)])
  assert.equal(log.uploads,3)
  assert.equal(log.deleted,1)
  assert.equal(stage.stats().retainedEstimatedBytes,16*16*4+8*8*4)
  stage.dispose()
  assert.equal(log.deleted,3)
})

test('GPU cache uses weak source identities rather than retaining decoded HTML images',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer/src/features/videoStudioRebuild/gachaGpuStage.ts'),'utf8')
  assert.match(source,/sourceIds\s*=\s*new WeakMap<object,\s*number>\(\)/)
  assert.doesNotMatch(source,/type CachedTexture\s*=\s*\{[^\n]*source:\s*TexImageSource/)
})

test('GPU reallocates a video only when its native resolution changes',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,4096)
  const video=sprite('video',8,8,true)
  stage.draw([video])
  assert.equal(stage.stats().retainedEstimatedBytes,8*8*4)
  video.source.width=16
  stage.draw([video])
  assert.equal(stage.stats().retainedEstimatedBytes,16*8*4)
  assert.equal(log.deleted,1)
  assert.equal(log.uploads,2)
  assert.equal(log.subUploads,0)
  stage.draw([video])
  assert.equal(log.subUploads,1)
  stage.dispose()
})

test('DOM image top must face screen top; explicit unflipped upload also applies to video',()=>{
  const file=fs.readFileSync(path.resolve(__dirname,'../src/renderer/src/features/videoStudioRebuild/gachaGpuStage.ts'),'utf8')
  assert.match(file,/v_uv=vec2\(\(a_pos\.x\+\.5\)\*u_flip\+\(u_flip<0\.0\?1\.0:0\.0\),\.5\+a_pos\.y\)/)
  assert.match(file,/pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL,false\)/)
  const {Stage,canvas}=setup(),stage=new Stage(canvas,4096)
  stage.draw([sprite('top-red-bottom-blue')])
  stage.draw([sprite('video',8,8,true)])
  stage.dispose()
})

test('independent left/right PT masks own persistent GPU textures and preserve body upload',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,8192)
  const body=sprite('body')
  const left=sprite('pupil-left'),right=sprite('pupil-right')
  left.mask={textureId:'mask-left',source:{width:16,height:16}}
  right.mask={textureId:'mask-right',source:{width:16,height:16}}
  stage.draw([body,left,right])
  assert.equal(log.uploads,5)
  stage.draw([body,left,right])
  assert.equal(log.uploads,5,'masks/pupils must not reupload on stable facial state')
  right.mask={textureId:'mask-right',source:{width:8,height:8}}
  stage.draw([body,left,right])
  assert.equal(log.uploads,6,'changing right mask alone uploads one texture')
  assert.equal(log.deleted,1)
  assert.equal(stage.stats().textureCount,5)
  stage.dispose()
})

test('GPU budget cannot evict a sprite still bound for the same rendered frame',()=>{
  const {Stage,canvas,log}=setup(),stage=new Stage(canvas,1024)
  const base=sprite('face',16,16)
  base.mask={textureId:'mask',source:{width:16,height:16}}
  assert.throws(()=>stage.draw([base]),/simultâneas acima do orçamento/)
  assert.equal(log.deleted,0,'not allowed to silently evict an in-flight face texture')
  stage.dispose()
})
