import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createImportedModelProject } from '../src/renderer/src/features/fabricator/models/processedModelProject.ts'
import { ChromaAdjustTaskError, startChromaAdjustWorker } from '../src/renderer/src/features/fabricator/models/runChromaAdjustWorker.ts'
import { ImageProcessorTaskError, startImageProcessorWorker } from '../src/renderer/src/features/fabricator/models/runImageProcessorWorker.ts'
import { ModelSourcePixelEditTaskError, startModelSourcePixelEditWorker } from '../src/renderer/src/features/fabricator/models/runModelSourcePixelEditWorker.ts'
import { applyModelSourceBrushPixels, modelSourceBrushRegion, removeModelSourceColorPixels } from '../src/renderer/src/features/fabricator/models/modelSourcePixelOperations.ts'
import { ModelSourceComposeTaskError, startModelSourceComposeWorker } from '../src/renderer/src/features/fabricator/models/runModelSourceComposeWorker.ts'
import { applyChromaPixels } from '../src/renderer/src/features/fabricator/models/chroma.ts'

const imageBuffer = value => Uint8Array.of(value).buffer

test('monta o projeto importado com bases, ordem, juntas e assets pendentes preservados', () => {
  const result = createImportedModelProject({
    type: 'complete',
    id: 7,
    width: 120,
    height: 180,
    parts: [
      { id: 'head', name: 'Cabeça', x: 40, y: 5, width: 30, height: 30, png: imageBuffer(1), basePng: imageBuffer(2) },
      { id: 'torso', name: 'Tronco', x: 35, y: 35, width: 40, height: 60, png: imageBuffer(3), basePng: imageBuffer(4) }
    ]
  }, 'data:image/png;base64,SOURCE', 74, {
    slot: 2,
    name: 'Modelo teste',
    sourceName: 'origem.png',
    sourceAssetName: 'source-test.png'
  })

  assert.equal(result.project.schemaVersion, 1)
  assert.equal(result.project.chromaVersion, 2)
  assert.equal(result.project.chromaBaseTolerance, 0)
  assert.equal(result.project.slot, 2)
  assert.equal(result.project.sourceDataUrl, 'data:image/png;base64,SOURCE')
  assert.equal(result.project.width, 120)
  assert.equal(result.project.height, 180)
  assert.equal(result.project.tolerance, 74)
  assert.deepEqual(result.project.layerOrder, ['head', 'torso'])
  assert.deepEqual(result.project.hiddenPartIds, [])

  const head = result.project.parts.find(part => part.id === 'head')
  assert.equal(head.rotation, 0)
  assert.equal(head.chromaBaseSaved, true)
  assert.equal(head.dataUrl, 'data:image/png;base64,AQ==')
  assert.equal(head.chromaBaseDataUrl, 'data:image/png;base64,Ag==')
  assert.deepEqual(head.sourceTransform.jointAnchor, head.jointAnchor)
  assert.equal(result.project.joints.length, 1)
  assert.equal(result.project.joints[0].parentPartId, 'torso')
  assert.equal(result.project.joints[0].childPartId, 'head')
  assert.equal(result.dirtyAssets.get('head'), head.dataUrl)
  assert.equal(result.dirtyChromaBases.get('head'), head.chromaBaseDataUrl)
  assert.equal(result.dirtyAssets.size, 2)
  assert.equal(result.dirtyChromaBases.size, 2)
})

test('tela e workers compartilham os contratos de mensagem definidos pelo domínio', async () => {
  const [page, imageWorker, chromaWorker, modelSource, chromaRunner, imageRunner, pixelWorker, pixelRunner, pixelEditing, composeWorker, composeRunner, geometry] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/imageProcessor.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/chromaAdjust.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSource.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runChromaAdjustWorker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runImageProcessorWorker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSourcePixelEdit.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runModelSourcePixelEditWorker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSourceEditing.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSourceCompose.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runModelSourceComposeWorker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSourceGeometry.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /startImageProcessorWorker/)
  assert.match(imageRunner, /MessageEvent<ImageProcessorMessage>/)
  assert.match(imageRunner, /satisfies ImageProcessorRequest/)
  assert.match(imageWorker, /MessageEvent<ImageProcessorRequest>/)
  assert.match(page, /startChromaAdjustWorker/)
  assert.match(modelSource, /startModelSourceComposeWorker/)
  assert.doesNotMatch(modelSource, /document\.createElement/)
  assert.match(chromaRunner, /MessageEvent<ChromaAdjustMessage>/)
  assert.match(chromaRunner, /satisfies ChromaAdjustRequest/)
  assert.match(chromaWorker, /MessageEvent<ChromaAdjustRequest>/)
  assert.match(pixelEditing, /startModelSourcePixelEditWorker/)
  assert.match(pixelRunner, /MessageEvent<ModelSourcePixelEditMessage>/)
  assert.match(pixelWorker, /MessageEvent<ModelSourcePixelEditRequest>/)
  assert.match(pixelWorker, /applyModelSourceBrushPixels/)
  assert.match(pixelWorker, /removeModelSourceColorPixels/)
  assert.doesNotMatch(pixelEditing, /function applyBrush\(/)
  assert.doesNotMatch(pixelEditing, /function removeSelectedColor\(/)
  assert.doesNotMatch(page, /new Worker\(new URL\('\.\/models\/imageProcessor\.worker/)
  assert.doesNotMatch(page, /new Worker\(new URL\('\.\/models\/chromaAdjust\.worker/)
  assert.doesNotMatch(modelSource, /new Worker\(new URL\('\.\/chromaAdjust\.worker/)
  assert.match(composeRunner, /MessageEvent<ModelSourceComposeMessage>/)
  assert.match(composeWorker, /MessageEvent<ModelSourceComposeWorkerRequest>/)
  assert.match(composeWorker, /OffscreenCanvas/)
  assert.match(composeWorker, /sourceRect\(/)
  assert.match(geometry, /export function sourceRect/)
  assert.match(chromaWorker, /applyChromaPixels/)
})

function rgbaImage(width, height, color = [240, 200, 170, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset)
  return { width, height, data }
}

function cropRgba(image, region) {
  const data = new Uint8ClampedArray(region.width * region.height * 4)
  for (let y = 0; y < region.height; y += 1) {
    const source = ((region.y + y) * image.width + region.x) * 4
    data.set(image.data.subarray(source, source + region.width * 4), y * region.width * 4)
  }
  return { width: region.width, height: region.height, data }
}

test('região do pincel é calculada linearmente sem expandir pontos em argumentos', () => {
  const points = Array.from({ length: 50_000 }, (_, index) => ({ x: index % 100, y: Math.floor(index / 100) % 100 }))
  const region = modelSourceBrushRegion(100, 100, points, 18, true)

  assert.deepEqual(region, { x: 0, y: 0, width: 100, height: 100 })
})

test('borracha remove só os pixels cobertos pelo círculo e mantém o restante intacto', () => {
  const source = rgbaImage(11, 11)
  const points = [{ x: 5, y: 5 }]
  const region = modelSourceBrushRegion(source.width, source.height, points, 4, false)
  const image = cropRgba(source, region)
  const removed = applyModelSourceBrushPixels(image, points, 4, false, region)
  const pixelAlpha = (x, y) => image.data[(y * image.width + x) * 4 + 3]

  assert.ok(removed > 0)
  assert.equal(pixelAlpha(2, 2), 0)
  assert.equal(pixelAlpha(0, 0), 255)
})

test('pincel de contorno apaga tinta escura e preserva pele e preenchimento interno', () => {
  const source = rgbaImage(15, 15, [0, 0, 0, 0])
  for (let y = 4; y <= 10; y += 1) for (let x = 4; x <= 10; x += 1) {
    const edge = x === 4 || x === 10 || y === 4 || y === 10
    source.data.set(edge ? [70, 34, 32, 255] : [240, 200, 170, 255], (y * source.width + x) * 4)
  }
  const points = [{ x: 4, y: 7 }]
  const region = modelSourceBrushRegion(source.width, source.height, points, 2, true)
  const image = cropRgba(source, region)
  const removed = applyModelSourceBrushPixels(image, points, 2, true, region)
  const localAlpha = (x, y) => image.data[((y - region.y) * image.width + x - region.x) * 4 + 3]

  assert.ok(removed > 0)
  assert.equal(localAlpha(4, 7), 0)
  assert.equal(localAlpha(7, 7), 255)
})

test('remoção de cor mantém contorno escuro e cores que não correspondem ao tom escolhido', () => {
  const image = rgbaImage(3, 1)
  image.data.set([25, 18, 18, 255], 0)
  image.data.set([242, 198, 168, 255], 4)
  image.data.set([20, 80, 220, 255], 8)

  assert.equal(removeModelSourceColorPixels(image, '#f2c6a8', 5), 1)
  assert.equal(image.data[3], 255)
  assert.equal(image.data[7], 0)
  assert.equal(image.data[11], 255)
})

test('Chroma compartilhado mantém o alpha verde transparente e limpa o derramamento', () => {
  const image = rgbaImage(3, 1, [0, 255, 0, 255])
  image.data.set([60, 190, 58, 255], 4)
  image.data.set([240, 160, 120, 255], 8)

  applyChromaPixels(image.data, [0, 255, 0], 24)

  assert.equal(image.data[3], 0)
  assert.equal(image.data[7], 255)
  assert.ok(image.data[5] < 190)
  assert.equal(image.data[11], 255)
})

test('worker de pixels ignora respostas antigas, converte as duas bases e termina', async () => {
  const worker = createWorkerDouble()
  const task = startModelSourcePixelEditWorker({
    id: 18,
    operation: 'brush',
    part: { width: 10, height: 20, displayDataUrl: 'data:image/png;base64,DISPLAY', baseDataUrl: 'data:image/png;base64,BASE' },
    points: [{ x: 2, y: 3 }], size: 8, outlineOnly: false
  }, () => worker)

  assert.equal(worker.posted.id, 18)
  worker.onmessage({ data: { type: 'complete', id: 17, displayPng: imageBuffer(1), basePng: imageBuffer(2), removedPixels: 1 } })
  assert.equal(worker.terminated, false)
  worker.onmessage({ data: { type: 'complete', id: 18, displayPng: imageBuffer(5), basePng: imageBuffer(6), removedPixels: 14 } })

  assert.deepEqual(await task.result, {
    displayDataUrl: 'data:image/png;base64,BQ==',
    baseDataUrl: 'data:image/png;base64,Bg==',
    removedPixels: 14
  })
  assert.equal(worker.terminateCount, 1)
})

test('worker de pixels distingue erro e cancelamento e respeita AbortSignal', async () => {
  const failedWorker = createWorkerDouble()
  const failed = startModelSourcePixelEditWorker({ id: 20, operation: 'remove-color', part: { width: 1, height: 1, displayDataUrl: 'data:image/png;base64,AA==', baseDataUrl: 'data:image/png;base64,AA==' }, color: '#ffffff', tolerance: 2 }, () => failedWorker)
  const failure = assert.rejects(failed.result, error => error instanceof ModelSourcePixelEditTaskError && error.kind === 'worker' && error.message === 'dados inválidos')
  failedWorker.onmessage({ data: { type: 'error', id: 20, message: 'dados inválidos' } })
  await failure
  assert.equal(failedWorker.terminateCount, 1)

  const worker = createWorkerDouble()
  const controller = new AbortController()
  const cancelled = startModelSourcePixelEditWorker({ id: 21, operation: 'remove-color', part: { width: 1, height: 1, displayDataUrl: 'data:image/png;base64,AA==', baseDataUrl: 'data:image/png;base64,AA==' }, color: '#ffffff', tolerance: 2 }, () => worker, controller.signal)
  const cancellation = assert.rejects(cancelled.result, error => error instanceof ModelSourcePixelEditTaskError && error.kind === 'cancelled' && error.name === 'AbortError')
  controller.abort()
  await cancellation
  worker.onmessage({ data: { type: 'complete', id: 21, displayPng: imageBuffer(1), basePng: imageBuffer(2), removedPixels: 0 } })
  assert.equal(worker.terminateCount, 1)

  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  const skipped = startModelSourcePixelEditWorker({ id: 22, operation: 'remove-color', part: { width: 1, height: 1, displayDataUrl: 'data:image/png;base64,AA==', baseDataUrl: 'data:image/png;base64,AA==' }, color: '#ffffff', tolerance: 2 }, () => {
    throw new Error('Worker não deve iniciar para tarefa cancelada.')
  }, alreadyAborted.signal)
  await assert.rejects(skipped.result, error => error instanceof ModelSourcePixelEditTaskError && error.kind === 'cancelled')
})

test('worker de composição ignora respostas antigas e devolve a composição completa', async () => {
  const worker = createWorkerDouble()
  const expected = { sourceDataUrl: 'source', previewDataUrl: 'preview', tolerance: 74, partUpdates: [] }
  const project = { width: 10, height: 20, tolerance: 74, sourceDataUrl: 'large-source', parts: [], joints: [], layerOrder: [], hiddenPartIds: [], modelSkinTone: '#f2c6a8', modelOutlineColor: '#351f24' }
  const task = startModelSourceComposeWorker({
    id: 30,
    project,
    edits: {},
    tolerance: 74
  }, () => worker)

  assert.equal(worker.posted.id, 30)
  assert.equal(worker.posted.project.sourceDataUrl, undefined)
  assert.deepEqual(worker.posted.project, { width: 10, height: 20, tolerance: 74, parts: [] })
  worker.onmessage({ data: { type: 'complete', id: 29, output: expected } })
  assert.equal(worker.terminated, false)
  worker.onmessage({ data: { type: 'complete', id: 30, output: expected } })

  assert.deepEqual(await task.result, {
    sourceDataUrl: 'source', previewDataUrl: 'preview', parts: [], tolerance: 74,
    modelSkinTone: '#f2c6a8', modelOutlineColor: '#351f24', joints: [], layerOrder: [], hiddenPartIds: []
  })
  assert.equal(worker.terminateCount, 1)
})

test('worker de composição devolve só alterações e mantém peças sem mudanças por referência', async () => {
  const worker = createWorkerDouble()
  const head = { id: 'head', name: 'Cabeça', width: 10, height: 10, dataUrl: 'old', rotation: 0 }
  const torso = { id: 'torso', name: 'Tronco', width: 20, height: 30, dataUrl: 'base', rotation: 0 }
  const task = startModelSourceComposeWorker({
    id: 33,
    project: { width: 30, height: 40, tolerance: 74, parts: [head, torso], joints: [] },
    edits: {},
    tolerance: 74
  }, () => worker)
  worker.onmessage({ data: { type: 'complete', id: 33, output: {
    sourceDataUrl: 'source', previewDataUrl: 'preview', tolerance: 74,
    partUpdates: [{ id: 'head', patch: { width: 12, dataUrl: 'new' } }]
  } } })

  const result = await task.result
  assert.deepEqual(result.parts[0], { ...head, width: 12, dataUrl: 'new' })
  assert.equal(result.parts[1], torso)
})

test('worker de composição encerra em erro e cancelamento', async () => {
  const failedWorker = createWorkerDouble()
  const failed = startModelSourceComposeWorker({ id: 31, project: {}, edits: {}, tolerance: 0 }, () => failedWorker)
  const failure = assert.rejects(failed.result, error => error instanceof ModelSourceComposeTaskError && error.kind === 'worker' && error.message === 'peça inválida')
  failedWorker.onmessage({ data: { type: 'error', id: 31, message: 'peça inválida' } })
  await failure
  assert.equal(failedWorker.terminateCount, 1)

  const worker = createWorkerDouble()
  const controller = new AbortController()
  const cancelled = startModelSourceComposeWorker({ id: 32, project: {}, edits: {}, tolerance: 0 }, () => worker, controller.signal)
  const cancellation = assert.rejects(cancelled.result, error => error instanceof ModelSourceComposeTaskError && error.kind === 'cancelled' && error.name === 'AbortError')
  controller.abort()
  await cancellation
  assert.equal(worker.terminateCount, 1)
})

test('processador de imagem filtra IDs, encaminha progresso e resolve o resultado completo', async () => {
  const worker = createWorkerDouble()
  const progress = []
  const task = startImageProcessorWorker({ id: 7, sourceDataUrl: 'source', tolerance: 74 }, value => progress.push(value), () => worker)
  const complete = { type: 'complete', id: 7, width: 80, height: 90, parts: [] }

  assert.equal(worker.posted.id, 7)
  worker.onmessage({ data: { type: 'progress', id: 8, value: 50 } })
  worker.onmessage({ data: { type: 'progress', id: 7, value: 42 } })
  worker.onmessage({ data: complete })

  assert.deepEqual(progress, [42])
  assert.deepEqual(await task.result, complete)
  assert.equal(worker.terminated, true)
})

test('processador de imagem encerra em erro e cancelamento e não termina duas vezes', async () => {
  const failedWorker = createWorkerDouble()
  const failedTask = startImageProcessorWorker({ id: 1, sourceDataUrl: 'source', tolerance: 74 }, () => {}, () => failedWorker)
  const failure = assert.rejects(failedTask.result, error => error instanceof ImageProcessorTaskError && error.kind === 'worker' && error.message === 'sem peças')
  failedWorker.onmessage({ data: { type: 'error', id: 1, message: 'sem peças' } })
  await failure
  assert.equal(failedWorker.terminateCount, 1)

  const cancelledWorker = createWorkerDouble()
  const cancelledTask = startImageProcessorWorker({ id: 2, sourceDataUrl: 'source', tolerance: 74 }, () => {}, () => cancelledWorker)
  const cancellation = assert.rejects(cancelledTask.result, error => error instanceof ImageProcessorTaskError && error.kind === 'cancelled')
  cancelledTask.cancel()
  cancelledTask.cancel()
  await cancellation
  assert.equal(cancelledWorker.terminateCount, 1)
})

test('worker compartilhado ignora respostas antigas, converte os PNGs e termina ao concluir', async () => {
  const worker = createWorkerDouble()
  const task = startChromaAdjustWorker({
    id: 9,
    sourceDataUrl: 'data:image/png;base64,SOURCE',
    tolerance: 74,
    parts: [{ id: 'head', dataUrl: 'data:image/png;base64,BASE' }]
  }, () => worker)

  assert.equal(worker.posted.id, 9)
  worker.onmessage({ data: { type: 'complete', id: 8, parts: [] } })
  assert.equal(worker.terminated, false)
  worker.onmessage({ data: { type: 'complete', id: 9, parts: [{ id: 'head', png: imageBuffer(5) }] } })

  assert.deepEqual(await task.result, new Map([['head', 'data:image/png;base64,BQ==']]))
  assert.equal(worker.terminated, true)
})

test('worker compartilhado diferencia falha, erro do worker e cancelamento sem terminar duas vezes', async () => {
  const failedWorker = createWorkerDouble()
  const failedTask = startChromaAdjustWorker({ id: 1, sourceDataUrl: 'source', tolerance: 20, parts: [] }, () => failedWorker)
  const failure = assert.rejects(failedTask.result, error => error instanceof ChromaAdjustTaskError && error.kind === 'worker' && error.message === 'falha de pixels')
  failedWorker.onmessage({ data: { type: 'error', id: 1, message: 'falha de pixels' } })
  await failure
  assert.equal(failedWorker.terminated, true)

  const runtimeWorker = createWorkerDouble()
  const runtimeTask = startChromaAdjustWorker({ id: 3, sourceDataUrl: 'source', tolerance: 20, parts: [] }, () => runtimeWorker)
  const runtimeFailure = assert.rejects(runtimeTask.result, error => error instanceof ChromaAdjustTaskError && error.kind === 'runtime' && error.message === 'Não foi possível aplicar o Chroma Key.')
  runtimeWorker.onerror(new Event('error'))
  await runtimeFailure
  assert.equal(runtimeWorker.terminated, true)

  const cancelledWorker = createWorkerDouble()
  const cancelledTask = startChromaAdjustWorker({ id: 2, sourceDataUrl: 'source', tolerance: 20, parts: [] }, () => cancelledWorker)
  const cancellation = assert.rejects(cancelledTask.result, error => error instanceof ChromaAdjustTaskError && error.kind === 'cancelled')
  cancelledTask.cancel()
  cancelledTask.cancel()
  await cancellation
  assert.equal(cancelledWorker.terminateCount, 1)
})

test('worker compartilhado acompanha AbortSignal e não inicia tarefa já cancelada', async () => {
  const worker = createWorkerDouble()
  const controller = new AbortController()
  const task = startChromaAdjustWorker({ id: 4, sourceDataUrl: 'source', tolerance: 20, parts: [] }, () => worker, controller.signal)
  const cancellation = assert.rejects(task.result, error => error instanceof ChromaAdjustTaskError && error.kind === 'cancelled')
  controller.abort()
  await cancellation
  worker.onmessage({ data: { type: 'complete', id: 4, parts: [] } })
  assert.equal(worker.terminateCount, 1)

  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  const skipped = startChromaAdjustWorker({ id: 5, sourceDataUrl: 'source', tolerance: 20, parts: [] }, () => {
    throw new Error('Worker não deve ser criado para sinal cancelado.')
  }, alreadyAborted.signal)
  await assert.rejects(skipped.result, error => error instanceof ChromaAdjustTaskError && error.kind === 'cancelled')
})

function createWorkerDouble() {
  return {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    posted: null,
    terminated: false,
    terminateCount: 0,
    postMessage(request) { this.posted = request },
    terminate() { this.terminateCount += 1; this.terminated = true }
  }
}
