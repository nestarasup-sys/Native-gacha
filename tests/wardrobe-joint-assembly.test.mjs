import test from 'node:test'
import assert from 'node:assert/strict'
import { createWardrobeJointAssemblyOffsets, findWardrobeJointCut, splitWardrobePixelsAtJoint, wardrobeJointSplitForSheetCell } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeJointAssembly.ts'

const point = (x, y) => ({ x, y })
const part = (id, name, x, y, width = 20, height = 50) => ({ id, name, x, y, width, height, rotation: 0, dataUrl: '' })
const link = (parentPartId, childPartId, parentAnchor, childAnchor) => ({ id: `${parentPartId}-${childPartId}`, parentPartId, childPartId, parentAnchor, childAnchor })

function fixture() {
  const parts = [
    part('head', 'Cabeça', 100, -50, 40, 50),
    part('torso', 'Tronco', 90, 20, 60, 80),
    part('thigh-left', 'Coxa esquerda', 20, 120),
    part('shin-left', 'Canela esquerda', 20, 230),
    part('thigh-right', 'Coxa direita', 180, 120),
    part('shin-right', 'Canela direita', 180, 230),
    part('upper-arm-left', 'Braço esquerdo', 10, 45),
    part('forearm-left', 'Antebraço esquerdo', 0, 140),
    part('hand-left', 'Mão esquerda', -10, 190, 15, 25),
    part('foot-right', 'Pé direito', 180, 285, 20, 15)
  ]
  const joints = [
    link('torso', 'head', point(110, 20), point(110, 0)),
    link('torso', 'thigh-left', point(105, 95), point(30, 120)),
    link('thigh-left', 'shin-left', point(30, 165), point(28, 230)),
    link('torso', 'thigh-right', point(135, 95), point(190, 120)),
    link('shin-right', 'thigh-right', point(192, 230), point(190, 165)),
    link('torso', 'upper-arm-left', point(100, 55), point(30, 45)),
    link('forearm-left', 'upper-arm-left', point(15, 140), point(25, 90)),
    link('forearm-left', 'hand-left', point(5, 185), point(-3, 195)),
    link('shin-right', 'foot-right', point(190, 280), point(190, 285))
  ]
  return { width: 300, height: 400, parts, joints }
}

test('Juntar juntas move só canelas e antebraços; todo o restante continua na posição original', () => {
  const model = fixture()
  const before = structuredClone(model)
  const offsets = createWardrobeJointAssemblyOffsets(model)
  const knee = model.joints.find((joint) => joint.id === 'thigh-left-shin-left')
  assert.deepEqual(offsets.torso, point(0, 0))
  for (const unchangedPart of ['head', 'thigh-left', 'thigh-right', 'upper-arm-left', 'hand-left', 'foot-right']) {
    assert.deepEqual(offsets[unchangedPart], point(0, 0), `${unchangedPart} must stay in place`)
  }
  assert.deepEqual(offsets['shin-left'], point(2, -65))
  assert.deepEqual(offsets['shin-right'], point(-2, -65))
  assert.deepEqual(offsets['forearm-left'], point(10, -50))
  assert.deepEqual(
    point(knee.parentAnchor.x + offsets['thigh-left'].x, knee.parentAnchor.y + offsets['thigh-left'].y),
    point(knee.childAnchor.x + offsets['shin-left'].x, knee.childAnchor.y + offsets['shin-left'].y)
  )
  assert.deepEqual(model, before)
})

test('corte automático usa a junta da perna anexada e orienta o limite pelo eixo das peças', () => {
  const model = fixture()
  const offsets = createWardrobeJointAssemblyOffsets(model)
  const component = { id: 'long-pants', name: 'Calça longa 01 · esquerda', category: 'calca-coxa', attachedPartId: 'thigh-left', sleeveSide: 'left', x: 15, y: 150, width: 50, height: 100, rotation: 0, dataUrl: '' }
  const cut = findWardrobeJointCut(component, model, offsets)
  assert.ok(cut)
  assert.equal(cut.upperPartId, 'thigh-left')
  assert.equal(cut.lowerPartId, 'shin-left')
  assert.ok(Math.abs(cut.point.x - 30) < 0.00001)
  assert.ok(Math.abs(cut.point.y - 165) < 0.00001)
  assert.ok(Math.abs(cut.axis.x - (2 / Math.hypot(2, 45))) < 0.00001)
  assert.ok(Math.abs(cut.axis.y - (45 / Math.hypot(2, 45))) < 0.00001)
  assert.equal(findWardrobeJointCut({ ...component, category: 'shorts' }, model, offsets), null)
})

test('corte preserva os pixels visíveis e os divide uma única vez pela linha calculada', () => {
  const rgba = new Uint8ClampedArray([
    11, 1, 2, 255,
    22, 1, 2, 128,
    33, 1, 2, 255
  ])
  const [upper, lower] = splitWardrobePixelsAtJoint(
    { width: 3, height: 1, data: rgba },
    { x: 0, y: 0, width: 3, height: 1, rotation: 0 },
    { upperPartId: 'a', lowerPartId: 'b', point: point(1.5, 0.5), axis: point(1, 0), tangent: point(0, 1) }
  )
  assert.deepEqual([...upper.pixels], [11, 1, 2, 255, 22, 1, 2, 128])
  assert.deepEqual([...lower.pixels], [33, 1, 2, 255])
  assert.deepEqual([upper.x, upper.y, upper.width, upper.height], [0, 0, 2, 1])
  assert.deepEqual([lower.x, lower.y, lower.width, lower.height], [2, 0, 1, 1])
})

test('corte considera a rotação da roupa ao transformar cada pixel para o espaço da junta', () => {
  const rgba = new Uint8ClampedArray([
    11, 0, 0, 255,
    22, 0, 0, 255,
    33, 0, 0, 255
  ])
  const [upper, lower] = splitWardrobePixelsAtJoint(
    { width: 1, height: 3, data: rgba },
    { x: 9, y: 9, width: 1, height: 3, rotation: 90 },
    { upperPartId: 'a', lowerPartId: 'b', point: point(9.5, 10.5), axis: point(1, 0), tangent: point(0, 1) }
  )
  assert.deepEqual([...upper.pixels], [22, 0, 0, 255, 33, 0, 0, 255])
  assert.deepEqual([...lower.pixels], [11, 0, 0, 255])
})

test('modelos antigos sem juntas persistidas usam a inferência comum para localizar o recorte', () => {
  const model = { ...fixture(), joints: [] }
  const offsets = createWardrobeJointAssemblyOffsets(model)
  assert.ok(Object.keys(offsets).length === model.parts.length)
  assert.deepEqual(offsets['thigh-left'], point(0, 0))
  assert.deepEqual(offsets['upper-arm-left'], point(0, 0))
  const component = { id: 'sleeve', name: 'Manga longa · esquerda', category: 'manga-superior', attachedPartId: 'upper-arm-left', sleeveSide: 'left', x: 0, y: 80, width: 20, height: 80, rotation: 0, dataUrl: '' }
  const cut = findWardrobeJointCut(component, model, offsets)
  assert.equal(cut?.upperPartId, 'upper-arm-left')
  assert.equal(cut?.lowerPartId, 'forearm-left')
})

test('um rig salvo sem a junta da peça falha sem inventar uma divisão', () => {
  const model = fixture()
  model.joints = model.joints.filter((joint) => joint.id !== 'thigh-left-shin-left')
  const offsets = createWardrobeJointAssemblyOffsets(model)
  const component = { id: 'long-pants', name: 'Calça longa 01 · esquerda', category: 'calca-coxa', attachedPartId: 'thigh-left', sleeveSide: 'left', x: 15, y: 150, width: 50, height: 100, rotation: 0, dataUrl: '' }
  assert.equal(findWardrobeJointCut(component, model, offsets), null)
})

test('importação 3×4 marca só as duas linhas longas para corte automático', () => {
  assert.equal(wardrobeJointSplitForSheetCell('pants', 0), undefined)
  assert.equal(wardrobeJointSplitForSheetCell('sleeves', 1), undefined)
  assert.equal(wardrobeJointSplitForSheetCell('pants', 2), 'leg')
  assert.equal(wardrobeJointSplitForSheetCell('pants', 3), 'leg')
  assert.equal(wardrobeJointSplitForSheetCell('sleeves', 2), 'arm')
  assert.equal(wardrobeJointSplitForSheetCell('sleeves', 3), 'arm')
})
