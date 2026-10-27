import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, moveEditorV6ElementInPeriod, prepareEditorV6PositionAtFrame, resolveEditorV6SceneAtFrame, setEditorV6BlockTiming, timelineClips } from '../../src/shared/editorV6Timeline'
import { recordEditorV6History, redoEditorV6History, undoEditorV6History } from '../../src/shared/editorV6History'
import { parseEditorV6Document } from '../../src/shared/editorV6Schema'

function fixture(): EditorV6Document {
  const assetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Preview', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
}

describe('preview e posicionamento do Editor V6', () => {
  it('compartilha a posição em todos os quadros do personagem', () => {
    const document = fixture(), id = document.elements[0].id
    const operation = prepareEditorV6PositionAtFrame(document, id, 120)!
    const moved = moveEditorV6ElementInPeriod(operation.document, operation.blockId, 25, -10)
    expect(resolveEditorV6SceneAtFrame(moved, 119).elements[0]).toMatchObject({ x: 25, y: -10 })
    expect(resolveEditorV6SceneAtFrame(moved, 120).elements[0]).toMatchObject({ x: 25, y: -10 })
    expect(resolveEditorV6SceneAtFrame(moved, 250).elements[0]).toMatchObject({ x: 25, y: -10 })
    expect(document.elements[0]).toMatchObject({ x: 0, y: 0 })
    expect(moved.timeline.durationFrames).toBe(300)
  })

  it('mantém uma única posição ao editar blocos anteriores e seguintes', () => {
    const document = fixture(), id = document.elements[0].id
    const later = prepareEditorV6PositionAtFrame(document, id, 240)!
    const laterMoved = moveEditorV6ElementInPeriod(later.document, later.blockId, -20, 0)
    const earlier = prepareEditorV6PositionAtFrame(laterMoved, id, 90)!
    const result = moveEditorV6ElementInPeriod(earlier.document, earlier.blockId, 20, 0)
    expect(resolveEditorV6SceneAtFrame(result, 89).elements[0].x).toBe(20)
    expect(resolveEditorV6SceneAtFrame(result, 150).elements[0].x).toBe(20)
    expect(resolveEditorV6SceneAtFrame(result, 240).elements[0].x).toBe(20)
    expect(prepareEditorV6PositionAtFrame(result, id, 90)!.blockId).toBe(earlier.blockId)
    expect(timelineClips(result.timeline)).toHaveLength(3)
  })

  it('não modifica o documento ao preparar um clique ou gesto cancelado', () => {
    const document = fixture(), before = JSON.stringify(document)
    const prepared = prepareEditorV6PositionAtFrame(document, document.elements[0].id, 299)!
    expect(prepared.document.timeline.durationFrames).toBe(300)
    moveEditorV6ElementInPeriod(prepared.document, prepared.blockId, 30, 5)
    expect(JSON.stringify(document)).toBe(before)
  })

  it('agrupa atualizações de arraste em uma única entrada de desfazer e refazer', () => {
    const before = fixture(), operation = prepareEditorV6PositionAtFrame(before, before.elements[0].id, 120)!
    let live = operation.document
    for (const x of [5, 10, 15, 20]) live = moveEditorV6ElementInPeriod(live, operation.blockId, x, 0)
    const history = recordEditorV6History({ undo: [], redo: [] }, before)
    const undone = undoEditorV6History(history, live)!
    expect(undone.history.undo).toHaveLength(0)
    expect(undone.document.timeline).toEqual(before.timeline)
    const redone = redoEditorV6History(undone.history, undone.document)!
    expect(resolveEditorV6SceneAtFrame(redone.document, 120).elements[0].x).toBe(20)
    expect(redone.history.undo).toHaveLength(1)
  })

  it('respeita bloqueio de posição e de faixa', () => {
    const document = fixture()
    document.timeline.tracks.find((track) => track.kind === 'character')!.blocks[0].state!.positionLocked = true
    expect(prepareEditorV6PositionAtFrame(document, document.elements[0].id, 90)).toBeNull()
    const locked = fixture()
    locked.timeline.tracks.find((track) => track.kind === 'character')!.locked = true
    expect(prepareEditorV6PositionAtFrame(locked, locked.elements[0].id, 90)).toBeNull()
    locked.timeline.tracks.find((track) => track.kind === 'video')!.locked = true
    expect(editEditorV6BackgroundAtFrame(locked, 90, { backgroundColor: '#ff0000' })).toBe(locked)
  })

  it('reconstrói fundos persistentes e os mantém depois de salvar e reabrir o JSON', () => {
    const original = fixture()
    const first = editEditorV6BackgroundAtFrame(original, 90, { backgroundColor: '#0000ff' })
    const second = editEditorV6BackgroundAtFrame(first, 150, { backgroundColor: '#00ff00', backgroundX: 10 })
    const reopened = parseEditorV6Document(JSON.parse(JSON.stringify(second)))
    expect(resolveEditorV6SceneAtFrame(reopened, 200).background).toMatchObject({ backgroundColor: '#00ff00', backgroundX: 10 })
    expect(resolveEditorV6SceneAtFrame(reopened, 100).background.backgroundColor).toBe('#0000ff')
    expect(resolveEditorV6SceneAtFrame(reopened, 30).background.backgroundColor).toBe('#ffffff')
    expect(original.backgroundColor).toBe('#ffffff')
    expect(timelineClips(reopened.timeline).filter(({ block }) => block.background).map(({ block }) => block.durationFrames)).toEqual([60, 150])
  })

  it('ajusta o limite dos comentários quando outro fundo inicia dentro do período', () => {
    let document = editEditorV6BackgroundAtFrame(fixture(), 0, { backgroundColor: '#0000ff' })
    const parentId = timelineClips(document.timeline).find(({ block }) => block.background)!.block.id
    document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks.push({ id: crypto.randomUUID(), label: 'Fala', startFrame: 80, durationFrames: 100, relativeStartFrame: 80, parentBlockId: parentId })
    document = editEditorV6BackgroundAtFrame(document, 90, { backgroundColor: '#00ff00' })
    const comment = document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks[0]
    expect(comment.durationFrames).toBe(10)
    expect(() => parseEditorV6Document(document)).not.toThrow()
    const first = timelineClips(document.timeline).find(({ block }) => block.id === parentId)!
    document = { ...document, timeline: setEditorV6BlockTiming(document.timeline, first.block.id, { durationFrames: 120 }) }
    expect(timelineClips(document.timeline).find(({ block }) => block.background && block.id !== parentId)!.block.startFrame).toBe(120)
  })

  it('usa o último quadro válido ao posicionar o cursor no fim do projeto', () => {
    const scene = resolveEditorV6SceneAtFrame(fixture(), 300)
    expect(scene.frame).toBe(299)
    expect(scene.elements).toHaveLength(1)
  })
})
