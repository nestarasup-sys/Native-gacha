import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'

async function sandbox(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-catalog-persistence-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}
const persistence = (files = fs) => createFabricatorCatalogPersistence(files, (path, data) => fs.writeFile(path, data))
const image = (id, text) => ({ id, bytes: Buffer.from(text) })

test('rosto e cabelo preservam manifesto e PNGs antigos se faltar imagem nova', async t => {
  const root = await sandbox(t)
  const folder = join(root, 'face')
  const opts = {
    folder, imageFolder: join(folder, 'images'), manifestName: 'face.json',
    expected: new Set(['eye', 'brow']), prune: 'all'
  }
  await persistence().saveCatalog({ ...opts, manifest: { schemaVersion: 1, updatedAt: 'a' },
    images: [image('eye', 'OLD EYE'), image('brow', 'OLD BROW')] })
  await fs.writeFile(join(folder, 'images', 'eye.paint.png'), 'PAINT')
  await assert.rejects(persistence().saveCatalog({
    ...opts, manifest: { schemaVersion: 1, updatedAt: 'b' },
    images: [image('eye', 'NEW EYE')], expected: new Set(['eye', 'missing'])
  }), /Imagem do catálogo ausente: missing/)
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'face.json',), 'utf8')).updatedAt, 'a')
  assert.equal(await fs.readFile(join(folder, 'images', 'brow.png'), 'utf8'), 'OLD BROW')
  assert.equal(await fs.readFile(join(folder, 'images', 'eye.paint.png'), 'utf8'), 'PAINT')
  await persistence().saveCatalog({
    ...opts, manifest: { schemaVersion: 1, updatedAt: 'c' },
    images: [image('eye', 'FINAL')], expected: new Set(['eye'])
  })
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'face.json'), 'utf8')).updatedAt, 'c')
  await assert.rejects(fs.access(join(folder, 'images', 'brow.png')), { code: 'ENOENT' })
  assert.equal(await fs.readFile(join(folder, 'images', 'eye.paint.png'), 'utf8'), 'PAINT')
})

test('manifesto de roupa mantém protocolo de backup em falha e reinício', async t => {
  const root = await sandbox(t)
  const folder = join(root, 'set-uniform')
  const options = { folder, imageFolder: join(folder, 'parts'), manifestName: 'wardrobe.json',
    expected: new Set(['coat']), images: [image('coat', 'PNG')], prune: 'all' }
  await persistence().saveCatalog({ ...options, manifest: { schemaVersion: 1, edition: 1, id: 'uniform' } })
  const badFiles = { ...fs, rename: async (from, to) => {
    if (from.endsWith('wardrobe.json.tmp')) {
      const error = new Error('Falha simulada na promoção')
      error.code = 'EIO'
      throw error
    }
    return fs.rename(from, to)
  } }
  await assert.rejects(persistence(badFiles).saveCatalog({
    ...options, manifest: { schemaVersion: 1, edition: 2, id: 'uniform' }
  }), /Falha simulada/)
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'wardrobe.json'), 'utf8')).edition, 1)
  await fs.rename(join(folder, 'wardrobe.json'), join(folder, 'wardrobe.json.backup'))
  await persistence().recoverWardrobeManifest(folder)
  await persistence().recoverWardrobeManifest(folder)
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'wardrobe.json'), 'utf8')).edition, 1)
  await persistence().saveCatalog({ ...options, manifest: { schemaVersion: 1, edition: 2, id: 'uniform' } })
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'wardrobe.json'), 'utf8')).edition, 2)
  assert.equal(await fs.readFile(join(folder, 'parts', 'coat.png'), 'utf8'), 'PNG')
})

test('catálogos recusam paths estranhos e IDs repetidos antes de gravar', async t => {
  const root = await sandbox(t)
  const options = { folder: root, imageFolder: join(root, 'images'),
    manifestName: 'hair-style.json', manifest: { schemaVersion: 1 },
    expected: new Set(['front']), images: [image('../escape', 'NO')] }
  await assert.rejects(persistence().saveCatalog(options), /inesperadas/)
  await assert.rejects(fs.access(join(root, 'hair-style.json')), { code: 'ENOENT' })
  await assert.rejects(persistence().saveCatalog({
    ...options, images: [image('front', 'x'), image('front', 'y')]
  }), /duplicadas/)
})
