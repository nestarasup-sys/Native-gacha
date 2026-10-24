'use strict'
/**
 * Full Gacha Pixel Oracle: actual face catalog, eyes, wardrobe and front/back
 * hair rendered through characterRenderer, compared to Pixi LayerStack.
 *
 * Both character and library are synthetic (the same fixture used in the
 * existing Video Studio visual oracle). No personal data is loaded.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const esbuild = require('esbuild')
const sharp = require('sharp')
const { createCharacterMediaFixture } = require('./character-media-oracle-fixture.cjs')
app.commandLine.appendSwitch('force-device-scale-factor','1')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.on('window-all-closed',()=>{})
const toPng = async (w,h,markup) => {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${markup}</svg>`
  return 'data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')
}
async function makeFixture(){
  const bootstrap=await createCharacterMediaFixture()
  const character=bootstrap.characters.characters[0]
  const now='2026-10-24T01:00:00.000Z'
  // Fabricator-style hair/garment assets, not painted approximations in the
  // GPU layer proof: characterRenderer decides their exact geometry/order.
  const hairFront=await toPng(115,48,'<path d="M4 18 Q57 -9 112 18 L104 44 L65 24 L27 45Z" fill="#492b79" stroke="#24163d" stroke-width="3"/>')
  const hairBack=await toPng(120,95,'<ellipse cx="60" cy="46" rx="58" ry="44" fill="#462d76"/><path d="M12 20h96v62H12Z" fill="#51377f"/>')
  const coat=await toPng(90,106,'<rect width="90" height="106" rx="10" fill="#d63f75"/><path d="M45 0V106" stroke="#ffffff" stroke-width="5"/>')
  const glasses=await toPng(94,30,'<rect x="2" y="2" width="42" height="25" rx="9" fill="none" stroke="#293c4f" stroke-width="4"/><rect x="49" y="2" width="42" height="25" rx="9" fill="none" stroke="#293c4f" stroke-width="4"/>')
  const hair={
    schemaVersion:1,id:'oracle-hair',modelSlot:1,name:'Synthetic front and back',
    front:{dataUrl:hairFront,width:115,height:48},
    back:{dataUrl:hairBack,width:120,height:95},fringe:null,
    transforms:{
      front:{x:-8,y:-16,scaleX:1,scaleY:1,rotation:0},
      back:{x:-9,y:-8,scaleX:1,scaleY:1,rotation:0},
    },createdAt:now,updatedAt:now,
  }
  const coatPart={
    id:'coat',name:'Jacket',category:'camisa',attachedPartId:'torso',
    x:55,y:150,width:90,height:106,rotation:0,dataUrl:coat,
  }
  const glassesPart={
    id:'glasses',name:'Glasses',category:'oculos',attachedPartId:'head',
    x:53,y:49,width:94,height:30,rotation:0,dataUrl:glasses,renderAboveHair:true,
  }
  const wardrobe={
    schemaVersion:1,id:'oracle-outfit',modelSlot:1,modelName:'Modelo sintético',
    name:'Clothes and accessory',width:200,height:300,
    components:[coatPart,glassesPart],updatedAt:now,
  }
  character.customization.hairAppearance={
    modelSlot:1,frontStyleId:'oracle-hair',backStyleId:'oracle-hair',
  }
  character.customization.wardrobeGroups=[
    {modelSlot:1,setId:'oracle-outfit',category:'camisa',componentId:'coat',
      offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0},
    {modelSlot:1,setId:'oracle-outfit',category:'oculos',componentId:'glasses',
      offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0},
  ]
  bootstrap.characterAssets.entries.push(
    {method:'loadHairStyle',args:[1,hair.id],value:hair},
    {method:'loadWardrobeSet',args:[1,wardrobe.id],value:wardrobe},
  )
  return {character,assets:bootstrap.characterAssets}
}

app.whenReady().then(async()=>{
  const status=app.getGPUFeatureStatus()
  const info=await app.getGPUInfo('basic').catch(()=>null)
  const software=/swiftshader|software|llvmpipe|microsoft basic render/i.test(JSON.stringify(info))
  if(status.webgl!=='enabled'||software){
    console.log(JSON.stringify({ok:true,skipped:true,reason:'Hardware WebGL unavailable',
      productionEligible:false,gpuStatus:status},null,2))
    app.exit(0);return
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-gacha-real-character-gpu-'))
  let win
  try{
    const fixture=await makeFixture()
    fs.writeFileSync(path.join(dir,'fixture.js'),
      'window.__fullGachaFixture='+JSON.stringify(fixture)+';')
    await esbuild.build({
      entryPoints:[path.join(__dirname,'pixi-gacha-full-character-benchmark.entry.ts')],
      bundle:true,format:'iife',platform:'browser',target:'es2022',
      outfile:path.join(dir,'bundle.js'),logLevel:'warning',
    })
    fs.writeFileSync(path.join(dir,'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="./fixture.js"></script><script src="./bundle.js"></script></body></html>')
    win=new BrowserWindow({show:false,width:400,height:500,
      webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}})
    await win.loadFile(path.join(dir,'index.html'))
    const result=await Promise.race([
      win.webContents.executeJavaScript(`(async()=>{
        for(let i=0;i<900;i++){
          if(window.__fullGachaGpuReport)return window.__fullGachaGpuReport
          await new Promise(r=>setTimeout(r,100))
        }
        throw Error('Full character oracle stalled')
      })()`,true),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Full Gacha Pixi oracle timed out')),95000)),
    ])
    if(!result?.ok||result.frames!==8||result.samples?.some(x=>x.canvasAlpha<=0||x.gpuAlpha<=0))
      throw new Error('Full character oracle failed: '+JSON.stringify(result))
    console.log(JSON.stringify({...result,gpuStatus:status,
      hardware:info,productionEnabled:false},null,2))
  }finally{
    if(win&&!win.isDestroyed())win.destroy()
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150})
    app.exit(0)
  }
}).catch(error=>{console.error(error.stack||error.message);app.exit(1)})
