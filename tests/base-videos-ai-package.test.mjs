import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBaseVideosAiPackage } from '../src/renderer/src/features/baseVideos/baseVideosAiPackage.ts'

test('pacote completo gera guia de importação, IDs locais e inclui apenas personagens escolhidos', () => {
  const video = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'cena.mp4', mimeType: 'video/mp4', extension: 'mp4', size: 1000, durationFrames: 600, createdAt: '2026-01-01T00:00:00.000Z', available: true }
  const character = { id: '123e4567-e89b-42d3-a456-426614174001', name: 'Íris', hair: '#000', outfit: '#000', skin: '#000', customization: { modelSlot: null, poseSlot: null, partOverrides: {}, layerOrder: [] }, createdAt: '', updatedAt: '' }
  const sheet = { characterId: character.id, characterName: character.name, personality: 'Atenta', backstory: '', fynRelationship: '', speakingStyle: '', relationships: [], additionalRules: '', updatedAt: '' }
  const result = buildBaseVideosAiPackage([video], {}, [], [character], [sheet])
  assert.match(result, /NYMI_IMPORTABLE_SCRIPT_V1/)
  assert.match(result, new RegExp(video.id))
  assert.match(result, /"personality": "Atenta"/)
  assert.doesNotMatch(result, /C:\\\\|\/Users\//)
})
