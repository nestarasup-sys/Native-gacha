import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  STUDIO_HISTORY_LIMIT,
  recordStudioHistory,
  redoStudioHistory,
  undoStudioHistory
} from '../src/shared/studioHistory.ts'

function studio(backgroundX = 0, updatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    schemaVersion: 1,
    id: 'studio-test',
    title: 'Teste',
    color: '#d7b5cd',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    backgroundColor: '#ffffff',
    backgroundAssetId: null,
    backgroundX,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: []
  }
}

test('gravar histórico cria snapshot da cena e descarta o ramo de refazer', () => {
  const state = { undo: [], redo: [{ backgroundX: 99 }] }
  const current = studio(12)
  const next = recordStudioHistory(state, current)

  assert.equal(next.undo.length, 1)
  assert.equal(next.undo[0].backgroundX, 12)
  assert.deepEqual(next.redo, [])
  assert.equal(current.backgroundX, 12)
})

test('desfazer e refazer restauram a cena sem perder os campos atuais do documento', () => {
  const before = studio(10)
  const edited = { ...studio(30), title: 'Nome preservado', backgroundY: 18 }
  const history = recordStudioHistory({ undo: [], redo: [] }, before)
  const undone = undoStudioHistory(history, edited)

  assert.ok(undone)
  assert.equal(undone.document.backgroundX, 10)
  assert.equal(undone.document.backgroundY, 0)
  assert.equal(undone.document.title, 'Nome preservado')
  assert.equal(undone.history.undo.length, 0)
  assert.equal(undone.history.redo.length, 1)

  const redone = redoStudioHistory(undone.history, undone.document)
  assert.ok(redone)
  assert.equal(redone.document.backgroundX, 30)
  assert.equal(redone.document.backgroundY, 18)
  assert.equal(redone.document.title, 'Nome preservado')
  assert.equal(redone.history.redo.length, 0)
})

test('histórico mantém o limite configurado sem expandir indefinidamente', () => {
  let history = { undo: [], redo: [] }
  for (let position = 0; position < STUDIO_HISTORY_LIMIT + 5; position += 1) {
    history = recordStudioHistory(history, studio(position))
  }

  assert.equal(history.undo.length, STUDIO_HISTORY_LIMIT)
  assert.equal(history.undo[0].backgroundX, 5)
  assert.equal(history.undo.at(-1).backgroundX, STUDIO_HISTORY_LIMIT + 4)
})

test('StudioPage delega histórico ao hook e limpa histórico ao trocar de documento', async () => {
  const [page, hook] = await Promise.all([
    readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/studio/useStudioHistory.ts', 'utf8')
  ])

  assert.match(page, /useStudioHistory\(/)
  assert.doesNotMatch(page, /recordStudioHistory|undoStudioHistory|redoStudioHistory|undoRef|redoRef/)
  assert.match(hook, /useEffect\(/)
  assert.match(hook, /\[activeStudioId\]/)
  assert.match(hook, /patchStudio\(\(\) => result\.document\)/)
})
