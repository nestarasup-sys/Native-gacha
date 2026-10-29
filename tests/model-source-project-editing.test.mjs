import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

function loadTypeScriptModule(file, resolveImport) {
  const source = readFileSync(resolve(file), 'utf8')
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, resolveImport)
  return module.exports
}

const rig = loadTypeScriptModule('src/shared/modelRig.ts', (specifier) => {
  throw new Error(`Import inesperado em modelRig.ts: ${specifier}`)
})
const modelSource = {
  sourceRect: (part) => ({
    x: part.sourceTransform?.x ?? part.x,
    y: part.sourceTransform?.y ?? part.y,
    width: part.sourceTransform?.width ?? part.width,
    height: part.sourceTransform?.height ?? part.height
  })
}
const editing = loadTypeScriptModule('src/renderer/src/features/fabricator/models/modelSourceProjectEditing.ts', (specifier) => {
  if (specifier === '../../../../../shared/modelRig') return rig
  if (specifier === './modelSource') return modelSource
  throw new Error(`Import inesperado em modelSourceProjectEditing.ts: ${specifier}`)
})
const { applyRotatedModelSourcePart } = editing

function part(id, name, rect) {
  return {
    id, name, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    rotation: 0, dataUrl: `data:${id}`,
    sourceTransform: { ...rect, rotation: 0 }
  }
}

function project(parts, joints = []) {
  return { width: 100, height: 80, parts, joints }
}

function rotated(partToRotate, rect = { x: 25, y: 15, width: 10, height: 20 }) {
  return {
    ...partToRotate,
    x: 25, y: 20, width: 10, height: 20,
    sourceTransform: { ...rect, rotation: 90 }
  }
}

test('aplica rotação sem mutar o modelo e gira os pivôs conectados com a peça', () => {
  const arm = part('arm', 'Braço esquerdo', { x: 20, y: 20, width: 20, height: 10 })
  const torso = part('torso', 'Tronco', { x: 70, y: 20, width: 10, height: 20 })
  const joint = {
    id: 'shoulder', parentPartId: arm.id, childPartId: torso.id,
    parentAnchor: { x: 34, y: 25 }, childAnchor: { x: 65, y: 25 }, pivot: { x: 49.5, y: 25 }
  }
  const original = project([arm, torso], [joint])

  const updated = applyRotatedModelSourcePart(original, arm.id, rotated(arm), 90)

  assert.equal(updated.parts[0].width, 10)
  assert.equal(updated.parts[0].height, 20)
  assert.deepEqual(updated.joints[0].parentAnchor, { x: 30, y: 29 })
  assert.deepEqual(updated.joints[0].childAnchor, { x: 65, y: 25 })
  assert.deepEqual(updated.joints[0].pivot, { x: 47.5, y: 27 })
  assert.deepEqual(updated.parts[0].jointAnchor, { x: 30, y: 29 })
  assert.deepEqual(original.parts[0], arm)
  assert.deepEqual(original.joints[0], joint)
})

test('recusa rotação fora da folha original', () => {
  const arm = part('arm', 'Braço', { x: 20, y: 20, width: 20, height: 10 })
  const model = project([arm])

  assert.throws(
    () => applyRotatedModelSourcePart(model, arm.id, rotated(arm, { x: 95, y: 10, width: 10, height: 20 }), 90),
    /ultrapassaria os limites da folha original/
  )
  assert.deepEqual(model.parts[0], arm)
})

test('recusa rotação que aumente a sobreposição com outra peça', () => {
  const arm = part('arm', 'Braço', { x: 20, y: 20, width: 20, height: 10 })
  const head = part('head', 'Cabeça', { x: 25, y: 10, width: 10, height: 15 })
  const model = project([arm, head])

  assert.throws(() => applyRotatedModelSourcePart(model, arm.id, rotated(arm), 90), /invadiria a área de Cabeça/)
  assert.deepEqual(model.parts[0], arm)
})

test('recusa IDs inconsistentes antes de substituir a peça', () => {
  const arm = part('arm', 'Braço', { x: 20, y: 20, width: 20, height: 10 })
  const model = project([arm])

  assert.throws(() => applyRotatedModelSourcePart(model, arm.id, rotated({ ...arm, id: 'other' }), 90), /peça diferente da selecionada/)
  assert.throws(() => applyRotatedModelSourcePart(model, 'missing', rotated(arm), 90), /não está mais no modelo/)
  assert.deepEqual(model.parts[0], arm)
})
