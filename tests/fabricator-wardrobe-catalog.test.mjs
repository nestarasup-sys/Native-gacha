/** Catálogo de roupas do Fabricador DEV é somente leitura e respeita o IPC legado. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricatorWardrobeCatalog } from '../electron/domains/fabricator/wardrobeCatalog.ts'
import { registerFabricatorWardrobeCatalogHandlers } from '../electron/domains/fabricator/wardrobeCatalogIpc.ts'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'native-gacha-wardrobe-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const pathForModel = slot => join(root, `model-${slot}`)
  const catalog = new FabricatorWardrobeCatalog(pathForModel, { readdir, readFile }, 10)
  async function put(id, changes = {}) {
    const path = join(pathForModel(1), `set-${id}`)
    await mkdir(path, { recursive: true })
    const item = { schemaVersion: 1, edition: 2, modelSlot: 1, id, name: id, modelName: 'Modelo 1',
      updatedAt: '2026-10-22T00:00:00Z', components: [{id:'camisa'}], ...changes }
    await writeFile(join(path, 'wardrobe.json'), JSON.stringify(item))
  }
  return { catalog, put, pathForModel }
}

test('lista roupas em ordem, ignora manifestos errados e não modifica a biblioteca', async t => {
  const { catalog, put, pathForModel } = await fixture(t)
  await put('camisa')
  await put('calca', { edition: undefined, components: [], updatedAt: '2026-10-23T00:00:00Z' })
  await put('fora', { modelSlot: 2 })
  await put('invalido', { edition: 3 })
  const original = await readFile(join(pathForModel(1), 'set-camisa', 'wardrobe.json'))
  assert.deepEqual((await catalog.list(1)).map(x => ({id:x.id,edition:x.edition,count:x.componentCount})), [
    {id:'calca',edition:1,count:0}, {id:'camisa',edition:2,count:1}
  ])
  assert.deepEqual(await readFile(join(pathForModel(1), 'set-camisa', 'wardrobe.json')), original)
  assert.deepEqual(await catalog.list(2), [])
  await assert.rejects(catalog.list(0), /Modelo inválido/)
  await assert.rejects(catalog.list(11), /Modelo inválido/)
})

test('recupera a transação das imagens antes de ler cada manifesto de roupa', async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-gacha-wardrobe-recovery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const pathForModel = slot => join(root, `model-${slot}`)
  const order = []
  const catalog = new FabricatorWardrobeCatalog(pathForModel, {
    readdir,
    readFile: async (...args) => { order.push('read'); return readFile(...args) }
  }, 10, async (folder, imageFolder) => {
    order.push(`recover:${folder}:${imageFolder}`)
  })
  const setFolder = join(pathForModel(1), 'set-camisa')
  await mkdir(setFolder, { recursive: true })
  await writeFile(join(setFolder, 'wardrobe.json'), JSON.stringify({ schemaVersion: 1, edition: 1, modelSlot: 1,
    id: 'camisa', name: 'Camisa', modelName: 'Modelo', updatedAt: '2026-10-22T00:00:00Z', components: [] }))

  assert.equal((await catalog.list(1)).length, 1)
  assert.deepEqual(order, [`recover:${setFolder}:${join(setFolder, 'parts')}`, 'read'])
})

test('IPC mantém canal e bloqueia origem não confiável antes de chamar a biblioteca', async () => {
  const handlers = new Map()
  let calls = 0
  registerFabricatorWardrobeCatalogHandlers({handle: (channel, callback) => handlers.set(channel, callback)}, event => {
    if (!event.trusted) throw new Error('Origem não confiável')
  }, {list: async () => { calls++; return [] }})
  assert.deepEqual([...handlers.keys()], ['fabricator:wardrobe:list'])
  await assert.rejects(handlers.get('fabricator:wardrobe:list')({trusted:false}, 1), /Origem não confiável/)
  assert.equal(calls, 0)
  assert.deepEqual(await handlers.get('fabricator:wardrobe:list')({trusted:true}, 1), [])
  assert.equal(calls, 1)
})
