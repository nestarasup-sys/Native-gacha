import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadFabricatorSlotForEditing } from '../src/renderer/src/features/fabricator/models/loadFabricatorSlotForEditing.ts'

const loaded = { slot: 3, name: 'Modelo 03', parts: [{ id: 'part-1' }] }
const history = { undo: [{ slot: 3 }], redo: [] }
const prepared = { project: { ...loaded, hydrated: true }, dirtyAssets: new Map(), dirtyChromaBases: new Map(), warning: null }

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    loadProject: async (slot) => { calls.push(['load-project', slot]); return loaded },
    loadHistory: async (slot) => { calls.push(['load-history', slot]); return history },
    isCurrent: () => true,
    onHistoryLoadFailure: () => calls.push(['history-warning']),
    replaceHistory: (value) => calls.push(['replace-history', value]),
    prepareProject: async (project, state, isCurrent) => {
      calls.push(['prepare', project, state, isCurrent()])
      return prepared
    },
    ...overrides
  }
  return { calls, load: () => loadFabricatorSlotForEditing(3, dependencies) }
}

test('carrega projeto e histórico, instala histórico e prepara antes de retornar o snapshot', async () => {
  const { calls, load } = createHarness()

  const snapshot = await load()

  assert.deepEqual(calls.map(([step]) => step), ['load-project', 'load-history', 'replace-history', 'prepare'])
  assert.equal(snapshot.loaded, loaded)
  assert.equal(snapshot.history, history)
  assert.equal(snapshot.prepared, prepared)
})

test('falha ao ler histórico usa o estado vazio e mantém o projeto disponível', async () => {
  const { calls, load } = createHarness({
    loadHistory: async () => { calls.push(['load-history', 3]); throw new Error('histórico indisponível') }
  })

  const snapshot = await load()

  assert.deepEqual(calls.map(([step]) => step), ['load-project', 'load-history', 'history-warning', 'replace-history', 'prepare'])
  assert.deepEqual(snapshot.history, { undo: [], redo: [] })
  assert.equal(snapshot.prepared, prepared)
})

test('seleção obsoleta após carregar o projeto não inicia leituras adicionais', async () => {
  const { calls, load } = createHarness({ isCurrent: () => false })

  assert.equal(await load(), null)
  assert.deepEqual(calls.map(([step]) => step), ['load-project'])
})

test('seleção que fica obsoleta durante leitura do histórico não publica histórico antigo', async () => {
  const calls = []
  let checks = 0
  const { load } = createHarness({
    loadProject: async () => { calls.push('load-project'); return loaded },
    loadHistory: async () => { calls.push('load-history'); return history },
    isCurrent: () => ++checks === 1
  })

  assert.equal(await load(), null)
  assert.deepEqual(calls, ['load-project', 'load-history'])
})

test('projeto ausente mantém o erro de domínio e não carrega histórico', async () => {
  let historyLoads = 0
  const { load } = createHarness({
    loadProject: async () => null,
    loadHistory: async () => { historyLoads += 1; return history }
  })

  await assert.rejects(load(), /O projeto salvo não pôde ser carregado/)
  assert.equal(historyLoads, 0)
})

test('FabricatorPage injeta os IPCs, os guards de geração e a hidratação do modelo', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /await loadFabricatorSlotForEditing\(slot, \{/)
  assert.match(page, /loadProject: \(targetSlot\) => window\.desktop\.fabricator\.loadFabricatorSlot\(targetSlot\)/)
  assert.match(page, /isCurrent: \(\) => generation === slotSelectionGeneration\.current/)
  assert.match(page, /prepareProject: prepareLoadedFabricatorProject/)
  assert.match(page, /if \(!snapshot \|\| generation !== slotSelectionGeneration\.current\) return/)
})
