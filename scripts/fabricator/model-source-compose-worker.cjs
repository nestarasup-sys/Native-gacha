'use strict'

/** Synthetic Electron/Chromium smoke for the production-built Model Source composer worker. */
const { app, BrowserWindow } = require('electron')
const { createServer } = require('node:http')
const { readFileSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')

const rendererAssets = resolve(__dirname, '../../out/renderer/assets')
const workerName = readdirSync(rendererAssets).find(name => /^modelSourceCompose\.worker-.*\.js$/.test(name))
if (!workerName) throw new Error('Worker de composição não encontrado. Execute o build antes do smoke.')
const workerSource = readFileSync(join(rendererAssets, workerName))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function run() {
  await app.whenReady()
  const server = createServer((request, response) => {
    if (request.url === '/worker.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      response.end(workerSource)
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end('<!doctype html><html><body>Model Source worker smoke</body></html>')
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor local do smoke não iniciou.')
  const window = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  try {
    await window.loadURL(`http://127.0.0.1:${address.port}/`)
    const result = await window.webContents.executeJavaScript(`(async () => {
      const worker = new Worker('/worker.js', { type: 'module' })
      const createImage = (colors, width, height) => {
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        const image = context.createImageData(width, height)
        colors.forEach((color, index) => image.data.set(color, index * 4))
        context.putImageData(image, 0, 0)
        return canvas.toDataURL('image/png')
      }
      const pixel = async (dataUrl, x, y) => {
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context.drawImage(bitmap, 0, 0)
          return Array.from(context.getImageData(x, y, 1, 1).data)
        } finally { bitmap.close() }
      }
      const createPattern = seed => {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        const context = canvas.getContext('2d')
        const image = context.createImageData(size, size)
        for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
          const offset = (y * size + x) * 4
          image.data[offset] = (x * 11 + y * 3 + seed * 17) % 256
          image.data[offset + 1] = (x * 5 + y * 13 + seed * 23) % 256
          image.data[offset + 2] = (x * 7 + y * 9 + seed * 31) % 256
          image.data[offset + 3] = 255
        }
        context.putImageData(image, 0, 0)
        return canvas.toDataURL('image/png')
      }
      const loadImage = dataUrl => new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Falha ao decodificar a textura sintética.'))
        image.src = dataUrl
      })
      const mainThreadCompose = async project => {
        const raw = document.createElement('canvas')
        raw.width = project.width; raw.height = project.height
        const rawContext = raw.getContext('2d')
        rawContext.fillStyle = '#00ff00'
        rawContext.fillRect(0, 0, project.width, project.height)
        for (const part of project.parts) {
          const image = await loadImage(part.chromaBaseDataUrl || part.dataUrl)
          rawContext.drawImage(image, part.sourceTransform.x, part.sourceTransform.y, part.sourceTransform.width, part.sourceTransform.height)
        }
        const sourceDataUrl = raw.toDataURL('image/png')
        const preview = document.createElement('canvas')
        preview.width = project.width; preview.height = project.height
        const view = preview.getContext('2d')
        for (const part of project.parts) {
          const image = await loadImage(part.dataUrl)
          view.drawImage(image, part.sourceTransform.x, part.sourceTransform.y, part.sourceTransform.width, part.sourceTransform.height)
        }
        return { sourceDataUrl, previewDataUrl: preview.toDataURL('image/png') }
      }
      let nextId = 0
      const compose = request => new Promise((resolve, reject) => {
        const id = ++nextId
        worker.onmessage = event => {
          if (event.data.id !== id) return
          event.data.type === 'complete' ? resolve(event.data.output) : reject(new Error(event.data.message))
        }
        worker.onerror = event => reject(new Error(event.message))
        worker.postMessage({ ...request, id })
      })
      const composeFreshWorker = request => new Promise((resolve, reject) => {
        const taskWorker = new Worker('/worker.js', { type: 'module' })
        const id = 1000 + ++nextId
        taskWorker.onmessage = event => {
          if (event.data.id !== id) return
          taskWorker.terminate()
          event.data.type === 'complete' ? resolve(event.data.output) : reject(new Error(event.data.message))
        }
        taskWorker.onerror = event => { taskWorker.terminate(); reject(new Error(event.message)) }
        taskWorker.postMessage({ ...request, id })
      })
      const measure = async operation => {
        let last = performance.now()
        let maxTimerGapMs = 0
        const timer = setInterval(() => {
          const now = performance.now()
          maxTimerGapMs = Math.max(maxTimerGapMs, now - last - 10)
          last = now
        }, 10)
        const start = performance.now()
        try { await operation() }
        finally { clearInterval(timer) }
        return { elapsedMs: performance.now() - start, maxTimerGapMs }
      }
      const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
      const countChangedChannels = async (first, second) => {
        const [a, b] = await Promise.all([first, second].map(async dataUrl => {
          const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
          try {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
            const context = canvas.getContext('2d', { willReadFrequently: true })
            context.drawImage(bitmap, 0, 0)
            return context.getImageData(0, 0, bitmap.width, bitmap.height).data
          } finally { bitmap.close() }
        }))
        let changed = 0
        for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) changed += 1
        return changed
      }
      const benchmarkProject = {
        width: 2048, height: 1024, tolerance: 74,
        parts: Array.from({ length: 8 }, (_, index) => {
          const x = index % 4 * 512
          const y = Math.floor(index / 4) * 512
          const dataUrl = createPattern(index + 1)
          return {
            id: 'part-' + index, name: 'Peça ' + index, x, y, width: 512, height: 512, rotation: 0,
            dataUrl, chromaBaseDataUrl: dataUrl,
            sourceTransform: { x, y, width: 512, height: 512, rotation: 0 }
          }
        })
      }
      const benchmarkRequest = { project: benchmarkProject, edits: {}, tolerance: 74 }
      const benchmarkCompose = async () => {
        const mainWarmup = await mainThreadCompose(benchmarkProject)
        const workerWarmup = await composeFreshWorker(benchmarkRequest)
        const sourceChangedChannels = await countChangedChannels(mainWarmup.sourceDataUrl, workerWarmup.sourceDataUrl)
        const previewChangedChannels = await countChangedChannels(mainWarmup.previewDataUrl, workerWarmup.previewDataUrl)
        const mainSamples = []
        const workerSamples = []
        const persistentWorkerSamples = []
        await compose(benchmarkRequest)
        for (let round = 0; round < 5; round += 1) {
          mainSamples.push(await measure(() => mainThreadCompose(benchmarkProject)))
          workerSamples.push(await measure(() => composeFreshWorker(benchmarkRequest)))
          persistentWorkerSamples.push(await measure(() => compose(benchmarkRequest)))
        }
        return {
          parts: benchmarkProject.parts.length,
          sheetWidth: benchmarkProject.width,
          sheetHeight: benchmarkProject.height,
          rounds: 5,
          mainMedianMs: median(mainSamples.map(sample => sample.elapsedMs)),
          workerMedianMs: median(workerSamples.map(sample => sample.elapsedMs)),
          persistentWorkerMedianMs: median(persistentWorkerSamples.map(sample => sample.elapsedMs)),
          mainMedianMaxTimerGapMs: median(mainSamples.map(sample => sample.maxTimerGapMs)),
          workerMedianMaxTimerGapMs: median(workerSamples.map(sample => sample.maxTimerGapMs)),
          persistentWorkerMedianMaxTimerGapMs: median(persistentWorkerSamples.map(sample => sample.maxTimerGapMs)),
          sourceChangedChannels,
          previewChangedChannels
        }
      }
      try {
        const sourceImage = createImage([[0,255,0,255], [255,0,0,255]], 2, 1)
        const chromaResult = await compose({
          project: { width: 2, height: 1, tolerance: 74, parts: [{
            id: 'head', name: 'Cabeça', x: 0, y: 0, width: 2, height: 1, rotation: 0,
            dataUrl: sourceImage,
            sourceTransform: { x: 0, y: 0, width: 2, height: 1, rotation: 0 }
          }] },
          edits: {},
          tolerance: 0
        })
        const chromaPreviewGreen = await pixel(chromaResult.previewDataUrl, 0, 0)
        const chromaPreviewRed = await pixel(chromaResult.previewDataUrl, 1, 0)
        const sourceRed = await pixel(chromaResult.sourceDataUrl, 1, 0)

        const movedResult = await compose({
          project: { width: 4, height: 3, tolerance: 74, parts: [{
            id: 'head', name: 'Cabeça', x: 0, y: 0, width: 2, height: 1, rotation: 0,
            dataUrl: sourceImage,
            sourceTransform: { x: 0, y: 0, width: 2, height: 1, rotation: 0, jointAnchor: { x: 1, y: 0.5 } }
          }] },
          edits: { head: { x: 1, y: 1, width: 2, height: 1 } },
          tolerance: 74
        })
        const smoke = {
          chromaPreviewGreen,
          chromaPreviewRed,
          sourceRed,
          movedOrigin: await pixel(movedResult.previewDataUrl, 0, 0),
          movedGreen: await pixel(movedResult.previewDataUrl, 1, 1),
          movedRed: await pixel(movedResult.previewDataUrl, 2, 1),
          sourceMovedRed: await pixel(movedResult.sourceDataUrl, 2, 1),
          sourceX: movedResult.partUpdates[0].patch.sourceTransform.x,
          jointAnchor: movedResult.partUpdates[0].patch.sourceTransform.jointAnchor
        }
        return { ...smoke, benchmark: await benchmarkCompose() }
      } finally { worker.terminate() }
    })()`)

    assert(result.chromaPreviewGreen[3] === 0, 'Chroma não removeu o verde puro da prévia.')
    assert(result.chromaPreviewRed[0] === 255 && result.chromaPreviewRed[3] === 255, 'Chroma alterou a área vermelha da prévia.')
    assert(result.sourceRed[0] === 255 && result.sourceRed[1] === 0, 'A folha original não preservou a base da peça.')
    assert(result.movedOrigin[3] === 0, 'A peça movida continuou aparecendo na posição antiga.')
    assert(result.movedGreen[1] === 255 && result.movedGreen[3] === 255, 'A peça movida perdeu o pixel verde original.')
    assert(result.movedRed[0] === 255 && result.movedRed[3] === 255, 'A peça movida perdeu o pixel vermelho original.')
    assert(result.sourceMovedRed[0] === 255, 'A folha de origem não atualizou a posição da peça.')
    assert(result.sourceX === 1, 'A transformação da origem não foi atualizada.')
    assert(result.jointAnchor.x === 2 && result.jointAnchor.y === 1.5, 'O pivô da peça não acompanhou a edição da origem.')
    assert(result.benchmark.sourceChangedChannels === 0, 'O PNG da folha difere da composição equivalente no thread principal.')
    assert(result.benchmark.previewChangedChannels === 0, 'A prévia difere da composição equivalente no thread principal.')
    const benchmark = result.benchmark
    process.stdout.write(
      `Model Source compose worker smoke OK; pixels idênticos. Benchmark sintético (${benchmark.parts} peças ${benchmark.sheetWidth}×${benchmark.sheetHeight}, mediana de ${benchmark.rounds} rodadas): ` +
      `thread principal ${benchmark.mainMedianMs.toFixed(1)} ms / maior atraso de timer ${benchmark.mainMedianMaxTimerGapMs.toFixed(1)} ms; ` +
      `worker novo ${benchmark.workerMedianMs.toFixed(1)} ms / ${benchmark.workerMedianMaxTimerGapMs.toFixed(1)} ms; ` +
      `worker reutilizado ${benchmark.persistentWorkerMedianMs.toFixed(1)} ms / ${benchmark.persistentWorkerMedianMaxTimerGapMs.toFixed(1)} ms.\n`
    )
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await new Promise(resolveClose => server.close(resolveClose))
    app.quit()
  }
}

run().catch(error => {
  console.error(error)
  app.exit(1)
})
