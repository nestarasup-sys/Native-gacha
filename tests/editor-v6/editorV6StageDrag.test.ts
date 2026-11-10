import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, resolveEditorV6SceneAtFrame, timelineClips } from '../../src/shared/editorV6Timeline'
import { editorV6StageDragPosition, moveEditorV6StageDrag, type EditorV6StageDrag } from '../../src/renderer/src/features/editorV6/useEditorV6StageInteraction'
import { prepareEditorV6StageDrag } from '../../src/renderer/src/features/editorV6/editorV6StageDrag'

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

function elementDrag(project: EditorV6Document, frame = 0): EditorV6StageDrag {
  const scene = resolveEditorV6SceneAtFrame(project, frame, { includeMotion: false })
  const drag = prepareEditorV6StageDrag({
    project,
    scene,
    id: 'actor-1',
    target: 'element',
    element: scene.elements.find((element) => element.id === 'actor-1'),
    pointerId: 1,
    startX: 10,
    startY: 20,
    width: 200,
    height: 100
  })
  if (!drag) throw new Error('Não foi possível preparar a peça de teste.')
  return drag
}

describe('arraste da cena do Editor V6', () => {
  it('ignora tremor de menos de dois pixels e converte o movimento para percentuais', () => {
    const drag = elementDrag(fixture())
    expect(editorV6StageDragPosition(drag, 11, 21)).toBeNull()
    expect(editorV6StageDragPosition(drag, 110, 70)).toEqual({ x: 50, y: 50 })
  })

  it('prepara o rascunho do elemento com o bloco do quadro e a posição da cena', () => {
    const project = fixture()
    const drag = elementDrag(project, 15)

    expect(drag).toMatchObject({
      id: 'actor-1', target: 'element', pointerId: 1,
      startX: 10, startY: 20, originalX: 0, originalY: 0,
      width: 200, height: 100, frame: 15, moved: false
    })
    expect(drag.blockId).toBeTruthy()
    expect(drag.before).toBe(project)
    expect(drag.prepared).not.toBe(project)
  })

  it('não prepara o arraste quando a faixa de personagens está bloqueada', () => {
    const project = fixture()
    const characterTrack = project.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.locked = true
    const scene = resolveEditorV6SceneAtFrame(project, 0, { includeMotion: false })

    expect(prepareEditorV6StageDrag({
      project,
      scene,
      id: 'actor-1',
      target: 'element',
      element: scene.elements.find((element) => element.id === 'actor-1'),
      pointerId: 1,
      startX: 0,
      startY: 0,
      width: 200,
      height: 100
    })).toBeNull()
  })

  it('não prepara o arraste do fundo quando a faixa de vídeo está bloqueada', () => {
    const project = fixture()
    project.timeline.tracks.find((track) => track.kind === 'video')!.locked = true
    const scene = resolveEditorV6SceneAtFrame(project, 0, { includeMotion: false })

    expect(prepareEditorV6StageDrag({
      project,
      scene,
      id: 'background',
      target: 'background',
      pointerId: 1,
      startX: 0,
      startY: 0,
      width: 200,
      height: 100
    })).toBeNull()
  })

  it('prepara o bloco de fundo do quadro e mantém seu ponto inicial', () => {
    const project = fixture()
    const scene = resolveEditorV6SceneAtFrame(project, 0, { includeMotion: false })
    const drag = prepareEditorV6StageDrag({
      project,
      scene,
      id: 'background',
      target: 'background',
      pointerId: 2,
      startX: 5,
      startY: 6,
      width: 200,
      height: 100
    })

    if (!drag) throw new Error('Não foi possível preparar o fundo para o arraste de teste.')
    expect(drag).toMatchObject({ target: 'background', pointerId: 2, originalX: 0, originalY: 0, frame: 0 })
    expect(timelineClips(drag.prepared.timeline).find(({ block }) => block.id === drag.blockId)?.block.background).toBeDefined()
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

  it('prepara o arraste de vídeo usando o layout salvo e respeita o bloqueio da faixa', () => {
    const project = fixture()
    const videoTrack = project.timeline.tracks.find((track) => track.kind === 'video')!
    const videoBlock = {
      id: 'video-block', label: 'Vídeo', mediaId: 'media-1', startFrame: 0, durationFrames: 90,
      mediaLayout: { x: 3, y: 4, width: 40, height: 25, rotation: 12 }
    }
    videoTrack.blocks.push(videoBlock)
    const scene = resolveEditorV6SceneAtFrame(project, 0, { includeMotion: false })
    const videoClip = timelineClips(project.timeline).find(({ block }) => block.id === videoBlock.id)!
    const input = {
      project,
      scene,
      id: 'media-video:video-block',
      target: 'video' as const,
      videoClip,
      pointerId: 3,
      startX: 0,
      startY: 0,
      width: 200,
      height: 100
    }

    expect(prepareEditorV6StageDrag(input)).toMatchObject({
      target: 'video', videoLayout: videoBlock.mediaLayout, originalX: 3, originalY: 4, blockId: 'video-block'
    })
    videoTrack.locked = true
    expect(prepareEditorV6StageDrag(input)).toBeNull()
  })
})
