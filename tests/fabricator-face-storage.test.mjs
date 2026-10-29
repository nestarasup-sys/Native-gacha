import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { createFabricatorFaceStorage } from '../electron/domains/fabricator/faceStorage.ts'
import { FabricatorCatalogAssetService } from '../electron/domains/fabricator/catalogAssetService.ts'
import { inspectFabricatorStorage } from '../src/shared/fabricatorStorageCompatibility.ts'

const png = text => `data:image/png;base64,${Buffer.from(text).toString('base64')}`
const transform = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
const sheet = (kind, name = `${kind}.png`) => ({ kind, name, width: 12, height: 10, tolerance: 74 })
const piece = (id, sheetKind = 'eyes') => ({
  id, sheet: sheetKind, index: 0, crop: { x: 0, y: 0, width: 6, height: 5 }, width: 6, height: 5
})
const faceSet = (overrides = {}) => ({
  schemaVersion: 1, id: 'classic', modelSlot: 1, name: 'Clássico',
  sheets: { eyes: sheet('eyes') }, pieces: [piece('eye-left')],
  transforms: {
    'eye-left': transform(), 'eye-right': transform(), 'brow-left': transform(),
    'brow-right': transform(), nose: transform(), mouth: transform()
  },
  eyeLinked: true, browLinked: true, selectedNose: 0, selectedExpression: 0, updatedAt: '2026-10-29T00:00:00.000Z',
  ...overrides
})
const catalogItem = (overrides = {}) => ({
  schemaVersion: 1, id: 'eyes-new', modelSlot: 1, category: 'eyes', name: 'Olhos novos',
  sheet: sheet('eyes'), pieces: [piece('eye-left')],
  transforms: { 'eye-left': transform(), 'eye-right': transform() },
  eyeLinked: true, browLinked: true, selectedNose: 0, selectedExpression: 0, updatedAt: '2026-10-29T00:00:00.000Z',
  ...overrides
})

async function createFixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-face-storage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const paths = {
    faceModel: slot => join(root, 'fabricator', 'faces', `model-${slot}`),
    faceSet: (slot, id) => join(root, 'fabricator', 'faces', `model-${slot}`, `set-${id}`),
    faceCatalog: slot => join(root, 'fabricator', 'faces', `model-${slot}`, 'catalog'),
    faceCatalogItem: (slot, id) => join(root, 'fabricator', 'faces', `model-${slot}`, 'catalog', `item-${id}`),
    faceComponent: slot => join(root, 'fabricator', 'face-components', `model-${slot}`),
    faceComponentItem: (slot, id) => join(root, 'fabricator', 'face-components', `model-${slot}`, `item-${id}`)
  }
  const catalogPersistence = createFabricatorCatalogPersistence(fs, (path, bytes) => fs.writeFile(path, bytes))
  const assets = new FabricatorCatalogAssetService(path => fs.readFile(path))
  const storage = createFabricatorFaceStorage({
    isValidModelSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    isValidWardrobeId: id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id),
    isValidFaceCatalogId: id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id),
    paths,
    dataUrlBuffer: dataUrl => {
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
      if (!match) throw new Error('Arquivo de peça inválido.')
      return Buffer.from(match[1], 'base64')
    },
    saveCatalog: options => catalogPersistence.saveCatalog(options),
    recoverCatalogManifest: (folder, imageFolder) => catalogPersistence.recoverCatalogManifest(folder, imageFolder),
    isCompatible: (kind, value) => inspectFabricatorStorage(kind, value).compatible,
    readCatalogPng: (identity, version, path) => assets.read('face', identity, version, path),
    invalidateCatalogPng: identity => assets.invalidate('face', identity),
    files: fs
  })
  return { paths, storage }
}

test('conjunto legado de rosto continua salvando, carregando PNGs e aparecendo como itens de catálogo', async t => {
  const { storage } = await createFixture(t)
  const set = faceSet()
  await storage.writeFaceSet(1, set, [
    { id: 'sheet-eyes', dataUrl: png('sheet-png') },
    { id: 'eye-left', dataUrl: png('piece-png') }
  ])

  const loaded = await storage.readFaceSet(1, 'classic')
  assert.equal(loaded.sheets.eyes.dataUrl, png('sheet-png'))
  assert.equal(loaded.pieces[0].dataUrl, png('piece-png'))
  assert.equal((await storage.listFaceCatalogItems(1))[0].id, 'legacy_classic_eyes')

  const legacyItem = await storage.readFaceCatalogItem(1, 'legacy_classic_eyes')
  assert.equal(legacyItem.category, 'eyes')
  assert.equal(legacyItem.sheet.dataUrl, png('sheet-png'))
  assert.equal(legacyItem.pieces[0].dataUrl, png('piece-png'))
})

test('catálogo facial atual e assets faciais mantêm manifestos, IDs e PNGs', async t => {
  const { storage } = await createFixture(t)
  const item = catalogItem()
  await storage.writeFaceCatalogItem(1, item, [
    { id: 'sheet-eyes', dataUrl: png('new-sheet') },
    { id: 'eye-left', dataUrl: png('new-piece') }
  ])
  const loadedItem = await storage.readFaceCatalogItem(1, 'eyes-new')
  assert.equal(loadedItem.sheet.dataUrl, png('new-sheet'))
  assert.equal(loadedItem.pieces[0].dataUrl, png('new-piece'))
  assert.deepEqual(await storage.listFaceCatalogItems(1), [{
    id: 'eyes-new', modelSlot: 1, category: 'eyes', name: 'Olhos novos',
    updatedAt: item.updatedAt, pieceCount: 1
  }])

  const asset = {
    schemaVersion: 1, id: 'eye-piece', modelSlot: 1, kind: 'eye', name: 'Olho',
    width: 8, height: 6, defaultTransform: transform(), updatedAt: item.updatedAt
  }
  await storage.writeFaceComponentAsset(1, asset, png('component-png'))
  assert.equal((await storage.readFaceComponentAsset(1, 'eye-piece')).dataUrl, png('component-png'))
  assert.deepEqual(await storage.listFaceComponentAssets(1, 'eye'), [{
    schemaVersion: 1, id: 'eye-piece', modelSlot: 1, kind: 'eye', name: 'Olho',
    width: 8, height: 6, updatedAt: item.updatedAt
  }])
})

test('validação recusa slots e dimensões inválidos antes de publicar dados', async t => {
  const { storage } = await createFixture(t)
  await assert.rejects(storage.writeFaceSet(2, faceSet(), []), /Rosto inválido/)
  await assert.rejects(storage.writeFaceCatalogItem(1, catalogItem({ sheet: { ...sheet('eyes'), width: 0 } }), []), /Peça facial inválida/)
  assert.equal(await storage.readFaceSet(1, 'classic'), null)
})
