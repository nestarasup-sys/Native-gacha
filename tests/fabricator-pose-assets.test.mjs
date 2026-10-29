import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingPoseAssets, poseAssetSnapshot } from '../src/renderer/src/features/fabricator/models/poseAssetSnapshots.ts'

test('restores pose PNGs into a newly recreated draft after saving the pose', () => {
  const parts = [
    { id: 'head', name: 'Cabeça', dataUrl: 'data:image/png;base64,aGVhZA==' },
    { id: 'arm', name: 'Braço', dataUrl: 'data:image/png;base64,YXJt' }
  ]
  const afterSave = poseAssetSnapshot(parts)
  assert.deepEqual(pendingPoseAssets(parts, afterSave), [
    { id: 'head', dataUrl: parts[0].dataUrl },
    { id: 'arm', dataUrl: parts[1].dataUrl }
  ])
})

test('only sends images still pending for the current pose pieces', () => {
  const parts = [{ id: 'head' }, { id: 'arm' }, { id: 'leg' }]
  const pending = new Map([['head', 'head-image'], ['leg', 'leg-image'], ['removed', 'unused-image']])
  assert.deepEqual(pendingPoseAssets(parts, pending), [
    { id: 'head', dataUrl: 'head-image' },
    { id: 'leg', dataUrl: 'leg-image' }
  ])
})
