import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { rebindWardrobeComponents } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeBindings.ts'
import { calibrateWardrobeSourceParts } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeSourceCalibration.ts'
import { bindWardrobeComponent } from '../src/shared/wardrobePose.ts'

const bone = {
  id: 'arm-left',
  name: 'Braço esquerdo',
  x: 100,
  y: 70,
  width: 50,
  height: 80,
  rotation: 12,
  sourceTransform: { x: 14, y: 24, width: 42, height: 70, rotation: 5 },
  dataUrl: 'data:image/png;base64,arm'
}
const model = { width: 400, height: 500, parts: [bone] }
const piece = {
  id: 'sleeve-left',
  name: 'Manga esquerda',
  category: 'manga-superior',
  attachedPartId: bone.id,
  x: 20,
  y: 35,
  width: 36,
  height: 60,
  rotation: 22,
  dataUrl: 'data:image/png;base64,sleeve'
}

test('um conjunto legado recebe binding e chamadas repetidas preservam identidade quando nada mudou', () => {
  const legacy = [piece]
  const first = rebindWardrobeComponents(legacy, model)
  assert.equal(first.changed, true)
  assert.deepEqual(first.components[0].binding, bindWardrobeComponent(piece, bone))

  const repeated = rebindWardrobeComponents(first.components, model)
  assert.equal(repeated.changed, false)
  assert.equal(repeated.components, first.components)
  assert.equal(repeated.components[0], first.components[0])
})

test('binding antigo acompanha somente componentes sem fixação explícita', () => {
  const originalBinding = bindWardrobeComponent(piece, bone)
  const changedBone = { ...bone, sourceTransform: { ...bone.sourceTransform, x: 40, width: 66 } }
  const components = [
    { ...piece, id: 'free-old', binding: originalBinding },
    { ...piece, id: 'fixed', glue: { mode: 'fixed' }, binding: originalBinding },
    { ...piece, id: 'loose', glue: { mode: 'loose' }, binding: originalBinding },
    { ...piece, id: 'missing-bone', attachedPartId: 'removed-part', binding: originalBinding }
  ]

  const result = rebindWardrobeComponents(components, { ...model, parts: [changedBone] })
  assert.equal(result.changed, true)
  assert.notDeepEqual(result.components[0].binding, originalBinding)
  assert.equal(result.components[1], components[1])
  assert.equal(result.components[2], components[2])
  assert.equal(result.components[3], components[3])
  assert.equal(result.components[1].binding, originalBinding)
  assert.equal(result.components[2].binding, originalBinding)
})

test('calibração converte junta montada para a folha original sem alterar o modelo', async () => {
  const arm = { id: 'arm', name: 'Braço', x: 80, y: 30, width: 40, height: 40, rotation: 90, dataUrl: 'arm.png' }
  const model = {
    width: 300,
    height: 400,
    joints: [{ id: 'arm-child', parentPartId: 'arm', childPartId: 'child', parentAnchor: { x: 100, y: 30 }, childAnchor: { x: 100, y: 80 } }],
    parts: [arm, { id: 'child', name: 'Mão', x: 90, y: 80, width: 20, height: 20, rotation: 0, dataUrl: 'hand.png' }]
  }
  const before = structuredClone(model)
  const parts = calibrateWardrobeSourceParts(model, 'arm', 200, 300)

  assert.deepEqual(parts[0].sourceTransform, {
    x: 200, y: 280, width: 40, height: 40, rotation: 0, anchorVersion: 1, jointAnchor: { x: 200, y: 300 }
  })
  assert.equal(parts[1], model.parts[1])
  assert.deepEqual(model, before)
  assert.equal(calibrateWardrobeSourceParts(model, 'missing', 0, 0), null)
})

test('a tela da biblioteca delega atualização dos bindings ao modelo puro', async () => {
  const editor = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(editor, /rebindWardrobeComponents\(draft\.components, referenceModel\)/)
  assert.doesNotMatch(editor, /function rebindComponents\(/)
})
