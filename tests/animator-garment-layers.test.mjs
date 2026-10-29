import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildAnimatorGarmentLayers } from '../src/renderer/src/features/fabricator/models/animatorGarmentLayers.ts'
import { mapWardrobeComponentToPose } from '../src/shared/wardrobePose.ts'

const part = (id, name = id, x = 0, y = 0, width = 100, height = 100, rotation = 0) => ({
  id, name, x, y, width, height, rotation, dataUrl: ''
})
const component = (id, category, attachedPartId, x = 10, y = 20, width = 30, height = 40, rotation = 7) => ({
  id, name: id, category, attachedPartId, x, y, width, height, rotation, dataUrl: `data:${id}`
})
const project = (slot, parts) => ({ slot, parts, joints: [] })

function group(setId, category, overrides = {}) {
  return {
    modelSlot: 1, setId, category,
    offsetX: 4, offsetY: -3, scaleX: 1.2, scaleY: .8, rotation: 11,
    ...overrides
  }
}

function layerGeometry(layer) {
  return {
    x: layer.originX,
    y: layer.originY,
    localLeft: layer.localLeft,
    localTop: layer.localTop,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    matrix: layer.matrix
  }
}

function projectedGeometry(transform) {
  return {
    x: transform.origin.x,
    y: transform.origin.y,
    localLeft: transform.localLeft,
    localTop: transform.localTop,
    width: transform.renderWidth,
    height: transform.renderHeight,
    rotation: transform.localRotation,
    matrix: transform.matrix
  }
}

test('AnimatorWorkspace delegates garment layer construction and no longer adds hidden seam padding', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', 'utf8')
  const model = await readFile('src/renderer/src/features/fabricator/models/animatorGarmentLayers.ts', 'utf8')
  assert.match(page, /buildAnimatorGarmentLayers\(/)
  assert.doesNotMatch(page, /pantsTogether|const knee =|const edge =/)
  assert.match(model, /mapWardrobeComponentToPose\(component, sourceBone, poseBone\)/)
  assert.doesNotMatch(model, /\.find\(\(part\) => part\.id === component\.attachedPartId\)/)
})

test('calça e mangas mantêm a geometria ajustada sem preenchimento automático de juntas', () => {
  const sourceThigh = part('thigh', 'Coxa', 10, 20, 100, 100)
  const sourceCalf = part('calf', 'Canela', 110, 120, 80, 100)
  const posedThigh = part('thigh', 'Coxa', 15, 25, 150, 130, 20)
  const posedCalf = part('calf', 'Canela', 115, 130, 110, 140, -12)
  const sourceArm = part('arm', 'Braço', 20, 30, 90, 100)
  const posedArm = part('arm', 'Braço', 25, 35, 120, 130, 14)
  const thigh = component('thigh-pants', 'calca-coxa', 'thigh', 20, 30, 44, 80, 3)
  const calf = component('calf-pants', 'calca-canela', 'calf', 120, 140, 38, 78, -4)
  const sleeve = component('upper-sleeve', 'manga-superior', 'arm', 30, 40, 50, 88, 8)
  const wardrobeGroups = [group('pants', 'calca', { opacity: 1.4 }), group('jacket', 'manga-superior', { opacity: -.5 })]
  const wardrobeDetails = {
    '1:pants': { components: [thigh, calf] },
    '1:jacket': { components: [sleeve] }
  }
  const layers = buildAnimatorGarmentLayers({
    rigProject: project(1, [sourceThigh, sourceCalf, sourceArm]),
    displayProject: project(1, [posedThigh, posedCalf, posedArm]),
    wardrobeGroups,
    wardrobeDetails,
    layerIndex: new Map([['thigh', 2], ['calf', 3], ['arm', 4]]),
    layerStride: 16
  })

  assert.deepEqual(layers.map((layer) => layer.key), [
    'pants:calca:thigh-pants', 'pants:calca:calf-pants', 'jacket:manga-superior:upper-sleeve'
  ])
  assert.deepEqual(layerGeometry(layers[0]), projectedGeometry(mapWardrobeComponentToPose(thigh, sourceThigh, posedThigh)))
  assert.deepEqual(layerGeometry(layers[1]), projectedGeometry(mapWardrobeComponentToPose(calf, sourceCalf, posedCalf)))
  assert.deepEqual(layerGeometry(layers[2]), projectedGeometry(mapWardrobeComponentToPose(sleeve, sourceArm, posedArm)))
  assert.equal(layers[0].opacity, 1)
  assert.equal(layers[2].opacity, 0)
  assert.deepEqual(layers.map((layer) => layer.zIndex), [36, 53, 70])
})

test('roupas filtram por modelo, conjunto, categoria e peça anexada', () => {
  const thigh = component('thigh', 'calca-coxa', 'thigh')
  const calf = component('calf', 'calca-canela', 'calf')
  const shorts = component('shorts', 'shorts', 'thigh')
  const sourceThigh = part('thigh')
  const sourceCalf = part('calf')
  const displayThigh = part('thigh', 'thigh', 10, 10, 120, 120)
  const displayCalf = part('calf', 'calf', 20, 20, 90, 90)
  const groups = [
    group('pants', 'calca', { componentId: 'calf' }),
    group('pants', 'calca', { componentId: 'missing' }),
    group('pants', 'calca', { modelSlot: 2 }),
    group('unavailable', 'calca')
  ]
  const layers = buildAnimatorGarmentLayers({
    rigProject: project(1, [sourceThigh, sourceCalf]),
    displayProject: project(1, [displayThigh, displayCalf]),
    wardrobeGroups: groups,
    wardrobeDetails: { '1:pants': { components: [thigh, calf, shorts] } },
    layerIndex: new Map(),
    layerStride: 16
  })

  assert.deepEqual(layers.map((layer) => layer.key), ['pants:calca:calf'])
})

test('many garment pieces resolve through one source and pose part index', () => {
  const count = 700
  const sourceParts = Array.from({ length: count }, (_, index) => part(`bone-${index}`))
  const poseParts = sourceParts.map((bone, index) => part(bone.id, bone.name, index, index * 2, 110, 120, index % 25))
  const components = Array.from({ length: count }, (_, index) => component(`shirt-${index}`, 'camisa', `bone-${index}`))
  const layers = buildAnimatorGarmentLayers({
    rigProject: project(1, sourceParts),
    displayProject: project(1, poseParts),
    wardrobeGroups: [group('uniform', 'camisa')],
    wardrobeDetails: { '1:uniform': { components } },
    layerIndex: new Map(poseParts.map((bone, index) => [bone.id, index])),
    layerStride: 16
  })

  assert.equal(layers.length, count)
  assert.equal(layers[0].key, 'uniform:camisa:shirt-0')
  assert.equal(layers.at(-1).key, `uniform:camisa:shirt-${count - 1}`)
})
