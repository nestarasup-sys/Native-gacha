'use strict'

const { app, BrowserWindow } = require('electron')
const { execFileSync, spawnSync } = require('node:child_process')
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { resolveEditorV6TestVideoToolsDirectory } = require('./testVideoTools.cjs')

const root = resolve(__dirname, '../..')
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
const ffmpeg = join(videoTools, 'ffmpeg.exe')
const ffprobe = join(videoTools, 'ffprobe.exe')

function positiveInteger(name, fallback, maximum) {
  const raw = process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw Error(`--${name} precisa ser inteiro entre 1 e ${maximum}.`)
  return value
}

const frames = positiveInteger('frames', 150, 900)
const width = positiveInteger('width', 1920, 1920)
const height = positiveInteger('height', 1080, 1080)

function syntheticRenderScript() {
  return `(() => {
    const width=${width}, height=${height}, frames=${frames}
    if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined') return {supported:false,reason:'WebCodecs VideoEncoder/VideoFrame não está exposto neste renderer',userAgent:navigator.userAgent,secureContext:isSecureContext}
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height
    const context=canvas.getContext('2d',{alpha:false,desynchronized:true})
    if(!context) throw Error('Canvas 2D não disponível')
    const chunks=[]; let outputBytes=0, queuePeak=0, firstOutputAt=0
    const encoder=new VideoEncoder({
      output(chunk){
        if(!firstOutputAt) firstOutputAt=performance.now()
        const bytes=new Uint8Array(chunk.byteLength); chunk.copyTo(bytes)
        chunks.push(bytes); outputBytes+=bytes.byteLength
      },
      error(error){ throw error }
    })
    const config={codec:'avc1.640029',width,height,bitrate:12000000,framerate:30,hardwareAcceleration:'prefer-hardware',latencyMode:'quality',avc:{format:'annexb'}}
    return (async()=>{ try {
      const support=await VideoEncoder.isConfigSupported(config)
      if(!support.supported) return {supported:false,reason:'H.264 1080p não suportado',userAgent:navigator.userAgent}
      encoder.configure(support.config)
      const start=performance.now(), frameDuration=Math.round(1000000/30)
      for(let frame=0;frame<frames;frame++){
        const phase=frame/30
        context.fillStyle='#111827'; context.fillRect(0,0,width,height)
        context.fillStyle='#292742'; context.fillRect(width*.08,height*.1,width*.84,height*.8)
        context.fillStyle='#523747'; context.beginPath(); context.ellipse(width*.5,height*.71,width*.13,height*.22,0,0,Math.PI*2); context.fill()
        context.fillStyle='#f1c3a3'; context.beginPath(); context.ellipse(width*.5,height*.43,width*.105,height*.19,0,0,Math.PI*2); context.fill()
        context.fillStyle='#4c3159'; context.beginPath(); context.moveTo(width*.38,height*.43); context.bezierCurveTo(width*.37,height*.16,width*.63,height*.17,width*.62,height*.46); context.lineTo(width*.57,height*.38+Math.sin(phase*3)*height*.012); context.lineTo(width*.53,height*.51); context.lineTo(width*.49,height*.37); context.lineTo(width*.44,height*.51); context.closePath(); context.fill()
        context.fillStyle='#282034'; context.fillRect(width*.455,height*.435,width*.018,height*.009); context.fillRect(width*.527,height*.435,width*.018,height*.009)
        context.fillStyle='#cc728a'; context.fillRect(width*.487,height*.49,width*.026,height*.008)
        const videoFrame=new VideoFrame(canvas,{timestamp:frame*frameDuration,duration:frameDuration})
        encoder.encode(videoFrame,{keyFrame:frame%60===0}); videoFrame.close()
        queuePeak=Math.max(queuePeak,encoder.encodeQueueSize)
        if(encoder.encodeQueueSize>4) await new Promise(resolve=>encoder.addEventListener('dequeue',resolve,{once:true}))
      }
      await encoder.flush(); encoder.close()
      const elapsedMs=performance.now()-start, output=new Uint8Array(outputBytes); let offset=0
      for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength}
      let binary=''; const stride=0x8000
      for(let index=0;index<output.length;index+=stride) binary+=String.fromCharCode(...output.subarray(index,index+stride))
      return {supported:true,config:support.config,frames,width,height,elapsedMs,firstOutputDelayMs:firstOutputAt?firstOutputAt-start:null,outputBytes,queuePeak,userAgent:navigator.userAgent,h264Base64:btoa(binary)}
    } catch(error) { try { encoder.close() } catch {} return {supported:false,reason:String(error),stack:error?.stack,userAgent:navigator.userAgent} }
    })()
  })()`
}

async function main() {
  const scratch = process.argv.find((value) => value.startsWith('--scratch='))?.slice('--scratch='.length)
  if (!scratch) throw Error('O perfil temporário precisa ser criado pelo processo supervisor.')
  app.setPath('userData', join(scratch, 'profile'))
  app.on('window-all-closed', () => {})
  let window
  try {
    await app.whenReady()
    window = new BrowserWindow({ show: false, width: 16, height: 16, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
    const html = join(scratch, 'worker.html')
    await writeFile(html, '<!doctype html><meta charset="utf-8"><title>WebCodecs benchmark</title>', { flag: 'wx' })
    await window.loadFile(html)
    const result = await window.webContents.executeJavaScript(syntheticRenderScript(), true)
    if (!result.supported) throw Error(JSON.stringify(result))
    const bitstream = Buffer.from(result.h264Base64, 'base64')
    const input = join(scratch, 'synthetic.h264'), output = join(scratch, 'synthetic.mp4')
    await writeFile(input, bitstream, { flag: 'wx' })
    execFileSync(ffmpeg, ['-v','error','-y','-fflags','+genpts','-r','30','-f','h264','-i',input,'-c:v','copy','-movflags','+faststart',output], { windowsHide: true, timeout: 120000 })
    const probe = JSON.parse(execFileSync(ffprobe, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',output], { windowsHide: true, timeout: 30000 }).toString('utf8'))
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    if (!video || video.codec_name !== 'h264' || Number(video.width) !== width || Number(video.height) !== height || Number(video.nb_read_frames) !== frames) throw Error('O MP4 WebCodecs não passou a validação H.264/dimensão/contagem de quadros.')
    window.destroy()
    const { h264Base64: _discarded, ...summary } = result
    process.stdout.write(JSON.stringify({ ...summary, muxedMp4Bytes: (await readFile(output)).byteLength, mp4: { codec: video.codec_name, width: video.width, height: video.height, frames: Number(video.nb_read_frames), fps: video.r_frame_rate, duration: Number(video.duration) }, ffmpeg: ffmpeg, coldProfile: true }) + '\n')
  } finally {
    if (window && !window.isDestroyed()) window.destroy()
    app.quit()
  }
}

async function supervise() {
  const scratch = await mkdtemp(join(tmpdir(), 'editor-v6-webcodecs-'))
  try {
    const executable = require('electron')
    const child = spawnSync(executable, [__filename, ...process.argv.slice(2), `--scratch=${scratch}`], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 180000 })
    if (child.error) throw child.error
    if (child.status !== 0) throw Error(child.stderr || `Electron encerrou com código ${child.status}.`)
    process.stdout.write(child.stdout)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (process.versions.electron) main().catch((error) => { console.error(error); app.exit(1) })
else supervise().catch((error) => { console.error(error); process.exitCode = 1 })
