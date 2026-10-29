import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, prepareEditorV6PositionAtFrame, resolveEditorV6SceneAtFrame, timelineClips } from '../../src/shared/editorV6Timeline'
import { editorV6StageDragPosition, moveEditorV6StageDrag, type EditorV6StageDrag } from '../../src/renderer/src/features/editorV6/useEditorV6StageInteraction'

function fixture(): EditorV6Document {
  const actor: EditorV6Element = {
    id: 'actor-1', kind: 'character', characterId: 'alice', assetId: 'asset-1', text: 'Alice',
    x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1
  }
  return {
    schemaVersion: 1, id: 'project-1', title: 'Teste', color: '#d7b5cd',
    createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor],
    assets: [{ id: 'asset-1', category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
    timeline: createEditorV6Timeline([actor])
  }
}

function elementDrag(project: EditorV6Document): EditorV6StageDrag {
  const operation = prepareEditorV6PositionAtFrame(project, 'actor-1', 0)
  if (!operation) throw new Error('Não foi possível preparar a peça de teste.')
  return {
    id: 'actor-1', target: 'element', pointerId: 1,
    startX: 10, startY: 20, originalX: 0, originalY: 0,
    width: 200, height: 100, before: project, prepared: operation.document,
    blockId: operation.blockId, frame: 0, moved: false
  }
}

describe('arraste da cena do Editor V6', () => {
  it('ignora tremor de menos de dois pixels e converte o movimento para percentuais', () => {
    const drag = elementDrag(fixture())
    expect(editorV6StageDragPosition(drag, 11, 21)).toBeNull()
    expect(editorV6StageDragPosition(drag, 110, 70)).toEqual({ x: 50, y: 50 })
  })

  it('edita o personagem no bloco preparado sem alterar o snapshot usado para cancelar', () => {
    const project = fixture()
    const before = structuredClone(project)
    const drag = elementDrag(project)
    const next = moveEditorV6StageDrag(drag, 35, -20)

    expect(resolveEditorV6SceneAtFrame(next, 0).elements[0]).toMatchObject({ id: 'actor-1', x: 35, y: -20 })
    expect(project).toEqual(before)
  })

  it('move o estado do fundo somente no bloco do quadro preparado', () => {
    const before = editEditorV6BackgroundAtFrame(fixture(), 0, {})
    const blockId = timelineClips(before.timeline).find(({ block }) => block.background)?.block.id
    expect(blockId).toBeTruthy()
    const drag: EditorV6StageDrag = {
      id: 'background', target: 'background', pointerId: 2,
      startX: 0, startY: 0, originalX: 0, originalY: 0,
      width: 200, height: 100, before, prepared: before,
      blockId: blockId!, frame: 0, moved: false
    }

    const next = moveEditorV6StageDrag(drag, 16, -8)
    expect(timelineClips(next.timeline).find(({ block }) => block.id === blockId)?.block.background)
      .toMatchObject({ backgroundX: 16, backgroundY: -8 })
  })

  it('move vídeo sem trocar layout, rotação ou dimensões', () => {
    const before = fixture()
    const videoTrack = before.timeline.tracks.find((track) => track.kind === 'video')!
    videoTrack.blocks.push({
      id: 'video-block', label: 'Vídeo', mediaId: 'media-1', startFrame: 0, durationFrames: 90,
      mediaLayout: { x: 3, y: 4, width: 40, height: 25, rotation: 12 }
    })
    const drag: EditorV6StageDrag = {
      id: 'media-video:video-block', target: 'video', videoLayout: videoTrack.blocks[0].mediaLayout,
      pointerId: 3, startX: 0, startY: 0, originalX: 3, originalY: 4,
      width: 200, height: 100, before, prepared: before,
      blockId: 'video-block', frame: 0, moved: false
    }

    const next = moveEditorV6StageDrag(drag, 30, -10)
    expect(timelineClips(next.timeline).find(({ block }) => block.id === 'video-block')?.block.mediaLayout)
      .toEqual({ x: 30, y: -10, width: 40, height: 25, rotation: 12 })
  })
})
