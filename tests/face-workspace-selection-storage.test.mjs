import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPONENT_SELECTION_STORAGE_KEY,
  FACE_DETAIL_SELECTION_STORAGE_KEY,
  FACE_IMPORT_ANCHORS_STORAGE_KEY,
  LEGACY_PUPIL_SELECTION_STORAGE_KEY,
  readComponentSelections,
  readFaceDetailSelections,
  readFaceImportAnchors,
  saveComponentSelection
} from '../src/renderer/src/features/fabricator/face/faceWorkspaceSelectionStorage.ts'

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries))
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

const anchor = (width = 40) => ({
  left: { width, height: 20, transform: { x: 10, y: 10, scaleX: .5, scaleY: .5, rotation: 0 } },
  right: { width, height: 20, transform: { x: 30, y: 10, scaleX: .5, scaleY: .5, rotation: 0 } }
})

test('migra pupilas antigas e preserva seleções atuais por slot', () => {
  const storage = createStorage({
    [LEGACY_PUPIL_SELECTION_STORAGE_KEY]: JSON.stringify({ 1: { left: 'old-left', right: 'old-right', linked: true } }),
    [COMPONENT_SELECTION_STORAGE_KEY]: JSON.stringify({ 1: { parts: { 'pupil-left': 'new-left' }, linked: { pupil: false } } })
  })

  assert.deepEqual(readComponentSelections(() => storage), {
    1: { parts: { 'pupil-left': 'new-left' }, linked: { pupil: false } }
  })

  saveComponentSelection(() => storage, 2, { parts: { 'eye-left': 'eye-two' }, linked: { eye: true } })
  assert.deepEqual(JSON.parse(storage.values.get(COMPONENT_SELECTION_STORAGE_KEY)), {
    1: { parts: { 'pupil-left': 'new-left' }, linked: { pupil: false } },
    2: { parts: { 'eye-left': 'eye-two' }, linked: { eye: true } }
  })
})

test('JSON corrompido continua usando seleções vazias sem bloquear a área', () => {
  const storage = createStorage({
    [COMPONENT_SELECTION_STORAGE_KEY]: '{broken',
    [FACE_DETAIL_SELECTION_STORAGE_KEY]: 'null',
    [FACE_IMPORT_ANCHORS_STORAGE_KEY]: '[]'
  })

  assert.deepEqual(readComponentSelections(() => storage), {})
  assert.deepEqual(readFaceDetailSelections(() => storage), {})
  assert.deepEqual(readFaceImportAnchors(() => storage), {})
})

test('guias de importação aceitam somente slots numéricos e âncoras válidas', () => {
  const storage = createStorage({
    [FACE_IMPORT_ANCHORS_STORAGE_KEY]: JSON.stringify({
      1: { eye: anchor(), pupil: anchor(0), unknown: anchor() },
      invalid: { eye: anchor() }
    })
  })

  assert.deepEqual(readFaceImportAnchors(() => storage), { 1: { eye: anchor() } })
})

test('detalhes faciais mantêm as seleções por modelo e ignoram chaves sem slot', () => {
  const storage = createStorage({
    [FACE_DETAIL_SELECTION_STORAGE_KEY]: JSON.stringify({
      1: { blush: 'blush-one' },
      nope: { blush: 'invalid' },
      3: null
    })
  })

  assert.deepEqual(readFaceDetailSelections(() => storage), { 1: { blush: 'blush-one' } })
})
