import test from 'node:test'
import assert from 'node:assert/strict'
import { createFabricatorProjectSaveCoordinator } from '../src/renderer/src/features/fabricator/projectSaveCoordinator.ts'

function project(slot, name) {
  return {
    schemaVersion: 1,
    slot,
    name,
    sourceName: `${name}.png`,
    sourceAssetName: `source-${slot}.png`,
    sourceDataUrl: 'data:image/png;base64,c291cmNl',
    width: 100,
    height: 100,
    tolerance: 74,
    parts: [{ id: `part-${slot}`, name: 'Cabeça', x: 0, y: 0, width: 10, height: 10, dataUrl: 'data:image/png;base64,cGFydA==', rotation: 0 }],
    joints: [],
    updatedAt: `2026-10-${String(slot).padStart(2, '0')}T00:00:00.000Z`
  }
}

function fixture({ saveProject, debounceMs = 60_000 } = {}) {
  const projectRef = { current: project(1, 'Inicial') }
  const dirtyAssets = new Map([['part-1', 'data:image/png;base64,ZWRpdGVk']])
  const dirtyChromaBases = new Map()
  const saved = []
  const states = []
  const errors = []
  const writes = []
  const coordinator = createFabricatorProjectSaveCoordinator({
    projectRef,
    dirtyAssets: { current: dirtyAssets },
    dirtyChromaBases: { current: dirtyChromaBases },
    saveProject: saveProject ?? (async (serialized, assets) => { writes.push({ serialized, assets }) }),
    setSaveState: (state) => states.push(state),
    setError: (message) => errors.push(message),
    onProjectSaved: (snapshot) => saved.push(snapshot),
    debounceMs
  })
  return { coordinator, projectRef, dirtyAssets, dirtyChromaBases, saved, states, errors, writes }
}

test('flush salva o snapshot atual e só limpa assets confirmados pela mesma versão', async () => {
  const state = fixture()
  state.coordinator.scheduleSave(state.projectRef.current)
  state.projectRef.current = project(1, 'Mais recente')

  await state.coordinator.flushProjectWrites()

  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].serialized.name, 'Mais recente')
  assert.equal(state.writes[0].serialized.sourceDataUrl, undefined)
  assert.deepEqual(state.writes[0].assets, [{ id: 'part-1', dataUrl: 'data:image/png;base64,ZWRpdGVk' }])
  assert.equal(state.dirtyAssets.has('part-1'), false)
  assert.equal(state.saved[0].name, 'Mais recente')
  assert.deepEqual(state.states, ['saving', 'saved'])
  await state.coordinator.waitForProjectWrites()
})

test('uma gravação antiga não limpa um asset editado enquanto o IPC estava em andamento', async () => {
  let markStarted
  let releaseSave
  const started = new Promise((resolve) => { markStarted = resolve })
  const gate = new Promise((resolve) => { releaseSave = resolve })
  const state = fixture({ saveProject: async () => { markStarted(); await gate } })
  const pending = state.coordinator.persistProject(state.projectRef.current)
  await started
  state.dirtyAssets.set('part-1', 'data:image/png;base64,bmV3ZXI=')
  releaseSave()
  await pending

  assert.equal(state.dirtyAssets.get('part-1'), 'data:image/png;base64,bmV3ZXI=')
})

test('a fila serializa snapshots e permite seguir após uma gravação falhar', async () => {
  const order = []
  let releaseFirst
  let failFirst = true
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const state = fixture({
    saveProject: async (serialized) => {
      order.push(`start:${serialized.slot}`)
      if (failFirst) {
        failFirst = false
        await gate
        order.push(`fail:${serialized.slot}`)
        throw new Error('falha sintética')
      }
      order.push(`saved:${serialized.slot}`)
    }
  })

  const first = state.coordinator.persistProject(project(1, 'Primeiro'))
  await Promise.resolve()
  const second = state.coordinator.persistProject(project(2, 'Segundo'))
  await Promise.resolve()
  assert.deepEqual(order, ['start:1'])

  releaseFirst()
  await assert.rejects(first, /falha sintética/)
  await second
  assert.deepEqual(order, ['start:1', 'fail:1', 'start:2', 'saved:2'])
  assert.deepEqual(state.saved.map(({ slot }) => slot), [2])
})

test('cancelamento impede o debounce pendente e o flush reporta erros sem ocultá-los', async () => {
  const cancelled = fixture({ debounceMs: 10 })
  cancelled.coordinator.scheduleSave(cancelled.projectRef.current)
  cancelled.coordinator.cancelScheduledSave()
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(cancelled.writes.length, 0)

  const failing = fixture({ saveProject: async () => { throw new Error('falha sintética') } })
  failing.coordinator.scheduleSave(failing.projectRef.current)
  await assert.rejects(failing.coordinator.flushProjectWrites(), /falha sintética/)
  assert.equal(failing.states.at(-1), 'error')
  assert.match(failing.errors.at(-1), /Falha ao salvar o projeto: falha sintética/)
  assert.equal(failing.dirtyAssets.has('part-1'), true)
  await failing.coordinator.waitForProjectWrites()
})
