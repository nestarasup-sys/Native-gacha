import { expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { exportEditorV6React } from '../../src/shared/editorV6ReactExport'
import { parseEditorV6ReactImport, secondsToFrame } from '../../src/shared/editorV6ReactImport'
import { buildEditorV6PoseCategoryIndex } from '../../src/shared/editorV6PoseCategories'

it('exports cast, speech and pose changes as editable react JSON with exact frame times', () => {
  const characterId = crypto.randomUUID(), elementId = crypto.randomUUID()
  const actor: EditorV6Element = { id: elementId, characterId, kind: 'character', text: 'Alice', x: -20, y: 10, width: 20, height: 50, rotation: 0, zIndex: 1, characterScale: 121, poseSlot: 1 }
  const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId, text: 'Olá', englishText: 'Hello\nthere!', x: -20, y: -10, width: 30, height: 17, rotation: 0, zIndex: 2 }
  const timeline = createEditorV6Timeline([actor, speech])
  const characterTrack = timeline.tracks.find(track => track.kind === 'character')!
  characterTrack.characterId = characterId
  characterTrack.blocks = [{ id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 100, state: actor }, { id: crypto.randomUUID(), label: 'Alice', startFrame: 100, durationFrames: 100, state: { ...actor, poseSlot: 2 } }]
  const speechTrack = timeline.tracks.find(track => track.kind === 'speech')!
  speechTrack.blocks = [{ id: crypto.randomUUID(), label: 'Olá', elementId: speech.id, characterId, state: speech, startFrame: 31, durationFrames: 90 }]
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Teste', color: '#ffffff', createdAt: now, updatedAt: now, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor, speech], assets: [], timeline }
  const categories = new Map([[characterId, new Map([[1, 'Parado'], [2, 'Sentado']])]])
  const result = exportEditorV6React(project, categories)
  expect(parseEditorV6ReactImport(result.data)).toEqual(result.data)
  expect(result.data.cast[0].character).toBe(characterId)
  expect(result.data.lines[0].text).toBe('Olá')
  expect(result.data.lines[0].englishText).toBe('Hello\nthere!')
  expect(secondsToFrame(result.data.lines[0].startSeconds)).toBe(31)
  expect(result.data.cast[0].poseCategory).toBe('Em pé')
  expect(result.data.cast[0].poseSlot).toBeUndefined()
  expect(result.data.beats[0].poseCategory).toBe('Sentado')
  expect(result.data.beats[0].poseSlot).toBeUndefined()
  expect(secondsToFrame(result.data.beats[0].startSeconds)).toBe(100)
  expect(JSON.stringify(result.data)).not.toContain('base64')
})

it('exporta categorias reais no cast, nos beats e nas partes da Intro quando selecionáveis', () => {
  const characterId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), characterId, kind: 'character', text: 'Alice', x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1, poseSlot: 1 }
  const timeline = createEditorV6Timeline([actor])
  timeline.durationFrames = 300
  const characterTrack = timeline.tracks.find(track => track.kind === 'character')!
  characterTrack.characterId = characterId
  characterTrack.blocks = [{ id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 300, state: actor }]
  timeline.tracks.push({ id: crypto.randomUUID(), kind: 'intro', name: 'Intro', muted: false, locked: false, blocks: [
    { id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 30, intro: {
      kind: 'character', characterId, assetId: crypto.randomUUID(), text: 'Olá', englishText: 'Hello', flipX: false, poseSlot: 3
    } }
  ] })
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Intro por categoria', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, elements: [actor], assets: [], timeline }
  const characters = [{ id: characterId, name: 'Alice', customization: { modelSlot: 1 } }] as never[]
  const summaries = new Map([[1, [
    { slot: 1, sourceModelSlot: 1, name: 'Em pé A', category: 'Em pé', sourceModelName: 'A', partCount: 1, updatedAt: 'a' },
    { slot: 2, sourceModelSlot: 1, name: 'Sentada', category: 'Sentado', sourceModelName: 'A', partCount: 1, updatedAt: 'b' },
    { slot: 3, sourceModelSlot: 1, name: 'Parado B', category: 'Parado', sourceModelName: 'A', partCount: 1, updatedAt: 'c' }
  ]]])
  const categories = buildEditorV6PoseCategoryIndex(project, characters, summaries, new Map([[1, [1, 2, 3]]]))
  const result = exportEditorV6React(project, categories)
  expect(result.data.cast[0].poseCategory).toBe('Em pé')
  expect(result.data.intro?.[0]).toMatchObject({ kind: 'character', parts: [{ poseCategory: 'Em pé' }] })
  expect(result.warnings).toEqual([])
  expect(parseEditorV6ReactImport(result.data)).toEqual(result.data)
})

it('mantém slot legado se a categoria não estiver selecionável para importação', () => {
  const characterId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), characterId, kind: 'character', text: 'Alice', x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1, poseSlot: 9 }
  const timeline = createEditorV6Timeline([actor])
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Pose sem seleção', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, elements: [actor], assets: [], timeline }
  const characters = [{ id: characterId, name: 'Alice', customization: { modelSlot: 1 } }] as never[]
  const summaries = new Map([[1, [{ slot: 9, sourceModelSlot: 1, name: 'Sentada', category: 'Sentado', sourceModelName: 'A', partCount: 1, updatedAt: 'a' }]]])
  const categories = buildEditorV6PoseCategoryIndex(project, characters, summaries, new Map([[1, [1, 2, 3, 4, 5]]]))
  const result = exportEditorV6React(project, categories)
  expect(result.data.cast[0].poseSlot).toBe(9)
  expect(result.data.cast[0].poseCategory).toBeUndefined()
  expect(result.warnings).toContain('Um ou mais personagens usam poseSlot porque todos os seus estados de pose precisam permanecer no formato numérico legado.')

  const withoutSavedSelection = buildEditorV6PoseCategoryIndex(project, characters, summaries, new Map([[1, null]]))
  const defaultResult = exportEditorV6React(project, withoutSavedSelection)
  expect(defaultResult.data.cast[0].poseCategory).toBe('Sentado')
  expect(defaultResult.data.cast[0].poseSlot).toBeUndefined()
})

it('não mistura poseCategory e poseSlot entre estados do mesmo personagem', () => {
  const characterId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), characterId, kind: 'character', text: 'Alice', x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1, poseSlot: 1 }
  const timeline = createEditorV6Timeline([actor])
  const characterTrack = timeline.tracks.find(track => track.kind === 'character')!
  characterTrack.characterId = characterId
  characterTrack.blocks = [
    { id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 30, state: actor },
    { id: crypto.randomUUID(), label: 'Alice', startFrame: 30, durationFrames: 30, state: { ...actor, poseSlot: 2 } },
    { id: crypto.randomUUID(), label: 'Alice', startFrame: 60, durationFrames: 30, state: { ...actor, poseSlot: null } }
  ]
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Estados mistos', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, elements: [actor], assets: [], timeline }
  const categories = new Map([[characterId, new Map([[1, 'Em pé']])]])
  const result = exportEditorV6React(project, categories)
  expect(result.data.cast[0].poseSlot).toBe(1)
  expect(result.data.cast[0].poseCategory).toBeUndefined()
  expect(result.data.beats.map(beat => beat.poseSlot)).toEqual([2, null])
  expect(result.data.beats.every(beat => beat.poseCategory === undefined)).toBe(true)
  expect(parseEditorV6ReactImport(result.data)).toEqual(result.data)
})

it('não deixa estado oculto ou mutado forçar fallback numérico no roteiro', () => {
  const characterId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), characterId, kind: 'character', text: 'Alice', x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1, poseSlot: 1 }
  const timeline = createEditorV6Timeline([actor])
  const characterTrack = timeline.tracks.find(track => track.kind === 'character')!
  characterTrack.characterId = characterId
  characterTrack.blocks = [{ id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 30, state: actor }]
  timeline.tracks.push({ ...characterTrack, id: crypto.randomUUID(), hidden: true, blocks: [
    { id: crypto.randomUUID(), label: 'Oculta', startFrame: 30, durationFrames: 30, state: { ...actor, poseSlot: 9 } }
  ] })
  timeline.tracks.push({ ...characterTrack, id: crypto.randomUUID(), muted: true, blocks: [
    { id: crypto.randomUUID(), label: 'Mutada', startFrame: 60, durationFrames: 30, state: { ...actor, poseSlot: 10 } }
  ] })
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Faixas não exportadas', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, elements: [actor], assets: [], timeline }
  const categories = new Map([[characterId, new Map([[1, 'Em pé']])]])
  const result = exportEditorV6React(project, categories)
  expect(result.data.cast[0].poseCategory).toBe('Em pé')
  expect(result.data.cast[0].poseSlot).toBeUndefined()
  expect(result.data.beats).toEqual([])
  expect(result.warnings).toEqual([])
})

it('omite do JSON exportado apenas cards sem quadro visível e mantém o round-trip válido', () => {
  const actor: EditorV6Element = { id: crypto.randomUUID(), characterId: crypto.randomUUID(), kind: 'character', text: 'Alice', x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1 }
  const videoId = crypto.randomUUID(), libraryVideoId = crypto.randomUUID()
  const timeline = createEditorV6Timeline([actor])
  timeline.durationFrames = 90
  timeline.tracks.find(track => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Cena', mediaId: videoId, startFrame: 0, durationFrames: 60,
    videoPresentation: { loadingGif: true, timeCard: 'Past', bottomCards: [
      { startSeconds: 0.01, endSeconds: 0.02, text: 'Sem quadro' },
      { startSeconds: 0.04, endSeconds: 0.08, text: 'Visível' }
    ] } }]
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Card legado', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor], assets: [], media: [{ id: videoId, libraryVideoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 60, hasAudio: false, sizeBytes: 1 }], timeline }

  const result = exportEditorV6React(project)
  expect(result.data.videos[0].presentation).toEqual({ loadingGif: true, timeCard: 'Past', bottomCards: [{ startSeconds: 0.04, endSeconds: 0.08, text: 'Visível' }] })
  expect(result.warnings).toContain('Um intervalo de card menor que um quadro foi omitido do roteiro exportado.')
  expect(parseEditorV6ReactImport(result.data)).toEqual(result.data)
})
