import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { splitWardrobeGarmentPairAtJoint } from '../src/renderer/src/features/fabricator/wardrobe/splitWardrobeGarmentPair.ts'

const point = (x, y) => ({ x, y })
const part = (id, name, x, y, width = 20, height = 50) => ({ id, name, x, y, width, height, rotation: 0, dataUrl: '' })
const link = (parentPartId, childPartId) => ({ id: `${parentPartId}-${childPartId}`, parentPartId, childPartId, parentAnchor: point(0, 0), childAnchor: point(0, 0) })

function createFixture() {
  const referenceModel = {
    width: 300,
    height: 400,
    parts: [
      part('thigh-left', 'Coxa esquerda', 20, 120),
      part('shin-left', 'Canela esquerda', 20, 230),
      part('thigh-right', 'Coxa direita', 180, 120),
      part('shin-right', 'Canela direita', 180, 230)
    ],
    joints: [link('thigh-left', 'shin-left'), link('thigh-right', 'shin-right')]
  }
  const component = (side) => ({
    id: `pants-${side}`,
    name: `Calça longa · ${side === 'left' ? 'esquerda' : 'direita'}`,
    category: 'calca-coxa',
    attachedPartId: `thigh-${side}`,
    sleevePairId: 'pants-pair',
    sleeveSide: side,
    sleeveSegment: 'whole',
    sleeveJointSplit: 'leg',
    x: side === 'left' ? 15 : 165,
    y: 130,
    width: 50,
    height: 100,
    rotation: 0,
    dataUrl: `data:${side}`,
    glue: { version: 1, mode: 'loose' }
  })
  const draft = { id: 'set-1', importKind: 'pants-grid-3x4', components: [component('left'), component('right')] }
  return { draft, referenceModel, selected: draft.components[0] }
}

function createIo(overrides = {}) {
  const calls = []
  let id = 0
  const io = {
    decodePixels: async (dataUrl) => {
      calls.push(['decode', dataUrl])
      const data = new Uint8ClampedArray(4 * 8 * 4)
      for (let index = 3; index < data.length; index += 4) data[index] = 255
      return { width: 4, height: 8, data }
    },
    encodeSegment: (segment) => {
      calls.push(['encode', segment.key, segment.width, segment.height])
      return `data:image/png;base64,${segment.key}-${segment.width}x${segment.height}`
    },
    createId: () => `generated-${++id}`,
    ...overrides
  }
  return { io, calls }
}

test('divide os dois lados sem publicar estado parcial e mantém vínculos com as juntas correspondentes', async () => {
  const { draft, referenceModel, selected } = createFixture()
  const before = structuredClone(draft)
  const { io, calls } = createIo()

  const replacements = await splitWardrobeGarmentPairAtJoint(draft, selected, referenceModel, {}, {}, io)

  assert.equal(replacements.length, 4)
  assert.deepEqual(draft, before)
  assert.deepEqual(replacements.map((item) => [item.sleeveSide, item.sleeveSegment, item.category, item.attachedPartId]), [
    ['left', 'upper', 'calca-coxa', 'thigh-left'],
    ['left', 'lower', 'calca-canela', 'shin-left'],
    ['right', 'upper', 'calca-coxa', 'thigh-right'],
    ['right', 'lower', 'calca-canela', 'shin-right']
  ])
  assert.deepEqual(replacements.map((item) => item.id), ['pants-left', 'generated-1', 'pants-right', 'generated-2'])
  assert.ok(replacements.every((item) => item.glue.mode === 'fixed' && item.binding?.boneId === item.attachedPartId))
  assert.equal(replacements[0].name, 'Calça longa · coxa')
  assert.equal(replacements[1].name, 'Calça longa · canela')
  assert.equal(calls.filter(([kind]) => kind === 'decode').length, 2)
  assert.equal(calls.filter(([kind]) => kind === 'encode').length, 4)
})

test('par incompleto não decodifica imagens nem cria recortes', async () => {
  const { draft, referenceModel, selected } = createFixture()
  draft.components.pop()
  const { io, calls } = createIo()

  await assert.rejects(splitWardrobeGarmentPairAtJoint(draft, selected, referenceModel, {}, {}, io), /par da roupa não está completo/)
  assert.deepEqual(calls, [])
})

test('se a segunda junta não existir, rejeita o conjunto inteiro sem retornar o primeiro recorte', async () => {
  const { draft, referenceModel, selected } = createFixture()
  referenceModel.joints = referenceModel.joints.filter((joint) => joint.parentPartId !== 'thigh-right')
  const { io, calls } = createIo()

  await assert.rejects(splitWardrobeGarmentPairAtJoint(draft, selected, referenceModel, {}, {}, io), /Não encontrei uma junta vinculada/)
  assert.equal(calls.filter(([kind]) => kind === 'encode').length, 2)
  assert.deepEqual(draft.components.map((item) => item.id), ['pants-left', 'pants-right'])
})

test('WardrobeWorkspace mantém a guarda de draft obsoleto após o cálculo assíncrono', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8')

  assert.match(page, /await splitWardrobeGarmentPairAtJoint\(/)
  assert.match(page, /if \(draftRef\.current !== draft\) throw new Error\('O conjunto mudou durante o cálculo/)
  assert.doesNotMatch(page, /splitWardrobePixelsAtJoint\(/)
})
