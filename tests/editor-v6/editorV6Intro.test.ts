import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { EditorV6MediaAsset } from '../../src/shared/editorV6'
import { isEditorV6Document } from '../../src/shared/editorV6Schema'
import { parseEditorV6ReactImport, planEditorV6ReactImport } from '../../src/shared/editorV6ReactImport'
import { exportEditorV6React } from '../../src/shared/editorV6ReactExport'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { editorV6BlinkEventAtFrame } from '../../src/shared/editorV6FaceSchedule'
import { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { editorV6VisualKeys } from '../../src/shared/editorV6Export'
import { pruneEditorV6TimelineSnapshots } from '../../src/shared/editorV6TimelineEdits'
import { resolveEditorV6IntroPortrait, updateEditorV6IntroPortrait, updateEditorV6IntroText } from '../../src/shared/editorV6Intro'
import { editorV6StageDragPosition, moveEditorV6StageDrag, prepareEditorV6StageDrag } from '../../src/renderer/src/features/editorV6/editorV6StageDrag'
import { duplicateEditorV6ProjectDocument } from '../../src/renderer/src/features/editorV6/editorV6ProjectDuplication'
import { compileEditorV6ReactImport } from '../../src/renderer/src/features/editorV6/editorV6ReactImportCompiler'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { renderEditorV6FrameSvg } from '../../src/renderer/src/features/editorV6/sceneCapture'
import { resolveEditorV6InspectorSelection } from '../../src/renderer/src/features/editorV6/editorV6Selection'
import { editEditorV6IntroAppearance } from '../../src/renderer/src/features/editorV6/editorV6IntroInspectorTarget'
import { prepareEditorV6IntroPoseBatch } from '../../src/renderer/src/features/editorV6/editorV6IntroPoseCommands'

const renderSize = { width: 128, height: 256 }
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a81sAAAAASUVORK5CYII='
vi.mock('../../src/renderer/src/features/editorV6/motion/characterSourceBatch', () => ({
  createEditorV6CharacterSourceBatch: () => ({ sourceFor: async () => ({}), clear: () => {} })
}))
vi.mock('../../src/renderer/src/characters/editorV6CharacterRenderer', () => ({
  prepareSavedCharacterRenderer: async () => ({ renderToCanvas: async () => renderSize, dispose: () => {} })
}))
vi.mock('../../src/renderer/src/features/editorV6/editorV6CharacterStageReference', () => ({
  editorV6CharacterStageReference: async () => ({ rendered: renderSize, crop: renderSize })
}))
vi.mock(import('../../src/renderer/src/features/editorV6/faceModeAssets'), async (original) => ({
  ...await original(),
  bakeEditorV6FaceModeAssets: async () => {
    const id = crypto.randomUUID()
    return { dataUrl: png, assetIds: { blink: id }, extraAssets: [
      { id, category: 'character', name: 'Blink', mimeType: 'image/png', dataUrl: png, timelineSnapshot: true }
    ] }
  }
}))
vi.mock('../../src/renderer/src/characters/sceneExpressionTransforms', () => ({
  buildSceneExpressionAppearance: async (_preset: unknown, appearance: CustomizerFaceAppearance) => appearance,
  buildSceneExpressionTransforms: async () => ({}),
  appearanceWithPupilsLookingLeft: async () => ({})
}))

const date = '2026-11-25T00:00:00.000Z'
const character = (name: string) => ({
  id: crypto.randomUUID(), name, updatedAt: date, customization: { modelSlot: 1, faceAppearance: {
    modelSlot: 1, setId: 'fixture', eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
  } }
}) as CustomizerCharacter
const actors = [character('Mara'), character('Alex')]
const videoId = crypto.randomUUID()
const media: EditorV6MediaAsset = { id: videoId, libraryVideoId: videoId, fileName: videoId + '.mp4',
  kind: 'video', mimeType: 'video/mp4', name: 'Vídeo', sizeBytes: 100, sourceFrames: 90, width: 480, height: 270, hasAudio: false }
const presets = new Map([[1, [{ id: 'normal', name: 'normal' }, { id: 'preocupada', name: 'preocupada' }]]])
const sample = {
  format: 'NYMI_EDITOR_V6_REACT_V1', title: 'Intro sintética', autoPoseEverySeconds: 0, autoListenerGaze: false,
  cast: actors.map(actor => ({ character: actor.name, x: 0, y: 0, poseSlot: null, expression: 'normal' })),
  videos: [{ videoId, startSeconds: 3, presentation: { loadingGif: true, timeCard: 'Past' } }],
  lines: [{ character: 'Mara', kind: 'speech', startSeconds: 4, durationSeconds: 3, text: 'Reação.' }],
  beats: [{ character: 'Mara', startSeconds: 5, expression: 'preocupada' }]
}
const intro = [
  { kind: 'black', text: 'Antes' },
  { kind: 'character', character: 'Mara', durationSeconds: 12, parts: [
    { startSeconds: 0, englishText: 'Hello.', text: 'Olá.' },
    { startSeconds: 5, englishText: 'I remember.', text: 'Eu lembro.', expression: 'preocupada' },
    { startSeconds: 9, englishText: 'One more thing.', text: 'Mais uma coisa.' }
  ] },
  { kind: 'black', text: 'Entre', durationSeconds: 2 },
  { kind: 'character', character: 'Alex', parts: [{ startSeconds: 0, englishText: 'I was there.', text: 'Eu estava lá.' }] },
  { kind: 'black', text: 'Depois' }
]

afterEach(() => vi.unstubAllGlobals())

describe('Intro do roteiro V14.5', () => {
  it('valida ordem, idiomas, cadastro, presets e limites com precisão de quadro', () => {
    const valid = parseEditorV6ReactImport({ ...sample, intro })
    const available = { characters: actors, posesByCharacter: new Map(), presetsByModel: presets, media: [media] }
    const plan = planEditorV6ReactImport(valid, available)
    expect(plan.contentStartFrame).toBe(870)
    expect(plan.intro.map(part => [part.startFrame, part.durationFrames])).toEqual([
      [0, 105], [105, 150], [255, 120], [375, 90], [465, 60], [525, 240], [765, 105]
    ])
    expect(plan.intro[3]).toMatchObject({ expression: 'preocupada' })
    expect(planEditorV6ReactImport(parseEditorV6ReactImport(sample), available).intro).toEqual([])
    expect(planEditorV6ReactImport(parseEditorV6ReactImport({ ...sample, intro, videos: [], lines: [], beats: [] }), available).durationFrames).toBe(870)
    expect(() => parseEditorV6ReactImport({ ...sample, intro: [intro[0], { ...intro[0], startSeconds: 3 }] })).toThrow(/sobreposição/)
    expect(() => parseEditorV6ReactImport({ ...sample, intro: [{ kind: 'character', character: 'Mara', parts: [
      { startSeconds: 0, englishText: 'One', text: 'Um' }, { startSeconds: 8, englishText: 'Two', text: 'Dois' }
    ] }] })).toThrow(/antes do fim/)
    expect(() => parseEditorV6ReactImport({ ...sample, intro: [{ kind: 'character', character: 'Mara', parts: [{ startSeconds: 0, text: 'Sem inglês' }] }] })).toThrow()
    expect(() => planEditorV6ReactImport(valid, { ...available, presetsByModel: new Map([[1, [{ id: 'normal', name: 'normal' }]]]) })).toThrow(/preocupada/)
    expect(() => planEditorV6ReactImport({ ...valid, cast: valid.cast.slice(0, 1) }, available)).toThrow(/fora do elenco/)
  })

  it('compila categorias de pose da Intro para os slots reais persistidos no projeto', async () => {
    vi.stubGlobal('window', { desktop: { editorV6: {}, fabricator: {
      loadFaceExpressionPreset: async (_model: number, id: string) => ({ id, updatedAt: date })
    } } })
    try {
      const source = parseEditorV6ReactImport({ ...sample, autoPoseEverySeconds: 0, videos: [], lines: [], beats: [], intro: [{
        kind: 'character', character: 'Mara', parts: [
          { startSeconds: 0, englishText: 'Standing.', text: 'Em pé.', poseCategory: 'Em pé' },
          { startSeconds: 4, englishText: 'Seated.', text: 'Sentada.', poseCategory: 'Sentado' }
        ]
      }] })
      const prepared = await compileEditorV6ReactImport(source, {
        characters: actors,
        poseSlots: new Map([[actors[0].id, [1, 2, 3]]]),
        poseRevisions: new Map(),
        poseCategories: new Map([[actors[0].id, new Map([[1, 'Parado'], [2, 'Sentado'], [3, 'Em pé']])]]),
        selectedPoses: new Map([[actors[0].id, [1, 2, 3]]]),
        presets
      })
      const blocks = prepared.document.timeline.tracks.find(track => track.kind === 'intro')!.blocks
      expect(blocks.map(block => block.intro?.kind === 'character' ? block.intro.poseSlot : null)).toEqual([1, 2])
      const document = prepared.document
      const blink = Array.from({ length: 106 }, (_, frame) => frame).find(frame => editorV6BlinkEventAtFrame(document.id, frame))!
      const portrait = blocks[0].intro
      if (portrait?.kind !== 'character') throw Error('Retrato ausente.')
      expect(resolveEditorV6SceneAtFrame(document, blink).elements[0].assetId).toBe(portrait.faceModeAssetIds?.blink)
      expect(resolveEditorV6SceneAtFrame(document, blink - 1).elements[0].assetId).toBe(portrait.assetId)
      expect(editorV6MotionPlans(document).find(plan => plan.blockId === blocks[1].id)).toMatchObject({
        from: { poseSlot: 1 }, to: { poseSlot: 2 }, endFrame: 120
      })
      expect(isEditorV6Document(pruneEditorV6TimelineSnapshots(document))).toBe(true)
      expect(exportEditorV6React(prepared.document).data.intro?.[0]).toMatchObject({
        kind: 'character', parts: [{ poseSlot: 1 }, { poseSlot: 2 }]
      })
    } finally { vi.unstubAllGlobals() }
  })

  it('materializa, salva, reabre e reexporta os blocos e seus retratos', async () => {
    vi.stubGlobal('window', { desktop: {
      editorV6: { linkEditorV6LibraryVideo: async () => media },
      fabricator: { loadFaceExpressionPreset: async (_model: number, id: string) => ({ id, updatedAt: date }) }
    } })
    const presentation = { loadingGif: true, cards: [{
      startSeconds: 0, endSeconds: 3,
      temporal: { startSeconds: 0, endSeconds: 3, enabled: true, text: 'Past' },
      english: { startSeconds: 0.5, endSeconds: 2, enabled: true, text: 'First mission' },
      portuguese: { startSeconds: 1, endSeconds: 3, enabled: true, text: 'Primeira missão' }
    }] }
    const source = parseEditorV6ReactImport({ ...sample, intro, videos: [{ ...sample.videos[0], presentation }] })
    const { document } = await compileEditorV6ReactImport(source, {
      characters: actors, poseSlots: new Map(), poseRevisions: new Map(), presets
    })
    const resolve = (frame: number) => resolveEditorV6SceneAtFrame(document, frame)
    expect(resolve(104)).toMatchObject({ intro: { kind: 'black', text: 'Antes' }, elements: [] })
    expect(resolve(105)).toMatchObject({ intro: { characterId: actors[0].id, text: 'Olá.', expression: 'normal' } })
    expect(resolve(254).intro).toMatchObject({ text: 'Olá.' })
    expect(resolve(255).intro).toMatchObject({ text: 'Eu lembro.', expression: 'preocupada' })
    expect(editorV6VisualKeys(resolve(254)).layerKeys.foreground).not.toBe(editorV6VisualKeys(resolve(255)).layerKeys.foreground)
    expect(resolve(525).intro).toMatchObject({ characterId: actors[1].id })
    expect(resolve(869).intro).toMatchObject({ text: 'Depois' })
    expect(resolve(870)).toMatchObject({ loadingGifFrame: 0 })
    expect(resolve(870).intro).toBeUndefined()
    expect(resolve(960)).toMatchObject({ mediaVideo: { startFrame: 960 }, videoCards: { timeCard: 'Past' } })
    expect(resolve(974).videoCardItems?.map(card => card.text)).toEqual(['Past'])
    expect(resolve(990).videoCardItems?.map(card => card.text)).toEqual(expect.arrayContaining(['Past', 'First mission', 'Primeira missão']))
    expect(resolve(1050).videoCardItems).toBeUndefined()
    const cardSvg = renderEditorV6FrameSvg(document, 990)
    expect(cardSvg).toContain('First mission')
    expect(cardSvg).toContain('Primeira missão')
    expect(resolve(990).elements.some(element => element.text === 'Reação.')).toBe(true)
    expect(resolve(1000).elements.find(element => element.characterId === actors[0].id && element.kind === 'character')?.activeExpressionPresetId).toBe('normal')
    const svg = renderEditorV6FrameSvg(document, 255)
    expect(svg).toContain('I remember.')
    expect(svg).toContain('Eu lembro.')
    expect(svg).toContain('fill="#ffffff"')

    const root = await fs.mkdtemp(join(tmpdir(), 'editor-v6-intro-test-'))
    try {
      const persistence = createEditorV6DocumentPersistence({
        files: fs, editorV6Path: id => join(root, 'editorV6-' + id), editorV6LibraryPath: () => root,
        validate: isEditorV6Document, assertLibraryVideoReferencesAvailable: async () => {},
        assertLibraryBackgroundReferencesAvailable: async () => {}, assertLibraryMediaReferencesAvailable: async () => {},
        coordinateLibraryReferenceChange: operation => operation(),
        decodeImage: data => Buffer.from(data.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes })
      })
      const introTrack = document.timeline.tracks.find(track => track.kind === 'intro')!
      const selected = introTrack.blocks[2]
      const startScene = resolve(255)
      const dragInput = { project: document, scene: startScene, id: selected.id, target: 'intro' as const,
        startX: 100, startY: 100, width: 500, height: 250, pointerId: 1 }
      const drag = prepareEditorV6StageDrag(dragInput)!
      expect(drag.originalX).toBe(-25)
      const point = editorV6StageDragPosition(drag, 150, 125)!
      const moved = moveEditorV6StageDrag(drag, point.x, point.y)
      const framed = updateEditorV6IntroPortrait(moved, selected.id, {
        characterScale: 114, characterWidthScale: 120, characterHeightScale: 90,
        rotation: -12, flipX: true, zIndex: 1, positionLocked: true
      })
      const resolvedPortrait = resolveEditorV6SceneAtFrame(framed, 105).intro!
      if (resolvedPortrait.kind !== 'character') throw Error('Retrato de teste ausente.')
      expect(resolveEditorV6IntroPortrait(resolvedPortrait)).toMatchObject({ x: -15, y: 10, rotation: -12, flipX: true })
      expect(prepareEditorV6StageDrag({ ...dragInput, project: framed, scene: resolveEditorV6SceneAtFrame(framed, 255) })).toBeNull()
      expect(resolveEditorV6SceneAtFrame(framed, 525).intro).toEqual(resolve(525).intro)
      expect(framed.elements).toBe(document.elements)
      expect(editorV6VisualKeys(startScene).layerKeys.foreground).not.toBe(editorV6VisualKeys(resolveEditorV6SceneAtFrame(framed, 255)).layerKeys.foreground)
      const selection = resolveEditorV6InspectorSelection({
        project: framed, visibleElements: [], selectedElementId: null, selectedTimelineBlockId: selected.id,
        backgroundAssetId: null, playheadFrame: 255
      })
      expect(selection.selectedElement).toMatchObject({ kind: 'character', id: selected.id, activeExpressionPresetId: 'preocupada' })
      expect(selection.selectedCharacterElement).toBeNull()
      const original = framed.assets.find(asset => asset.id === selection.selectedElement?.assetId)!
      const replacement = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVQIW2PABwAACQABFXGjQAAAAABJRU5ErkJggg=='
      const customized = editEditorV6IntroAppearance(framed, selected.id, working => ({
        ...working,
        elements: working.elements.map(element => element.id === selected.id
          ? { ...element, activeExpressionPresetId: null, activeFaceMode: 'blink' } : element),
        assets: working.assets.map(asset => asset.id === original.id ? { ...asset, dataUrl: replacement } : asset)
      }))
      expect(customized.elements).toBe(framed.elements)
      expect(customized.assets.find(asset => asset.id === original.id)).toBe(original)
      expect(resolveEditorV6SceneAtFrame(customized, 255).intro).toMatchObject({ face: { activeFaceMode: 'blink' } })
      expect(renderEditorV6FrameSvg(customized, 255)).toContain(replacement)
      const batch = await prepareEditorV6IntroPoseBatch(customized, selection.selectedElement!, actors[0], actors, async ({ element, poseSlot }) => {
        expect(poseSlot).toBeNull()
        return { baseMode: 'idle', baked: { dataUrl: replacement, crop: null, assetIds: {}, extraAssets: [] },
          geometry: { width: element.width, height: element.height, characterCanvasWidth: 20 } }
      })
      expect(batch.skipped).toEqual([])
      expect(renderEditorV6FrameSvg(batch.apply(customized), 525)).toContain(replacement)
      const edited = updateEditorV6IntroText(customized, selected.id, 'englishText', 'An edited part.')
      await persistence.writeEditorV6(pruneEditorV6TimelineSnapshots(edited))
      const saved = (await persistence.readEditorV6(document.id))!
      const duplicate = duplicateEditorV6ProjectDocument(saved, {
        id: crypto.randomUUID(), title: 'Cópia', color: saved.color, createdAt: date, updatedAt: date
      }, () => crypto.randomUUID())
      expect(isEditorV6Document(duplicate)).toBe(true)
      const copiedPortrait = resolveEditorV6SceneAtFrame(duplicate, 105).intro
      expect(copiedPortrait).toMatchObject({ portraitLayout: { x: -15, y: 10 }, flipX: true })
      expect(copiedPortrait?.kind === 'character' && copiedPortrait.assetId).not.toBe(resolvedPortrait.assetId)
      expect(saved.timeline.tracks.find(track => track.kind === 'intro')?.blocks[2].intro).toMatchObject({ englishText: 'An edited part.' })
      const { data, warnings } = exportEditorV6React(saved)
      expect(warnings).toEqual([])
      expect(data.videos[0].startSeconds).toBe(3)
      expect(data.videos[0].presentation).toEqual(presentation)
      expect(data.lines[0].startSeconds).toBe(4)
      expect(data.beats[0].startSeconds).toBe(5)
      expect(data.intro?.[1]).toMatchObject({ kind: 'character', character: actors[0].id, durationSeconds: 12 })
      expect(planEditorV6ReactImport(data, { characters: actors, posesByCharacter: new Map(), presetsByModel: presets, media: [media] }).intro[2])
        .toMatchObject({ expression: undefined, face: { activeFaceMode: 'blink' }, flipX: true,
          portraitLayout: { characterScale: 114, x: -15, y: 10, rotation: -12 } })
      expect(data.intro?.[4]).toMatchObject({ kind: 'black', text: 'Depois' })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
