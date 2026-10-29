import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, syncEditorV6TimelineElements, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, isEditorV6BlinkFrame, normalizeEditorV6Timeline, duplicateEditorV6Block, repairEditorV6DuplicateAssets, repairEditorV6FaceModeAssetReferences, resolveEditorV6ElementsAtFrame, resolveEditorV6SceneAtFrame, setEditorV6BlockTiming, snapEditorV6Frame, splitEditorV6Block, timelineClips } from '../../src/shared/editorV6Timeline'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'

function fixture(): EditorV6Document {
  const assetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Timeline', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
}
const actorClip = (document: EditorV6Document) => timelineClips(document.timeline).find(({ track }) => track.kind === 'character')!

describe('timeline do Editor V6', () => {
  it('aciona talk apenas durante falas e agenda piscadas determinísticas por personagem', () => {
    const document = fixture(), actor = document.elements[0]
    const blinkId = crypto.randomUUID(), talkId = crypto.randomUUID(), combinedId = crypto.randomUUID()
    document.assets.push(
      { id: blinkId, category: 'character', name: 'Alice · blink', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true },
      { id: talkId, category: 'character', name: 'Alice · talk', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true },
      { id: combinedId, category: 'character', name: 'Alice · talk-blink', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true }
    )
    document.elements[0] = { ...actor, faceModeAssetIds: { blink: blinkId, talk: talkId, 'talk-blink': combinedId } }
    const characterTrack = document.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.blocks = characterTrack.blocks.map((block) => ({ ...block, state: { ...actor, faceModeAssetIds: { blink: blinkId, talk: talkId, 'talk-blink': combinedId } } }))
    document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks = [{ id: crypto.randomUUID(), label: 'Fala de Alice', characterId: 'alice', startFrame: 0, durationFrames: 300 }]
    document.timeline.tracks.find((track) => track.kind === 'thought')!.blocks = [{ id: crypto.randomUUID(), label: 'Pensamento', characterId: 'alice', startFrame: 0, durationFrames: 300 }]
    const normalFrame = Array.from({ length: 300 }, (_, frame) => frame).find((frame) => !isEditorV6BlinkFrame(document.id, 'alice', frame))!
    expect(resolveEditorV6ElementsAtFrame(document, normalFrame)[0].assetId).toBe(talkId)
    expect(resolveEditorV6ElementsAtFrame(document, normalFrame, { includeMotion: false })[0].assetId).toBe(talkId)
    const blinkFrame = Array.from({ length: 300 }, (_, frame) => frame).find((frame) => isEditorV6BlinkFrame(document.id, 'alice', frame))!
    expect(resolveEditorV6ElementsAtFrame(document, blinkFrame)[0].assetId).toBe(combinedId)
    expect(isEditorV6BlinkFrame(document.id, 'alice', blinkFrame)).toBe(true)
    const noSpeech = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.kind === 'speech' ? [] : track.blocks })) } }
    expect(resolveEditorV6ElementsAtFrame(noSpeech, normalFrame)[0].assetId).toBe(actor.assetId)
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
  })

  it('vincula fala e pensamento ao personagem posicionado e só a fala aciona talk', () => {
    const document = fixture(), actor = document.elements[0]
    const talkId = crypto.randomUUID()
    document.assets.push({ id: talkId, category: 'character', name: 'Alice · talk', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true })
    document.elements[0] = { ...actor, faceModeAssetIds: { talk: talkId } }
    const characterTrack = document.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.blocks = characterTrack.blocks.map((block) => ({ ...block, state: { ...document.elements[0] } }))
    const speech = { id: crypto.randomUUID(), kind: 'speech' as const, characterId: 'alice', text: 'Olá', x: actor.x, y: actor.y, width: 28, height: 16, rotation: 0, zIndex: 2 }
    const withSpeech = addEditorV6ElementAtFrame(document, speech, 30)
    const speechBlock = withSpeech.timeline.tracks.find((track) => track.kind === 'speech')!.blocks[0]
    expect(speechBlock.state).toMatchObject({ characterId: 'alice', x: actor.x, y: actor.y })
    expect(resolveEditorV6ElementsAtFrame(withSpeech, 30).find((element) => element.kind === 'character')?.assetId).toBe(talkId)

    const thought = { ...speech, id: crypto.randomUUID(), kind: 'thought' as const, text: 'Pensando' }
    const withThought = addEditorV6ElementAtFrame({ ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => track.kind === 'speech' ? { ...track, blocks: [] } : track) } }, thought, 30)
    const thoughtBlock = withThought.timeline.tracks.find((track) => track.kind === 'thought')!.blocks[0]
    expect(thoughtBlock.state).toMatchObject({ characterId: 'alice', x: actor.x, y: actor.y })
    expect(resolveEditorV6ElementsAtFrame(withThought, 30).find((element) => element.kind === 'character')?.assetId).toBe(actor.assetId)
  })

  it('resolve vídeo importado no instante ativo e valida o vínculo do arquivo ao projeto', () => {
    const document = fixture(), videoId = crypto.randomUUID(), fileName = `${videoId}.mp4`
    document.media = [{ id: videoId, name: 'Cena.mp4', fileName, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: true, width: 1920, height: 1080, sizeBytes: 1024 }]
    const track = document.timeline.tracks.find((item) => item.kind === 'video')!
    track.blocks.push({ id: crypto.randomUUID(), label: 'Cena.mp4', mediaId: videoId, startFrame: 30, durationFrames: 90, mediaInFrame: 15, audioEnabled: true, gain: 1 })
    document.timeline.durationFrames = 300
    expect(resolveEditorV6SceneAtFrame(document, 29).mediaVideo).toBeUndefined()
    expect(resolveEditorV6SceneAtFrame(document, 45).mediaVideo).toMatchObject({ mediaId: videoId, startFrame: 30, sourceInFrame: 15, audioEnabled: true, layout: { x: 0, y: 0, width: 40, height: 40, rotation: 0 } })
    expect(resolveEditorV6SceneAtFrame(document, 120).mediaVideo).toBeUndefined()
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
  })

  it('resolve vídeo da Base pelo ID sem exigir cópia na pasta do projeto', () => {
    const document = fixture(), libraryId = crypto.randomUUID()
    document.media = [{ id: libraryId, libraryVideoId: libraryId, name: 'Compartilhado.mp4', fileName: `${libraryId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: true, width: 1280, height: 720, sizeBytes: 1024 }]
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Compartilhado.mp4', mediaId: libraryId, startFrame: 0, durationFrames: 90, audioEnabled: true }]
    const scene = resolveEditorV6SceneAtFrame(document, 10)
    expect(scene.mediaVideo?.url).toBe(`gacha-editor-media://library/${document.id}/${libraryId}`)
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
  })

  it('preserva a posição, o tamanho e a rotação do vídeo na cena e valida seus limites', () => {
    const document = fixture(), videoId = crypto.randomUUID()
    document.media = [{ id: videoId, name: 'Cena.mp4', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: false, sizeBytes: 1024 }]
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Cena.mp4', mediaId: videoId, startFrame: 0, durationFrames: 90, mediaLayout: { x: 12, y: -8, width: 55, height: 36, rotation: 15 } }]
    expect(resolveEditorV6SceneAtFrame(document, 10).mediaVideo?.layout).toEqual({ x: 12, y: -8, width: 55, height: 36, rotation: 15 })
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks[0].mediaLayout!.width = 0
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(false)
  })

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

  it('mantém a referência do personagem na imagem certa ao reparar IDs duplicados entre categorias', () => {
    const document = fixture(), original = document.assets[0]
    document.assets.unshift({ ...original, category: 'object', name: 'Objeto com ID duplicado' })
    const repaired = repairEditorV6DuplicateAssets(document, null)
    const character = repaired.elements[0]
    expect(repaired.assets.find((asset) => asset.id === character.assetId)?.category).toBe('character')
    expect(editorV6DocumentSchema.safeParse(repaired).success).toBe(true)
  })

  it('aponta qual vínculo do personagem está inválido ao validar o projeto', () => {
    const document = fixture(), actor = document.elements[0]
    const missingImage = editorV6DocumentSchema.safeParse({ ...document, elements: [{ ...actor, assetId: crypto.randomUUID() }] })
    const missingSource = editorV6DocumentSchema.safeParse({ ...document, elements: [{ ...actor, characterId: undefined }] })
    expect(missingImage.success).toBe(false)
    expect(missingImage.error.issues.map((issue) => issue.path)).toContainEqual(['elements', 0, 'assetId'])
    expect(missingSource.success).toBe(false)
    expect(missingSource.error.issues.map((issue) => issue.path)).toContainEqual(['elements', 0, 'characterId'])
  })

  it('remove referências faciais órfãs sem apagar modos cujos assets continuam válidos', () => {
    const document = fixture(), actor = document.elements[0], clip = actorClip(document)
    const blinkId = crypto.randomUUID()
    document.assets.push({ id: blinkId, category: 'character', name: 'Alice · blink', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true })
    const withStaleReferences = {
      ...document,
      elements: [{ ...actor, faceModeAssetIds: { idle: actor.assetId!, blink: blinkId, talk: crypto.randomUUID(), 'talk-blink': crypto.randomUUID() } }],
      timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => track.id === clip.track.id ? { ...track, blocks: track.blocks.map((block) => ({ ...block, state: { ...actor, faceModeAssetIds: { idle: actor.assetId!, blink: blinkId, talk: crypto.randomUUID() } } })) } : track) }
    }
    const repaired = repairEditorV6FaceModeAssetReferences(withStaleReferences)
    expect(repaired.elements[0].faceModeAssetIds).toEqual({ idle: actor.assetId, blink: blinkId })
    expect(actorClip(repaired).block.state?.faceModeAssetIds).toEqual({ idle: actor.assetId, blink: blinkId })
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

  it('compartilha posição ao saltar e mantém os demais estados por bloco', () => {
    const document = fixture(), original = actorClip(document)
    document.timeline = splitEditorV6Block(document.timeline, original.block.id, 90)
    const secondId = actorClip(document).track.blocks[1].id
    const edited = editEditorV6DocumentAtBlock(document, secondId, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, x: 25, poseSlot: 3 })) }))
    expect(resolveEditorV6ElementsAtFrame(edited, 150)[0]).toMatchObject({ x: 25, poseSlot: 3 })
    expect(resolveEditorV6ElementsAtFrame(edited, 45)[0].x).toBe(25)
    expect(resolveEditorV6ElementsAtFrame(edited, 90)[0].x).toBe(25)
    expect(edited.elements[0].x).toBe(25)
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
