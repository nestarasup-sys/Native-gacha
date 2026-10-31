import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { wardrobeSaveAssets } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeSaveAssets.ts'
import {
  createWardrobeDeformationPatch,
  createWardrobeRestorationPatch,
  wardrobeWarpBaseBounds
} from '../src/renderer/src/features/fabricator/wardrobe/wardrobeDeformationModel.ts'

const piece = {
  id: 'sleeve-left',
  name: 'Manga esquerda',
  category: 'manga-superior',
  attachedPartId: 'arm-left',
  x: 10,
  y: 20,
  width: 120,
  height: 60,
  rotation: 27,
  dataUrl: 'data:image/png;base64,original'
}
const assertClose = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be within 1e-9 of ${expected}`)
const assertCloseObject = (actual, expected) => {
  for (const [key, value] of Object.entries(expected)) assertClose(actual[key], value)
}

test('a tela temporária preserva escala, deslocamento e rotação da peça', () => {
  const bounds = wardrobeWarpBaseBounds(piece, { width: 100, height: 50 }, 10, { x: 5, y: -3 })
  assertCloseObject(bounds, { x: 25, y: 25.57142857142857, width: 100, height: 42.857142857142854, rotation: 27 })
})

test('a primeira deformação guarda a imagem e o quadro anteriores e remove o offset temporário', () => {
  const patch = createWardrobeDeformationPatch(piece, {
    sourceUrl: piece.dataUrl,
    image: { width: 100, height: 50 },
    committedPadding: 0
  }, {
    bounds: { x: 15, y: 17, width: 100, height: 50, rotation: 27 },
    padding: 4,
    scaleX: 1.2,
    scaleY: 0.8
  }, { x: 5, y: -3 }, 'data:image/png;base64,deformed-1')

  assert.equal(patch.dataUrl, 'data:image/png;base64,deformed-1')
  assert.equal(patch.deformationOriginalDataUrl, piece.dataUrl)
  assert.deepEqual(patch.deformationOriginalFrame, {
    x: 10, y: 20, width: 120, height: 60,
    originX: undefined, originY: undefined,
    originWidth: undefined, originHeight: undefined
  })
  assertCloseObject(
    { x: patch.x, y: patch.y, width: patch.width, height: patch.height },
    { x: 5.2, y: 16.8, width: 129.6, height: 46.4 }
  )
  assertCloseObject(
    { originX: patch.originX, originY: patch.originY, originWidth: patch.originWidth, originHeight: patch.originHeight },
    { originX: 5.2, originY: 15.2, originWidth: 129.6, originHeight: 69.6 }
  )
})

test('deformações seguintes mantêm o primeiro backup e acumulam padding no quadro de origem', () => {
  const firstPatch = createWardrobeDeformationPatch(piece, {
    sourceUrl: piece.dataUrl,
    image: { width: 100, height: 50 },
    committedPadding: 0
  }, {
    bounds: { x: 10, y: 20, width: 100, height: 50, rotation: 27 },
    padding: 4,
    scaleX: 1.2,
    scaleY: 0.8
  }, { x: 0, y: 0 }, 'data:image/png;base64,deformed-1')
  const afterFirst = { ...piece, ...firstPatch }
  const secondPatch = createWardrobeDeformationPatch(afterFirst, {
    sourceUrl: piece.dataUrl,
    image: { width: 100, height: 50 },
    committedPadding: 4
  }, {
    bounds: { x: 15, y: 17, width: 120, height: 40, rotation: 27 },
    padding: 6,
    scaleX: 0.9,
    scaleY: 0.75
  }, { x: 5, y: -3 }, 'data:image/png;base64,deformed-2')

  assert.equal(secondPatch.dataUrl, 'data:image/png;base64,deformed-2')
  assert.equal(secondPatch.deformationOriginalDataUrl, piece.dataUrl)
  assert.deepEqual(secondPatch.deformationOriginalFrame, firstPatch.deformationOriginalFrame)
  assertCloseObject(
    { originX: secondPatch.originX, originY: secondPatch.originY, originWidth: secondPatch.originWidth, originHeight: secondPatch.originHeight },
    { originX: 2.8, originY: 12.8, originWidth: 134.4, originHeight: 74.4 }
  )
})

test('restaurar devolve a imagem e o quadro salvos e ignora peça sem backup', () => {
  const deformed = {
    ...piece,
    ...createWardrobeDeformationPatch(piece, {
      sourceUrl: piece.dataUrl,
      image: { width: 100, height: 50 },
      committedPadding: 0
    }, {
      bounds: { x: 10, y: 20, width: 100, height: 50, rotation: 27 },
      padding: 4,
      scaleX: 1.2,
      scaleY: 0.8
    }, { x: 0, y: 0 }, 'data:image/png;base64,deformed')
  }
  assert.deepEqual(createWardrobeRestorationPatch(deformed), {
    dataUrl: piece.dataUrl,
    isDeformed: false,
    x: piece.x,
    y: piece.y,
    width: piece.width,
    height: piece.height,
    originX: undefined,
    originY: undefined,
    originWidth: undefined,
    originHeight: undefined
  })
  assert.equal(createWardrobeRestorationPatch(piece), null)
  assert.equal(createWardrobeRestorationPatch({ ...deformed, deformationOriginalDataUrl: undefined }), null)
})

test('a página delega deformação ao hook de domínio da feature e mantém gravação por peça', async () => {
  const [workspace, hook] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/useWardrobeDeformation.ts', import.meta.url), 'utf8')
  ])
  assert.match(workspace, /useWardrobeDeformation\(/)
  assert.match(workspace, /wardrobeSaveAssets\(set\)/)
  assert.match(workspace, /saveWardrobeSet\(modelSlot, serialized, images\)/)
  assert.match(workspace, /clearDirtyWarpImages\(\)/)
  assert.match(workspace, /invalidateWarpImage\(selected\.id\)/)
  assert.doesNotMatch(workspace, /warpSessionsRef|warpDragRef|applyWardrobeWarpBrush|requestAnimationFrame/)
  assert.match(hook, /setPointerCapture\(event\.pointerId\)/)
  assert.match(hook, /event\.type === 'pointercancel'/)
  assert.match(hook, /requestAnimationFrame\(/)
  assert.match(hook, /warpSessionsRef\.current\.size >= 4/)
  assert.match(hook, /createWardrobeDeformationPatch\(/)
  assert.match(hook, /createWardrobeRestorationPatch\(/)
})

test('o salvamento preserva cada PNG atual e o original para recuperação da deformação', () => {
  const deformed = {
    ...piece,
    id: 'sleeve-left',
    dataUrl: 'data:image/png;base64,editado',
    hasDeformationOriginal: true,
    deformationOriginalDataUrl: 'data:image/png;base64,original'
  }
  const next = { ...piece, id: 'sleeve-right', dataUrl: 'data:image/png;base64,segundo' }
  assert.deepEqual(wardrobeSaveAssets({ components: [deformed, next] }), [
    { id: 'sleeve-left', dataUrl: deformed.dataUrl },
    { id: 'sleeve-left_deform_original', dataUrl: deformed.deformationOriginalDataUrl },
    { id: 'sleeve-right', dataUrl: next.dataUrl }
  ])
  assert.throws(
    () => wardrobeSaveAssets({ components: [{ ...next, dataUrl: '' }] }),
    /Imagem ausente na roupa/
  )
  assert.throws(
    () => wardrobeSaveAssets({ components: [{ ...deformed, deformationOriginalDataUrl: undefined }] }),
    /Imagem original ausente na roupa/
  )
})
