import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { createFaceGuidePersistence } from '../electron/domains/fabricator/faceGuidePersistence.ts'

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

test('proteção pré-gravação: peça faltante nunca sobrescreve PNG válido, independentemente do catálogo', async t => {
  for (const manifestName of ['wardrobe.json', 'hair-style.json', 'face.json']) {
    const root = await sandbox(t)
    const folder = join(root, manifestName.replace('.json', ''))
    const imageFolder = join(folder, 'images')
    const writeLog = []
    const persistenceWithAudit = createFabricatorCatalogPersistence(fs, async (path, data) => {
      writeLog.push(path)
      await fs.writeFile(path, data)
    })
    const original = { schemaVersion: 1, id: 'set-1', updatedAt: 'before' }
    const base = { folder, imageFolder, manifestName, expected: new Set(['left', 'right']) }
    await persistenceWithAudit.saveCatalog({ ...base, manifest: original,
      images: [image('left', 'LEFT_ORIGINAL'), image('right', 'RIGHT_ORIGINAL')] })
    const beforeLeft = await fs.readFile(join(imageFolder, 'left.png'))
    const beforeRight = await fs.readFile(join(imageFolder, 'right.png'))
    await fs.unlink(join(imageFolder, 'right.png'))
    writeLog.length = 0
    await assert.rejects(persistenceWithAudit.saveCatalog({
      ...base, expected: new Set(['left', 'right', 'missing']), 
      manifest: { ...original, updatedAt: 'after' },
      images: [image('left', 'REPLACED_WITH_SLEEVE')]
    }), /Imagem do catálogo ausente: right|Imagem do catálogo ausente: missing/)
    assert.equal(writeLog.length, 0, 'não deve escrever nem a primeira manga quando falta outra peça: ' + manifestName)
    assert.deepEqual(await fs.readFile(join(imageFolder, 'left.png')), beforeLeft)
    assert.deepEqual(JSON.parse(await fs.readFile(join(folder, manifestName), 'utf8')), original)
    await assert.rejects(fs.access(join(imageFolder, 'right.png')), { code: 'ENOENT' })
    assert.equal(beforeRight.toString(), 'RIGHT_ORIGINAL')
  }
})

test('proteção pré-gravação: falha de permissão conserva o manifesto e todos os PNGs', async t => {
  const root = await sandbox(t)
  const folder = join(root, 'wardrobe')
  const imageFolder = join(folder, 'parts')
  const base = { folder, imageFolder, manifestName: 'wardrobe.json', expected: new Set(['left', 'right']) }
  await persistence().saveCatalog({ ...base, manifest: { id: 'a' },
    images: [image('left', 'LEFT'), image('right', 'RIGHT')] })
  let writes = 0
  const accessError = { ...fs, access: async path => {
    if (path.endsWith('right.png')) { const error = Error('Sem acesso à imagem'); error.code = 'EACCES'; throw error }
    return fs.access(path)
  } }
  const service = createFabricatorCatalogPersistence(accessError, async (path, data) => {
    writes++
    await fs.writeFile(path, data)
  })
  await assert.rejects(service.saveCatalog({ ...base,
    manifest: { id: 'b' }, images: [image('left', 'CORRUPTED')] }), /Sem acesso/)
  assert.equal(writes, 0)
  assert.equal(await fs.readFile(join(imageFolder, 'left.png'), 'utf8'), 'LEFT')
  assert.deepEqual(JSON.parse(await fs.readFile(join(folder, 'wardrobe.json'), 'utf8')), { id: 'a' })
})

test('guias de olhos, rosto e cabeça extra persistem por perfil e modelo sem sobrescrever umas às outras', async t => {
  const root = await sandbox(t)
  const guide = (changes = {}) => ({ visible: true, verticalX: 50, horizontalY: 45, lowerHorizontalY: 65, angle: 12, ...changes })
  const service = createFaceGuidePersistence(fs, () => root)
  const eyes = { 1: guide({ verticalX: 35, angle: -8 }), 2: guide({ horizontalY: 40 }) }
  const face = { 1: guide({ verticalX: 62, horizontalY: 52 }), 3: guide({ visible: false, angle: 0 }) }
  const headExtras = { 1: guide({ verticalX: 70, lowerHorizontalY: 80 }) }

  await service.write('eyes', eyes)
  await service.write('face', face)
  await service.write('head-extras', headExtras)
  assert.deepEqual(await service.read('eyes'), eyes)
  assert.deepEqual(await service.read('face'), face)
  assert.deepEqual(await service.read('head-extras'), headExtras)

  await service.write('eyes', { ...eyes, 1: guide({ verticalX: 31, angle: -15 }) })
  assert.equal((await service.read('eyes'))?.[1].verticalX, 31)
  assert.deepEqual(await service.read('face'), face)
  assert.deepEqual(await service.read('head-extras'), headExtras)
})

test('leitura retorna vazio quando ainda não há ajustes e gravação recusa valores inválidos', async t => {
  const root = await sandbox(t)
  const service = createFaceGuidePersistence(fs, () => root)

  assert.equal(await service.read('eyes'), null)
  await assert.rejects(service.write('face', { 1: { visible: true, verticalX: 50, horizontalY: 45, lowerHorizontalY: 65, angle: 45 } }), /Guias de desenho inválidas/)
  await assert.rejects(service.write('invalid', {}), /Perfil de guias inválido/)
  assert.equal(await service.read('face'), null)
})

test('arquivo de guias inválido não é confundido com ausência e nunca é sobrescrito',async t=>{
  const root=await sandbox(t),directory=join(root,'fabricator')
  await fs.mkdir(directory,{recursive:true})
  const location=join(directory,'guides-eyes.json')
  const service=createFaceGuidePersistence(fs,()=>root)
  for(const content of ['{json truncado',JSON.stringify({1:{visible:true,verticalX:900}})]){
    await fs.writeFile(location,content)
    await assert.rejects(service.read('eyes'),/Arquivo de guias inválido|SyntaxError|Expected property|Unexpected token/)
    await assert.rejects(service.write('eyes',{1:{visible:true,verticalX:50,horizontalY:45,lowerHorizontalY:65,angle:12}}),/Arquivo de guias inválido|SyntaxError|Expected property|Unexpected token/)
    assert.equal(await fs.readFile(location,'utf8'),content,'o original não pode ser apagado por um fallback')
  }
  const stable={1:{visible:true,verticalX:50,horizontalY:45,lowerHorizontalY:65,angle:12}}
  await fs.writeFile(location,JSON.stringify(stable))
  assert.deepEqual(await service.read('eyes'),stable)
  await service.write('eyes',{...stable,1:{...stable[1],angle:15}})
  assert.equal((await service.read('eyes'))[1].angle,15)
})

test('hook desativa edição ao receber erro da persistência e mantém prévia local',async()=>{
  const hook=await fs.readFile('src/renderer/src/features/fabricator/face/useFaceGuides.ts','utf8')
  const persistence=await fs.readFile('electron/domains/fabricator/faceGuidePersistence.ts','utf8')
  assert.match(hook,/loadedProfileRef\.current = null\s+setLoadedProfile\(null\)\s+reportError/)
  assert.match(persistence,/await read\(profile\)/)
})
