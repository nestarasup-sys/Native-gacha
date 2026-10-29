import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createFacePartPreviewModel } from '../src/renderer/src/features/fabricator/face/facePartPreviewModel.ts'

const head = { id: 'head', name: 'Cabeça', x: 0, y: 0, width: 200, height: 100, dataUrl: '', rotation: 0 }

function faceAsset(id, kind, transform, width = 20, height = 10, rightSidePositioned = false) {
  return {
    schemaVersion: 1,
    id,
    modelSlot: 1,
    kind,
    name: id,
    width,
    height,
    defaultTransform: transform,
    rightSidePositioned,
    updatedAt: '2026-10-29T00:00:00.000Z',
    dataUrl: `data:image/png;base64,${id}`
  }
}

const linked = { eye: true, pupil: true, 'eye-closed': true, eyebrow: true }

test('FaceComponentsWorkspace delegates part layering to the preview model', async () => {
  const workspace = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  const component = await readFile('src/renderer/src/features/fabricator/face/FacePartPreview.tsx', 'utf8')
  assert.match(workspace, /<FacePartPreview/)
  assert.doesNotMatch(workspace, /function renderPart\(/)
  assert.match(component, /createFacePartPreviewModel\(/)
  assert.match(component, /face-component-pupil-mask/)
})

test('missing face part selection does not create a preview layer', () => {
  assert.equal(createFacePartPreviewModel({
    id: 'eye-left', mirror: true, overrides: {}, selectedAssets: {}, details: {}, linked,
    head, eyeMasks: {}, activePreviewKey: null
  }), null)
})

test('an explicitly selected right eye keeps its own image and physical position', () => {
  const left = faceAsset('left', 'eye', { x: 35, y: 42, scaleX: 1, scaleY: 1, rotation: 8 })
  const right = faceAsset('right', 'eye', { x: 155, y: 44, scaleX: 1.2, scaleY: .9, rotation: 12 }, 24, 12, true)
  const model = createFacePartPreviewModel({
    id: 'eye-right', mirror: true, overrides: { 'eye-left': 'left', 'eye-right': 'right' },
    selectedAssets: { 'eye-left': 'left', 'eye-right': 'right' }, details: { left, right }, linked,
    head, eyeMasks: {}, activePreviewKey: 'eye-right:right'
  })

  assert.equal(model.imageAsset.id, 'right')
  assert.equal(model.style.left, '77.5%')
  assert.equal(model.style.top, '44%')
  assert.equal(model.style.width, '14.399999999999999%')
  assert.equal(model.style.transform, 'translate(-50%,-50%) rotate(12deg) scaleX(1)')
  assert.equal(model.canDrag, true)
  assert.equal(model.drag.invertX, false)
})

test('an empty linked right side mirrors the left asset position and orientation', () => {
  const left = faceAsset('left', 'eye', { x: 35, y: 42, scaleX: 1, scaleY: 1, rotation: 8 })
  const model = createFacePartPreviewModel({
    id: 'eye-right', mirror: true, overrides: { 'eye-left': 'left' },
    selectedAssets: { 'eye-left': 'left' }, details: { left }, linked,
    head, eyeMasks: {}, activePreviewKey: 'eye-right:left'
  })

  assert.equal(model.imageAsset.id, 'left')
  assert.equal(model.style.left, '82.5%')
  assert.equal(model.style.transform, 'translate(-50%,-50%) rotate(-8deg) scaleX(-1)')
  assert.equal(model.drag.invertX, true)
})

test('pupil preview clips to the selected eye mask and scales within its bounds', () => {
  const eye = faceAsset('eye-left', 'eye', { x: 40, y: 40, scaleX: 1.5, scaleY: 2, rotation: 0 })
  const pupil = faceAsset('pupil-left', 'pupil', { x: 2, y: -1, scaleX: .5, scaleY: .6, rotation: 5 }, 4, 4)
  const model = createFacePartPreviewModel({
    id: 'pupil-left', mirror: true,
    overrides: { 'eye-left': eye.id, 'pupil-left': pupil.id },
    selectedAssets: { 'eye-left': eye.id, 'pupil-left': pupil.id },
    details: { [eye.id]: eye, [pupil.id]: pupil }, linked,
    head, eyeMasks: { [eye.id]: 'data:image/png;base64,mask' },
    activePreviewKey: 'pupil-left:pupil-left'
  })

  assert.equal(model.imageAsset.id, pupil.id)
  assert.equal(model.style.left, '21%')
  assert.equal(model.style.top, '39%')
  assert.equal(model.style.width, '7.5%')
  assert.equal(model.style.height, '12%')
  assert.equal(model.pupilMask.style.left, '20%')
  assert.equal(model.pupilMask.style.top, '40%')
  assert.equal(model.pupilMask.style.width, '15%')
  assert.equal(model.pupilMask.style.height, '20%')
  assert.equal(model.pupilMask.style.maskImage, 'url(data:image/png;base64,mask)')
  assert.equal(model.pupilMask.pupilStyle.left, '56.666666666666664%')
  assert.equal(model.pupilMask.pupilStyle.top, '45%')
  assert.equal(model.pupilMask.pupilStyle.width, '50%')
  assert.equal(model.pupilMask.pupilStyle.height, '60%')
  assert.equal(model.pupilMask.drag.pupil, true)
  assert.equal(model.pupilMask.drag.rotation, 0)
  assert.equal(model.canDrag, true)
})

test('a mirrored pupil uses its source orientation without double-flipping its offset', () => {
  const rightEye = faceAsset('eye-right', 'eye', { x: 150, y: 40, scaleX: 1, scaleY: 1, rotation: 15 })
  const rightPupil = faceAsset('pupil-right', 'pupil', { x: 3, y: 0, scaleX: .4, scaleY: .5, rotation: 10 }, 4, 4)
  const model = createFacePartPreviewModel({
    id: 'pupil-right', mirror: true,
    overrides: { 'eye-right': rightEye.id, 'pupil-right': rightPupil.id },
    selectedAssets: { 'eye-right': rightEye.id, 'pupil-right': rightPupil.id },
    details: { [rightEye.id]: rightEye, [rightPupil.id]: rightPupil }, linked,
    head, eyeMasks: {}, activePreviewKey: 'pupil-right:pupil-right'
  })

  assert.equal(model.pupilMask.style.left, '25%')
  assert.equal(model.pupilMask.drag.invertX, true)
  assert.equal(model.pupilMask.drag.rotation, -15)
  assert.match(model.pupilMask.pupilStyle.transform, /rotate\(10deg\)/)
})
