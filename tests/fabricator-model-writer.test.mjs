import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorModelWriter } from '../electron/domains/fabricator/modelWriter.ts'

const png = 'data:image/png;base64,' + Buffer.from('IMAGE').toString('base64')
const model = {
  schemaVersion: 1, slot: 1, name: 'Modelo', sourceName: 'base.png',
  sourceAssetName: 'source-abcd1234.png', width: 250, height: 300,
  tolerance: 74, joints: [], updatedAt: '2026-10-22T12:00:00Z',
  parts: [{ id: 'cabeca', name: 'Cabeça', x: 5, y: 9, width: 45, height: 46, rotation: 0, chromaBaseSaved: true }]
}
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'native-gacha-model-writer-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const folder = join(home, 'slot-1')
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(join(folder, 'source-abcd1234.png'), 'ORIGINAL')
  const writer = createFabricatorModelWriter({
    slotPath: () => folder,
    isValidSlot: slot => slot === 1,
    dataUrlBuffer: dataUrl => Buffer.from(dataUrl.split(',')[1], 'base64'),
    writeAssetImageSource: (path, bytes) => fs.writeFile(path, bytes),
    files: fs
  })
  return { home, folder, writer }
}

test('writer publica manifesto somente depois de verificar todos os PNGs e preserva os contratos legados', async t => {
  const { folder, writer } = await fixture(t)
  const assets = [{ id: 'cabeca', dataUrl: png, chromaBaseDataUrl: png }]
  await writer(model, assets)
  const manifest = JSON.parse(await fs.readFile(join(folder, 'project.json'), 'utf8'))
  assert.equal(manifest.sourceFile, model.sourceAssetName)
  assert.equal(manifest.parts[0].name, 'Cabeça')
  assert.equal(manifest.parts[0].chromaBaseSaved, true)
  assert.equal(await fs.readFile(join(folder,'parts','cabeca.png'),'utf8'), 'IMAGE')
  assert.equal(await fs.readFile(join(folder,'parts','cabeca.base.png'),'utf8'), 'IMAGE')
  await assert.rejects(fs.access(join(folder, 'project.json.tmp')), /ENOENT/)
})

test('writer recusa falta de recorte e nunca publica um manifesto incompleto', async t => {
  const { folder, writer } = await fixture(t)
  await assert.rejects(writer(model, []),/FABRICATOR_MISSING_ASSETS/)
  await assert.rejects(fs.access(join(folder,'project.json')), /ENOENT/)
  await assert.rejects(writer({...model,parts:[{...model.parts[0],id:'../invalido'}]},[]),/Identificador de peça inválido/)
})

test('writer remove somente arquivos obsoletos e mantém fonte referenciada pelo histórico', async t => {
  const { folder, writer } = await fixture(t)
  await fs.mkdir(join(folder,'parts'), {recursive:true})
  await fs.mkdir(join(folder,'history'), {recursive:true})
  await fs.writeFile(join(folder,'parts','antigo.png'), 'OLD')
  await fs.writeFile(join(folder,'parts','cabeca.paint.png'), 'PAINT')
  await fs.writeFile(join(folder,'source-bbbb2222.png'),'STILL_REFERENCED')
  await fs.writeFile(join(folder,'source-cccc3333.png'),'OBSOLETE')
  await fs.writeFile(join(folder,'history','history.json'),JSON.stringify({undo:[{project:{sourceAssetName:'source-bbbb2222.png'}}],redo:[]}))
  await writer(model,[{ id: 'cabeca', dataUrl: png, chromaBaseDataUrl: png }])
  assert.deepEqual(await fs.readFile(join(folder,'source-bbbb2222.png'),'utf8'),'STILL_REFERENCED')
  assert.equal(await fs.readFile(join(folder,'parts','cabeca.paint.png'),'utf8'),'PAINT')
  await assert.rejects(fs.access(join(folder,'source-cccc3333.png')), /ENOENT/)
  await assert.rejects(fs.access(join(folder,'parts','antigo.png')), /ENOENT/)
})
