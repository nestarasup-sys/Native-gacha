import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { wardrobeSaveAssets } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeSaveAssets.ts'
import { createFabricatorWardrobePersistence } from '../electron/domains/fabricator/wardrobePersistence.ts'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'

const png = value => `data:image/png;base64,${Buffer.from(value).toString('base64')}`
const piece = (id, segment = 'whole', splitTarget, category = 'manga-superior', side = id.startsWith('right') ? 'right' : 'left', image = png(id)) => ({ id, name: id, category, attachedPartId: category === 'sapato' ? 'foot-left' : category === 'calca-coxa' ? 'thigh-left' : 'arm-left', x: 0, y: 0, width: 20, height: 30, rotation: 0, sleevePairId: 'pair-one', sleeveSide: side, sleeveSegment: segment, ...(splitTarget ? { sleeveJointSplit: splitTarget } : {}), dataUrl: image })

for (const importKind of ['sleeve-grid-3x4', 'pants-grid-3x4', 'shoe-grid-3x4']) test(`${importKind}: salvar e reabrir mantém metadados, PNGs e pares`, async t => {
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
  const category = importKind === 'shoe-grid-3x4' ? 'sapato' : importKind === 'pants-grid-3x4' ? 'calca-coxa' : 'manga-superior'
  const splitTarget = importKind === 'pants-grid-3x4' ? 'leg' : importKind === 'sleeve-grid-3x4' ? 'arm' : undefined
  const rightImage = importKind === 'shoe-grid-3x4' ? png('left') : png('right')
  const set = { schemaVersion: 1, edition: 1, previewGender: 'male', importKind, id: 'sleeves', modelSlot: 1, modelName: 'Synthetic', name: 'Sleeves', width: 100, height: 100, updatedAt: 'first', components: [piece('left', 'whole', splitTarget, category, 'left', png('left')), piece('right', 'whole', splitTarget, category, 'right', rightImage)] }
  const save = async value => {
    const metadata = { ...value, components: value.components.map(({ dataUrl, ...rest }) => rest) }
    await storage.save(1, metadata, wardrobeSaveAssets(value))
    return storage.read(1, value.id)
  }
  const original = await save(set)
  assert.equal(original.previewGender, 'male')
  assert.equal(original.colorMode, undefined)
  assert.equal(original.importKind, importKind)
  assert.equal(original.components[0].dataUrl, png('left'))
  assert.equal(original.components[0].sleeveJointSplit, splitTarget)
  assert.equal(original.components[1].sleeveSide, 'right')
  const assetColorsSet = await save({ ...set, colorMode: 'asset-colors', updatedAt: 'asset-colors' })
  assert.equal(assetColorsSet.colorMode, 'asset-colors')
  await assert.rejects(save({ ...set, colorMode: 'automatic' }), /Conjunto de roupa inválido/)
  assert.equal((await storage.read(1, set.id)).colorMode, 'asset-colors')
  if (importKind === 'shoe-grid-3x4') {
    assert.equal(original.components[0].category, 'sapato')
    assert.equal(original.components[1].category, 'sapato')
    assert.equal(original.components[1].dataUrl, original.components[0].dataUrl)
  } else {
    const split = { ...original, updatedAt: 'split', components: ['left-upper', 'left-lower', 'right-upper', 'right-lower'].map(id => piece(id, id.endsWith('upper') ? 'upper' : 'lower', undefined, category)) }
    const reopened = await save(split)
    assert.equal(reopened.components.length, 4)
    assert.equal(reopened.components[3].dataUrl, png('right-lower'))
    assert.equal(reopened.components[3].sleevePairId, 'pair-one')
    reopened.components[0].dataUrl = png('edited-image')
    assert.equal((await save(reopened)).components[0].dataUrl, png('edited-image'))
  }
  assert.equal((await save(original)).components[0].dataUrl, png('left'))
})

test('imagem original exigida pelo manifesto nunca é omitida silenciosamente', () => {
  assert.throws(() => wardrobeSaveAssets({ components: [{ ...piece('left'), hasDeformationOriginal: true }] }), /Imagem original ausente/)
})
