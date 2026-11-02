import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWardrobeTestPoseCommands } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeTestPoseCommands.ts'

const pageUrl = new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeHarness({ listPoseSlots = async () => [], loadPose = async () => null } = {}) {
  const events = []
  const state = { poseSlots: [], pose: null, loading: false, pickerOpen: false, dragOffsets: { part: { x: 2, y: -3 } }, joinJoints: true, error: 'previous' }
  const requestRef = { current: 0 }
  const commands = createWardrobeTestPoseCommands({
    requestRef,
    listPoseSlots: async (slot) => { events.push(['list', slot]); return listPoseSlots(slot) },
    loadPose: async (modelSlot, poseSlot) => { events.push(['load', modelSlot, poseSlot]); return loadPose(modelSlot, poseSlot) },
    setPoseSlots: (slots) => { events.push(['slots', slots]); state.poseSlots = slots },
    setPose: (pose) => { events.push(['pose', pose]); state.pose = pose },
    setLoading: (loading) => { events.push(['loading', loading]); state.loading = loading },
    setPickerOpen: (open) => { events.push(['picker', open]); state.pickerOpen = open },
    clearDragOffsets: () => { events.push(['clear-offsets']); state.dragOffsets = {} },
    disableJoinJoints: () => { events.push(['disable-joints']); state.joinJoints = false },
    setError: (error) => { events.push(['error', error]); state.error = error }
  })
  return { commands, events, requestRef, state }
}

test('abrir o seletor filtra slots vazios e encerra loading após listar', async () => {
  const first = { slot: 1, sourceModelSlot: 3, name: 'Em pé', sourceModelName: 'Base', partCount: 10, updatedAt: 'today' }
  const second = { slot: 2, sourceModelSlot: 3, name: 'Sentada', sourceModelName: 'Base', partCount: 9, updatedAt: 'today' }
  const harness = makeHarness({ listPoseSlots: async () => [null, first, null, second] })

  await harness.commands.openPicker(3)

  assert.deepEqual(harness.state.poseSlots, [first, second])
  assert.equal(harness.state.pickerOpen, true)
  assert.equal(harness.state.loading, false)
  assert.equal(harness.state.error, '')
  assert.deepEqual(harness.events.slice(0, 4), [['error', ''], ['picker', true], ['loading', true], ['list', 3]])
})

test('falha de listagem apresenta o erro e libera o loading', async () => {
  const harness = makeHarness({ listPoseSlots: async () => { throw new Error('catálogo indisponível') } })

  await harness.commands.openPicker(2)

  assert.equal(harness.state.error, 'catálogo indisponível')
  assert.equal(harness.state.loading, false)
  assert.equal(harness.state.pickerOpen, true)
})

test('fechar invalida uma listagem em curso e resposta antiga não muda o estado', async () => {
  const pending = deferred()
  const harness = makeHarness({ listPoseSlots: () => pending.promise })
  const opening = harness.commands.openPicker(4)

  harness.commands.closePicker()
  pending.resolve([{ slot: 1, sourceModelSlot: 4, name: 'Em pé', sourceModelName: 'Base', partCount: 10, updatedAt: 'today' }])
  await opening

  assert.deepEqual(harness.state.poseSlots, [])
  assert.equal(harness.state.loading, false)
  assert.equal(harness.state.pickerOpen, false)
})

test('carregar pose validada limpa ajustes temporários e abre a prévia', async () => {
  const pose = { slot: 5, sourceModelSlot: 2, parts: [] }
  const harness = makeHarness({ loadPose: async () => pose })

  await harness.commands.loadPose(2, 5)

  assert.equal(harness.state.pose, pose)
  assert.equal(harness.state.loading, false)
  assert.equal(harness.state.pickerOpen, false)
  assert.deepEqual(harness.state.dragOffsets, {})
  assert.equal(harness.state.joinJoints, false)
  assert.equal(harness.state.error, '')
})

test('pose ausente ou de outro slot não entra na prévia e mantém o erro de domínio', async () => {
  const harness = makeHarness({ loadPose: async () => ({ slot: 1, sourceModelSlot: 9 }) })
  harness.state.pickerOpen = true

  await harness.commands.loadPose(2, 1)

  assert.equal(harness.state.pose, null)
  assert.equal(harness.state.pickerOpen, true)
  assert.equal(harness.state.error, 'Esta pose não está mais disponível para o modelo selecionado.')
  assert.equal(harness.state.loading, false)
})

test('sair do teste invalida a carga pendente e zera pose e offsets', async () => {
  const pending = deferred()
  const harness = makeHarness({ loadPose: () => pending.promise })
  const loading = harness.commands.loadPose(1, 7)

  harness.commands.exitPose()
  pending.resolve({ slot: 7, sourceModelSlot: 1 })
  await loading

  assert.equal(harness.state.pose, null)
  assert.equal(harness.state.loading, false)
  assert.deepEqual(harness.state.dragOffsets, {})
})

test('WardrobeWorkspace injeta os serviços da feature e delega carregamento e cancelamento', async () => {
  const page = await readFile(pageUrl, 'utf8')

  assert.match(page, /createWardrobeTestPoseCommands\(\{[\s\S]*?listPoseSlots:[\s\S]*?loadPose:[\s\S]*?setPoseSlots:[\s\S]*?setPose:[\s\S]*?setLoading:[\s\S]*?setPickerOpen:/)
  assert.match(page, /await testPoseCommands\.openPicker\(modelSlot\)/)
  assert.match(page, /const loadTestPose = \(slot: number\) => testPoseCommands\.loadPose\(modelSlot, slot\)/)
  assert.match(page, /const exitTestPose = testPoseCommands\.exitPose/)
  assert.match(page, /const closeTestPosePicker = testPoseCommands\.closePicker/)
})
