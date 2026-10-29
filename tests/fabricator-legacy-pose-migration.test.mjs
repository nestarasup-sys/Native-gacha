import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLegacyPoseMigration } from '../electron/domains/fabricator/legacyPoseMigration.ts'

async function withTemporaryRoot(operation) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-gacha-legacy-pose-'))
  try { await operation(root) } finally { await fs.rm(root, { recursive: true, force: true }) }
}

function createMigration(root, fileOperations = fs) {
  const legacyRoot = join(root, 'legacy-poses')
  const modelRoot = join(root, 'models')
  return {
    legacyRoot,
    modelRoot,
    migration: createLegacyPoseMigration({
      getLegacyRoot: () => legacyRoot,
      poseSlotCount: 4,
      poseSlotPath: (modelSlot, poseSlot) => join(modelRoot, `model-${modelSlot}`, `slot-${poseSlot}`),
      poseDraftPath: (modelSlot) => join(modelRoot, `model-${modelSlot}`, 'draft'),
      isValidModelSlot: (modelSlot) => Number.isInteger(modelSlot) && modelSlot >= 1 && modelSlot <= 4,
      files: {
        readFile: (path, encoding) => fileOperations.readFile(path, encoding),
        access: (path) => fileOperations.access(path),
        mkdir: (path, options) => fileOperations.mkdir(path, options),
        rename: (source, destination) => fileOperations.rename(source, destination)
      }
    })
  }
}

test('migra slots e rascunho para o modelo de origem sem tocar em slots inválidos', async () => {
  await withTemporaryRoot(async (root) => {
    const { legacyRoot, modelRoot, migration } = createMigration(root)
    const legacyPose = { sourceModelSlot: 2, name: 'sintética' }
    await fs.mkdir(join(legacyRoot, 'slot-1'), { recursive: true })
    await fs.mkdir(join(legacyRoot, 'slot-2'), { recursive: true })
    await fs.mkdir(join(legacyRoot, 'draft'), { recursive: true })
    await fs.writeFile(join(legacyRoot, 'slot-1', 'pose.json'), JSON.stringify(legacyPose))
    await fs.writeFile(join(legacyRoot, 'slot-2', 'pose.json'), JSON.stringify({ sourceModelSlot: 99, name: 'inválida' }))
    await fs.writeFile(join(legacyRoot, 'draft', 'draft.json'), JSON.stringify({ project: { sourceModelSlot: 2 }, frames: [] }))

    const task = migration.ensure()
    assert.equal(migration.ensure(), task, 'chamadas concorrentes devem compartilhar a migração')
    await task

    assert.deepEqual(JSON.parse(await fs.readFile(join(modelRoot, 'model-2', 'slot-1', 'pose.json'), 'utf8')), legacyPose)
    assert.deepEqual(JSON.parse(await fs.readFile(join(modelRoot, 'model-2', 'draft', 'draft.json'), 'utf8')), { project: { sourceModelSlot: 2 }, frames: [] })
    assert.deepEqual(JSON.parse(await fs.readFile(join(legacyRoot, 'slot-2', 'pose.json'), 'utf8')), { sourceModelSlot: 99, name: 'inválida' })
    assert.equal(migration.getTrackedTask(), task)
    assert.equal(migration.ensure(), task, 'a migração concluída continua memoizada')
  })
})

test('migração deixa a origem intacta se o destino já contém uma pose', async () => {
  await withTemporaryRoot(async (root) => {
    const { legacyRoot, modelRoot, migration } = createMigration(root)
    const existingDestination = join(modelRoot, 'model-1', 'slot-1')
    await fs.mkdir(join(legacyRoot, 'slot-1'), { recursive: true })
    await fs.mkdir(existingDestination, { recursive: true })
    await fs.writeFile(join(legacyRoot, 'slot-1', 'pose.json'), JSON.stringify({ sourceModelSlot: 1, name: 'origem' }))
    await fs.writeFile(join(existingDestination, 'pose.json'), JSON.stringify({ name: 'destino existente' }))

    await migration.ensure()

    assert.deepEqual(JSON.parse(await fs.readFile(join(existingDestination, 'pose.json'), 'utf8')), { name: 'destino existente' })
    assert.deepEqual(JSON.parse(await fs.readFile(join(legacyRoot, 'slot-1', 'pose.json'), 'utf8')), { sourceModelSlot: 1, name: 'origem' })
  })
})

test('falha transitória libera nova tentativa e retoma após slots já movidos', async () => {
  await withTemporaryRoot(async (root) => {
    const legacyRoot = join(root, 'legacy-poses')
    const modelRoot = join(root, 'models')
    let failSecondRenameOnce = true
    const fileOperations = {
      readFile: fs.readFile,
      access: fs.access,
      mkdir: fs.mkdir,
      rename: async (source, destination) => {
        if (failSecondRenameOnce && source === join(legacyRoot, 'slot-2')) {
          failSecondRenameOnce = false
          throw new Error('falha transitória de rename')
        }
        return fs.rename(source, destination)
      }
    }
    const { migration } = createMigration(root, fileOperations)
    await fs.mkdir(join(legacyRoot, 'slot-1'), { recursive: true })
    await fs.mkdir(join(legacyRoot, 'slot-2'), { recursive: true })
    await fs.writeFile(join(legacyRoot, 'slot-1', 'pose.json'), JSON.stringify({ sourceModelSlot: 1 }))
    await fs.writeFile(join(legacyRoot, 'slot-2', 'pose.json'), JSON.stringify({ sourceModelSlot: 2 }))

    const firstAttempt = migration.ensure()
    assert.equal(migration.ensure(), firstAttempt)
    await assert.rejects(firstAttempt, /falha transitória/)
    assert.equal(migration.getTrackedTask(), null, 'falha não deve envenenar tentativas futuras')
    await fs.access(join(modelRoot, 'model-1', 'slot-1', 'pose.json'))
    await fs.access(join(legacyRoot, 'slot-2', 'pose.json'))

    await migration.ensure()
    await fs.access(join(modelRoot, 'model-2', 'slot-2', 'pose.json'))
    await assert.rejects(fs.access(join(legacyRoot, 'slot-2')))
  })
})
