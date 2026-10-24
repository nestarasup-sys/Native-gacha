'use strict'
/**
 * Real GPU proof of the persistent-sprite prototype.
 * Never writes a project; uses only synthetic PNGs generated in this window.
 * Needs npm install pixi.js locally and a hardware WebGL2 implementation.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const ts = require('typescript')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('force-device-scale-factor','1')
app.whenReady().then(async () => {
  const features = app.getGPUFeatureStatus()
  const info = await app.getGPUInfo('basic').catch(() => null)
  const software = /swiftshader|software|llvmpipe|microsoft basic render/i.test(JSON.stringify(info))
  if (features.webgl !== 'enabled' || software) {
    console.log(JSON.stringify({ok:true,skipped:true,reason:'No hardware WebGL2',features},null,2))
    app.exit(0);return
  }
  let pixiPath
  try { pixiPath = require.resolve('pixi.js') }
  catch { throw Error('PixiJS ausente: npm install pixi.js') }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-gacha-pixi-rig-'))
  const base = path.resolve(__dirname, '../..')
  const tsOut = relative => ts.transpileModule(fs.readFileSync(path.join(base,relative),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  fs.writeFileSync(path.join(dir,'interpolation.mjs'),tsOut('src/shared/videoCharacterInterpolation.ts'))
  const rigJs=tsOut('src/renderer/src/features/videoStudio/pixiGachaPoseRig.ts')
    .replace('../../../../shared/videoCharacterInterpolation','./interpolation.mjs')
  fs.writeFileSync(path.join(dir,'rig.mjs'),rigJs)
  const html=`<!doctype html><meta charset="utf-8"><script type="module">
import * as PIXI from ${JSON.stringify(pathToFileURL(pixiPath).href)};
import { PixiGachaPoseRig, orderedVisiblePoseParts } from './rig.mjs';
const width=360,height=320,frames=180;
const image = color => {
  const canvas=document.createElement('canvas');canvas.width=28;canvas.height=28;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,28,28);
  ctx.fillStyle='#ffffff';ctx.fillRect(6,8,9,8);
  return canvas.toDataURL('image/png')
}
const urls=[image('#ed5599'),image('#297bdf'),image('#55bd98')];
const part=(id,x,y,width,height,angle,url)=>({id,x,y,width,height,rotation:angle,dataUrl:url});
const from={width,height,parts:[
  part('body',110,80,110,170,0,urls[0]),
  part('arm',210,110,48,145,-70,urls[1]),
  part('head',132,25,75,80,0,urls[2])
],layerOrder:['body','arm','head']};
const to={...from,parts:[
  part('body',110,80,110,170,0,urls[0]),
  part('arm',130,25,48,145,20,urls[1]),
  part('head',132,25,75,80,12,urls[2])
]};
const raster=new Map(await Promise.all(urls.map(async src=>{
  const img=new Image();img.src=src;await img.decode();return [src,img];
})));
await Promise.all(urls.map(url=>PIXI.Assets.load(url)));
const reference=document.createElement('canvas');reference.width=width;reference.height=height;
const context=reference.getContext('2d',{willReadFrequently:true});
function drawCanvas(artwork){
  context.clearRect(0,0,width,height);
  for(const part of orderedVisiblePoseParts(artwork)){
    context.save();context.translate(part.x+part.width/2,part.y+part.height/2);
    context.rotate(part.rotation*Math.PI/180);
    context.drawImage(raster.get(part.dataUrl),-part.width/2,-part.height/2,part.width,part.height);
    context.restore();
  }
}
const app=new PIXI.Application();
await app.init({width,height,autoStart:false,preference:'webgl',preferWebGLVersion:2,backgroundAlpha:0,antialias:false,resolution:1});
const rig=new PixiGachaPoseRig(PIXI);
app.stage.addChild(rig.stage);
const samples=[];
for(const t of [0,.25,.5,.75,1]){
  const mixed=PIXI_MIX(from,to,t);
  rig.setPose(mixed);
  app.renderer.render(app.stage);
  drawCanvas(mixed);
  const gpu=app.renderer.extract.pixels(app.stage);
  const pix=gpu.pixels || gpu;
  const cpu=context.getImageData(0,0,width,height).data;
  let pixelChanged=0,totalError=0,nonempty=0;
  for(let i=0;i<cpu.length;i+=4){
    const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(cpu[i+c]-pix[i+c])));
    if(delta>16)pixelChanged++;
    totalError+=delta;
    if(cpu[i+3]>0)nonempty++;
  }
  samples.push({progress:t,pixelChanged,nonempty,meanMaxChannelError:totalError/(width*height)});
}
// Keep the same interpolation function as the real Video Studio.
function PIXI_MIX(a,b,t){return window.__mixPoseArtwork(a,b,t)}
const canvasTime=performance.now();
for(let i=0;i<frames;i++)drawCanvas(PIXI_MIX(from,to,(i%15)/15));
const canvasMs=performance.now()-canvasTime;
const gpuTime=performance.now();
for(let i=0;i<frames;i++){rig.setInterpolatedPose(from,to,(i%15)/15);app.renderer.render(app.stage)}
const pixiMs=performance.now()-gpuTime;
const stats=rig.stats();
rig.dispose();app.destroy(true,{children:true});
window.__result={ok:true,frames,backend:'webgl2',samples,canvasMs,pixiMs,stats};
</script>`
  // Inject canonical interpolation into the browser, retaining the same TS
  // implementation as the current exact Canvas pipeline.
  const injected=html.replace('const width=360',`import { mixPoseArtwork } from './interpolation.mjs';window.__mixPoseArtwork=mixPoseArtwork;const width=360`)
  fs.writeFileSync(path.join(dir,'index.html'),injected)
  const win = new BrowserWindow({show:false,width:360,height:320,webPreferences:{
    contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false
  }})
  try {
    await win.loadFile(path.join(dir,'index.html'))
    const result=await Promise.race([
      win.webContents.executeJavaScript('(async()=>{while(!window.__result)await new Promise(r=>setTimeout(r,25));return window.__result})()',true),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('GPU rig smoke timed out')),60000))
    ])
    if(!result?.ok || result.stats?.spritesCreated!==3 || result.stats?.texturesCreated!==3
      || result.stats?.poseUpdates !== frames+5 || result.stats?.orderUpdates!==1
      || result.samples.some(x=>x.nonempty<=0))throw Error('Rig proof failed: '+JSON.stringify(result))
    console.log(JSON.stringify({...result,machine:{os:process.platform,gpuInfo:info}},null,2))
  }finally{
    if(!win.isDestroyed())win.destroy()
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150})
    app.exit(0)
  }
}).catch(error=>{console.error(error.stack||error.message);process.exitCode=1;app.exit(1)})
