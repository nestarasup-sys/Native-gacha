import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPosePersistence } from '../electron/domains/fabricator/posePersistence.ts'
import { createAnimatorPersistence } from '../electron/domains/fabricator/animatorPersistence.ts'
import { runAnimatorImageTransaction } from '../electron/domains/fabricator/imageManifestTransaction.ts'
import { poseAssetsForPersistence } from '../src/renderer/src/features/fabricator/models/poseAssetSnapshots.ts'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const png = 'data:image/png;base64,' + Buffer.from('PNGDATA').toString('base64')
const part = { id: 'head', name: 'Cabeça', x: 12, y: 8, width: 30, height: 40, rotation: 0 }
const pose = {
  schemaVersion: 1, slot: 2, name: 'De pé', category: 'Parado', sourceModelSlot: 1,
  sourceModelName: 'Modelo', sourceModelUpdatedAt: '2026-10-22T12:00:00Z', width: 200, height: 240,
  parts: [part], joints: [], layerOrder: ['head'], hiddenPartIds: [], updatedAt: '2026-10-22T12:00:00Z'
}
const draft = { editingSlot: null, project: { ...pose, slot: undefined } }
const animation = {
  schemaVersion: 1, slot: 1, name: 'Piscar', sourceModelSlot: 1, sourceModelName: 'Modelo',
  sourceModelUpdatedAt: '2026-10-22T12:00:00Z', sourceModelPartCount: 1,
  width: 200, height: 240, parts: [part], joints: [], layerOrder: ['head'], hiddenPartIds: [],
  frames: [{
    id: 'frame-1', durationMs: 100, transforms: {head: {x:12,y:8,rotation:0}},
    joints: [], thumbnailDataUrl: png
  }],
  interpolation: 'smooth', loopMode: 'loop', speed: 1, thumbnailDataUrl: png,
  updatedAt: '2026-10-22T12:00:00Z'
}

async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-gacha-pose-animator-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const modelPath = modelSlot => join(root, 'models', `model-${modelSlot}`)
  const poseSlotPath = (modelSlot, slot) => join(modelPath(modelSlot), 'poses', `slot-${slot}`)
  const poseDraftPath = modelSlot => join(modelPath(modelSlot), 'poses', 'draft')
  const animatorSlotPath = (modelSlot, slot) => join(modelPath(modelSlot), 'animations', `slot-${slot}`)
  const animatorDraftPath = modelSlot => join(modelPath(modelSlot), 'animations', 'draft')
  const deps = {
    isValidModelSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    isValidPoseSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 12,
    dataUrlBuffer: url => Buffer.from(url.split(',')[1], 'base64'),
    writeAssetImageSource: (path, bytes) => fs.writeFile(path, bytes),
    readAssetImage: path => fs.readFile(path),
    files: fs
  }
  const animatorDeps = { ...deps, animatorSlotPath, animatorDraftPath }
  return {
    pose: createPosePersistence({ ...deps, poseSlotPath, poseDraftPath, modelSlotPath: modelPath, modelHeadParts: async () => [] }),
    animator: createAnimatorPersistence(animatorDeps),
    animatorDeps,
    paths: {poseSlotPath,poseDraftPath,animatorSlotPath,animatorDraftPath,modelPath}
  }
}

test('Poses DEV salva, relê e mantém PNGs e categoria por slot', async t => {
  const {pose: store,paths} = await fixture(t)
  await store.writePoseProject(1,2,pose,[{id:'head',dataUrl:png}])
  const loaded = await store.readPoseProject(1,2)
  assert.equal(loaded.name, 'De pé')
  assert.equal(loaded.parts[0].dataUrl,png)
  assert.equal(loaded.category,'Parado')
  assert.equal(JSON.parse(await fs.readFile(join(paths.poseSlotPath(1,2),'pose.json'),'utf8')).slot,2)
  await assert.rejects(store.writePoseProject(1,3,pose,[]),/Pose inválida/)
})
test('Poses DEV salva e relê o rascunho sem renomear peças', async t => {
  const {pose: store} = await fixture(t)
  await store.writePoseDraft(1,draft,[{id:'head',dataUrl:png}])
  const loaded = await store.readPoseDraft(1)
  assert.equal(loaded.project.parts[0].id,'head')
  assert.equal(loaded.project.parts[0].dataUrl,png)
})
test('autosave recria o PNG da cabeça se a pasta do rascunho tiver sido removida', async t => {
  const {pose: store,paths} = await fixture(t)
  const imageParts = [{...part,dataUrl:png}]
  const savedDraft = {...draft,project:{...draft.project,parts:[part]}}
  await store.writePoseDraft(1,savedDraft,poseAssetsForPersistence(imageParts))
  await fs.rm(paths.poseDraftPath(1),{recursive:true,force:true})
  await store.writePoseDraft(1,savedDraft,poseAssetsForPersistence(imageParts))
  const loaded = await store.readPoseDraft(1)
  assert.equal(loaded.project.parts[0].dataUrl,png)
})
test('rascunho de pose recupera a imagem do slot editado antes da imagem do modelo', async t => {
  const {pose: store,paths} = await fixture(t)
  const editedPng = 'data:image/png;base64,' + Buffer.from('EDITEDPOSE').toString('base64')
  await fs.mkdir(join(paths.modelPath(1),'parts'), {recursive:true})
  await fs.writeFile(join(paths.modelPath(1),'parts','head.png'), Buffer.from('BASEMODEL'))
  await store.writePoseProject(1,2,{...pose,parts:[part]},[{id:'head',dataUrl:editedPng}])
  await store.writePoseDraft(1,{editingSlot:2,updatedAt:pose.updatedAt,project:{...pose,slot:undefined,parts:[part]}},[])
  const loaded = await store.readPoseDraft(1)
  assert.equal(loaded.project.parts[0].dataUrl,editedPng)
})
test('rascunho de pose nova recupera imagem ausente do modelo base', async t => {
  const {pose: store,paths} = await fixture(t)
  const basePng = 'data:image/png;base64,' + Buffer.from('BASEMODEL').toString('base64')
  await fs.mkdir(join(paths.modelPath(1),'parts'), {recursive:true})
  await fs.writeFile(join(paths.modelPath(1),'parts','head.png'), Buffer.from('BASEMODEL'))
  await store.writePoseDraft(1,{editingSlot:null,updatedAt:pose.updatedAt,project:{...pose,slot:undefined,parts:[part]}},[])
  const loaded = await store.readPoseDraft(1)
  assert.equal(loaded.project.parts[0].dataUrl,basePng)
})
test('Animador DEV salva e relê frames e fontes PNG por slot', async t => {
  const {animator: store,paths} = await fixture(t)
  await store.writeAnimatorAnimation(1,1,animation,[{id:'head',dataUrl:png}])
  const loaded=await store.readAnimatorAnimation(1,1)
  assert.equal(loaded.frames[0].durationMs,100)
  assert.equal(loaded.parts[0].dataUrl,png)
  assert.equal(JSON.parse(await fs.readFile(join(paths.animatorSlotPath(1,1),'animation.json'),'utf8')).slot,1)
  await assert.rejects(store.writeAnimatorAnimation(1,1,{...animation,frames:[]},[]),/Animação inválida/)
})
test('Animador DEV mantém snapshots em draft com round-trip', async t => {
  const {animator: store} = await fixture(t)
  const animatedDraft = {
    editingSlot:null,
    animation:{...animation,slot:undefined},
    currentTransforms:{ head:{x:12,y:8,rotation:0} },
    currentJoints:[], selectedFrameId:'frame-1', dirtyFrame:false,
    updatedAt:animation.updatedAt
  }
  await store.writeAnimatorDraft(1,animatedDraft,[{id:'head',dataUrl:png}])
  const loaded=await store.readAnimatorDraft(1)
  assert.equal(loaded.animation.parts[0].dataUrl,png)
  assert.equal(loaded.selectedFrameId,'frame-1')
})

test('journal do Animador só aceita manifestos declarados pelo domínio', async () => {
  assert.throws(() => runAnimatorImageTransaction({ manifestName: '../animation.json' }), /Manifesto de animação não autorizado/)
})

test('Animador DEV apaga PNG obsoleto só depois de confirmar o novo manifesto', async t => {
  const { animator: store, paths } = await fixture(t)
  const body = { id: 'body', name: 'Tronco', x: 20, y: 30, width: 60, height: 90, rotation: 0 }
  const original = {
    ...animation,
    parts: [part, body],
    frames: [{ ...animation.frames[0], transforms: { head: { x: 12, y: 8, rotation: 0 }, body: { x: 20, y: 30, rotation: 0 } } }]
  }
  const folder = paths.animatorSlotPath(1, 1)
  await store.writeAnimatorAnimation(1, 1, original, [{ id: 'head', dataUrl: png }, { id: 'body', dataUrl: png }])
  await fs.writeFile(join(folder, 'parts', 'head.paint.png'), 'PAINT')
  await fs.writeFile(join(folder, 'parts', 'head.paint.json'), '{"sourceHash":"kept"}')

  const updated = { ...animation, frames: [{ ...animation.frames[0], transforms: { head: { x: 15, y: 8, rotation: 0 } } }] }
  await store.writeAnimatorAnimation(1, 1, updated, [{ id: 'head', dataUrl: png }])

  assert.equal(JSON.parse(await fs.readFile(join(folder, 'animation.json'), 'utf8')).parts.length, 1)
  await assert.rejects(fs.access(join(folder, 'parts', 'body.png')), { code: 'ENOENT' })
  assert.equal(await fs.readFile(join(folder, 'parts', 'head.paint.png'), 'utf8'), 'PAINT')
  assert.equal(await fs.readFile(join(folder, 'parts', 'head.paint.json'), 'utf8'), '{"sourceHash":"kept"}')
})

test('Animador DEV recupera PNG e manifesto antigos após encerramento durante a escrita de asset', async t => {
  const { animator: store, animatorDeps, paths } = await fixture(t)
  await store.writeAnimatorAnimation(1, 1, animation, [{ id: 'head', dataUrl: png }])
  const folder = paths.animatorSlotPath(1, 1)
  const child = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/fabricator/crash-animator-image-write.mjs', import.meta.url)), folder, 'animation', 'image'], {
    encoding: 'utf8', timeout: 25000
  })

  assert.equal(child.status, 94, child.stderr || child.error?.message || 'O processo não encerrou no checkpoint do PNG')
  assert.equal(await fs.readFile(join(folder, 'parts', 'head.png'), 'utf8'), 'PROCESS_CRASH_NEW_IMAGE')
  assert.notEqual(await fs.readFile(join(folder, '.animator-image-transaction', 'journal.json'), 'utf8'), '')

  const reopened = createAnimatorPersistence(animatorDeps)
  const restored = await reopened.readAnimatorAnimation(1, 1)
  assert.equal(restored.parts[0].dataUrl, png)
  assert.deepEqual(JSON.parse(await fs.readFile(join(folder, 'animation.json'), 'utf8')), animation)
  await assert.rejects(fs.access(join(folder, '.animator-image-transaction')), { code: 'ENOENT' })
})

test('Animador DEV mantém PNGs novos quando o processo encerra após promover o manifesto', async t => {
  const { animator: store, animatorDeps, paths } = await fixture(t)
  await store.writeAnimatorAnimation(1, 1, animation, [{ id: 'head', dataUrl: png }])
  const folder = paths.animatorSlotPath(1, 1)
  const child = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/fabricator/crash-animator-image-write.mjs', import.meta.url)), folder, 'animation', 'manifest'], {
    encoding: 'utf8', timeout: 25000
  })

  assert.equal(child.status, 96, child.stderr || child.error?.message || 'O processo não encerrou após a promoção do manifesto')
  assert.equal(JSON.parse(await fs.readFile(join(folder, 'animation.json'), 'utf8')).name, 'Crash test')
  assert.notEqual(await fs.readFile(join(folder, '.animator-image-transaction', 'journal.json'), 'utf8'), '')

  const reopened = createAnimatorPersistence(animatorDeps)
  const restored = await reopened.readAnimatorAnimation(1, 1)
  assert.equal(restored.name, 'Crash test')
  assert.equal(restored.parts[0].dataUrl, png)
  await assert.rejects(fs.access(join(folder, '.animator-image-transaction')), { code: 'ENOENT' })
})

test('Animador DEV recupera o PNG anterior quando o autosave draft é interrompido', async t => {
  const { animator: store, animatorDeps, paths } = await fixture(t)
  const originalDraft = {
    editingSlot: null,
    animation: { ...animation, slot: undefined },
    currentTransforms: { head: { x: 12, y: 8, rotation: 0 } },
    currentJoints: [],
    selectedFrameId: 'frame-1',
    dirtyFrame: false,
    updatedAt: animation.updatedAt
  }
  await store.writeAnimatorDraft(1, originalDraft, [{ id: 'head', dataUrl: png }])
  const folder = paths.animatorDraftPath(1)
  const child = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/fabricator/crash-animator-image-write.mjs', import.meta.url)), folder, 'draft', 'image'], {
    encoding: 'utf8', timeout: 25000
  })

  assert.equal(child.status, 94, child.stderr || child.error?.message || 'O processo não encerrou no checkpoint do PNG draft')
  const reopened = createAnimatorPersistence(animatorDeps)
  const restored = await reopened.readAnimatorDraft(1)
  assert.equal(restored.animation.name, animation.name)
  assert.equal(restored.animation.parts[0].dataUrl, png)
  assert.deepEqual(JSON.parse(await fs.readFile(join(folder, 'draft.json'), 'utf8')), JSON.parse(JSON.stringify(originalDraft)))
  await assert.rejects(fs.access(join(folder, '.animator-image-transaction')), { code: 'ENOENT' })
})
test('manifesto não é publicado se faltar peça no rascunho do Animator', async t => {
  const {animator: store,paths} = await fixture(t)
  await assert.rejects(store.writeAnimatorAnimation(1,1,animation,[]),/Imagem-base ausente/)
  await assert.rejects(fs.access(join(paths.animatorSlotPath(1,1),'animation.json')), /ENOENT/)
})
