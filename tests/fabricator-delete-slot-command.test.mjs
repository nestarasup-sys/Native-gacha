import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deleteFabricatorSlotCommand } from '../src/renderer/src/features/fabricator/deleteFabricatorSlotCommand.ts'

const summary = (overrides = {}) => ({ slot: 2, name: 'Modelo de teste', sourceName: 'base.png', partCount: 3, updatedAt: '2026-01-01T00:00:00.000Z', ...overrides })
const project = (overrides = {}) => ({ slot: 2, name: 'Modelo de teste', updatedAt: '2026-01-01T00:00:00.000Z', parts: [], ...overrides })

function createDeps(overrides = {}) {
  const calls = []
  const state = { currentProject: project(), restoredProject: null, error: '' }
  const deps = {
    slot: 2,
    summary: summary(),
    activeSlot: 2,
    deletionInProgress: false,
    confirm: (message) => { calls.push(['confirm', message]); return true },
    setDeletingSlot: (slot) => calls.push(['busy', slot]),
    invalidateActiveProject: () => calls.push(['invalidate-active']),
    waitForProjectWrites: async () => { calls.push(['flush']) },
    deleteSlot: async (slot) => { calls.push(['delete', slot]) },
    removeSlotSummary: () => calls.push(['remove-summary']),
    clearActiveProject: () => calls.push(['clear-active']),
    setError: (message) => { state.error = message; calls.push(['error', message]) },
    getCurrentProject: () => state.currentProject,
    restoreActiveProject: (next) => { state.restoredProject = next; calls.push(['restore', next]) },
    reloadActiveSlot: async (slot) => calls.push(['reload', slot]),
    now: () => '2026-11-02T12:00:00.000Z',
    ...overrides
  }
  return { deps, calls, state }
}

test('slot ausente, exclusão simultânea ou confirmação cancelada não iniciam efeitos', async () => {
  for (const overrides of [{ summary: null }, { deletionInProgress: true }, { confirm: () => false }]) {
    const context = createDeps(overrides)
    assert.equal(await deleteFabricatorSlotCommand(context.deps), false)
    assert.deepEqual(context.calls.filter(([name]) => name !== 'confirm'), [])
  }
})

test('confirmação distingue remoção de recuperação e de slot normal', async () => {
  const regular = createDeps()
  const recovery = createDeps({ summary: summary({ recoveryRequired: true }) })

  await deleteFabricatorSlotCommand(regular.deps)
  await deleteFabricatorSlotCommand(recovery.deps)

  assert.match(regular.calls[0][1], /Excluir permanentemente “Modelo de teste”/)
  assert.match(recovery.calls[0][1], /Limpar permanentemente a recuperação pendente/)
})

test('slot ativo aguarda writes antes da exclusão e limpa a sessão somente após sucesso', async () => {
  const { deps, calls } = createDeps()

  assert.equal(await deleteFabricatorSlotCommand(deps), true)
  assert.deepEqual(calls.map(([name]) => name), ['confirm', 'busy', 'invalidate-active', 'flush', 'delete', 'remove-summary', 'clear-active', 'busy'])
  assert.deepEqual(calls.filter(([name]) => name === 'busy').map(([, value]) => value), [2, null])
})

test('slot inativo não cancela nem limpa o projeto atualmente aberto', async () => {
  const { deps, calls } = createDeps({ activeSlot: 1 })

  assert.equal(await deleteFabricatorSlotCommand(deps), true)
  assert.equal(calls.some(([name]) => name === 'invalidate-active' || name === 'clear-active'), false)
  assert.deepEqual(calls.map(([name]) => name), ['confirm', 'busy', 'flush', 'delete', 'remove-summary', 'busy'])
})

test('falha ao excluir o slot ativo restaura o projeto atual e agenda uma nova versão', async () => {
  const { deps, calls, state } = createDeps({ deleteSlot: async () => { throw new Error('disco ocupado') } })

  assert.equal(await deleteFabricatorSlotCommand(deps), false)
  assert.equal(state.error, 'Não foi possível excluir o modelo: disco ocupado')
  assert.equal(state.restoredProject.updatedAt, '2026-11-02T12:00:00.000Z')
  assert.deepEqual(calls.map(([name]) => name), ['confirm', 'busy', 'invalidate-active', 'flush', 'error', 'restore', 'busy'])
})

test('falha sem projeto carregado recarrega o slot e sempre libera o estado ocupado', async () => {
  const context = createDeps({ getCurrentProject: () => null })
  const { deps, calls, state } = context
  deps.waitForProjectWrites = async () => { calls.push(['flush']); throw new Error('flush falhou') }

  assert.equal(await deleteFabricatorSlotCommand(deps), false)
  assert.equal(state.error, 'Não foi possível excluir o modelo: flush falhou')
  assert.deepEqual(calls.map(([name]) => name), ['confirm', 'busy', 'invalidate-active', 'flush', 'error', 'reload', 'busy'])
  assert.equal(calls.at(-1)[1], null)
})

test('FabricatorPage injeta persistência, cancelamento e recuperação no comando da feature', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /deleteFabricatorSlotCommand\(\{/)
  assert.match(page, /waitForProjectWrites,/)
  assert.match(page, /deleteSlot: \(targetSlot\) => window\.desktop\.fabricator\.deleteFabricatorSlot\(targetSlot\)/)
  assert.match(page, /invalidateActiveProject: \(\) =>/)
  assert.match(page, /restoreActiveProject:/)
  assert.match(page, /reloadActiveSlot: \(targetSlot\) => selectSlot\(targetSlot\)/)
})
