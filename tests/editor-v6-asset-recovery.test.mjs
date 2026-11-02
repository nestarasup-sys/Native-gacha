import test from 'node:test'
import assert from 'node:assert/strict'
import { restorePersistedCharacterAssets } from '../src/renderer/src/features/editorV6/editorV6AssetRecovery.ts'

const asset = (id, category = 'character', name = id) => ({ id, category, name, mimeType: 'image/png', dataUrl: `data:image/png;base64,${id}` })
const character = (id, assetId) => ({ id, kind: 'character', characterId: `character-${id}`, assetId, text: id, x: 1, y: 2, width: 10, height: 20, rotation: 0, zIndex: 1 })
const document = (assets, elements) => ({
  schemaVersion: 1, id: 'project', title: 'Editor V6 04', color: '#ffffff', createdAt: '', updatedAt: 'current',
  backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
  backgroundRotation: 0, assets, elements, timeline: { fps: 30, durationFrames: 30, tracks: [] }
})

test('restaura asset de personagem faltante do último salvamento preservando as edições atuais', () => {
  const persistedAsset = asset('fgd-base')
  const currentAsset = asset('other-character')
  const current = document([currentAsset], [character('fgd', persistedAsset.id)])
  const persisted = document([persistedAsset], [character('fgd', persistedAsset.id)])

  const recovered = restorePersistedCharacterAssets(current, persisted)

  assert.notEqual(recovered, current)
  assert.deepEqual(recovered.assets, [currentAsset, persistedAsset])
  assert.equal(recovered.elements[0].assetId, persistedAsset.id)
  assert.equal(recovered.updatedAt, 'current')
})

test('não inventa substituto se o asset referenciado nunca foi salvo', () => {
  const current = document([], [character('fgd', 'missing')])
  const persisted = document([], [character('fgd', 'missing')])
  assert.equal(restorePersistedCharacterAssets(current, persisted), current)
})

test('considera snapshots da timeline e repara somente referências de personagem', () => {
  const timelineAsset = asset('talk-snapshot')
  const objectAsset = asset('object-image', 'object')
  const current = document([objectAsset], [])
  current.timeline.tracks = [{ id: 'track', kind: 'character', characterId: 'character-fgd', name: 'fgd', muted: false, locked: false, blocks: [{ id: 'block', elementId: 'fgd', label: 'fgd', startFrame: 0, durationFrames: 30, state: { ...character('fgd', 'missing-base'), faceModeAssetIds: { idle: 'missing-base', talk: timelineAsset.id } } }] }]
  const persisted = document([timelineAsset], [])

  const recovered = restorePersistedCharacterAssets(current, persisted)

  assert.deepEqual(recovered.assets, [objectAsset, timelineAsset])
  assert.equal(recovered.timeline.tracks[0].blocks[0].state.assetId, 'missing-base')
})
