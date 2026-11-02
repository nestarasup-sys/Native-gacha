import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  animatorFrameStartTime,
  deleteAnimatorFrame,
  duplicateAnimatorFrame,
  reorderAnimatorFrame,
  updateAnimatorFrameDuration
} from '../src/renderer/src/features/fabricator/models/animatorFrameTimeline.ts'

const workspaceUrl = new URL('../src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', import.meta.url)

function makeFrame(id, durationMs) {
  return {
    id,
    durationMs,
    transforms: { torso: { x: durationMs / 10, y: 12, rotation: 3 } },
    joints: [{ id: `${id}-joint`, parentPartId: 'torso', childPartId: 'arm' }],
    thumbnailDataUrl: `data:image/png;base64,${id}`
  }
}

test('duplica logo após o frame selecionado, com novo ID e dados independentes', () => {
  const frames = [makeFrame('a', 100), makeFrame('b', 200), makeFrame('c', 300)]
  const result = duplicateAnimatorFrame(frames, 'b', () => 'b-copy')

  assert.deepEqual(result.frames.map((frame) => frame.id), ['a', 'b', 'b-copy', 'c'])
  assert.deepEqual(result.frame, { ...frames[1], id: 'b-copy' })
  assert.notEqual(result.frame.transforms, frames[1].transforms)
  assert.notEqual(result.frame.joints, frames[1].joints)
  assert.deepEqual(frames.map((frame) => frame.id), ['a', 'b', 'c'])
  assert.equal(duplicateAnimatorFrame(frames, 'missing', () => 'unused'), null)
})

test('exclui o frame e seleciona o anterior, ou o novo primeiro ao excluir o primeiro', () => {
  const frames = [makeFrame('a', 100), makeFrame('b', 200), makeFrame('c', 300)]
  const middle = deleteAnimatorFrame(frames, 'b')
  const first = deleteAnimatorFrame(frames, 'a')

  assert.deepEqual(middle.frames.map((frame) => frame.id), ['a', 'c'])
  assert.equal(middle.selectedFrame.id, 'a')
  assert.deepEqual(first.frames.map((frame) => frame.id), ['b', 'c'])
  assert.equal(first.selectedFrame.id, 'b')
  assert.equal(deleteAnimatorFrame([frames[0]], 'a'), null)
  assert.equal(deleteAnimatorFrame(frames, 'missing'), null)
})

test('reordena um frame adjacente e calcula o novo início no playhead', () => {
  const frames = [makeFrame('a', 100), makeFrame('b', 200), makeFrame('c', 300)]
  const result = reorderAnimatorFrame(frames, 'b', 1)

  assert.deepEqual(result.frames.map((frame) => frame.id), ['a', 'c', 'b'])
  assert.equal(result.startTime, 400)
  assert.deepEqual(frames.map((frame) => frame.id), ['a', 'b', 'c'])
  assert.equal(reorderAnimatorFrame(frames, 'a', -1), null)
  assert.equal(reorderAnimatorFrame(frames, 'c', 1), null)
  assert.equal(reorderAnimatorFrame(frames, 'missing', 1), null)
})

test('limita a duração entre 40 e 10.000 ms e mantém no-op para valores inválidos ou iguais', () => {
  const frames = [makeFrame('a', 100), makeFrame('b', 200)]

  assert.deepEqual(updateAnimatorFrameDuration(frames, 'a', 1).map((frame) => frame.durationMs), [40, 200])
  assert.deepEqual(updateAnimatorFrameDuration(frames, 'b', 20000).map((frame) => frame.durationMs), [100, 10000])
  assert.equal(updateAnimatorFrameDuration(frames, 'a', 100), null)
  assert.equal(updateAnimatorFrameDuration(frames, 'a', Number.NaN), null)
  assert.equal(updateAnimatorFrameDuration(frames, 'missing', 300), null)
  assert.deepEqual(frames.map((frame) => frame.durationMs), [100, 200])
})

test('calcula o instante do frame usando a soma das durações anteriores', () => {
  const frames = [makeFrame('a', 100), makeFrame('b', 200), makeFrame('c', 300)]

  assert.equal(animatorFrameStartTime(frames, frames[0]), 0)
  assert.equal(animatorFrameStartTime(frames, frames[2]), 300)
  assert.equal(animatorFrameStartTime(frames, makeFrame('missing', 50)), 300)
})

test('AnimatorWorkspace delega as mutações de timeline ao modelo e mantém o estado visual', async () => {
  const workspace = await readFile(workspaceUrl, 'utf8')

  assert.match(workspace, /duplicateAnimatorFrame\(animation\.frames, selectedFrame\.id/)
  assert.match(workspace, /deleteAnimatorFrame\(animation\.frames, selectedFrame\.id\)/)
  assert.match(workspace, /reorderAnimatorFrame\(animation\.frames, selectedFrame\.id, offset\)/)
  assert.match(workspace, /updateAnimatorFrameDuration\(animation\.frames, selectedFrame\.id, value\)/)
  assert.doesNotMatch(workspace, /frames\.splice\(selectedFrameIndex \+ 1, 0, copy\)/)
})
