import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, syncEditorV6TimelineElements, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, normalizeEditorV6Timeline, duplicateEditorV6Block, repairEditorV6DuplicateAssets, resolveEditorV6ElementsAtFrame, setEditorV6BlockTiming, snapEditorV6Frame, splitEditorV6Block, timelineClips } from '../../src/shared/editorV6Timeline'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'

function fixture(): EditorV6Document {
  const assetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Timeline', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
}
const actorClip = (document: EditorV6Document) => timelineClips(document.timeline).find(({ track }) => track.kind === 'character')!

describe('timeline do Editor V6', () => {
  it('insere uma fala no cursor com texto independente e preserva a precisão de quadros', () => {
    const document = fixture()
    const speech = { ...document.elements[0], id: crypto.randomUUID(), kind: 'speech' as const, characterId: undefined, assetId: undefined, text: 'Olá' }
    const next = addEditorV6ElementAtFrame(document, speech, 90)
    expect(resolveEditorV6ElementsAtFrame(next, 89).some((element) => element.id === speech.id)).toBe(false)
    expect(resolveEditorV6ElementsAtFrame(next, 90).find((element) => element.id === speech.id)?.text).toBe('Olá')
    expect(editorV6DocumentSchema.safeParse(next).success).toBe(true)
  })

  it('restaura o evento sobreposto mais antigo quando o mais recente termina', () => {
    const document = fixture(), element = { ...document.elements[0], id: crypto.randomUUID(), kind: 'speech' as const, characterId: undefined, assetId: undefined, text: 'Primeiro' }
    let next = addEditorV6ElementAtFrame(document, element, 0)
    const speechTrack = next.timeline.tracks.find((track) => track.kind === 'speech')!
    next = { ...next, timeline: { ...next.timeline, tracks: next.timeline.tracks.map((track) => track.id === speechTrack.id ? { ...track, blocks: [...track.blocks, { ...track.blocks[0], id: crypto.randomUUID(), startFrame: 30, durationFrames: 30, state: { ...element, text: 'Segundo' } }] } : track) } }
    expect(resolveEditorV6ElementsAtFrame(next, 45).find((item) => item.id === element.id)?.text).toBe('Segundo')
    expect(resolveEditorV6ElementsAtFrame(next, 75).find((item) => item.id === element.id)?.text).toBe('Primeiro')
  })

  it('recupera imagens com ID duplicado sem descartar a imagem de nenhum período', () => {
    const document = fixture(), clip = actorClip(document)
    document.assets.push({ ...document.assets[0], timelineSnapshot: true, dataUrl: 'data:image/png;base64,AQ==' })
    const repaired = repairEditorV6DuplicateAssets(document, clip.block.id)
    expect(repaired.assets).toHaveLength(2)
    expect(new Set(repaired.assets.map((asset) => asset.id)).size).toBe(2)
    const image = resolveEditorV6ElementsAtFrame(repaired, 30)[0].assetId
    expect(repaired.assets.find((asset) => asset.id === image)?.dataUrl).toBe('data:image/png;base64,AQ==')
    expect(editorV6DocumentSchema.safeParse(repaired).success).toBe(true)
  })

  it('preserva dois períodos do mesmo personagem na sincronização e ao salvar JSON', () => {
    const document = fixture(), id = actorClip(document).block.id
    document.timeline = splitEditorV6Block(document.timeline, id, 90)
    document.timeline = normalizeEditorV6Timeline(syncEditorV6TimelineElements(document.timeline, document.elements))
    expect(actorClip(document).track.blocks).toHaveLength(2)
    expect(actorClip(document).track.blocks.map((block) => block.durationFrames)).toEqual([90, 210])
    expect(editorV6DocumentSchema.safeParse(JSON.parse(JSON.stringify(document))).success).toBe(true)
  })

  it('reconstrói o estado ao saltar para qualquer quadro sem reproduzir desde o início', () => {
    const document = fixture(), original = actorClip(document)
    document.timeline = splitEditorV6Block(document.timeline, original.block.id, 90)
    const secondId = actorClip(document).track.blocks[1].id
    const edited = editEditorV6DocumentAtBlock(document, secondId, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, x: 25, poseSlot: 3 })) }))
    expect(resolveEditorV6ElementsAtFrame(edited, 150)[0]).toMatchObject({ x: 25, poseSlot: 3 })
    expect(resolveEditorV6ElementsAtFrame(edited, 45)[0].x).toBe(0)
    expect(resolveEditorV6ElementsAtFrame(edited, 90)[0].x).toBe(25)
    expect(edited.elements[0].x).toBe(0)
  })

  it('mantém a imagem da pose anterior ao editar a imagem de outro período', () => {
    const document = fixture(), original = actorClip(document)
    document.timeline = splitEditorV6Block(document.timeline, original.block.id, 90)
    const second = actorClip(document).track.blocks[1]
    const edited = editEditorV6DocumentAtBlock(document, second.id, (working) => ({ ...working, assets: working.assets.map((asset) => ({ ...asset, dataUrl: 'data:image/png;base64,AQ==' })) }))
    const early = resolveEditorV6ElementsAtFrame(edited, 30)[0], late = resolveEditorV6ElementsAtFrame(edited, 100)[0]
    expect(early.assetId).not.toBe(late.assetId)
    expect(edited.assets.find((asset) => asset.id === early.assetId)?.dataUrl).toBe('data:image/png;base64,AA==')
    expect(edited.assets.find((asset) => asset.id === late.assetId)?.dataUrl).toBe('data:image/png;base64,AQ==')
    expect(editorV6DocumentSchema.safeParse(edited).success).toBe(true)
    const editedAgain = editEditorV6DocumentAtBlock(edited, second.id, (working) => ({ ...working, assets: working.assets.map((asset) => asset.id === late.assetId ? { ...asset, dataUrl: 'data:image/png;base64,Ag==' } : asset) }))
    expect(new Set(editedAgain.assets.map((asset) => asset.id)).size).toBe(editedAgain.assets.length)
    expect(editedAgain.assets.find((asset) => asset.id === resolveEditorV6ElementsAtFrame(editedAgain, 100)[0].assetId)?.dataUrl).toBe('data:image/png;base64,Ag==')
    expect(editedAgain.assets.find((asset) => asset.id === early.assetId)?.dataUrl).toBe('data:image/png;base64,AA==')
  })

  it('rejeita edições do estado bloqueado e permite desbloquear a faixa', () => {
    const document = fixture(), clip = actorClip(document)
    clip.track.locked = true
    expect(editEditorV6DocumentAtBlock(document, clip.block.id, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, x: 20 })) }))).toBe(document)
    const unlocked = editEditorV6DocumentAtBlock(document, clip.block.id, (working) => ({ ...working, timeline: { ...working.timeline, tracks: working.timeline.tracks.map((track) => ({ ...track, locked: false })) } }))
    expect(actorClip(unlocked).track.locked).toBe(false)
  })

  it('não recria o último bloco excluído nem mostra personagem sem período', () => {
    const document = fixture()
    document.timeline.tracks = document.timeline.tracks.map((track) => ({ ...track, blocks: [] }))
    document.timeline = syncEditorV6TimelineElements(document.timeline, document.elements)
    expect(actorClip(document)).toBeUndefined()
    expect(resolveEditorV6ElementsAtFrame(document, 30)).toEqual([])
  })

  it('ajusta a fronteira entre estados com pelo menos um quadro de cada lado', () => {
    const document = fixture(), clip = actorClip(document)
    let timeline = splitEditorV6Block(document.timeline, clip.block.id, 100)
    const secondId = timelineClips(timeline).find(({ block }) => block.startFrame === 100)!.block.id
    timeline = setEditorV6BlockTiming(timeline, secondId, { startFrame: 0 })
    expect(timelineClips(timeline).find(({ block }) => block.id === secondId)?.block.startFrame).toBe(1)
    timeline = setEditorV6BlockTiming(timeline, clip.block.id, { durationFrames: 80 })
    expect(timelineClips(timeline).find(({ block }) => block.id === secondId)?.block.startFrame).toBe(80)
    expect(timelineClips(timeline).find(({ block }) => block.id === clip.block.id)?.block.durationFrames).toBe(80)
  })

  it('duplica períodos sem perder o vínculo ao personagem', () => {
    const document = fixture(), clip = actorClip(document)
    document.timeline = duplicateEditorV6Block(document.timeline, clip.block.id)
    document.timeline = syncEditorV6TimelineElements(document.timeline, document.elements)
    expect(actorClip(document).track.blocks).toHaveLength(2)
    expect(document.timeline.durationFrames).toBe(600)
    expect(actorClip(document).track.blocks[1].elementId).toBe(document.elements[0].id)
  })

  it('aplica magnetismo às duas bordas respeitando quadros inteiros', () => {
    const document = fixture(), id = actorClip(document).block.id
    expect(snapEditorV6Frame(document.timeline, 88, 90, id, 3).frame).toBe(90)
    expect(snapEditorV6Frame(document.timeline, 88, 90, id, 1).frame).toBe(88)
    expect(snapEditorV6Frame(document.timeline, 89, 120, id, 2, 30).frame).toBe(90)
  })

  it('oculta estados por período e por faixa', () => {
    const document = fixture(), clip = actorClip(document)
    const hiddenState = editEditorV6DocumentAtBlock(document, clip.block.id, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, visible: false })) }))
    expect(resolveEditorV6ElementsAtFrame(hiddenState, 20)).toEqual([])
    const hiddenTrack = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, hidden: true })) } }
    expect(resolveEditorV6ElementsAtFrame(hiddenTrack, 20)).toEqual([])
  })

  it('move e divide comentários relativos junto com o visual', () => {
    const document = fixture()
    const visualId = crypto.randomUUID(), commentId = crypto.randomUUID()
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks = [{ id: visualId, label: 'Visual', startFrame: 30, durationFrames: 150 }]
    document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks = [{ id: commentId, label: 'Comentário', startFrame: 60, durationFrames: 90, parentBlockId: visualId, relativeStartFrame: 30 }]
    let timeline = setEditorV6BlockTiming(document.timeline, visualId, { startFrame: 90 })
    expect(timelineClips(timeline).find(({ block }) => block.id === commentId)?.block.startFrame).toBe(120)
    timeline = splitEditorV6Block(timeline, visualId, 150)
    const comments = timeline.tracks.find((track) => track.kind === 'speech')!.blocks
    expect(comments).toHaveLength(2)
    expect(comments.map((block) => block.durationFrames)).toEqual([30, 60])
    expect(comments[0].parentBlockId).not.toBe(comments[1].parentBlockId)
    expect(editorV6DocumentSchema.safeParse({ ...document, timeline }).success).toBe(true)
  })
})
