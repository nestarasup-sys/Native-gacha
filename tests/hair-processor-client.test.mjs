import test from 'node:test'
import assert from 'node:assert/strict'
import { runHairProcessor } from '../src/renderer/src/features/fabricator/hairProcessorClient.ts'

const request = {
  dataUrl: 'data:image/png;base64,AA==',
  tolerance: 70,
  mode: 'auto',
  layout: 'pair',
  paddingPercent: 0
}

function createWorker(overrides = {}) {
  return {
    onmessage: null,
    onerror: null,
    posted: null,
    terminateCount: 0,
    postMessage(value) { this.posted = value },
    terminate() { this.terminateCount += 1 },
    ...overrides
  }
}

test('cliente envia o contrato da tarefa, confere URL do worker e encerra após resposta válida', async () => {
  const worker = createWorker()
  let workerOptions
  const resultPromise = runHairProcessor(request, (url, options) => {
    assert.match(url.pathname, /hairProcessor\.worker\.ts$/)
    workerOptions = options
    return worker
  })
  assert.deepEqual(worker.posted, request)
  assert.deepEqual(workerOptions, { type: 'module' })

  const result = { type: 'complete', layout: 'pair', front: { png: new ArrayBuffer(0), width: 4, height: 5 }, back: { png: new ArrayBuffer(0), width: 6, height: 7 } }
  worker.onmessage({ data: result })
  assert.equal(await resultPromise, result)
  assert.equal(worker.terminateCount, 1)
})

test('resposta de erro e formato inesperado encerram o worker e rejeitam', async () => {
  const processorError = createWorker()
  const errorPromise = runHairProcessor(request, () => processorError)
  processorError.onmessage({ data: { type: 'error', message: 'Falha sintética' } })
  await assert.rejects(errorPromise, /Falha sintética/)
  assert.equal(processorError.terminateCount, 1)

  const wrongLayout = createWorker()
  const layoutPromise = runHairProcessor(request, () => wrongLayout)
  wrongLayout.onmessage({ data: { type: 'complete', layout: 'three-style-grid' } })
  await assert.rejects(layoutPromise, /formato de cabelo inesperado/)
  assert.equal(wrongLayout.terminateCount, 1)
})

test('erro do Worker e falha ao postar também encerram o recurso', async () => {
  const erroredWorker = createWorker()
  const errorPromise = runHairProcessor(request, () => erroredWorker)
  erroredWorker.onerror({})
  await assert.rejects(errorPromise, /Não foi possível processar o chroma/)
  assert.equal(erroredWorker.terminateCount, 1)

  const postingWorker = createWorker({ postMessage() { throw new Error('Falha sintética de envio') } })
  await assert.rejects(runHairProcessor(request, () => postingWorker), /Falha sintética de envio/)
  assert.equal(postingWorker.terminateCount, 1)
})
