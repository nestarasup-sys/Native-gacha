const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { createSyntheticStressProfile } = require('../../scripts/editor-v6/synthetic-stress-profile.cjs')

test('prepara um perfil sintético completo sem depender de app-data', async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gacha-stress-profile-test-'))
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))
  const profileRoot = path.join(temporaryRoot, 'runtime', 'profile')

  const result = await createSyntheticStressProfile(profileRoot)
  assert.deepEqual(result.characterNames, ['STRESS_Aurora', 'STRESS_Nix', 'STRESS_Brisa', 'STRESS_Dorian'])
  assert.equal(result.partCount, 10)
  assert.deepEqual(result.poseSlots, [1, 2])

  const characters = JSON.parse(await fs.readFile(path.join(profileRoot, 'customizer', 'characters', 'characters.json'), 'utf8'))
  assert.equal(characters.length, 4)
  assert.ok(characters.every((character) => character.customization.modelSlot === 1 && character.customization.poseSlot === 1))

  const modelFolder = path.join(profileRoot, 'fabricator', 'models', 'slot-1')
  const model = JSON.parse(await fs.readFile(path.join(modelFolder, 'project.json'), 'utf8'))
  assert.equal(model.parts.length, 10)
  assert.equal(model.joints.length, 9)
  const source = await sharp(path.join(modelFolder, model.sourceFile)).metadata()
  assert.deepEqual({ width: source.width, height: source.height }, { width: 768, height: 900 })

  for (const slot of [1, 2]) {
    const poseFolder = path.join(profileRoot, 'fabricator', 'poses', 'model-1', `slot-${slot}`)
    const pose = JSON.parse(await fs.readFile(path.join(poseFolder, 'pose.json'), 'utf8'))
    assert.equal(pose.slot, slot)
    assert.equal(pose.parts.length, 10)
    assert.equal(pose.joints.length, 9)
    for (const part of pose.parts) await fs.access(path.join(poseFolder, 'parts', `${part.id}.png`))
  }
})

test('recusa preparar o perfil sintético sobre uma pasta que já contém dados', async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gacha-stress-profile-existing-'))
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))
  const profileRoot = path.join(temporaryRoot, 'runtime', 'profile')
  await fs.mkdir(profileRoot, { recursive: true })
  const marker = path.join(profileRoot, 'preservar.txt')
  await fs.writeFile(marker, 'fixture preexistente', { flag: 'wx' })

  await assert.rejects(createSyntheticStressProfile(profileRoot), /não está vazia/)
  assert.equal(await fs.readFile(marker, 'utf8'), 'fixture preexistente')
})
