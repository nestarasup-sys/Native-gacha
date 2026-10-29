import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { createFabricatorHairStorage } from '../electron/domains/fabricator/hairStorage.ts'
import { FabricatorCatalogAssetService } from '../electron/domains/fabricator/catalogAssetService.ts'
import { inspectFabricatorStorage } from '../src/shared/fabricatorStorageCompatibility.ts'

const png = text => `data:image/png;base64,${Buffer.from(text).toString('base64')}`
const transform = () => ({ x: 10, y: 20, scaleX: 1.2, scaleY: 0.9, rotation: 4 })

async function createFixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-hair-storage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const paths = {
    hairModel: slot => join(root, 'fabricator', 'hair', `model-${slot}`),
    hairStyle: (slot, id) => join(root, 'fabricator', 'hair', `model-${slot}`, 'styles', `style-${id}`)
  }
  const catalogPersistence = createFabricatorCatalogPersistence(fs, (path, bytes) => fs.writeFile(path, bytes))
  const assets = new FabricatorCatalogAssetService(path => fs.readFile(path))
  const storage = createFabricatorHairStorage({
    isValidModelSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    isValidWardrobeId: id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id),
    paths,
    dataUrlBuffer: dataUrl => {
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
      if (!match) throw new Error('Arquivo de peça inválido.')
      return Buffer.from(match[1], 'base64')
    },
    saveCatalog: options => catalogPersistence.saveCatalog(options),
    recoverCatalogManifest: (folder, imageFolder) => catalogPersistence.recoverCatalogManifest(folder, imageFolder),
    isCompatible: (kind, value) => inspectFabricatorStorage(kind, value).compatible,
    readCatalogPng: (identity, version, path) => assets.read('hair', identity, version, path),
    invalidateCatalogPng: identity => assets.invalidate('hair', identity),
    legacyHairStyle: (modelSlot, workspace) => workspace
      ? { ...workspace, id: 'legacy-workspace', modelSlot, name: 'Legado', createdAt: workspace.updatedAt }
      : null,
    files: fs
  })
  return { paths, storage }
}

test('rascunho e conjunto de cabelo preservam PNGs, estilos e caminho legado', async t => {
  const { storage } = await createFixture(t)
  const updatedAt = '2026-10-29T00:00:00.000Z'
  const workspace = {
    schemaVersion: 1, modelSlot: 1,
    front: { width: 12, height: 8 }, back: null, fringe: null,
    transforms: { front: transform(), back: transform() },
    sourceImageSaved: true, sourceAppliesToDraft: true, chromaTolerance: 74,
    updatedAt
  }
  await storage.writeHairWorkspace(1, workspace, [
    { id: 'front', dataUrl: png('workspace-front') },
    { id: 'source', dataUrl: png('workspace-source') }
  ])
  const loadedWorkspace = await storage.readHairWorkspace(1)
  assert.equal(loadedWorkspace.front.dataUrl, png('workspace-front'))
  assert.equal(loadedWorkspace.sourceImageDataUrl, png('workspace-source'))

  const legacyStyle = await storage.readHairStyle(1, 'legacy-workspace')
  assert.equal(legacyStyle.id, 'legacy-workspace')
  assert.equal(legacyStyle.front.dataUrl, png('workspace-front'))

  const style = {
    schemaVersion: 1, id: 'style-1', modelSlot: 1, name: 'Cabelo teste',
    front: { width: 15, height: 9 }, back: null, fringe: null,
    transforms: { front: transform(), back: transform() },
    sourceImageSaved: true, sourceAppliesToDraft: true,
    createdAt: updatedAt, updatedAt
  }
  await storage.writeHairStyle(1, style, [
    { id: 'front', dataUrl: png('style-front') },
    { id: 'source', dataUrl: png('style-source') }
  ])
  assert.equal((await storage.readHairStyle(1, 'style-1')).front.dataUrl, png('style-front'))
  assert.equal((await storage.readHairStyle(1, 'style-1', true)).sourceImageDataUrl, png('style-source'))

  await storage.writeLegacyHairCatalogState(1, 'dismissed')
  await storage.writeLegacyHairCatalogState(1, 'active')
  assert.equal(await storage.readLegacyHairCatalogState(1), 'dismissed')
  assert.equal(await storage.readHairStyle(1, 'legacy-workspace'), null)

  await storage.clearHairWorkspace(1)
  assert.equal(await storage.readHairWorkspace(1), null)
  assert.equal((await storage.readHairStyle(1, 'style-1')).front.dataUrl, png('style-front'))
})

test('persistência capilar rejeita entradas inválidas sem publicar manifestos', async t => {
  const { storage } = await createFixture(t)
  const invalid = {
    schemaVersion: 1, id: 'bad-style', modelSlot: 1, name: 'Inválido',
    front: { width: 10, height: 8 }, back: null, fringe: null,
    transforms: { front: { ...transform(), scaleX: 0 }, back: transform() },
    createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z'
  }
  await assert.rejects(storage.writeHairStyle(1, invalid, [{ id: 'front', dataUrl: png('never-written') }]), /Estilo de cabelo inválido/)
  assert.equal(await storage.readHairStyle(1, 'bad-style'), null)
})
