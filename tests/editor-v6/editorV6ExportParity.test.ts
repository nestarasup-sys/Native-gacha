import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { planEditorV6VideoOverlays } from '../../src/shared/editorV6VideoComposition'
import { attachEditorV6Motion, editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { splitEditorV6Block } from '../../src/shared/editorV6Timeline'
import { renderEditorV6FrameSvg } from '../../src/renderer/src/features/editorV6/sceneCapture'

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
      project: ready, selectedId: null, playing: false, fullView: true
    }))
    const exportSvg = renderEditorV6FrameSvg(ready, frame)
    expect(preview).toContain('viewBox="0 0 10 10"')
    expect(preview).toContain('data:image/png;base64,AQ==')
    expect(exportSvg).toContain('viewBox="0 0 10 10"')
    expect(exportSvg).toContain('data:image/png;base64,AQ==')
  })
})
