import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { poseAssetsForPersistence } from '../src/renderer/src/features/fabricator/models/poseAssetSnapshots.ts'

test('sends every pose PNG so a draft can be recreated from its in-memory snapshot', () => {
  const parts = [
    { id: 'head', name: 'Cabeça', dataUrl: 'data:image/png;base64,aGVhZA==' },
    { id: 'arm', name: 'Braço', dataUrl: 'data:image/png;base64,YXJt' }
  ]
  assert.deepEqual(poseAssetsForPersistence(parts), [
    { id: 'head', dataUrl: parts[0].dataUrl },
    { id: 'arm', dataUrl: parts[1].dataUrl }
  ])
})

test('autosave e salvamento definitivo enviam o snapshot completo de imagens', async () => {
  const source = await readFile(new URL('../src/renderer/src/features/fabricator/PoseWorkspace.tsx', import.meta.url), 'utf8')
  assert.equal(source.match(/poseAssetsForPersistence\(snapshot\.parts\)/g)?.length, 2)
})
