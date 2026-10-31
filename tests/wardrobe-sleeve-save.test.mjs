import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { wardrobeSaveAssets } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeSaveAssets.ts'
import { createFabricatorWardrobePersistence } from '../electron/domains/fabricator/wardrobePersistence.ts'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'

const png = value => `data:image/png;base64,${Buffer.from(value).toString('base64')}`
const piece = (id, segment = 'whole', splitTarget) => ({ id, name: id, category: 'manga-superior', attachedPartId: 'arm-left', x: 0, y: 0, width: 20, height: 30, rotation: 0, sleevePairId: 'pair-one', sleeveSide: 'left', sleeveSegment: segment, ...(splitTarget ? { sleeveJointSplit: splitTarget } : {}), dataUrl: png(id) })

for (const importKind of ['sleeve-grid-3x4', 'pants-grid-3x4']) test(`${importKind}: salvar, reabrir, recortar e restaurar mantém PNGs e pares`, async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'sleeve-save-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const catalog = createFabricatorCatalogPersistence(fs, (path, bytes) => fs.writeFile(path, bytes))
  const storage = createFabricatorWardrobePersistence({
    isValidModelSlot: slot => slot === 1, isValidWardrobeId: id => /^[a-z0-9_-]+$/.test(id),
    wardrobeSetPath: () => root, deformationOriginalId: id => `${id}_deform_original`,
    dataUrlBuffer: url => Buffer.from(url.split(',')[1], 'base64'),
    saveCatalog: opts => catalog.saveCatalog(opts), recoverWardrobeManifest: folder => catalog.recoverWardrobeManifest(folder),
    isCompatible: () => true, readCatalogPng: (_identity, _version, path) => fs.readFile(path), invalidateCatalogPng: () => {}, files: fs
  })
  const splitTarget = importKind === 'pants-grid-3x4' ? 'leg' : 'arm'
  const set = { schemaVersion: 1, edition: 1, importKind, id: 'sleeves', modelSlot: 1, modelName: 'Synthetic', name: 'Sleeves', width: 100, height: 100, updatedAt: 'first', components: [piece('left', 'whole', splitTarget), piece('right', 'whole', splitTarget)] }
  const save = async value => {
    const metadata = { ...value, components: value.components.map(({ dataUrl, ...rest }) => rest) }
    await storage.save(1, metadata, wardrobeSaveAssets(value))
    return storage.read(1, value.id)
  }
  const original = await save(set)
  assert.equal(original.components[0].dataUrl, png('left'))
  assert.equal(original.components[0].sleeveJointSplit, splitTarget)
  const split = { ...original, updatedAt: 'split', components: ['left-upper', 'left-lower', 'right-upper', 'right-lower'].map(id => piece(id, id.endsWith('upper') ? 'upper' : 'lower')) }
  const reopened = await save(split)
  assert.equal(reopened.components.length, 4)
  assert.equal(reopened.components[3].dataUrl, png('right-lower'))
  assert.equal(reopened.components[3].sleevePairId, 'pair-one')
  reopened.components[0].dataUrl = png('edited-image')
  assert.equal((await save(reopened)).components[0].dataUrl, png('edited-image'))
  assert.equal((await save(original)).components[0].dataUrl, png('left'))
})

test('imagem original exigida pelo manifesto nunca é omitida silenciosamente', () => {
  assert.throws(() => wardrobeSaveAssets({ components: [{ ...piece('left'), hasDeformationOriginal: true }] }), /Imagem original ausente/)
})
