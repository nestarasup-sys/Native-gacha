'use strict'

const { app, BrowserWindow } = require('electron')
const { readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')

async function main() {
  if (!process.argv[2] || !process.argv[3]) throw Error('Informe os caminhos da fixture sintética e do resultado.')
  const inputPath = path.resolve(process.argv[2])
  const outputPath = path.resolve(process.argv[3])
  const runsRoot = path.resolve(__dirname, '../../out/editor-v6-stress/runs')
  const outputRelative = path.relative(runsRoot, outputPath)
  if (!inputPath || !outputPath || !outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) {
    throw Error('Arquivos da fixture Canvas2D precisam ficar dentro de uma execução isolada do Editor V6.')
  }
  const fixture = JSON.parse(await readFile(inputPath, 'utf8'))
  if (!Number.isSafeInteger(fixture.width) || !Number.isSafeInteger(fixture.height)
    || fixture.width < 32 || fixture.height < 32 || !Array.isArray(fixture.frames)
    || fixture.frames.length < 1 || fixture.frames.length > 60) throw Error('A fixture Canvas2D possui dimensões ou contagem inválidas.')

  app.setPath('userData', path.join(path.dirname(outputPath), 'isolated-electron-profile'))
  await app.whenReady()
  const window = new BrowserWindow({
    show: false, width: fixture.width, height: fixture.height,
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  try {
    await window.loadURL('data:text/html;charset=utf-8,%3C!doctype%20html%3E%3Cmeta%20charset%3Dutf-8%3E%3Ctitle%3ECanvas%20Parity%3C/title%3E')
    const result = await window.webContents.executeJavaScript(`(async (fixture) => {
      const width=fixture.width,height=fixture.height
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
      const context=canvas.getContext('2d',{willReadFrequently:true,alpha:true})
      const backgroundBytes=Uint8Array.from(atob(fixture.background),value=>value.charCodeAt(0))
      const background=new ImageData(new Uint8ClampedArray(backgroundBytes.buffer),width,height)
      const layer=document.createElement('canvas');layer.width=fixture.overlayWidth;layer.height=fixture.overlayHeight
      const layerContext=layer.getContext('2d',{willReadFrequently:true,alpha:true})
      const encode=bytes=>{let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary)}
      const samplesMs=[],frames=[]
      const render=(frame)=>{
        const layerBytes=Uint8Array.from(atob(frame.pixels),value=>value.charCodeAt(0))
        layerContext.putImageData(new ImageData(new Uint8ClampedArray(layerBytes.buffer),fixture.overlayWidth,fixture.overlayHeight),0,0)
        const started=performance.now()
        context.putImageData(background,0,0)
        context.drawImage(layer,frame.left,frame.top)
        const rgba=context.getImageData(0,0,width,height).data
        return {rgba,elapsed:performance.now()-started}
      }
      for(let index=0;index<Math.min(3,fixture.frames.length);index++)render(fixture.frames[index])
      for(const frame of fixture.frames){const output=render(frame);samplesMs.push(output.elapsed);frames.push({rgba:encode(output.rgba)})}
      return {samplesMs,frames,jsHeapBytes:performance.memory?.usedJSHeapSize??null}
    })(${JSON.stringify(fixture)})`, true)
    const metrics = app.getAppMetrics().map(metric => ({
      type: metric.type,
      workingSetBytes: Number.isFinite(metric.memory?.workingSetSize) ? Math.round(metric.memory.workingSetSize * 1024) : null,
      privateBytes: Number.isFinite(metric.memory?.privateBytes) ? Math.round(metric.memory.privateBytes * 1024) : null
    }))
    await writeFile(outputPath, JSON.stringify({ ...result, totalMs: result.samplesMs.reduce((sum, item) => sum + item, 0), processes: metrics }), { flag: 'wx' })
  } finally {
    if (!window.isDestroyed()) window.destroy()
    app.quit()
  }
}

main().catch(error => { console.error('[V6 offscreen Canvas2D spike]', error); app.exit(1) })
