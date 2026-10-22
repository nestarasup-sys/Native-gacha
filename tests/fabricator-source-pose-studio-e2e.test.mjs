import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { publishModelSource } from '../electron/domains/fabricator/modelSource.ts'
import { recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'
import { verifyModelSourceCommit } from '../electron/domains/fabricator/modelSourceJournal.ts'
import { auditCharacterContinuity, selectCharacterArtwork } from '../src/shared/characterSourceContinuity.ts'
import { selectOriginalModelSource } from '../src/shared/fabricatorModelViews.ts'
const require = createRequire(import.meta.url)
const { createCompleteCharacterFixture } = require('../scripts/fabricator/complete-character-fixture.cjs')

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const png = async (width, height, r) =>
  sharp({ create: { width, height, channels: 4, background: { r, g: 80, b: 170, alpha: 1 } } }).png().toBuffer()
const fileHash = async path => hash(await fs.readFile(path))
async function snapshot(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await fileHash(path)])))
}

test('E2E em sandbox: publicar duas fontes preserva pose, roupa, cabelo, olhos, rosto e expressão entre reinícios', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-continuity-e2e-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const primary = await createCompleteCharacterFixture(join(root, 'profile-a'))
  const secondary = await createCompleteCharacterFixture(join(root, 'profile-b'))
  const independent = [join(secondary.model, 'project.json'), join(secondary.pose, 'pose.json'),
    join(secondary.outfit, 'wardrobe.json'), join(secondary.hair, 'images', 'front.png')]
  const protectedPaths = [
    join(primary.pose, 'pose.json'), join(primary.pose, 'parts', 'body.png'),
    join(primary.pose, 'parts', 'head.png'), join(primary.outfit, 'wardrobe.json'),
    join(primary.outfit, 'parts', 'coat.png'), join(primary.hair, 'hair-style.json'),
    join(primary.hair, 'images', 'front.png'), join(primary.hair, 'images', 'back.png'),
    join(primary.eye, 'asset.json'), join(primary.eye, 'asset.png'),
    join(primary.eyebrow, 'asset.json'), join(primary.eyebrow, 'asset.png'), primary.expression,
    ...independent
  ]
  const baseline = await snapshot(protectedPaths)
  const pose = JSON.parse(await fs.readFile(join(primary.pose, 'pose.json'), 'utf8'))
  const wardrobe = JSON.parse(await fs.readFile(join(primary.outfit, 'wardrobe.json'), 'utf8'))
  const initialPose = structuredClone(pose)
  const initialWardrobe = structuredClone(wardrobe)
  let currentSource = 'source-aaaa1111.png'
  for (let iteration = 0; iteration < 2; iteration++) {
    const initial = JSON.parse(await fs.readFile(join(primary.model, 'project.json'), 'utf8'))
    assert.equal(initial.sourceFile, currentSource)
    const source = await png(256, 384, 30 + 60 * iteration)
    const assets = await Promise.all(initial.parts.map(async part =>
      ({ id: part.id, dataUrl: 'data:image/png;base64,' + (await png(part.width, part.height, 150 + 40 * iteration)).toString('base64') })))
    const request = {
      project: { ...initial, sourceAssetName: currentSource,
        updatedAt: `2026-10-22T14:0${iteration}:00.000Z`,
        parts: initial.parts.map(part => part.id === 'head'
          ? { ...part, sourceTransform: { ...part.sourceTransform, x: 160 + iteration } }
          : part) },
      sourceDataUrl: 'data:image/png;base64,' + source.toString('base64'),
      changedAssets: assets
    }
    const save = async (project, updates, stage) => {
      await fs.mkdir(join(stage, 'parts'), { recursive: true })
      for (const asset of updates) {
        await fs.writeFile(join(stage, 'parts', asset.id + '.png'),
          Buffer.from(asset.dataUrl.slice('data:image/png;base64,'.length), 'base64'))
      }
      await fs.writeFile(join(stage, 'project.json'), JSON.stringify({ ...project, sourceFile: project.sourceAssetName }))
    }
    currentSource = await publishModelSource(request, () => primary.model, save, fs)
    await verifyModelSourceCommit(primary.model, currentSource, fs)
    for (let restart = 0; restart < 3; restart++) {
      assert.equal(await recoverModelSourceSlot(1, () => primary.model, fs), 'intact')
      assert.deepEqual(await snapshot(protectedPaths), baseline)
    }
    const updatedModel = JSON.parse(await fs.readFile(join(primary.model, 'project.json'), 'utf8'))
    assert.equal(updatedModel.sourceFile, currentSource)
    assert.equal(selectOriginalModelSource(updatedModel).parts.find(part => part.id === 'head').x, 160 + iteration)
    assert.deepEqual(selectCharacterArtwork(updatedModel, pose, 1), initialPose)
    const audit = auditCharacterContinuity(updatedModel, pose, [wardrobe])
    assert.equal(audit.compatible, true)
    assert.equal(audit.hasOlderPoseSnapshot, true)
    assert.deepEqual(audit.missingAttachments, [])
    assert.deepEqual(wardrobe, initialWardrobe)
    assert.equal(await fileHash(join(primary.model, currentSource)), hash(source))
  }
  const backupDir = join(root, 'profile-a', 'fabricator', 'models')
  assert.equal((await fs.readdir(backupDir)).filter(name => name.startsWith('.model-source-backup-1-')).length, 2)
  assert.deepEqual(await snapshot(protectedPaths), baseline)
})
