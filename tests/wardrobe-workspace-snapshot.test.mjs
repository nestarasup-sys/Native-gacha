import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadWardrobeWorkspaceSnapshot } from '../src/renderer/src/features/fabricator/wardrobe/loadWardrobeWorkspaceSnapshot.ts'

const reference = { slot: 2, name: 'modelo-base' }
const models = [null, { slot: 2 }, { slot: 3 }]
const catalog = { sets: [{ id: 'set-1' }], issues: [{ id: 'set-legacy', reason: 'needs review' }] }

function dependencies(overrides = {}) {
  const calls = []
  return {
    calls,
    value: {
      listSlots: async () => { calls.push('list-slots'); return models },
      loadModel: async (slot) => { calls.push(`load-model:${slot}`); return reference },
      listWardrobeSets: async (slot) => { calls.push(`list-sets:${slot}`); return catalog },
      loadHistory: async (slot) => { calls.push(`load-history:${slot}`); return { undo: [], redo: [] } },
      recoverReference: (model, history) => { calls.push(`recover:${history.undo.length}`); return { ...model, recovered: true } },
      ...overrides
    }
  }
}

test('carrega slots, referência e catálogo em paralelo e recupera a referência sem publicar mudanças', async () => {
  const fixture = dependencies()
  const result = await loadWardrobeWorkspaceSnapshot(2, fixture.value)

  assert.deepEqual(fixture.calls.slice(0, 3), ['list-slots', 'load-model:2', 'list-sets:2'])
  assert.deepEqual(fixture.calls.slice(3), ['load-history:2', 'recover:0'])
  assert.deepEqual(result, { kind: 'loaded', models, model: { ...reference, recovered: true }, catalog })
})

test('redireciona para o primeiro modelo salvo e não lê histórico quando o slot pedido está vazio', async () => {
  const fixture = dependencies()
  fixture.value.loadModel = async (slot) => { fixture.calls.push(`load-model:${slot}`); return null }
  const result = await loadWardrobeWorkspaceSnapshot(1, fixture.value)

  assert.deepEqual(result, { kind: 'redirect', models, targetSlot: 2 })
  assert.deepEqual(fixture.calls, ['list-slots', 'load-model:1', 'list-sets:1'])
})

test('mantém modelo de referência funcional se o histórico retornar vazio ou falhar', async () => {
  const noHistory = dependencies({ loadHistory: async () => null })
  assert.deepEqual(await loadWardrobeWorkspaceSnapshot(2, noHistory.value), { kind: 'loaded', models, model: reference, catalog })

  const failedHistory = dependencies({ loadHistory: async () => { throw new Error('histórico indisponível') } })
  assert.deepEqual(await loadWardrobeWorkspaceSnapshot(2, failedHistory.value), { kind: 'loaded', models, model: reference, catalog })
})

test('propaga falha nas leituras principais para o tratamento de erro da página', async () => {
  const fixture = dependencies({ listWardrobeSets: async () => { throw new Error('catálogo indisponível') } })

  await assert.rejects(loadWardrobeWorkspaceSnapshot(2, fixture.value), /catálogo indisponível/)
})

test('WardrobeWorkspace delega a carga e mantém os guards contra respostas obsoletas', async () => {
  const [page, session] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/useWardrobeCatalogSession.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /useWardrobeCatalogSession\(/)
  assert.match(session, /await loadWardrobeWorkspaceSnapshot\(targetSlot/)
  assert.match(session, /requestRef\.current !== requestId/)
  assert.match(session, /requestRef\.current\+\+/)
})
