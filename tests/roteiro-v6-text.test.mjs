import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRoteiroEditorV6Text, selectRoteiroV6Poses } from '../src/renderer/src/features/roteiros/roteiroEditorV6Text.ts'

test('seleção de poses mantém a ordem e os espaços escolhidos por modelo', () => {
  const poses = [{ slot: 7, sourceModelSlot: 2, name: 'Sentada' }, { slot: 1, sourceModelSlot: 2, name: 'Em pé' }, { slot: 3, sourceModelSlot: 1, name: 'Outro modelo' }]
  assert.deepEqual(selectRoteiroV6Poses(2, poses, [7, null, 9, 1]), [{ selection: 1, slot: 7, name: 'Sentada', available: true }, { selection: 3, slot: 9, name: 'Pose 9', available: false }, { selection: 4, slot: 1, name: 'Em pé', available: true }])
  assert.deepEqual(selectRoteiroV6Poses(2, poses, null).map((item) => item.slot), [1, 7])
  assert.deepEqual(selectRoteiroV6Poses(2, poses, [null, null]), [])
})

test('TXT V6 reúne IDs, poses selecionadas, presets, fichas e conteúdo de cada vídeo sem misturar seções', () => {
  const first = 'actor-1', second = 'actor-2', video = 'video-1'
  const dialogue = 'Olá! "Você viu?"\nSegunda linha.'
  const roteiro = { id: 'script-1', title: 'React', videoTitle: 'Vídeo', characterIds: [first, second], backgroundAssetId: 'bg-1', opening: { video: null, blocks: [] }, tiktoks: [{ id: 'section-1', title: 'Primeiro', video: { id: video, name: 'anterior.mp4', durationFrames: 600 }, description: 'Descrição do roteiro', additionalContext: 'Contexto do roteiro', sceneEndSeconds: 7.1, firstGroupReactionSeconds: 2.4, blocks: [{ characterId: first, kind: 'fala', expression: '', textPortuguese: dialogue, textEnglish: '' }] }, { id: 'section-2', title: 'Segundo', description: 'Outra cena', blocks: [] }] }
  const characters = [{ id: first, name: 'Íris', customization: { modelSlot: 2, faceAppearance: {} } }, { id: second, name: 'Caio', customization: { modelSlot: 2 } }]
  const sheets = [{ characterId: first, personality: 'Atenta', backstory: '', fynRelationship: '', speakingStyle: '', relationships: [{ targetCharacterId: second, description: 'Amigo' }], additionalRules: '' }]
  const models = [{ modelSlot: 2, selectedPoses: [{ selection: 1, slot: 7, name: 'Sentada', available: true }, { selection: 3, slot: 4, name: 'Pose 4', available: false }], expressions: [{ id: 'preset-1', name: 'Triste magoada' }] }]
  const result = buildRoteiroEditorV6Text({ roteiro, characters, sheets, models, videos: [{ id: video, name: 'atual.mp4', available: true, durationFrames: 600 }], details: [{ videoId: video, videoNumber: 19, description: 'Descrição da base', additionalContext: 'Contexto da base', timeline: 'future' }], backgrounds: [{ id: 'bg-1', name: 'Sala', available: true }] })
  assert.match(result, /characterId: actor-1/)
  assert.match(result, /Seleção 1: poseSlot 7 · Sentada/)
  assert.match(result, /Seleção 3: poseSlot 4.*INDISPONÍVEL/)
  assert.match(result, /expression: preset-1/)
  assert.match(result, /"personality": "Atenta"/)
  assert.match(result, /"name": "Caio"/)
  assert.match(result, /backgroundLibraryId: bg-1/)
  assert.match(result, /videoId: video-1/)
  assert.match(result, /Número na Base: 19/)
  assert.match(result, /Duração do vídeo: 10 segundos/)
  assert.ok(result.includes(`Português: ${JSON.stringify(dialogue)}`))
  const firstSection = result.split('TIKTOK 01')[1].split('TIKTOK 02')[0]
  const secondSection = result.split('TIKTOK 02')[1]
  assert.match(firstSection, /Contexto do roteiro/)
  assert.match(firstSection, /Contexto da base/)
  assert.doesNotMatch(secondSection, /Contexto do roteiro|video-1/)
  assert.doesNotMatch(result, /assets\/tiktoks|POSE 1.*Pasta exata/)
})
