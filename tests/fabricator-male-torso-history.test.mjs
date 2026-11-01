import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorHistoryPersistence } from '../electron/domains/fabricator/historyPersistence.ts'

test('histórico mantém a imagem independente do tronco masculino fora do manifesto JSON', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fabricator-male-torso-history-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const folder = join(root, 'slot-1')
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(join(folder, 'source-abcd1234.png'), Buffer.from('source'))
  const persistence = createFabricatorHistoryPersistence({
    slotPath: () => folder,
    isValidSlot: (slot) => slot === 1,
    dataUrlBuffer: (value) => Buffer.from(value.split(',')[1], 'base64'),
    files: fs
  })
  const torsoData = `data:image/png;base64,${Buffer.from('male-torso').toString('base64')}`
  const project = {
    schemaVersion: 1, slot: 1, name: 'Modelo', sourceName: 'base.png', sourceAssetName: 'source-abcd1234.png',
    width: 100, height: 120, tolerance: 74, parts: [], joints: [], updatedAt: '2026-11-01T00:00:00Z',
    maleTorso: { id: 'male-torso', name: 'Tronco masculino', x: 10, y: 20, width: 30, height: 40, rotation: 0, dataUrl: torsoData }
  }
  await persistence.write(1, { undo: [{ action: 'edit', project }], redo: [] })
  const stored = JSON.parse(await fs.readFile(join(folder, 'history', 'history.json'), 'utf8'))
  assert.equal(stored.undo[0].project.maleTorso, undefined)
  assert.equal(stored.undo[0].maleTorso.part.id, 'male-torso')
  const restored = await persistence.read(1)
  assert.equal(restored.undo[0].project.maleTorso.dataUrl, torsoData)
})
