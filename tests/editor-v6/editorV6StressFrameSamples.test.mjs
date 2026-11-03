import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeSelectedFrames, forEachDecodedFrameBatch } from '../../scripts/editor-v6/stressFrameSamples.ts'

test('decodifica amostras em lotes ordenados e associa cada buffer ao quadro correto', () => {
  const sampleFrames = Array.from({ length: 35 }, (_, index) => index * 3)
  const batches = []
  const decoded = decodeSelectedFrames(sampleFrames, 3, (frames) => {
    batches.push([...frames])
    return Buffer.from(frames.flatMap((frame) => [frame, frame + 1, frame + 2]))
  })

  assert.deepEqual(batches.map((batch) => batch.length), [16, 16, 3])
  assert.deepEqual([...decoded.keys()], sampleFrames)
  assert.deepEqual([...decoded.get(sampleFrames[0])], [0, 1, 2])
  assert.deepEqual([...decoded.get(sampleFrames[17])], [51, 52, 53])
  assert.deepEqual([...decoded.get(sampleFrames.at(-1))], [102, 103, 104])
})

test('lista vazia não chama o decodificador', () => {
  let calls = 0

  assert.deepEqual(decodeSelectedFrames([], 3, () => { calls += 1; return Buffer.alloc(0) }), new Map())
  assert.equal(calls, 0)
})

test('consome quadros por lote sem manter todos os buffers decodificados', () => {
  const consumed = []
  const frames = [2, 4, 6, 8, 10]
  forEachDecodedFrameBatch(frames, 2, (batch) => Buffer.from(batch.flatMap((frame) => [frame, frame + 1])), (batch, decoded) => {
    consumed.push({ frames: [...batch], bytes: [...decoded] })
  }, 2)

  assert.deepEqual(consumed, [
    { frames: [2, 4], bytes: [2, 3, 4, 5] },
    { frames: [6, 8], bytes: [6, 7, 8, 9] },
    { frames: [10], bytes: [10, 11] }
  ])
})

test('rejeita uma amostra que não contém todos os bytes esperados', () => {
  assert.throws(
    () => decodeSelectedFrames([10, 20], 4, () => Buffer.alloc(7)),
    /retornou 7 bytes; esperava 8 para 2 quadros/
  )
})

test('valida o limite do lote e o tamanho do quadro antes de iniciar', () => {
  assert.throws(() => decodeSelectedFrames([1], 0, () => Buffer.alloc(0)), /tamanho do quadro.*positivo/)
  assert.throws(() => decodeSelectedFrames([1], 1, () => Buffer.alloc(1), 0), /lote de quadros.*positivo/)
})
