import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createImportedModelProject } from '../src/renderer/src/features/fabricator/models/processedModelProject.ts'
import { ChromaAdjustTaskError, startChromaAdjustWorker } from '../src/renderer/src/features/fabricator/models/runChromaAdjustWorker.ts'
import { ImageProcessorTaskError, startImageProcessorWorker } from '../src/renderer/src/features/fabricator/models/runImageProcessorWorker.ts'

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
  const [page, imageWorker, chromaWorker, modelSource, chromaRunner, imageRunner] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/imageProcessor.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/chromaAdjust.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/modelSource.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runChromaAdjustWorker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/runImageProcessorWorker.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /startImageProcessorWorker/)
  assert.match(imageRunner, /MessageEvent<ImageProcessorMessage>/)
  assert.match(imageRunner, /satisfies ImageProcessorRequest/)
  assert.match(imageWorker, /MessageEvent<ImageProcessorRequest>/)
  assert.match(page, /startChromaAdjustWorker/)
  assert.match(modelSource, /startChromaAdjustWorker/)
  assert.match(chromaRunner, /MessageEvent<ChromaAdjustMessage>/)
  assert.match(chromaRunner, /satisfies ChromaAdjustRequest/)
  assert.match(chromaWorker, /MessageEvent<ChromaAdjustRequest>/)
  assert.doesNotMatch(page, /new Worker\(new URL\('\.\/models\/imageProcessor\.worker/)
  assert.doesNotMatch(page, /new Worker\(new URL\('\.\/models\/chromaAdjust\.worker/)
  assert.doesNotMatch(modelSource, /new Worker\(new URL\('\.\/chromaAdjust\.worker/)
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

function createWorkerDouble() {
  return {
    onmessage: null,
    onerror: null,
    posted: null,
    terminated: false,
    terminateCount: 0,
    postMessage(request) { this.posted = request },
    terminate() { this.terminateCount += 1; this.terminated = true }
  }
}
