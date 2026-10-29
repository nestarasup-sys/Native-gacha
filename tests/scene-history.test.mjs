import test from 'node:test'
import assert from 'node:assert/strict'
import { SCENE_HISTORY_LIMIT, recordSceneHistory, redoSceneHistory, undoSceneHistory } from '../src/shared/sceneHistory.ts'

function adapter(limit = SCENE_HISTORY_LIMIT) {
  return {
    limit,
    snapshot: (document) => ({ scene: document.scene }),
    restore: (document, snapshot) => ({ ...document, scene: snapshot.scene })
  }
}

test('algoritmo compartilhado registra snapshots sem mutar entradas e limpa o ramo de refazer', () => {
  const history = { undo: [{ scene: 'old' }], redo: [{ scene: 'future' }] }
  const current = { id: 'project', title: 'Mantido', scene: 'current' }
  const next = recordSceneHistory(history, current, adapter())

  assert.deepEqual(next.undo, [{ scene: 'old' }, { scene: 'current' }])
  assert.deepEqual(next.redo, [])
  assert.deepEqual(history.redo, [{ scene: 'future' }])
  assert.equal(current.scene, 'current')
})

test('algoritmo compartilhado desfaz/refaz pelo adaptador e preserva campos fora do snapshot', () => {
  const current = { id: 'project', title: 'Título atual', scene: 'after' }
  const history = { undo: [{ scene: 'before' }], redo: [] }
  const undone = undoSceneHistory(history, current, adapter())

  assert.ok(undone)
  assert.equal(undone.document.scene, 'before')
  assert.equal(undone.document.title, 'Título atual')
  assert.deepEqual(undone.history.redo, [{ scene: 'after' }])
  assert.equal(current.scene, 'after')

  const redone = redoSceneHistory(undone.history, undone.document, adapter())
  assert.ok(redone)
  assert.equal(redone.document.scene, 'after')
  assert.equal(redone.document.title, 'Título atual')
  assert.deepEqual(redone.history.redo, [])
})

test('limite comum é aplicado tanto para histórico curto como para limite unitário', () => {
  assert.equal(SCENE_HISTORY_LIMIT, 30)
  const oneStepAdapter = adapter(1)
  let history = { undo: [{ scene: 'oldest' }], redo: [] }
  history = recordSceneHistory(history, { scene: 'newest' }, oneStepAdapter)

  assert.deepEqual(history.undo, [{ scene: 'newest' }])
  assert.deepEqual(history.redo, [])
})

test('desfazer/refazer sem entradas disponíveis devolve null', () => {
  const history = { undo: [], redo: [] }
  const document = { scene: 'same' }

  assert.equal(undoSceneHistory(history, document, adapter()), null)
  assert.equal(redoSceneHistory(history, document, adapter()), null)
})
