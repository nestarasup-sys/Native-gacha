import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { planEditorV6VideoOverlays } from '../../src/shared/editorV6VideoComposition'
import { attachEditorV6Motion, editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { splitEditorV6Block } from '../../src/shared/editorV6Timeline'
import { renderEditorV6FrameSvg } from '../../src/renderer/src/features/editorV6/sceneCapture'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'

vi.mock('../../src/renderer/src/features/editorV6/editorV6PlaybackClock', () => ({
  useEditorV6PlaybackFrame: () => 83
}))
import { EditorV6PlaybackScene } from '../../src/renderer/src/features/editorV6/EditorV6PlaybackScene'

function fixture(): EditorV6Document {
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Paridade',
    color: '#d7b5cd', createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements: [], timeline: createEditorV6Timeline() }
}
const vid = (id: string, name: string) => ({
  id, name, fileName: `${id}.mp4`, kind: 'video' as const, mimeType: 'video/mp4',
  hasAudio: true, sourceFrames: 180, sizeBytes: 2000, width: 1920, height: 1080
})

describe('paridade da seleção visual prévia ↔ exportação', () => {
  it('desenha os cards acima da cena e mantém os balões acima deles', () => {
    const ordinary: EditorV6Element = { id: 'ordinary', kind: 'narrator', text: 'Objeto comum', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex: 1 }
    const balloon: EditorV6Element = { id: 'balloon', kind: 'speech', text: 'Fala acima', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex: 2 }
    const scene = { frame: 0, background: { backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 },
      elements: [balloon, ordinary], videoCardItems: [{ blockId: 'card', position: 'bottom' as const, text: 'Card acima', layout: { x: 0, y: 0, width: 40, height: 40, rotation: 0 } }] }
    const svg = renderToStaticMarkup(createElement(SceneSurface, { scene, assets: [] }))
    expect(svg.indexOf('aria-label="Objeto comum"')).toBeLessThan(svg.indexOf('aria-label="Card acima"'))
    expect(svg.indexOf('aria-label="Card acima"')).toBeLessThan(svg.indexOf('aria-label="Fala acima"'))
  })

  it('desempata vídeos no mesmo quadro pelo ID do bloco, nunca pelo nome do arquivo', () => {
    const doc = fixture()
    const idA = crypto.randomUUID(), idB = crypto.randomUUID()
    doc.media = [vid(idA, 'Z'), vid(idB, 'A')]
    const video = doc.timeline.tracks.find(track => track.kind === 'video')!
    const blockA = '11111111-1111-4111-8111-111111111111'
    const blockB = '22222222-2222-4222-8222-222222222222'
    video.blocks = [
      { id: blockB, label: 'Z', mediaId: idA, startFrame: 30, durationFrames: 120 },
      { id: blockA, label: 'A', mediaId: idB, startFrame: 30, durationFrames: 120 }
    ]
    const plan = planEditorV6VideoOverlays(doc, 0, 160)
    expect(plan.map(clip => clip.blockId)).toEqual([blockA, blockB])
    expect(resolveEditorV6SceneAtFrame(doc, 50).mediaVideo?.blockId).toBe(plan.at(-1)?.blockId)
  })

  it('mantém a prioridade de vídeos sobrepostos em partes Turbo cortadas no meio', () => {
    const doc = fixture()
    const oldId = crypto.randomUUID(), recentId = crypto.randomUUID()
    doc.media = [vid(oldId, 'Z'), vid(recentId, 'A')]
    const video = doc.timeline.tracks.find(track => track.kind === 'video')!
    video.blocks = [
      { id: crypto.randomUUID(), label: 'Z', mediaId: oldId, startFrame: 0, durationFrames: 160, mediaInFrame: 10 },
      { id: crypto.randomUUID(), label: 'A', mediaId: recentId, startFrame: 40, durationFrames: 80, mediaInFrame: 5 }
    ]
    doc.timeline.durationFrames = 180
    for (const [start, end] of [[0, 100], [80, 140], [100, 150]] as const) {
      const plan = planEditorV6VideoOverlays(doc, start, end)
      for (const frame of Array.from({ length: end - start }, (_, i) => i + start)) {
        const visible = plan.filter(clip => frame >= clip.startFrame && frame < clip.endFrame).at(-1)
        const preview = resolveEditorV6SceneAtFrame(doc, frame).mediaVideo
        expect(visible?.blockId).toBe(preview?.blockId)
        if (visible && preview) {
          const sourceAtFrame = visible.mediaInFrame + frame - visible.startFrame
          expect(sourceAtFrame).toBe(preview.sourceInFrame + frame - preview.startFrame)
          expect(visible.layout).toEqual(preview.layout)
        }
      }
    }
  })

  it('não exporta vídeos escondidos, silenciados ou fora do trecho', () => {
    const doc = fixture(), id = crypto.randomUUID()
    doc.media = [vid(id, 'A')]
    const track = doc.timeline.tracks.find(item => item.kind === 'video')!
    track.blocks = [{ id: crypto.randomUUID(), label: 'A', mediaId: id, startFrame: 50, durationFrames: 100 }]
    expect(planEditorV6VideoOverlays(doc, 0, 50)).toEqual([])
    expect(planEditorV6VideoOverlays(doc, 150, 200)).toEqual([])
    track.muted = true
    expect(planEditorV6VideoOverlays(doc, 60, 70)).toEqual([])
    track.muted = false; track.hidden = true
    expect(planEditorV6VideoOverlays(doc, 60, 70)).toEqual([])
  })

  it('usa na prévia o mesmo atlas de transição de pose utilizado no SVG da exportação', () => {
    const doc = fixture(), assetId = crypto.randomUUID()
    const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice',
      assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1 }
    doc.elements = [actor]
    doc.assets = [{ id: assetId, category: 'character', name: 'Alice',
      mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }]
    doc.timeline = createEditorV6Timeline([actor])
    const first = doc.timeline.tracks.find(track => track.kind === 'character')!.blocks[0].id
    doc.timeline = splitEditorV6Block(doc.timeline, first, 90)
    doc.timeline.tracks.find(track => track.kind === 'character')!.blocks[1].state = { ...actor, poseSlot: 2 }
    const plan = editorV6MotionPlans(doc)[0]
    expect(plan.samples.length).toBe(7)
    const atlasId = crypto.randomUUID()
    const ready = attachEditorV6Motion(doc, plan.blockId, {
      asset: { id: atlasId, category: 'character', name: 'Atlas',
        mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQ==', timelineSnapshot: true },
      motion: { version: 1, key: plan.key, assetId: atlasId,
        frames: plan.samples.map((sample, i) => ({ offset: sample.offset, sprite: {
          x: i * 10, y: 0, width: 10, height: 10, atlasWidth: 70, atlasHeight: 10
        }, x: i, y: 0, width: 20, height: 30, rotation: 0, flipX: false })) }
    })
    const frame = 83
    const scene = resolveEditorV6SceneAtFrame(ready, frame)
    expect(scene.elements[0].assetId).toBe(atlasId)
    expect(scene.elements[0].motionSprite?.x).toBe(0)
    const preview = renderToStaticMarkup(createElement(EditorV6PlaybackScene, {
      project: ready, previewMotionCharacters: [], previewMotionEnabled: false, selectedId: null, playing: false, fullView: true
    }))
    const exportSvg = renderEditorV6FrameSvg(ready, frame)
    expect(preview).toContain('viewBox="0 0 10 10"')
    expect(preview).toContain('data:image/png;base64,AQ==')
    expect(exportSvg).toContain('viewBox="0 0 10 10"')
    expect(exportSvg).toContain('data:image/png;base64,AQ==')
  })

  it('renderiza os cards temporizados com o mesmo conteúdo e geometria na prévia e no SVG de exportação', () => {
    const doc = fixture(), mediaId = crypto.randomUUID()
    doc.media = [vid(mediaId, 'Clipe com cards')]
    doc.timeline.durationFrames = 180
    doc.timeline.tracks.find(track => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Clipe', mediaId,
      startFrame: 0, durationFrames: 180, mediaLayout: { x: 7, y: -4, width: 72, height: 64, rotation: 8 },
      videoPresentation: {
        timeCards: [{ startSeconds: 1, endSeconds: 3, text: 'Future' }],
        bottomCards: [{ startSeconds: 1, endSeconds: 3, text: 'Contexto em dois idiomas' }]
      } }]
    const preview = renderToStaticMarkup(createElement(EditorV6PlaybackScene, {
      project: doc, previewMotionCharacters: [], previewMotionEnabled: false, selectedId: null, playing: false, fullView: true
    }))
    const exportSvg = renderEditorV6FrameSvg(doc, 83)
    const cardMarkup = (svg: string, label: string) => svg.match(new RegExp(`<g aria-label="${label}">[\\s\\S]*?<\\/g>`))?.[0]
    expect(cardMarkup(preview, 'Future')).toBeTruthy()
    expect(cardMarkup(preview, 'Future')).toBe(cardMarkup(exportSvg, 'Future'))
    expect(cardMarkup(preview, 'Contexto em dois idiomas')).toBe(cardMarkup(exportSvg, 'Contexto em dois idiomas'))
    expect(preview).toContain('Future')
    expect(exportSvg).toContain('Contexto em dois idiomas')
  })

  it('mantém a apresentação bilíngue da Intro e o retrato iguais na prévia e no SVG de exportação', () => {
    const doc = fixture(), assetId = crypto.randomUUID()
    doc.assets = [{ id: assetId, category: 'character', name: 'Retrato da Intro', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }]
    const mediaId = crypto.randomUUID()
    doc.media = [vid(mediaId, 'Vídeo após a Intro')]
    doc.timeline.tracks.find(track => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Vídeo após a Intro', mediaId,
      startFrame: 90, durationFrames: 10, videoPresentation: { loadingGif: true } }]
    doc.timeline.tracks.push({ id: crypto.randomUUID(), kind: 'intro', name: 'Intro', muted: false, locked: false, blocks: [{
      id: crypto.randomUUID(), label: 'Apresentação', startFrame: 80, durationFrames: 10,
      intro: { kind: 'character', characterId: 'alice', assetId, text: 'Olá, Alice', englishText: 'Hello, Alice', flipX: true,
        portraitLayout: { x: -10, characterScale: 150, zIndex: 1, flipX: true } }
    }] })
    doc.timeline.durationFrames = 100
    const preview = renderToStaticMarkup(createElement(EditorV6PlaybackScene, {
      project: doc, previewMotionCharacters: [], previewMotionEnabled: false, selectedId: null, playing: false, fullView: true
    }))
    const exportSvg = renderEditorV6FrameSvg(doc, 83)
    for (const svg of [preview, exportSvg]) {
      expect(svg).toContain('Hello, Alice')
      expect(svg).toContain('Olá, Alice')
      expect(svg).toContain('data:image/png;base64,AA==')
      expect(svg).toContain('scale(1.5 1.5)')
      expect(svg).toContain('scale(-1 1)')
      expect(svg).toContain('aria-label="Loading..."')
    }
    expect(resolveEditorV6SceneAtFrame(doc, 83).loadingGifFrame).toBeDefined()
    expect(resolveEditorV6SceneAtFrame(doc, 83, { includeVideo: false, includeVideoPresentation: true }).loadingGifFrame).toBeDefined()
    expect(resolveEditorV6SceneAtFrame(doc, 83, { includeVideo: false, includeVideoPresentation: false }).loadingGifFrame).toBeUndefined()
  })
})
