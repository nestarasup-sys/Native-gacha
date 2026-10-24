'use strict'
/** Smoke visual OPT-IN no Chromium do Electron, sem acessar bibliotecas reais.
 * Renderiza duas visões sintéticas (imagem original e montagem), captura PNGs e
 * verifica pixels. NÃO é substituto de screenshot das telas reais com assets.
 * Execute: npm run test:fabricator:electron-visual
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const ts = require('typescript')

function loadPureTs(path) {
  const source = readFileSync(join(__dirname, '../../', path), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  return mod.exports
}
const { selectOriginalModelSource, selectMountedModelSource } = loadPureTs('src/shared/fabricatorModelViews.ts')
const { comparePixelBuffers } = loadPureTs('src/shared/videoVisualOracle.ts')

const W = 24, H = 24
const model = {
  slot: 1, name:'Visual fixture', sourceName:'fixture.png', width:W,height:H,tolerance:74,
  updatedAt:'2026-10-22T12:00:00.000Z', sourceDataUrl:'',joints:[],layerOrder:['body','head','hair'],hiddenPartIds:[],
  parts: [
    { id:'body',name:'Tronco', x:10,y:12,width:10,height:9,rotation:0,sourceTransform:{x:4,y:12,width:10,height:9,rotation:0}},
    { id:'head',name:'Cabeça', x:12,y:2,width:6,height:6,rotation:0,sourceTransform:{x:2,y:2,width:6,height:6,rotation:0}},
    { id:'hair',name:'Cabelo', x:12,y:1,width:6,height:2,rotation:0,sourceTransform:{x:2,y:1,width:6,height:2,rotation:0}}
  ]
}
const colors = { body:'#226fce',head:'#ffc34d',hair:'#252237' }
async function render(win, view, file) {
  const payload = JSON.stringify(view.parts.map(p => ({x:p.x,y:p.y,width:p.width,height:p.height,id:p.id})))
  const res = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas')
    canvas.width=${W}; canvas.height=${H}
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    ctx.clearRect(0,0,${W},${H})
    const colors=${JSON.stringify(colors)}
    for(const p of ${payload}) { ctx.fillStyle=colors[p.id];ctx.fillRect(p.x,p.y,p.width,p.height) }
    document.body.replaceChildren(canvas)
    return Array.from(ctx.getImageData(0,0,${W},${H}).data)
  })()`)
  const pixels=Uint8Array.from(res)
  // capturar o PNG real do Chromium em escala física x1 (sem alterar dimensões)
  writeFileSync(file, Buffer.from(await win.webContents.executeJavaScript(
    "document.querySelector('canvas').toDataURL('image/png').split(',')[1]"
  ),'base64'))
  return pixels
}
function pixel(data,x,y) { return Array.from(data.subarray((y*W+x)*4,(y*W+x)*4+4)) }
async function main() {
  await app.whenReady()
  const win = new BrowserWindow({ width:500,height:400, show:false, webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false} })
  try {
    await win.loadURL('data:text/html,<html><body></body></html>')
    const output=mkdtempSync(join(tmpdir(),'native-gacha-visual-'))
    const original=await render(win,selectOriginalModelSource(model),join(output,'source-original.png'))
    const mounted=await render(win,selectMountedModelSource(model),join(output,'pose-mounted.png'))
    // asserts independentes de serialize/renderer: espaço vazio vs cabeça original/montada
    if(pixel(original,3,3)[0]!==255 || pixel(mounted,3,3)[3]!==0)throw Error('Geometria original incoerente')
    if(pixel(mounted,13,3)[0]!==255 || pixel(original,13,3)[3]!==0)throw Error('Montagem incoerente')
    const result=comparePixelBuffers(original,mounted,W,H)
    if(result.changedPixels < 15)throw Error('Oracle visual não encontrou diferença esperada')
    process.stdout.write('Electron Chromium visual smoke OK; screenshots em '+output+'; changedPixels='+result.changedPixels+'\n')
  } finally {
    if(!win.isDestroyed())win.destroy()
    app.quit()
  }
}
void main().catch(error => { console.error(error); app.exit(1) })
