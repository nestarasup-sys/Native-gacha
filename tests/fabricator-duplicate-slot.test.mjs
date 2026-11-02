import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { duplicateFabricatorSlot } from '../src/renderer/src/features/fabricator/duplicateFabricatorSlot.ts'

const source = {
  slot: 1,
  name: 'Modelo base',
  sourceName: 'modelo.png',
  parts: [{ id: 'head' }, { id: 'body' }]
}

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    source,
    targetSlot: 2,
    targetOccupied: false,
    cancelScheduledSave: () => calls.push(['cancelSave']),
    persistProject: async (project) => calls.push(['persist', project.slot]),
    duplicateSlot: async (from, to) => calls.push(['duplicate', from, to]),
    setBusy: (busy) => calls.push(['busy', busy]),
    setError: (error) => calls.push(['error', error]),
    setSlotSummary: (summary) => calls.push(['summary', summary]),
    broadcastAssetsUpdated: () => calls.push(['assetsUpdated']),
    closeDialog: () => calls.push(['closeDialog']),
    clearTargetSlot: () => calls.push(['clearTarget']),
    now: () => '2026-11-01T12:00:00.000Z',
    ...overrides
  }
  return { calls, dependencies }
}

test('salva antes de duplicar e atualiza o resumo somente após sucesso do catálogo', async () => {
  const { calls, dependencies } = createHarness()

  await duplicateFabricatorSlot(dependencies)

  assert.deepEqual(calls, [
    ['busy', true], ['error', ''], ['cancelSave'], ['persist', 1], ['duplicate', 1, 2],
    ['summary', { slot: 2, name: 'Modelo base', sourceName: 'modelo.png', partCount: 2, updatedAt: '2026-11-01T12:00:00.000Z' }],
    ['assetsUpdated'], ['closeDialog'], ['clearTarget'], ['busy', false]
  ])
})

test('falha ao salvar impede a duplicação e libera o estado ocupado', async () => {
  const failure = new Error('projeto não salvo')
  const { calls, dependencies } = createHarness({ persistProject: async () => { throw failure } })

  await duplicateFabricatorSlot(dependencies)

  assert.equal(calls.some(([kind]) => kind === 'duplicate'), false)
  assert.equal(calls.some(([kind]) => kind === 'summary'), false)
  assert.equal(calls.some(([kind]) => kind === 'closeDialog'), false)
  assert.deepEqual(calls.slice(-2), [['error', 'projeto não salvo'], ['busy', false]])
})

test('falha do catálogo mantém o resumo atual e apresenta a causa', async () => {
  const { calls, dependencies } = createHarness({ duplicateSlot: async () => { throw new Error('slot ocupado') } })

  await duplicateFabricatorSlot(dependencies)

  assert.equal(calls.some(([kind]) => kind === 'summary'), false)
  assert.equal(calls.some(([kind]) => kind === 'assetsUpdated'), false)
  assert.equal(calls.some(([kind]) => kind === 'closeDialog'), false)
  assert.equal(calls.some(([kind, value]) => kind === 'error' && value === 'slot ocupado'), true)
  assert.deepEqual(calls.at(-1), ['busy', false])
})

test('não altera estado nem chama serviços para alvo inválido, ocupado ou origem ausente', async (t) => {
  for (const overrides of [
    { source: null },
    { targetSlot: null },
    { targetSlot: 1 },
    { targetOccupied: true }
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      const { calls, dependencies } = createHarness(overrides)
      await duplicateFabricatorSlot(dependencies)
      assert.deepEqual(calls, [])
    })
  }
})

test('FabricatorPage delega a gravação e duplicação ao comando da feature', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /await duplicateFabricatorSlot\(/)
  assert.match(page, /persistProject,/)
  assert.match(page, /window\.desktop\.fabricator\.duplicateFabricatorSlot\(sourceSlot, target\)/)
})
