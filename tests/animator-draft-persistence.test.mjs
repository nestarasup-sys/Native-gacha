import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createAnimatorDraftSaveRequest,
  enqueueAnimatorDraftSave,
  isAnimatorDraftDocumentDirty,
  isAnimatorDraftFrameDirty
} from '../src/renderer/src/features/fabricator/animatorDraftPersistence.ts'

function animation() {
  return {
    schemaVersion: 1,
    slot: 3,
    name: 'Animação sintética',
    sourceModelSlot: 2,
    sourceModelName: 'Modelo sintético',
    sourceModelUpdatedAt: '2026-11-02T12:00:00.000Z',
    sourceModelPartCount: 1,
    basePoseSlot: null,
    characterId: null,
    width: 100,
    height: 120,
    parts: [{ id: 'torso', name: 'Tronco', x: 5, y: 7, width: 20, height: 30, dataUrl: 'image:torso' }],
    joints: [],
    layerOrder: ['torso'],
    hiddenPartIds: [],
    frames: [{ id: 'frame-1', durationMs: 250, transforms: { torso: { x: 0, y: 0, rotation: 0 } }, joints: [], thumbnailDataUrl: 'thumb' }],
    interpolation: 'smooth',
    loopMode: 'loop',
    speed: 1,
    thumbnailDataUrl: 'thumb',
    updatedAt: '2026-11-02T12:00:00.000Z'
  }
}

test('dirty check distingue alterações de frame, documento salvo e frame ausente', () => {
  const current = { animation: animation(), transforms: { torso: { x: 0, y: 0, rotation: 0 } }, joints: [], frameId: 'frame-1' }
  const saved = JSON.stringify({ ...current.animation, parts: current.animation.parts.map(({ dataUrl: _dataUrl, ...part }) => part) })

  assert.equal(isAnimatorDraftFrameDirty(current.animation, current), false)
  assert.equal(isAnimatorDraftDocumentDirty(current.animation, current, saved), false)
  assert.equal(isAnimatorDraftDocumentDirty(current.animation, current, null), true)
  assert.equal(isAnimatorDraftFrameDirty(current.animation, { ...current, transforms: { torso: { x: 3, y: 0, rotation: 0 } } }), true)
  assert.equal(isAnimatorDraftFrameDirty(current.animation, { ...current, frameId: 'removed-frame' }), false)
})

test('save request remove bytes do documento e inclui somente assets pendentes ainda não salvos', () => {
  const source = animation()
  const current = { animation: source, transforms: { torso: { x: 4, y: 0, rotation: 0 } }, joints: [], frameId: 'frame-1' }
  const request = createAnimatorDraftSaveRequest(source, 3, current, true, new Map([
    ['torso', 'image:torso'], ['removed-part', 'image:removed']
  ]), false)

  assert.equal(request.draft.editingSlot, 3)
  assert.equal(request.draft.dirtyFrame, true)
  assert.equal(request.draft.selectedFrameId, 'frame-1')
  assert.equal(request.draft.animation.slot, undefined)
  assert.equal('dataUrl' in request.draft.animation.parts[0], false)
  assert.deepEqual(request.assets, [{ id: 'torso', dataUrl: 'image:torso' }])
  assert.deepEqual(createAnimatorDraftSaveRequest(source, 3, current, true, new Map([['torso', 'image:torso']]), true).assets, [])
  assert.equal(source.parts[0].dataUrl, 'image:torso')
})

test('fila serializa rascunhos e permite retry após falha de gravação', async () => {
  const queue = { current: Promise.resolve() }
  const events = []
  let failFirst = true
  const save = async (_slot, draft) => {
    events.push(`start:${draft.editingSlot}`)
    await Promise.resolve()
    if (failFirst) { failFirst = false; events.push('failed'); throw new Error('falha sintética') }
    events.push(`end:${draft.editingSlot}`)
  }
  const requestFor = slot => createAnimatorDraftSaveRequest(animation(), slot,
    { animation: animation(), transforms: {}, joints: [], frameId: 'frame-1' }, false, new Map(), true)

  await assert.rejects(enqueueAnimatorDraftSave(queue, 2, requestFor(3), save), /falha sintética/)
  await enqueueAnimatorDraftSave(queue, 2, requestFor(4), save)
  assert.deepEqual(events, ['start:3', 'failed', 'start:4', 'end:4'])
})

test('ambos os caminhos do Animator compartilham o payload e a fila serializada', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(page, /createAnimatorDraftSaveRequest\(/)
  assert.equal((page.match(/enqueueAnimatorDraftSave\(/g) ?? []).length, 2, 'os dois caminhos de gravação usam o mesmo enfileirador')
  assert.match(page, /isAnimatorDraftDocumentDirty\(snapshot, editorState, savedAnimationRef\.current\)/)
  assert.doesNotMatch(page, /snapshot\.parts\.flatMap\(\(part\) => pendingAssets\.current\.has/)
  assert.match(page, /await next\s+draftAssetsPersisted\.current = true/)
  assert.match(page, /void next\.then\(\(\) => \{ draftAssetsPersisted\.current = true/)
})
