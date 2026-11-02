import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWardrobeGridHistory } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeGridHistory.ts'

const snapshot = (id, importKind = 'sleeve-grid-3x4') => ({ id, importKind, components: [] })

test('registra somente grades pareadas e limita o histórico a 30 snapshots', () => {
  const history = createWardrobeGridHistory()
  history.record(snapshot('complete-sheet', 'complete'))
  assert.equal(history.canUndo, false)

  for (let index = 0; index < 35; index += 1) history.record(snapshot(String(index), ['sleeve-grid-3x4', 'pants-grid-3x4', 'shoe-grid-3x4'][index % 3]))

  const undone = []
  let current = snapshot('current')
  while (history.canUndo) {
    current = history.undo(current)
    undone.push(current.id)
  }
  assert.deepEqual(undone, Array.from({ length: 30 }, (_, index) => String(34 - index)))
  assert.equal(history.undo(current), null)
})

test('refazer repõe snapshots, volta a permitir desfazer e uma nova edição limpa redo', () => {
  const history = createWardrobeGridHistory()
  history.record(snapshot('before-1'))
  history.record(snapshot('before-2'))

  const second = history.undo(snapshot('after-2'))
  const first = history.undo(second)
  assert.equal(first.id, 'before-1')
  assert.equal(history.canRedo, true)

  const restored = history.redo(first)
  assert.equal(restored.id, 'before-2')
  assert.equal(history.canUndo, true)

  history.undo(restored)
  history.record(snapshot('new-edit', 'shoe-grid-3x4'))
  assert.equal(history.canRedo, false)
})

test('limpar a sessão remove ambos os lados do histórico', () => {
  const history = createWardrobeGridHistory()
  history.record(snapshot('before'))
  history.undo(snapshot('after'))

  history.clear()

  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
})

test('a grade de sapatos também participa do histórico de edição', () => {
  const history = createWardrobeGridHistory()
  history.record(snapshot('shoes-before', 'shoe-grid-3x4'))
  assert.equal(history.canUndo, true)
  assert.equal(history.undo(snapshot('shoes-after', 'shoe-grid-3x4')).id, 'shoes-before')
})

test('WardrobeWorkspace usa o histórico dedicado e mantém os atalhos fora dos campos de edição', async () => {
  const [page, editing] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/useWardrobeSheetEditing.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /createWardrobeGridHistory\(\)/)
  assert.match(page, /pairedGridHistoryRef\.current\.record\(current\)/)
  assert.match(page, /useWardrobeSheetEditing\(/)
  assert.match(editing, /pairedGridHistoryRef\.current\.clear\(\)/)
  assert.match(editing, /pairedGridHistoryRef\.current\.undo\(draft\)/)
  assert.match(editing, /pairedGridHistoryRef\.current\.redo\(draft\)/)
  assert.match(editing, /target\?\.matches\('input, textarea, select, \[contenteditable="true"\]'\)/)
  assert.doesNotMatch(editing, /sleeveUndoRef|sleeveRedoRef|recordSleeveHistory/)
})
