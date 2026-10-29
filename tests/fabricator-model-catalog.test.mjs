/** Teste da biblioteca do Fabricador usando somente caminhos temporários. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricatorModelCatalog } from '../electron/domains/fabricator/modelCatalog.ts'
import { registerFabricatorModelCatalogHandlers } from '../electron/domains/fabricator/modelIpc.ts'
import { AmbiguousModelSourceRecoveryError } from '../electron/domains/fabricator/modelSourceRecovery.ts'
const SOURCE_FILE = 'source-abcdef11-2345.png'
const PART = { id: 'head', name: 'Cabeça', x: 0, y: 0, width: 80, height: 80, rotation: 0 }
const manifest = { schemaVersion: 1, slot: 1, name: 'Modelinho', sourceName: 'sheet.png', sourceAssetName: SOURCE_FILE,
  sourceFile: SOURCE_FILE, width: 100, height: 100, tolerance: 12, parts: [PART], joints: [], updatedAt: '2026-10-22T00:00:00Z' }
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'gv5-models-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const slotPath = (slot) => join(dir, `slot-${slot}`)
  const catalog = new FabricatorModelCatalog(10, slotPath, { readFile, readAssetImage: readFile })
  const folder = slotPath(1)
  await mkdir(join(folder, 'parts'), { recursive: true })
  await writeFile(join(folder, 'project.json'), JSON.stringify(manifest))
  await writeFile(join(folder, SOURCE_FILE), Buffer.from([1,2,3]))
  await writeFile(join(folder, 'parts', 'head.png'), Buffer.from([4,5,6]))
  return { catalog, folder }
}
test('lista 10 slots com um preenchido, preserva nome e número de peças', async t => {
  const { catalog } = await fixture(t)
  const slots = await catalog.listSlots()
  assert.equal(slots.length, 10)
  assert.deepEqual(slots[0], { slot: 1, name: 'Modelinho', sourceName: 'sheet.png', partCount: 1, updatedAt: manifest.updatedAt })
  assert.deepEqual(slots.slice(1), Array(9).fill(null))
})
test('reconstitui sourceDataUrl e peças na leitura do catálogo', async t => {
  const { catalog } = await fixture(t)
  const project = await catalog.loadSlot(1)
  assert.equal(project.name, 'Modelinho')
  assert.equal(project.sourceDataUrl, 'data:image/png;base64,AQID')
  assert.equal(project.parts[0].dataUrl, 'data:image/png;base64,BAUG')
  assert.equal(project.parts[0].id, 'head')
})
test('slot inválido rejeitado antes de IO; slot não preenchido retorna null', async t => {
  const { catalog } = await fixture(t)
  await assert.rejects(catalog.loadSlot(0), /Slot inválido/)
  await assert.rejects(catalog.loadSlot(11), /Slot inválido/)
  assert.equal(await catalog.loadSlot(2), null)
})
test('manifesto com filename inseguro ou componente com ID inválido não é carregado', async t => {
  const { catalog, folder } = await fixture(t)
  await writeFile(join(folder, 'project.json'), JSON.stringify({ ...manifest, sourceFile: '../../secret.png' }))
  assert.equal(await catalog.loadSlot(1), null)
  await writeFile(join(folder, 'project.json'), JSON.stringify({ ...manifest, parts: [{ ...PART, id: '../../bad' }] }))
  assert.equal(await catalog.loadSlot(1), null)
})
test('máscara base opcional mantém referência binária na mesma estrutura', async t => {
  const { catalog, folder } = await fixture(t)
  await writeFile(join(folder, 'project.json'), JSON.stringify({ ...manifest, parts: [{ ...PART, chromaBaseSaved: true }] }))
  await writeFile(join(folder, 'parts', 'head.base.png'), Buffer.from([10,11,12]))
  assert.equal((await catalog.loadSlot(1)).parts[0].chromaBaseDataUrl, 'data:image/png;base64,CgsM')
})
test('IPC conserva canais e impede acesso de origem não confiável', async () => {
  const handlers = new Map(); let calls = 0
  const catalog = { listSlots: async () => { calls++; return [] }, loadSlot: async slot => { calls++; return { slot } } }
  registerFabricatorModelCatalogHandlers({ handle: (name, cb) => handlers.set(name, cb) }, event => {
    if (!event.trusted) throw new Error('Origem inválida')
  }, catalog)
  assert.deepEqual([...handlers.keys()].sort(), ['fabricator:list-slots', 'fabricator:load-slot'])
  for (const cb of handlers.values()) await assert.rejects(cb({ trusted: false }, 1), /Origem inválida/)
  assert.equal(calls, 0)
  assert.deepEqual(await handlers.get('fabricator:load-slot')({ trusted: true }, 1), { slot: 1 })
})

test('IPC converte recuperação ambígua em modelo indisponível sem rejeitar o invoke', async () => {
  const handlers = new Map()
  registerFabricatorModelCatalogHandlers({ handle: (name, cb) => handlers.set(name, cb) }, () => {}, {
    listSlots: async () => [],
    loadSlot: async (slot) => {
      if (slot === 3) throw new AmbiguousModelSourceRecoveryError()
      throw new Error('Falha de leitura do disco')
    }
  })
  assert.equal(await handlers.get('fabricator:load-slot')({}, 3), null)
  await assert.rejects(handlers.get('fabricator:load-slot')({}, 4), /Falha de leitura do disco/)
})

test('catálogo reutiliza PNGs da versão atual e atualiza após nova publicação', async t => {
  const { folder } = await fixture(t)
  let imageReads = 0
  const counting = new FabricatorModelCatalog(10, () => folder, {
    readFile,
    readAssetImage: async path => { imageReads++; return readFile(path) }
  })
  const first = await counting.loadSlot(1)
  const second = await counting.loadSlot(1)
  assert.equal(imageReads, 1)
  assert.equal(second.parts[0].dataUrl, first.parts[0].dataUrl)
  await writeFile(join(folder,'parts','head.png'),Buffer.from([9,8,7]))
  await writeFile(join(folder,'project.json'),JSON.stringify({...manifest, updatedAt:'2026-10-22T13:00:00Z'}))
  const updated = await counting.loadSlot(1)
  assert.equal(imageReads, 2)
  assert.equal(updated.parts[0].dataUrl, 'data:image/png;base64,CQgH')
  assert.equal(first.parts[0].dataUrl,'data:image/png;base64,BAUG')
})
