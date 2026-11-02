import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWardrobeGridHistory } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeGridHistory.ts'

const snapshot = (id, importKind = 'sleeve-grid-3x4') => ({ id, importKind, components: [] })

test('registra somente grades de mangas/calças e limita o histórico a 30 snapshots', () => {
  const history = createWardrobeGridHistory()
  history.record(snapshot('complete-sheet', 'complete'))
  assert.equal(history.canUndo, false)

  for (let index = 0; index < 35; index += 1) history.record(snapshot(String(index), index % 2 ? 'sleeve-grid-3x4' : 'pants-grid-3x4'))

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
  history.record(snapshot('new-edit', 'pants-grid-3x4'))
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

test('WardrobeWorkspace usa o histórico dedicado e mantém os atalhos fora dos campos de edição', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8')

  assert.match(page, /createWardrobeGridHistory\(\)/)
  assert.match(page, /sleeveHistoryRef\.current\.record\(current\)/)
  assert.match(page, /sleeveHistoryRef\.current\.clear\(\)/)
  assert.match(page, /sleeveHistoryRef\.current\.undo\(draft\)/)
  assert.match(page, /sleeveHistoryRef\.current\.redo\(draft\)/)
  assert.match(page, /target\?\.matches\('input, textarea, select, \[contenteditable="true"\]'\)/)
  assert.doesNotMatch(page, /sleeveUndoRef|sleeveRedoRef|recordSleeveHistory/)
})
