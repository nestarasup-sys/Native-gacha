import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isMovablePosePart, rotatePosePart, translatePoseBranch } from '../src/renderer/src/features/fabricator/poseEditorModel.ts'
import { createPoseHistory, hasPoseGestureChanged, rememberPoseProject, restorePoseProject } from '../src/renderer/src/features/fabricator/poseHistory.ts'

function project() {
  return {
    schemaVersion: 1,
    name: 'Pose sintética',
    sourceModelSlot: 1,
    sourceModelName: 'Modelo sintético',
    sourceModelUpdatedAt: '2026-01-01T00:00:00.000Z',
    width: 200,
    height: 300,
    parts: [
      { id: 'upper', name: 'Braço superior esquerdo', x: 40, y: 40, width: 40, height: 60, rotation: 0, dataUrl: `data:image/png;base64,${'A'.repeat(1024)}`, jointAnchor: { x: 60, y: 90 } },
      { id: 'forearm', name: 'Antebraço esquerdo', x: 40, y: 100, width: 40, height: 60, rotation: 0, dataUrl: `data:image/png;base64,${'B'.repeat(1024)}`, jointAnchor: { x: 60, y: 100 } },
      { id: 'torso', name: 'Tronco', x: 70, y: 80, width: 60, height: 90, rotation: 0, dataUrl: 'data:image/png;base64,VE9SU08=' }
    ],
    joints: [{ id: 'elbow', parentPartId: 'upper', childPartId: 'forearm', parentAnchor: { x: 60, y: 90 }, childAnchor: { x: 60, y: 100 }, pivot: { x: 60, y: 95 }, fixed: true }],
    layerOrder: ['torso', 'upper', 'forearm'],
    hiddenPartIds: [],
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

test('histórico de poses mantém snapshots imutáveis por referência e respeita o limite', () => {
  const first = project()
  const second = { ...first, name: 'Segunda versão' }
  const third = { ...first, name: 'Terceira versão' }
  let history = createPoseHistory()
  history = rememberPoseProject(history, first, 2)
  history = rememberPoseProject(history, second, 2)
  history = rememberPoseProject(history, third, 2)

  assert.deepEqual(history.undo, [second, third])
  assert.equal(history.undo[0], second)
  assert.deepEqual(history.redo, [])
})

test('desfazer e refazer trocam os snapshots sem clonar nem alterar o histórico anterior', () => {
  const first = project()
  const second = { ...first, name: 'Segunda versão' }
  const recorded = rememberPoseProject(createPoseHistory(), first)
  const undone = restorePoseProject(recorded, second, 'undo')

  assert.ok(undone)
  assert.equal(undone.project, first)
  assert.equal(undone.history.redo[0], second)
  assert.deepEqual(recorded.redo, [])

  const redone = restorePoseProject(undone.history, first, 'redo')
  assert.ok(redone)
  assert.equal(redone.project, second)
  assert.equal(redone.history.undo[0], first)
  assert.equal(restorePoseProject(createPoseHistory(), first, 'undo'), null)
})

test('mover um ramo fixo preserva a junta, as imagens e o estado anterior', () => {
  const before = project()
  const moved = translatePoseBranch(before, 'upper', 8, -5)

  assert.deepEqual([moved.parts[0].x, moved.parts[0].y], [48, 35])
  assert.deepEqual([moved.parts[1].x, moved.parts[1].y], [48, 95])
  assert.deepEqual(moved.parts[0].jointAnchor, { x: 68, y: 85 })
  assert.deepEqual(moved.joints[0].parentAnchor, { x: 68, y: 85 })
  assert.deepEqual(moved.joints[0].childAnchor, { x: 68, y: 95 })
  assert.deepEqual(moved.joints[0].pivot, { x: 68, y: 90 })
  assert.equal(moved.parts[0].dataUrl, before.parts[0].dataUrl)
  assert.deepEqual([before.parts[0].x, before.parts[0].y, before.parts[1].x, before.parts[1].y], [40, 40, 40, 100])
  assert.equal(isMovablePosePart(before, 'torso'), false)
  assert.equal(isMovablePosePart(before, 'forearm'), true)
})

test('rotacionar seleciona a junta conectada quando solicitado e deixa o tronco intacto', () => {
  const before = project()
  const rotated = rotatePosePart(before, 'upper', 35, true)
  const isolated = rotatePosePart(before, 'upper', 35, false)

  assert.equal(rotated.parts[0].rotation, 35)
  assert.equal(rotated.parts[1].rotation, 35)
  assert.equal(rotated.parts[2], before.parts[2])
  assert.equal(isolated.parts[0].rotation, 35)
  assert.equal(isolated.parts[1], before.parts[1])
  assert.deepEqual(before.parts.map((part) => [part.x, part.y, part.rotation]), [[40, 40, 0], [40, 100, 0], [70, 80, 0]])
})

test('comparação de gesto ignora PNG e metadados, mas percebe mudanças geométricas e nas juntas', () => {
  const before = project()
  const metadataOnly = { ...before, name: 'Outro nome', updatedAt: 'agora', parts: before.parts.map((part) => ({ ...part, dataUrl: `${part.dataUrl}outra-carga` })) }
  assert.equal(hasPoseGestureChanged(before, metadataOnly), false)

  const moved = { ...before, parts: before.parts.map((part, index) => index === 0 ? { ...part, x: part.x + 1 } : part) }
  assert.equal(hasPoseGestureChanged(before, moved), true)

  const adjustedJoint = { ...before, joints: before.joints.map((joint) => ({ ...joint, pivot: { x: joint.pivot.x + 1, y: joint.pivot.y } })) }
  assert.equal(hasPoseGestureChanged(before, adjustedJoint), true)

  const returnedToStart = translatePoseBranch(translatePoseBranch(before, 'upper', 5, 0), 'upper', -5, 0)
  assert.equal(hasPoseGestureChanged(before, returnedToStart), false)
})

test('PoseWorkspace usa snapshots compartilhados e não serializa o projeto no fim do arrasto', async () => {
  const workspace = await readFile('src/renderer/src/features/fabricator/PoseWorkspace.tsx', 'utf8')
  assert.match(workspace, /rememberPoseProject\(current, before\)/)
  assert.match(workspace, /hasPoseGestureChanged\(drag\.before, current\)/)
  assert.doesNotMatch(workspace, /structuredClone|JSON\.stringify\(drag\.before/)
})
