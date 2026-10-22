import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { inspectHairFaceCatalog } = require('../scripts/diagnostics/audit-hair-face-images.cjs')
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const pixel = value => Buffer.concat([PNG, Buffer.from([value])])

async function fixture(t, filename, data, files) {
  const root = await fs.mkdtemp(join(tmpdir(), 'fabricator-hair-face-readonly-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(join(root, 'images'))
  const original = JSON.stringify({ schemaVersion: 1, ...data })
  await fs.writeFile(join(root, filename), original)
  for (const [name, bytes] of Object.entries(files)) await fs.writeFile(join(root, 'images', name), bytes)
  return { root, original }
}

test('auditoria do cabelo distingue frente, trás, franja e imagem original', async t => {
  const bytes = {
    'front.png': pixel(1), 'back.png': pixel(2),
    'fringe.png': pixel(3), 'source.png': pixel(4)
  }
  const { root, original } = await fixture(t, 'hair.json', {
    modelSlot: 1, front: {}, back: {}, fringe: {}, sourceImageSaved: true
  }, bytes)
  const report = await inspectHairFaceCatalog(root)
  assert.equal(report.readOnly, true)
  assert.deepEqual(report.assets.map(x => x.id), ['front', 'back', 'fringe', 'source'])
  assert.deepEqual(report.duplicateGroups, [])
  assert.ok(report.assets.every(x => !x.warning))
  assert.equal(await fs.readFile(join(root, 'hair.json'), 'utf8'), original)
  for (const [filename, fileBytes] of Object.entries(bytes))
    assert.deepEqual(await fs.readFile(join(root, 'images', filename)), fileBytes)
})

test('auditoria do rosto evidencia olhos duplicados sem tentar reparar', async t => {
  const repeated = pixel(7)
  const { root } = await fixture(t, 'item.json', {
    id: 'eyes-1', modelSlot: 1, category: 'eyes',
    pieces: [{ id: 'eye-left' }, { id: 'eye-right' }]
  }, {
    'sheet-eyes.png': pixel(1),
    'eye-left.png': repeated,
    'eye-right.png': repeated
  })
  const report = await inspectHairFaceCatalog(root)
  assert.deepEqual(report.duplicateGroups.map(x => x.assetIds), [['eye-left', 'eye-right']])
  assert.equal(report.assets.length, 3)
  assert.deepEqual(await fs.readFile(join(root, 'images', 'eye-left.png')), repeated)
})

test('auditoria de face legada relata PNG ausente e cabeçalhos inválidos', async t => {
  const { root } = await fixture(t, 'face.json', {
    sheets: { eyes: { kind: 'eyes' }, eyebrows: null },
    pieces: [{ id: 'eye-left' }, { id: 'eye-right' }]
  }, { 'sheet-eyes.png': pixel(4), 'eye-left.png': Buffer.from('not-a-png') })
  const report = await inspectHairFaceCatalog(root)
  assert.deepEqual(report.assets.filter(x => x.warning).map(x => x.id).sort(), ['eye-left', 'eye-right'])
})

test('auditoria impede escape de arquivos e rejeita manifestos ambíguos', async t => {
  const { root } = await fixture(t, 'item.json', {
    category: 'eyes', pieces: [{ id: '../escape' }]
  }, {})
  await assert.rejects(inspectHairFaceCatalog(root), /ID de peça facial inválido/)
  await fs.writeFile(join(root, 'hair.json'), JSON.stringify({ schemaVersion: 1 }))
  await assert.rejects(inspectHairFaceCatalog(root), /único manifesto/)
})
