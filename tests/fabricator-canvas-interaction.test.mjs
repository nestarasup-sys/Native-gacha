import test from 'node:test'
import assert from 'node:assert/strict'
import { createFabricatorCanvasInteraction } from '../src/renderer/src/features/fabricator/canvasInteraction.ts'

function part(id, name, overrides = {}) {
  return { id, name, x: 0, y: 0, width: 20, height: 40, rotation: 0, dataUrl: 'synthetic', ...overrides }
}

function createHarness(project) {
  const calls = { history: [], positions: [], mixerStarted: 0, mixerMoved: 0, finished: 0, pan: null, panning: false, mixerPainting: false }
  const refs = {
    dragRef: { current: null },
    anchorDragRef: { current: null },
    panRef: { current: null },
    mixerStrokeRef: { current: null },
    mixerQueueRef: { current: Promise.resolve() }
  }
  const state = { project }
  const interaction = createFabricatorCanvasInteraction({
    project: state.project,
    ...refs,
    setSelectedIds: (update) => { calls.selectedIds = typeof update === 'function' ? update(calls.selectedIds ?? []) : update },
    connectMode: false,
    mixerActive: false,
    thighDeformationActive: false,
    pan: { x: 0, y: 0 },
    setPan: (value) => { calls.pan = value },
    setPanning: (value) => { calls.panning = value },
    setMixerPainting: (value) => { calls.mixerPainting = value },
    scale: 2,
    startHistoryGesture: (action) => calls.history.push(action),
    finishHistoryGesture: () => { calls.finished += 1 },
    updateProject: (updater) => { state.project = updater(state.project) },
    updatePartPosition: (id, dx, dy) => calls.positions.push({ id, dx, dy }),
    startMixerStroke: () => { calls.mixerStarted += 1 },
    moveMixerStroke: () => { calls.mixerMoved += 1 }
  })
  return { calls, refs, state, interaction }
}

function pointerEvent(pointerId, clientX, clientY, extra = {}) {
  const captured = { pointerId: null }
  return {
    pointerId, clientX, clientY, target: {},
    currentTarget: { setPointerCapture: (id) => { captured.pointerId = id } },
    preventDefault() {},
    stopPropagation() {},
    captured,
    ...extra
  }
}

test('movimento de peça usa a escala do canvas e preserva a transformação do torso', async () => {
  const project = { parts: [part('arm', 'Braço'), part('torso', 'Tronco')], joints: [] }
  const { calls, refs, interaction } = createHarness(project)
  const drag = pointerEvent(4, 10, 20)

  interaction.beginPartDrag(drag, project.parts[0])
  assert.equal(drag.captured.pointerId, 4)
  assert.deepEqual(calls.history, ['edit'])
  assert.deepEqual(calls.selectedIds, ['arm'])

  interaction.onPointerMove(pointerEvent(4, 16, 26))
  assert.deepEqual(calls.positions, [{ id: 'arm', dx: 3, dy: 3 }])
  interaction.onPointerUp(pointerEvent(4, 16, 26))
  await Promise.resolve()
  assert.equal(refs.dragRef.current, null)
  assert.equal(calls.finished, 1)

  const torsoDrag = pointerEvent(5, 0, 0)
  interaction.beginPartDrag(torsoDrag, project.parts[1])
  assert.equal(torsoDrag.captured.pointerId, null)
  assert.deepEqual(calls.selectedIds, ['torso'])
  assert.deepEqual(calls.history, ['edit'])
  assert.equal(calls.positions.length, 1)
})

test('arrastar o pivô atualiza a peça, sua fonte original e as juntas conectadas', () => {
  const arm = part('arm', 'Braço', {
    jointAnchor: { x: 15, y: 20 },
    sourceTransform: { x: 0, y: 0, width: 20, height: 40, rotation: 0 }
  })
  const project = {
    parts: [arm, part('torso', 'Tronco')],
    joints: [{ id: 'joint', parentPartId: 'torso', childPartId: 'arm', parentAnchor: { x: 50, y: 40 }, childAnchor: { x: 15, y: 20 }, pivot: { x: 32.5, y: 30 } }]
  }
  const { state, interaction } = createHarness(project)

  interaction.beginAnchorDrag(pointerEvent(7, 10, 20), 'arm', 4)
  interaction.onPointerMove(pointerEvent(7, 14, 26))

  const movedArm = state.project.parts.find(({ id }) => id === 'arm')
  assert.deepEqual(movedArm.jointAnchor, { x: 19, y: 23 })
  assert.deepEqual(movedArm.sourceTransform.jointAnchor, { x: 19, y: 23 })
  assert.deepEqual(state.project.joints[0].childAnchor, { x: 19, y: 23 })
  assert.deepEqual(state.project.joints[0].pivot, { x: 34.5, y: 31.5 })
})

test('pan ignora a barra de ferramentas e objetos, e aplica a distância arrastada', async () => {
  const project = { parts: [part('arm', 'Braço')], joints: [] }
  const { calls, refs, interaction } = createHarness(project)
  const toolsTarget = { closest: (selector) => selector === '.model-stage-tools' ? {} : null }
  const ignoredTools = pointerEvent(3, 1, 1, { target: toolsTarget })
  interaction.beginPan(ignoredTools)
  assert.equal(refs.panRef.current, null)

  const start = pointerEvent(3, 10, 15)
  interaction.beginPan(start)
  assert.equal(start.captured.pointerId, 3)
  assert.equal(calls.panning, true)
  interaction.onPointerMove(pointerEvent(3, 19, 27))
  assert.deepEqual(calls.pan, { x: 9, y: 12 })
  assert.equal(calls.mixerMoved, 1)

  interaction.onPointerCancel()
  await Promise.resolve()
  assert.equal(refs.panRef.current, null)
  assert.equal(calls.panning, false)
  assert.equal(calls.finished, 1)
})
