import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModelAppearancePreviews } from '../src/renderer/src/features/fabricator/models/modelAppearancePreviewLoader.ts'

const parts = (count) => Array.from({ length: count }, (_, index) => ({ id: `part-${index}`, name: `Parte ${index}` }))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('previews usam chave de slot e peça, filtram ausentes e preservam a ordem', async () => {
  const result = await loadModelAppearancePreviews(
    4,
    parts(4),
    '#f0c8aa',
    '#6a2c2c',
    async (slot, part, tone, outline) => {
      assert.equal(slot, 4)
      assert.equal(tone, '#f0c8aa')
      assert.equal(outline, '#6a2c2c')
      return part.id === 'part-1' ? null : `preview:${part.id}`
    },
    () => false
  )

  assert.deepEqual(Object.keys(result), ['4:part-0', '4:part-2', '4:part-3'])
  assert.equal(result['4:part-2'], 'preview:part-2')
})

test('trocas independentes compartilham o limite de duas gerações simultâneas', async () => {
  let active = 0
  let maximumActive = 0
  const createBatch = (slot) => loadModelAppearancePreviews(
    slot,
    parts(5),
    undefined,
    undefined,
    async (currentSlot, part) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      try {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return `${currentSlot}:${part.id}`
      } finally {
        active -= 1
      }
    },
    () => false
  )

  const [first, second] = await Promise.all([createBatch(1), createBatch(2)])
  assert.equal(maximumActive, 2)
  assert.equal(Object.keys(first).length, 5)
  assert.equal(Object.keys(second).length, 5)
})

test('troca de modelo cancela trabalhos ainda enfileirados e descarta resultados antigos', async () => {
  const gate = deferred()
  let started = 0
  let cancelled = false
  const load = loadModelAppearancePreviews(7, parts(5), undefined, undefined, async () => {
    started += 1
    await gate.promise
    return 'preview antiga'
  }, () => cancelled)

  while (started < 2) await Promise.resolve()
  cancelled = true
  gate.resolve()

  assert.deepEqual(await load, {})
  assert.equal(started, 2)
})

test('falha em uma peça interrompe a fila e é propagada após o trabalho ativo terminar', async () => {
  const activeGate = deferred()
  const failedGate = deferred()
  let started = 0
  const load = loadModelAppearancePreviews(8, parts(5), undefined, undefined, async (_slot, part) => {
    started += 1
    if (part.id === 'part-0') return failedGate.promise
    if (part.id === 'part-1') return activeGate.promise
    return 'não deveria iniciar'
  }, () => false)

  while (started < 2) await Promise.resolve()
  failedGate.reject(new Error('falha ao gerar PNG'))
  activeGate.resolve('preview ativa')

  await assert.rejects(load, /falha ao gerar PNG/)
  assert.equal(started, 2)
})
