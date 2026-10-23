'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const ts=require('typescript')

function load(deps={}){
  const source=fs.readFileSync(path.resolve(__dirname,'../electron/videoPreviewProxyStore.ts'),'utf8')
  const compiled=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('require','module','exports',compiled)((name)=>name in deps?deps[name]:require(name),mod,mod.exports)
  return mod.exports
}

test('preview proxy store keys derivatives by source SHA and reuses them warm',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-'))
  const source=path.join(root,'source.mp4')
  fs.writeFileSync(source,Buffer.alloc(8192,3))
  let calls=0
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      calls++
      const out=args.at(-1)
      if(args.some(value=>value.includes('showwavespic=s=1200x120:colors=white'))) fs.writeFileSync(out,Buffer.alloc(256,4))
      else fs.writeFileSync(out,Buffer.alloc(2048,5))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'))
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const first=await store.ensure({sourcePath:source,ffmpeg})
    assert.equal(first.proxyFilename,'preview.mp4')
    assert.equal(first.waveformFilename,'waveform.png')
    const firstCalls=calls
    const second=await store.ensure({sourcePath:source,ffmpeg})
    assert.deepEqual(second,first)
    assert.equal(calls,firstCalls,'warm proxy does not invoke FFmpeg again')
    assert.equal(await store.resolveFile(first.sourceSha256,'proxy'),path.join(root,'cache',first.sourceSha256.slice(0,2),first.sourceSha256,'preview.mp4'))
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})


test('corrupt cached proxy is removed and regenerated instead of being re-adopted',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-corrupt-'))
  const source=path.join(root,'source.mp4')
  fs.writeFileSync(source,Buffer.alloc(8192,7))
  let calls=0
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      calls++
      const out=args.at(-1)
      if(args.some(value=>value.includes('showwavespic=s=1200x120:colors=white'))) fs.writeFileSync(out,Buffer.alloc(256,9))
      else fs.writeFileSync(out,Buffer.alloc(2048,11))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'))
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const first=await store.ensure({sourcePath:source,ffmpeg})
    const proxy=await store.resolveFile(first.sourceSha256,'proxy')
    fs.writeFileSync(proxy,Buffer.alloc(333,1))
    assert.equal(await store.read(first.sourceSha256),null)

    const callsBefore=calls
    const repaired=await store.ensure({sourcePath:source,ffmpeg})
    assert.ok(calls>callsBefore,'corruption triggers FFmpeg regeneration')
    assert.equal(repaired.proxyBytes,2048)
    assert.equal(fs.statSync(await store.resolveFile(first.sourceSha256,'proxy')).size,2048)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})


test('proxy cache quota evicts older derivatives while preserving the freshly generated item',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-quota-'))
  const sourceA=path.join(root,'a.mp4')
  const sourceB=path.join(root,'b.mp4')
  fs.writeFileSync(sourceA,Buffer.alloc(8192,1))
  fs.writeFileSync(sourceB,Buffer.alloc(8192,2))
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      const out=args.at(-1)
      if(args.some(value=>value.includes('showwavespic=s=1200x120:colors=white'))) fs.writeFileSync(out,Buffer.alloc(256,4))
      else fs.writeFileSync(out,Buffer.alloc(2048,5))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'),4000)
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const first=await store.ensure({sourcePath:sourceA,ffmpeg})
    await new Promise(resolve=>setTimeout(resolve,5))
    const second=await store.ensure({sourcePath:sourceB,ffmpeg})
    assert.equal(await store.read(first.sourceSha256),null,'old derivative is evicted once quota is exceeded')
    assert.ok(await store.read(second.sourceSha256),'freshly generated derivative remains available')
    const pruned=await store.prune(second.sourceSha256)
    assert.ok(pruned.bytes<=4000)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})


test('concurrent ensure calls for the same source share one FFmpeg generation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-concurrent-'))
  const source=path.join(root,'source.mp4')
  fs.writeFileSync(source,Buffer.alloc(8192,6))
  let calls=0
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      calls++
      await new Promise(resolve=>setTimeout(resolve,15))
      const out=args.at(-1)
      if(args.includes('showwavespic=s=1200x120:colors=white')) fs.writeFileSync(out,Buffer.alloc(256,4))
      else fs.writeFileSync(out,Buffer.alloc(2048,5))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'))
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const [a,b,c]=await Promise.all([
      store.ensure({sourcePath:source,ffmpeg}),
      store.ensure({sourcePath:source,ffmpeg}),
      store.ensure({sourcePath:source,ffmpeg}),
    ])
    assert.deepEqual(a,b)
    assert.deepEqual(b,c)
    assert.equal(calls,2,'one proxy encode plus one waveform generation is shared across callers')
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})

test('pruning one proxy never deletes another proxy while its generation is in flight',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-parallel-sources-'))
  const sourceA=path.join(root,'a.mp4')
  const sourceB=path.join(root,'b.mp4')
  fs.writeFileSync(sourceA,Buffer.alloc(8192,21))
  fs.writeFileSync(sourceB,Buffer.alloc(8192,22))
  let releaseB
  let signalBStarted
  const waitForB=new Promise(resolve=>{signalBStarted=resolve})
  const holdB=new Promise(resolve=>{releaseB=resolve})
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      const source=args[args.indexOf('-i')+1]
      const waveform=args.includes('showwavespic=s=1200x120:colors=white')
      if(source===sourceB&&!waveform){signalBStarted();await holdB}
      const out=args.at(-1)
      fs.writeFileSync(out,Buffer.alloc(waveform?256:2048,waveform?31:32))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'))
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const inFlightB=store.ensure({sourcePath:sourceB,ffmpeg})
    await waitForB
    const firstA=await store.ensure({sourcePath:sourceA,ffmpeg})
    releaseB()
    const secondB=await inFlightB
    assert.ok(await store.read(firstA.sourceSha256),'first completed proxy remains available')
    assert.ok(await store.read(secondB.sourceSha256),'pruning the first proxy leaves the other active generation intact')
    assert.equal(fs.statSync(await store.resolveFile(secondB.sourceSha256,'proxy')).size,2048)
  }finally{releaseB();fs.rmSync(root,{recursive:true,force:true})}
})

test('waveform command maps the filtered audio visualization to a PNG video output',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gv5-proxy-waveform-'))
  const source=path.join(root,'source.mp4')
  fs.writeFileSync(source,Buffer.alloc(8192,41))
  let waveformArgs=null
  const mod=load({'./videoFfmpegCapabilities':{
    runVideoStudioProcess:async(_exe,args)=>{
      const out=args.at(-1)
      if(args.some(value=>value.includes('showwavespic=s=1200x120:colors=white'))){
        waveformArgs=args
        fs.writeFileSync(out,Buffer.alloc(256,42))
      }else fs.writeFileSync(out,Buffer.alloc(2048,43))
      return {code:0,stdout:'',stderr:''}
    }
  }})
  const store=new mod.VideoPreviewProxyStore(path.join(root,'cache'))
  const ffmpeg={executable:path.resolve(process.execPath),videoEncoder:'h264_mf',smokeEncoded:true}
  try{
    const record=await store.ensure({sourcePath:source,ffmpeg})
    assert.equal(record.waveformFilename,'waveform.png')
    assert.ok(waveformArgs)
    const filter=waveformArgs[waveformArgs.indexOf('-filter_complex')+1]
    assert.equal(filter,'[0:a:0]aformat=channel_layouts=mono,showwavespic=s=1200x120:colors=white[wave]')
    assert.equal(waveformArgs[waveformArgs.indexOf('-map')+1],'[wave]')
    assert.equal(waveformArgs.includes('0:a:0?'),false,'the source audio stream is consumed by the visualization filter, not sent to PNG')
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})
