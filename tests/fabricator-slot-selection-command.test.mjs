import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectFabricatorSlotCommand } from '../src/renderer/src/features/fabricator/selectFabricatorSlotCommand.ts'

const snapshot = { loaded: { slot: 3 }, prepared: { project: { slot: 3 }, dirtyAssets: new Map(), dirtyChromaBases: new Map() } }

function createHarness(overrides = {}) {
  const calls = []
  const state = { generation: 0, error: '' }
  const dependencies = {
    slot: 3,
    summary: { slot: 3, name: 'Modelo 3', sourceName: 'base.png', partCount: 2, updatedAt: 'now' },
    nextGeneration: () => { state.generation += 1; calls.push(['generation', state.generation]); return state.generation },
    isCurrent: (generation) => generation === state.generation,
    setSwitching: (switching) => calls.push(['switching', switching]),
    invalidatePendingWork: () => calls.push(['invalidate']),
    getCurrentProject: () => ({ slot: 1 }),
    persistCurrentProject: async (project) => { calls.push(['persist', project.slot]) },
    onSaveFailure: (reason) => { state.error = reason instanceof Error ? reason.message : String(reason); calls.push(['save-error', state.error]) },
    resetSlotSession: (slot) => calls.push(['reset', slot]),
    onRecoveryRequired: (slot) => calls.push(['recovery', slot]),
    loadSnapshot: async (slot, isCurrent) => { calls.push(['load', slot, isCurrent()]); return snapshot },
    applySnapshot: (value) => calls.push(['apply', value]),
    onLoadFailure: (reason) => { state.error = reason instanceof Error ? reason.message : String(reason); calls.push(['load-error', state.error]) },
    ...overrides
  }
  return { dependencies, calls, state }
}

test('salva antes de resetar a sessão e aplica o snapshot somente após o carregamento', async () => {
  const { dependencies, calls } = createHarness()

  await selectFabricatorSlotCommand(dependencies)

  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'persist', 'reset', 'load', 'apply', 'switching'])
  assert.deepEqual(calls.filter(([name]) => name === 'switching').map(([, value]) => value), [true, false])
  assert.deepEqual(calls.find(([name]) => name === 'load').slice(1), [3, true])
})

test('sem projeto atual não persiste, mas ainda troca para o slot selecionado', async () => {
  const { dependencies, calls } = createHarness({ getCurrentProject: () => null })

  await selectFabricatorSlotCommand(dependencies)

  assert.equal(calls.some(([name]) => name === 'persist'), false)
  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'reset', 'load', 'apply', 'switching'])
})

test('falha ao salvar mantém a sessão antiga e não tenta carregar o destino', async () => {
  const { dependencies, calls, state } = createHarness({ persistCurrentProject: async () => { calls.push(['persist']); throw new Error('write interrompido') } })

  await selectFabricatorSlotCommand(dependencies)

  assert.equal(state.error, 'write interrompido')
  assert.equal(calls.some(([name]) => name === 'reset' || name === 'load'), false)
  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'persist', 'save-error', 'switching'])
})

test('resposta de salvamento obsoleta não troca o slot nem encerra o loading da solicitação nova', async () => {
  let releasePersist
  const { dependencies, calls, state } = createHarness({ persistCurrentProject: () => new Promise((resolve) => { releasePersist = resolve }) })
  const pending = selectFabricatorSlotCommand(dependencies)
  state.generation += 1
  releasePersist()
  await pending

  assert.equal(calls.some(([name, value]) => name === 'reset' || name === 'load' || name === 'switching' && value === false), false)
})

test('slot vazio limpa a sessão e encerra a troca sem chamar o loader', async () => {
  const { dependencies, calls } = createHarness({ summary: null })

  await selectFabricatorSlotCommand(dependencies)

  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'persist', 'reset', 'switching'])
})

test('slot com recuperação exige ação manual e não tenta escolher um snapshot', async () => {
  const { dependencies, calls } = createHarness({ summary: { slot: 3, recoveryRequired: true } })

  await selectFabricatorSlotCommand(dependencies)

  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'persist', 'reset', 'recovery', 'switching'])
})

test('uma resposta obsoleta do loader não aplica estado nem encerra o loading atual', async () => {
  let releaseLoad
  const { dependencies, calls, state } = createHarness({ loadSnapshot: () => new Promise((resolve) => { releaseLoad = resolve }) })
  const pending = selectFabricatorSlotCommand(dependencies)
  await new Promise((resolve) => setImmediate(resolve))
  state.generation += 1
  releaseLoad(snapshot)
  await pending

  assert.equal(calls.some(([name]) => name === 'apply'), false)
  assert.equal(calls.some(([name, value]) => name === 'switching' && value === false), false)
})

test('falha atual de carregamento expõe o erro e libera a troca', async () => {
  const { dependencies, calls, state } = createHarness({ loadSnapshot: async () => { throw new Error('modelo inválido') } })

  await selectFabricatorSlotCommand(dependencies)

  assert.equal(state.error, 'modelo inválido')
  assert.deepEqual(calls.map(([name]) => name), ['generation', 'switching', 'invalidate', 'persist', 'reset', 'load-error', 'switching'])
})

test('a página injeta persistência, limpeza da sessão e loader com guarda de geração', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')
  const command = await readFile(new URL('../src/renderer/src/features/fabricator/selectFabricatorSlotCommand.ts', import.meta.url), 'utf8')

  assert.match(page, /selectFabricatorSlotCommand\(\{/)
  assert.match(page, /persistCurrentProject: async \(projectToSave\) => \{ cancelScheduledSave\(\); await persistProject\(projectToSave\) \}/)
  assert.match(page, /resetSlotSession: \(targetSlot\) =>/)
  assert.match(page, /loadSnapshot: \(targetSlot, isCurrent\) => loadFabricatorSlotForEditing\(targetSlot, \{/)
  assert.match(page, /isCurrent,/)
  assert.match(page, /prepareProject: prepareLoadedFabricatorProject/)
  assert.match(command, /if \(!snapshot \|\| !deps\.isCurrent\(generation\)\) return/)
})
