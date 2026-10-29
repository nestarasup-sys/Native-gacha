import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { libraryBaseName, sameLibraryPair, visibleFaceLibraryAssets } from '../src/renderer/src/features/fabricator/face/faceLibraryModel.ts'

function faceAsset(id, { kind = 'eye', name = id, right = false, pairId, dataUrl = `data:${id}` } = {}) {
  const detail = {
    schemaVersion: 1,
    id,
    modelSlot: 1,
    kind,
    name,
    width: 100,
    height: 80,
    defaultTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    rightSidePositioned: right,
    ...(pairId ? { pairId } : {}),
    updatedAt: '2026-01-01T00:00:00.000Z',
    dataUrl
  }
  const { dataUrl: _dataUrl, defaultTransform: _transform, ...summary } = detail
  return { summary, detail }
}

test('paired sides use explicit pair IDs and preserve library order', () => {
  const left = faceAsset('left', { name: 'Duo · Olho esquerdo', pairId: 'pair-1' })
  const right = faceAsset('right', { name: 'Duo · Olho direito', pairId: 'pair-1', right: true })
  const assets = [left.summary, right.summary]
  const details = { left: left.detail, right: right.detail }

  assert.deepEqual(visibleFaceLibraryAssets(assets, details), [left.summary])
  assert.equal(sameLibraryPair(left.detail, right.detail), true)
})

test('right-side pairId can reference the left asset ID', () => {
  const left = faceAsset('left-id', { name: 'Meu olho · Olho esquerdo' })
  const right = faceAsset('right-id', { name: 'Meu olho · Olho direito', right: true, pairId: 'left-id' })

  assert.deepEqual(visibleFaceLibraryAssets([left.summary, right.summary], { 'left-id': left.detail, 'right-id': right.detail }), [left.summary])
  assert.equal(sameLibraryPair(left.detail, right.detail), true)
})

test('legacy pairs require matching base name and identical image bytes', () => {
  const left = faceAsset('left', { name: 'Clássico · Olho esquerdo', dataUrl: 'same-image' })
  const right = faceAsset('right', { name: 'Clássico · Olho direito', right: true, dataUrl: 'same-image' })
  const otherImage = faceAsset('other', { name: 'Clássico · Olho direito', right: true, dataUrl: 'other-image' })

  assert.equal(libraryBaseName(left.detail.name), 'Clássico')
  assert.deepEqual(visibleFaceLibraryAssets([left.summary, right.summary], { left: left.detail, right: right.detail }), [left.summary])
  assert.deepEqual(visibleFaceLibraryAssets([left.summary, otherImage.summary], { left: left.detail, other: otherImage.detail }), [left.summary, otherImage.summary])
})

test('missing details, mismatched kinds, and incomplete IDs do not hide a right-side asset', () => {
  const leftWithId = faceAsset('left', { name: 'Par · Olho esquerdo', pairId: 'left-group' })
  const rightWithoutId = faceAsset('right', { name: 'Par · Olho direito', right: true, dataUrl: leftWithId.detail.dataUrl })
  const otherKind = faceAsset('nose', { kind: 'nose', name: 'Par · Olho esquerdo', pairId: 'different' })
  const rightOtherKind = faceAsset('right-eye', { kind: 'eye', name: 'Par · Olho direito', right: true, pairId: 'different' })
  const missing = faceAsset('missing-right', { name: 'Ausente · Olho direito', right: true })
  const assets = [leftWithId.summary, rightWithoutId.summary, otherKind.summary, rightOtherKind.summary, missing.summary]
  const details = {
    left: leftWithId.detail,
    right: rightWithoutId.detail,
    nose: otherKind.detail,
    'right-eye': rightOtherKind.detail
  }

  assert.deepEqual(visibleFaceLibraryAssets(assets, details), assets)
  assert.equal(sameLibraryPair(leftWithId.detail, rightWithoutId.detail), false)
  assert.equal(sameLibraryPair(otherKind.detail, rightOtherKind.detail), false)
})

test('library pairing is indexed outside the render page instead of scanning every asset pair', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  const model = await readFile('src/renderer/src/features/fabricator/face/faceLibraryModel.ts', 'utf8')

  assert.match(page, /useMemo\(\(\) => visibleFaceLibraryAssets\(assets, details\), \[assets, details\]\)/)
  assert.doesNotMatch(page, /assets\.some\(\(candidate\)/)
  assert.match(model, /const leftIds = new Set<string>\(\)/)
  assert.match(model, /const fallbackPairs: FallbackPairs = new Map\(\)/)
})
