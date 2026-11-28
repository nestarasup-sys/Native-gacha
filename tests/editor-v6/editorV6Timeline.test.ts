import { editorV6BlinkEventAtFrame } from '../../src/shared/editorV6FaceSchedule'
import { recordEditorV6History, redoEditorV6History, undoEditorV6History } from '../../src/shared/editorV6History'
import { pasteEditorV6CardBlock } from '../../src/shared/editorV6Cards'
import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, syncEditorV6TimelineElements, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, editorV6HasDuplicateAssetIds, normalizeEditorV6Timeline, duplicateEditorV6Block, repairEditorV6DuplicateAssets, repairEditorV6FaceModeAssetReferences, resolveEditorV6ElementsAtFrame, resolveEditorV6SceneAtFrame, setEditorV6BlockTiming, snapEditorV6Frame, splitEditorV6Block, timelineClips } from '../../src/shared/editorV6Timeline'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { exportEditorV6React } from '../../src/shared/editorV6ReactExport'
import { editorV6VisualKeys } from '../../src/shared/editorV6Export'
import { editorV6VideoPresentationImportSchema, editorV6VideoPresentationSchema } from '../../src/shared/editorV6VideoPresentation'
import { attachEditorV6Motion, editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { editorV6CardMatchesVideo } from '../../src/shared/editorV6Cards'
import { duplicateEditorV6ProjectDocument } from '../../src/renderer/src/features/editorV6/editorV6ProjectDuplication'

function fixture(): EditorV6Document {
  const assetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Timeline', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
}
const actorClip = (document: EditorV6Document) => timelineClips(document.timeline).find(({ track }) => track.kind === 'character')!

describe('timeline do Editor V6', () => {
  it('detecta IDs de assets repetidos sem montar array temporário', () => {
    expect(editorV6HasDuplicateAssetIds([{ id: 'asset-a' }, { id: 'asset-b' }])).toBe(false)
    expect(editorV6HasDuplicateAssetIds([{ id: 'asset-a' }, { id: 'asset-a' }])).toBe(true)
  })

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
    const normalFrame = Array.from({ length: 300 }, (_, frame) => frame).find((frame) => !Boolean(editorV6BlinkEventAtFrame(document.id, frame)))!
    expect(resolveEditorV6ElementsAtFrame(document, normalFrame)[0].assetId).toBe(talkId)
    expect(resolveEditorV6ElementsAtFrame(document, normalFrame, { includeMotion: false })[0].assetId).toBe(talkId)
    const blinkFrame = Array.from({ length: 300 }, (_, frame) => frame).find((frame) => Boolean(editorV6BlinkEventAtFrame(document.id, frame)))!
    expect(resolveEditorV6ElementsAtFrame(document, blinkFrame)[0].assetId).toBe(combinedId)
    expect(Boolean(editorV6BlinkEventAtFrame(document.id, blinkFrame))).toBe(true)
    const noSpeech = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.kind === 'speech' ? [] : track.blocks })) } }
    expect(resolveEditorV6ElementsAtFrame(noSpeech, normalFrame)[0].assetId).toBe(actor.assetId)
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
  })

  it('preserva o asset base quando o personagem só tem uma referência facial idle', () => {
    const document = fixture(), actor = document.elements[0], idleId = crypto.randomUUID()
    document.assets.push({ id: idleId, category: 'character', name: 'Alice · idle', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true })
    const state = { ...actor, faceModeAssetIds: { idle: idleId } }
    document.elements[0] = state
    document.timeline.tracks.find((track) => track.kind === 'character')!.blocks = [{
      id: crypto.randomUUID(), elementId: actor.id, label: actor.text, startFrame: 0, durationFrames: 300, state
    }]
    document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks = [{
      id: crypto.randomUUID(), elementId: crypto.randomUUID(), label: 'Fala de Alice', characterId: actor.characterId, startFrame: 0, durationFrames: 300
    }]
    const blinkFrame = Array.from({ length: 300 }, (_, frame) => frame).find((frame) => Boolean(editorV6BlinkEventAtFrame(document.id, frame)))!

    expect(resolveEditorV6ElementsAtFrame(document, blinkFrame)[0].assetId).toBe(actor.assetId)
    expect(resolveEditorV6ElementsAtFrame(document, 30)[0].assetId).toBe(actor.assetId)
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

  it('mantém o alvo explícito e o personagem mais próximo quando há cópias do mesmo personagem', () => {
    const document = fixture(), actor = document.elements[0]
    const nearbyActor: EditorV6Element = { ...actor, id: crypto.randomUUID(), text: 'Cópia próxima', x: 100, zIndex: 2 }
    document.elements.push(nearbyActor)
    const characterTrack = document.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.blocks.push({ id: crypto.randomUUID(), elementId: nearbyActor.id, label: nearbyActor.text, startFrame: 0, durationFrames: 300, state: nearbyActor })

    const nearestLinkedSpeech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId: actor.characterId, text: 'Mais perto', x: 95, y: 0, width: 28, height: 16, rotation: 0, zIndex: 3 }
    const exactLinkedThought: EditorV6Element = { ...nearestLinkedSpeech, id: crypto.randomUUID(), kind: 'thought', text: 'Vínculo exato', attachedCharacterElementId: actor.id }
    document.elements.push(nearestLinkedSpeech, exactLinkedThought)
    const speechTrack = document.timeline.tracks.find((track) => track.kind === 'speech')!
    const thoughtTrack = document.timeline.tracks.find((track) => track.kind === 'thought')!
    speechTrack.blocks = [{ id: crypto.randomUUID(), elementId: nearestLinkedSpeech.id, label: nearestLinkedSpeech.text, startFrame: 0, durationFrames: 60, state: nearestLinkedSpeech }]
    thoughtTrack.blocks = [{ id: crypto.randomUUID(), elementId: exactLinkedThought.id, label: exactLinkedThought.text, startFrame: 0, durationFrames: 60, state: exactLinkedThought }]

    const resolved = resolveEditorV6ElementsAtFrame(document, 1)
    expect(resolved.find((element) => element.kind === 'speech')?.speakerName).toBe('Cópia próxima')
    expect(resolved.find((element) => element.kind === 'thought')?.speakerName).toBe('Alice')
    const linkedSpeech = resolved.find((element) => element.kind === 'speech')!
    expect(linkedSpeech.speakerAnchorX).toBeGreaterThan(0)
    expect(linkedSpeech.speakerAnchorY).toBeLessThan(0)
  })

  it('mantém fala e pensamento ancorados à geometria lógica enquanto o recorte animado varia', () => {
    const document = fixture(), actor = document.elements[0]
    const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId: actor.characterId,
      attachedCharacterElementId: actor.id, attachmentOriginX: actor.x, attachmentOriginY: actor.y,
      text: 'Fala estável', x: actor.x, y: actor.y, width: 28, height: 16, rotation: 0, zIndex: 2 }
    const thought: EditorV6Element = { ...speech, id: crypto.randomUUID(), kind: 'thought', text: 'Pensamento estável', y: actor.y + 20, zIndex: 3 }
    document.elements.push(speech, thought)
    document.timeline.tracks.find(track => track.kind === 'speech')!.blocks = [{
      id: crypto.randomUUID(), elementId: speech.id, label: speech.text, startFrame: 0, durationFrames: 300, state: speech
    }]
    document.timeline.tracks.find(track => track.kind === 'thought')!.blocks = [{
      id: crypto.randomUUID(), elementId: thought.id, label: thought.text, startFrame: 0, durationFrames: 300, state: thought
    }]
    const characterTrack = document.timeline.tracks.find(track => track.kind === 'character')!
    const firstBlock = characterTrack.blocks[0]
    document.timeline = splitEditorV6Block(document.timeline, firstBlock.id, 90)
    const transitionBlock = document.timeline.tracks.find(track => track.kind === 'character')!.blocks[1]
    transitionBlock.state = { ...actor, poseSlot: 2 }
    const plan = editorV6MotionPlans(document)[0]
    const assetId = crypto.randomUUID()
    const frames = plan.samples.map((sample, index) => ({
      offset: sample.offset,
      // Every crop has different visible bounds, simulating pose/expression alpha changes.
      sprite: { x: 0, y: index * 120, width: 80 + index * 7, height: 100 + index * 13, atlasWidth: 122, atlasHeight: plan.samples.length * 120 },
      x: actor.x, y: actor.y, width: 20 + index * 3, height: 30 + index * 5, rotation: index * 2, flipX: false
    }))
    const ready = attachEditorV6Motion(document, transitionBlock.id, {
      asset: { id: assetId, category: 'character', name: 'Atlas variável', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQ==', timelineSnapshot: true },
      motion: { version: 1, key: plan.key, assetId, frames }
    })
    const snapshots = plan.samples.map(sample => {
      const frame = plan.endFrame + sample.offset
      const elements = resolveEditorV6ElementsAtFrame(ready, frame)
      return [speech, thought].map(source => {
        const linked = elements.find(element => element.id === source.id)!
        return { x: linked.x, y: linked.y, layout: linked.balloonLayout, anchorX: linked.speakerAnchorX, anchorY: linked.speakerAnchorY }
      })
    })

    expect(snapshots.length).toBeGreaterThan(1)
    for (const snapshot of snapshots.slice(1)) expect(snapshot).toEqual(snapshots[0])
  })

  it('recria o índice de snapshots-base quando a lista de elementos é substituída', () => {
    const document = fixture(), actor = document.elements[0]
    document.timeline.tracks.find((track) => track.kind === 'character')!.blocks = [{
      id: crypto.randomUUID(), elementId: actor.id, label: 'Posição posterior', startFrame: 50, durationFrames: 250, state: { ...actor, x: 50 }
    }]
    const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId: actor.characterId, attachedCharacterElementId: actor.id, text: 'Olá', x: 20, y: 0, width: 28, height: 16, rotation: 0, zIndex: 2 }
    document.elements.push(speech)
    document.timeline.tracks.find((track) => track.kind === 'speech')!.blocks = [{ id: crypto.randomUUID(), elementId: speech.id, label: speech.text, startFrame: 0, durationFrames: 300, state: speech }]
    expect(resolveEditorV6ElementsAtFrame(document, 60).find((element) => element.kind === 'speech')?.x).toBe(70)

    const updatedDocument = { ...document, elements: [{ ...actor, x: 10 }, speech] }
    expect(resolveEditorV6ElementsAtFrame(updatedDocument, 60).find((element) => element.kind === 'speech')?.x).toBe(60)
  })

  it('aplica a escala de balões do projeto a todas as falas e mantém documentos antigos válidos', () => {
    const document = fixture(), actor = document.elements[0]
    const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId: actor.characterId, attachedCharacterElementId: actor.id, attachmentOriginX: actor.x, attachmentOriginY: actor.y, text: 'Olá', x: actor.x, y: actor.y, width: 28, height: 16, rotation: 0, zIndex: 2 }
    const thought: EditorV6Element = { ...speech, id: crypto.randomUUID(), kind: 'thought', text: 'Pensando' }
    const withSpeech = addEditorV6ElementAtFrame(document, speech, 30)
    const withBoth = addEditorV6ElementAtFrame(withSpeech, thought, 30)
    withBoth.balloonScalePercent = 145
    withBoth.balloonOffsetY = -12

    const elements = resolveEditorV6ElementsAtFrame(withBoth, 30)
    expect(elements.find((element) => element.kind === 'speech')).toMatchObject({ balloonScalePercent: 145, balloonOffsetY: -12 })
    expect(elements.find((element) => element.kind === 'thought')).toMatchObject({ balloonScalePercent: 145, balloonOffsetY: -12 })
    expect(editorV6DocumentSchema.safeParse(withBoth).success).toBe(true)
    expect(editorV6DocumentSchema.safeParse({ ...withBoth, balloonScalePercent: 251 }).success).toBe(false)
    expect(editorV6DocumentSchema.safeParse({ ...withBoth, balloonOffsetY: 101 }).success).toBe(false)
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
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

  it('pode omitir a resolução do vídeo sem alterar os elementos da cena', () => {
    const document = fixture(), videoId = crypto.randomUUID()
    document.media = [{ id: videoId, name: 'Cena.mp4', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: true, width: 1920, height: 1080, sizeBytes: 1024 }]
    document.timeline.tracks.find((item) => item.kind === 'video')!.blocks.push({ id: crypto.randomUUID(), label: 'Cena.mp4', mediaId: videoId, startFrame: 30, durationFrames: 90 })

    const complete = resolveEditorV6SceneAtFrame(document, 45)
    const withoutVideo = resolveEditorV6SceneAtFrame(document, 45, { includeVideo: false })

    expect(complete.mediaVideo?.mediaId).toBe(videoId)
    expect(withoutVideo.mediaVideo).toBeUndefined()
    expect(withoutVideo.elements).toEqual(complete.elements)
    expect(withoutVideo.background).toEqual(complete.background)
  })

  it('salva e reexporta a apresentação do vídeo e mantém os limites de quadros', () => {
    const document = fixture(), videoId = crypto.randomUUID()
    document.media = [{ id: videoId, libraryVideoId: videoId, name: 'Cena.mp4', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: false, width: 1080, height: 1920, sizeBytes: 1024 }]
    const track = document.timeline.tracks.find(item => item.kind === 'video')!
    const presentation = { timeCard: 'Indecipherable', bottomCard: 'Contexto', loadingGif: true } as const
    const block = { id: crypto.randomUUID(), label: 'Cena', mediaId: videoId, mediaInFrame: 0, startFrame: 120, durationFrames: 60, videoPresentation: presentation }
    track.blocks.push(block)
    document.timeline.durationFrames = 300
    const saved = editorV6DocumentSchema.parse(JSON.parse(JSON.stringify(document)))
    expect(exportEditorV6React(saved).data.videos[0].presentation).toEqual(presentation)
    const at = (frame: number) => resolveEditorV6SceneAtFrame(saved, frame, { includeVideo: false, includeVideoPresentation: true })
    expect(at(29).loadingGifFrame).toBeUndefined()
    expect(at(30).loadingGifFrame).toBe(0)
    expect(at(39).loadingGifFrame).toBe(1)
    expect(at(119).loadingGifFrame).toBe(1)
    expect(at(120).loadingGifFrame).toBeUndefined()
    expect(at(120).mediaVideo).toBeUndefined()
    expect(at(120).videoCards).toMatchObject({ aspect: 1080 / 1920, timeCard: 'Indecipherable', bottomCard: 'Contexto' })
    expect(at(180).videoCards).toBeUndefined()
    const split = splitEditorV6Block(saved.timeline, block.id, 150)
    const blocks = split.tracks.find(item => item.kind === 'video')!.blocks
    expect(blocks[1].videoPresentation).toEqual({ loadingGif: false })
    expect(resolveEditorV6SceneAtFrame({ ...saved, timeline: split }, 145).loadingGifFrame).toBeUndefined()
  })

  it('mostra cards nos intervalos pedidos e preserva o tempo ao dividir o clipe', () => {
    const document = fixture(), videoId = crypto.randomUUID()
    document.media = [{ id: videoId, libraryVideoId: videoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 600, hasAudio: false, width: 1920, height: 1080, sizeBytes: 100 }]
    const block = { id: crypto.randomUUID(), label: 'Cena', mediaId: videoId, mediaInFrame: 0, startFrame: 60, durationFrames: 600,
      videoPresentation: { bottomCards: [{ startSeconds: 10, endSeconds: 15, text: 'Primeiro' }, { startSeconds: 16, endSeconds: 20, text: 'Segundo' }],
        timeCards: [{ startSeconds: 0, endSeconds: 15, text: 'Past' as const }, { startSeconds: 15, endSeconds: 20, text: 'Future' as const }] } }
    document.timeline.tracks.find(track => track.kind === 'video')!.blocks.push(block)
    document.timeline.durationFrames = 660
    const saved = editorV6DocumentSchema.parse(JSON.parse(JSON.stringify(document)))
    const card = (frame: number, timeline = saved.timeline) => resolveEditorV6SceneAtFrame({ ...saved, timeline }, frame).videoCards
    expect(card(359)?.bottomCard).toBeUndefined()
    expect(card(360)?.bottomCard).toBe('Primeiro')
    expect(card(510)?.bottomCard).toBeUndefined()
    expect(card(510)?.timeCard).toBe('Future')
    expect(card(540)?.bottomCard).toBe('Segundo')
    const split = splitEditorV6Block(saved.timeline, block.id, 420)
    expect(card(420, split)?.bottomCard).toBe('Primeiro')
    expect(card(510, split)?.timeCard).toBe('Future')
    expect(exportEditorV6React(saved).data.videos[0].presentation).toEqual(block.videoPresentation)
  })

  it('migra cards antigos para blocos independentes, edita seus tempos e exporta o roteiro compatível', () => {
    const document = fixture(), videoId = crypto.randomUUID(), blockId = crypto.randomUUID()
    document.media = [{ id: videoId, libraryVideoId: videoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 600, hasAudio: false, width: 1920, height: 1080, sizeBytes: 100 }]
    const video = { id: blockId, label: 'Cena', mediaId: videoId, startFrame: 60, durationFrames: 300,
      videoPresentation: { loadingGif: true, bottomCards: [{ startSeconds: 0, endSeconds: 5, text: 'Primeiro' }, { startSeconds: 5, endSeconds: 10, text: 'Segundo' }], timeCards: [{ startSeconds: 0, endSeconds: 10, text: 'Past' as const }] } }
    document.timeline.tracks.find(track => track.kind === 'video')!.blocks.push(video)
    document.timeline.durationFrames = 360

    const timeline = normalizeEditorV6Timeline(document.timeline)
    const cards = timeline.tracks.find(track => track.kind === 'card')!
    const migrated = { ...document, timeline }
    expect(timeline.tracks.findIndex(track => track.kind === 'card')).toBe(timeline.tracks.findIndex(track => track.kind === 'video') + 1)
    expect(timeline.tracks.find(track => track.kind === 'video')!.blocks[0].videoPresentation).toEqual({ loadingGif: true })
    expect(cards.blocks.map(block => [block.startFrame, block.durationFrames])).toEqual([[60, 300], [210, 150]])
    expect(resolveEditorV6SceneAtFrame(migrated, 209).videoCardItems?.map(card => card.text)).toEqual(expect.arrayContaining(['Past', 'Primeiro']))
    expect(resolveEditorV6SceneAtFrame(migrated, 210).videoCardItems?.map(card => card.text)).toEqual(expect.arrayContaining(['Past', 'Segundo']))
    expect(editorV6VisualKeys(resolveEditorV6SceneAtFrame(migrated, 209)).layerKeys.foreground).not.toBe(editorV6VisualKeys(resolveEditorV6SceneAtFrame(migrated, 210)).layerKeys.foreground)

    const secondCard = cards.blocks.find(block => block.videoCard && 'components' in block.videoCard && block.videoCard.components.portuguese.text === 'Segundo')!
    const changed = setEditorV6BlockTiming(timeline, secondCard.id, { startFrame: 330, durationFrames: 60 })
    expect(resolveEditorV6SceneAtFrame({ ...migrated, timeline: changed }, 330).videoCardItems?.map(card => card.text)).toContain('Segundo')
    expect(resolveEditorV6SceneAtFrame({ ...migrated, timeline: changed }, 360).videoCardItems).toBeUndefined()
    const persisted = editorV6DocumentSchema.parse({ ...migrated, timeline: changed })
    expect(exportEditorV6React(persisted).data.videos[0].presentation).toMatchObject({ loadingGif: true, cards: [
      { temporal: { startSeconds: 0, endSeconds: 10, text: 'Past', enabled: true },
        portuguese: { startSeconds: 0, endSeconds: 5, text: 'Primeiro', enabled: true } },
      { portuguese: { startSeconds: 9, endSeconds: 10, text: 'Segundo', enabled: true } }
    ] })
  })

  it('preserva o card bilíngue na ida e volta e isola divisão, duplicação e colagem', () => {
    const document = fixture(), videoId = crypto.randomUUID(), videoBlockId = crypto.randomUUID()
    document.media = [{ id: videoId, libraryVideoId: videoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 600, hasAudio: false, sizeBytes: 100 }]
    const video = { id: videoBlockId, label: 'Cena', mediaId: videoId, startFrame: 90, durationFrames: 360 }
    const presentation = editorV6VideoPresentationImportSchema.parse({ loadingGif: true, cards: [{
      startSeconds: 0, endSeconds: 8,
      temporal: { startSeconds: 0, endSeconds: 8, text: 'Future' },
      english: { startSeconds: 1, endSeconds: 6, text: 'Hello' },
      portuguese: { startSeconds: 4, endSeconds: 8, text: 'Olá', enabled: false }
    }] })
    const videoTrack = document.timeline.tracks.find(track => track.kind === 'video')!
    videoTrack.blocks = [{ ...video, videoPresentation: presentation }]
    document.timeline = normalizeEditorV6Timeline(document.timeline)
    const getCards = (timeline = document.timeline) => timeline.tracks.find(track => track.kind === 'card')!.blocks
    const [block] = getCards()
    expect(getCards()).toHaveLength(1)
    expect(exportEditorV6React(editorV6DocumentSchema.parse(document)).data.videos[0].presentation).toEqual(presentation)
    const at = (frame: number) => resolveEditorV6SceneAtFrame(document, frame, { includeVideo: false }).videoCardItems?.map(item => item.text)
    expect(at(120)).toEqual(expect.arrayContaining(['Hello', 'Future']))
    expect(at(270)).toEqual(['Future'])

    const split = splitEditorV6Block(document.timeline, block.id, 180)
    const divided = { ...document, timeline: split }
    const history = recordEditorV6History({ undo: [], redo: [] }, document)
    const undone = undoEditorV6History(history, divided)!
    expect(getCards(undone.document.timeline)).toEqual([block])
    expect(getCards(redoEditorV6History(undone.history, undone.document)!.document.timeline)).toEqual(getCards(split))
    const [left, right] = getCards(split)
    expect(left.id).not.toEqual(right.id)
    expect(left.videoCard).toMatchObject({ components: { english: { startFrame: 30, endFrame: 90 }, portuguese: { enabled: false, text: 'Olá' } } })
    expect(right.videoCard).toMatchObject({ components: { english: { startFrame: 0, endFrame: 90 }, portuguese: { startFrame: 30, endFrame: 150 } } })
    if (!right.videoCard || !('components' in right.videoCard)) throw Error('Card não unificado')
    right.videoCard.components.english.text = 'Other'
    expect(left.videoCard).toMatchObject({ components: { english: { text: 'Hello' } } })
    const duplicated = getCards(duplicateEditorV6Block(split, left.id)).at(-1)!
    const pasted = pasteEditorV6CardBlock({ ...document, timeline: split }, left, 280, crypto.randomUUID())!.block
    for (const copy of [duplicated, pasted]) {
      expect(copy.id).not.toBe(left.id)
      expect(copy.videoCard).toEqual(left.videoCard)
      expect(copy.videoCard).not.toBe(left.videoCard)
      if (!copy.videoCard || !('components' in copy.videoCard)) throw Error('Card não unificado')
      copy.videoCard.components.english.text = 'Copy'
      expect(left.videoCard).toMatchObject({ components: { english: { text: 'Hello' } } })
    }
  })

  it('exibe card apenas dentro do vídeo associado e limita intervalos legados ao fim do clipe', () => {
    const document = fixture(), videoId = crypto.randomUUID(), videoBlockId = crypto.randomUUID()
    document.media = [{ id: videoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 600, hasAudio: false, sizeBytes: 100 }]
    const videoTrack = document.timeline.tracks.find(track => track.kind === 'video')!
    videoTrack.blocks = [{ id: videoBlockId, label: 'Cena', mediaId: videoId, startFrame: 150, durationFrames: 300 }]
    const cardTrack = document.timeline.tracks.find(track => track.kind === 'card')!
    cardTrack.blocks = [{ id: crypto.randomUUID(), label: 'Contexto', startFrame: 300, durationFrames: 300,
      videoCard: { videoBlockId, position: 'bottom', text: 'Contexto', fallbackLayout: { x: 0, y: 0, width: 40, height: 40, rotation: 0 } } }]
    document.timeline.durationFrames = 600

    expect(resolveEditorV6SceneAtFrame(document, 299).videoCardItems).toBeUndefined()
    expect(resolveEditorV6SceneAtFrame(document, 300).videoCardItems?.[0].text).toBe('Contexto')
    expect(resolveEditorV6SceneAtFrame(document, 449).videoCardItems?.[0].text).toBe('Contexto')
    expect(resolveEditorV6SceneAtFrame(document, 450).videoCardItems).toBeUndefined()
    const mutedDocument = structuredClone(document)
    mutedDocument.timeline.tracks.find(track => track.kind === 'video')!.muted = true
    expect(resolveEditorV6SceneAtFrame(mutedDocument, 320).videoCardItems).toBeUndefined()

    const legacy = fixture()
    legacy.timeline.tracks.find(track => track.kind === 'video')!.blocks = [{ id: videoBlockId, label: 'Cena', startFrame: 150, durationFrames: 300,
      videoPresentation: { bottomCards: [{ startSeconds: 9, endSeconds: 12, text: 'Até o fim' }] } }]
    const migrated = normalizeEditorV6Timeline(legacy.timeline).tracks.find(track => track.kind === 'card')!.blocks[0]
    expect(migrated).toMatchObject({ startFrame: 420, durationFrames: 30 })
  })

  it('rejeita intervalos de card menores que um quadro e resolve limites com a conversão da timeline', () => {
    const subFrame = {
      bottomCards: [{ startSeconds: 0.01, endSeconds: 0.02, text: 'Curto demais' }]
    }
    expect(editorV6VideoPresentationImportSchema.safeParse(subFrame).success).toBe(false)
    // Persisted projects stay readable; the stricter rule applies only to new script imports.
    expect(editorV6VideoPresentationSchema.safeParse(subFrame).success).toBe(true)
    const legacyProject = fixture(), legacyVideoId = crypto.randomUUID()
    legacyProject.media = [{ id: legacyVideoId, name: 'Cena', fileName: `${legacyVideoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: false, sizeBytes: 1 }]
    legacyProject.timeline.tracks.find(track => track.kind === 'video')!.blocks.push({ id: crypto.randomUUID(), label: 'Cena', mediaId: legacyVideoId,
      startFrame: 0, durationFrames: 60, videoPresentation: subFrame })
    const parsedLegacy = editorV6DocumentSchema.safeParse(legacyProject)
    expect(parsedLegacy.success, JSON.stringify(parsedLegacy.success ? [] : parsedLegacy.error.issues)).toBe(true)

    const document = fixture(), videoId = crypto.randomUUID()
    document.media = [{ id: videoId, name: 'Cena', fileName: `${videoId}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 180, hasAudio: false, sizeBytes: 1 }]
    const block = { id: crypto.randomUUID(), label: 'Cena', mediaId: videoId, startFrame: 60, durationFrames: 90,
      videoPresentation: { bottomCards: [{ startSeconds: 0.01, endSeconds: 0.04, text: 'Um quadro' }] } }
    document.timeline.tracks.find(track => track.kind === 'video')!.blocks.push(block)
    document.timeline.durationFrames = 180

    expect(resolveEditorV6SceneAtFrame(document, 60).videoCards?.bottomCard).toBeUndefined()
    expect(resolveEditorV6SceneAtFrame(document, 61).videoCards?.bottomCard).toBe('Um quadro')
    expect(resolveEditorV6SceneAtFrame(document, 62).videoCards?.bottomCard).toBeUndefined()
  })

  it('atualiza o índice de vídeos quando a lista de mídia do projeto muda', () => {
    const document = fixture(), videoId = crypto.randomUUID()
    const media = { id: videoId, name: 'Cena.mp4', fileName: `${videoId}.mp4`, kind: 'video' as const, mimeType: 'video/mp4', sourceFrames: 180, hasAudio: true, width: 1920, height: 1080, sizeBytes: 1024 }
    document.media = [media]
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks = [{ id: crypto.randomUUID(), label: 'Cena.mp4', mediaId: videoId, startFrame: 0, durationFrames: 60 }]
    expect(resolveEditorV6SceneAtFrame(document, 1).mediaVideo?.layout).toMatchObject({ width: 40, height: 40 })

    const updatedMedia = [{ ...media, width: 720, height: 1280 }]
    const updatedDocument = { ...document, media: updatedMedia }
    expect(resolveEditorV6SceneAtFrame(updatedDocument, 1).mediaVideo?.layout).toMatchObject({ width: 12.6563, height: 40 })
  })

  it('mantém a prioridade do clipe de vídeo mais recente e respeita lacunas longas', () => {
    const document = fixture()
    const clips = [
      { id: 'video-a', startFrame: 0, durationFrames: 10 },
      { id: 'video-b', startFrame: 100, durationFrames: 20 },
      { id: 'video-c', startFrame: 105, durationFrames: 25 }
    ]
    document.media = clips.map(({ id }) => ({ id, name: id, fileName: `${id}.mp4`, kind: 'video' as const, mimeType: 'video/mp4', sourceFrames: 180, hasAudio: false, sizeBytes: 1024 }))
    document.timeline.tracks.find((track) => track.kind === 'video')!.blocks = clips.map(({ id, startFrame, durationFrames }) => ({ id: `block-${id}`, label: id, mediaId: id, startFrame, durationFrames }))

    expect(resolveEditorV6SceneAtFrame(document, 50).mediaVideo).toBeUndefined()
    expect(resolveEditorV6SceneAtFrame(document, 102).mediaVideo?.mediaId).toBe('video-b')
    expect(resolveEditorV6SceneAtFrame(document, 110).mediaVideo?.mediaId).toBe('video-c')
    expect(resolveEditorV6SceneAtFrame(document, 130).mediaVideo).toBeUndefined()
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

  it('divide e duplica blocos com estados aninhados independentes', () => {
    const document = fixture(), original = actorClip(document)
    const state = { ...original.block.state!, faceModeAssetIds: { idle: 'idle-asset', blink: 'blink-asset' } }
    original.block.state = state

    const split = splitEditorV6Block(document.timeline, original.block.id, 90)
    const splitBlocks = split.tracks.find((track) => track.kind === 'character')!.blocks
    expect(splitBlocks[0].state).not.toBe(splitBlocks[1].state)
    expect(splitBlocks[0].state!.faceModeAssetIds).not.toBe(splitBlocks[1].state!.faceModeAssetIds)
    splitBlocks[1].state!.faceModeAssetIds!.blink = 'changed-after-split'
    expect(splitBlocks[0].state!.faceModeAssetIds!.blink).toBe('blink-asset')

    const duplicated = duplicateEditorV6Block(document.timeline, original.block.id)
    const duplicatedBlocks = duplicated.tracks.find((track) => track.kind === 'character')!.blocks
    expect(duplicatedBlocks[0].state).not.toBe(duplicatedBlocks[1].state)
    expect(duplicatedBlocks[0].state!.faceModeAssetIds).not.toBe(duplicatedBlocks[1].state!.faceModeAssetIds)
    duplicatedBlocks[1].state!.faceModeAssetIds!.idle = 'changed-after-duplicate'
    expect(duplicatedBlocks[0].state!.faceModeAssetIds!.idle).toBe('idle-asset')
  })

  it('duplica projetos com cards ligados aos novos IDs de vídeo e estados independentes', () => {
    const document = fixture()
    const videoTrack = document.timeline.tracks.find((track) => track.kind === 'video')!
    const cardTrack = document.timeline.tracks.find((track) => track.kind === 'card')!
    const videoId = crypto.randomUUID(), rightVideoId = crypto.randomUUID(), cardId = crypto.randomUUID()
    const video = { id: videoId, label: 'Vídeo', mediaId: 'media', startFrame: 0, durationFrames: 30 }
    const rightVideo = { id: rightVideoId, label: 'Vídeo · continuação', mediaId: 'media', startFrame: 30, durationFrames: 30, videoCardOriginBlockId: videoId }
    const card = { id: cardId, label: 'Card', startFrame: 0, durationFrames: 60, videoCard: { videoBlockId: videoId, components: {
      temporal: { enabled: true, startFrame: 0, endFrame: 60, text: 'Past' as const },
      english: { enabled: false, startFrame: 0, endFrame: 60, text: '' },
      portuguese: { enabled: true, startFrame: 0, endFrame: 60, text: 'Texto' }
    } } }
    videoTrack.blocks = [video, rightVideo]
    cardTrack.blocks = [card]
    document.characterNameColors = { alice: '#ffffff' }
    const appearance = { modelSlot: 1, eyeState: 0 } as NonNullable<EditorV6Element['faceAppearance']>
    document.elements[0] = { ...document.elements[0], faceAppearance: appearance }

    const duplicate = duplicateEditorV6ProjectDocument(document, {
      id: crypto.randomUUID(), title: 'Cópia independente', color: document.color,
      createdAt: document.createdAt, updatedAt: document.updatedAt
    }, () => crypto.randomUUID())
    const copiedVideoTrack = duplicate.timeline.tracks.find((track) => track.kind === 'video')!
    const copiedRoot = copiedVideoTrack.blocks.find((block) => block.label === video.label)!
    const copiedRight = copiedVideoTrack.blocks.find((block) => block.label === rightVideo.label)!
    const copiedCard = duplicate.timeline.tracks.find((track) => track.kind === 'card')!.blocks[0]
    expect(copiedCard.videoCard!.videoBlockId).toBe(copiedRoot.id)
    expect(copiedRight.videoCardOriginBlockId).toBe(copiedRoot.id)
    expect(editorV6CardMatchesVideo(copiedCard.videoCard!, copiedRight)).toBe(true)
    expect(copiedCard.videoCard!.components).not.toBe(card.videoCard.components)
    copiedCard.videoCard!.components.portuguese.text = 'Alterado na cópia'
    expect(card.videoCard.components.portuguese.text).toBe('Texto')
    expect(duplicate.elements[0].faceAppearance).not.toBe(document.elements[0].faceAppearance)
    expect(duplicate.characterNameColors).not.toBe(document.characterNameColors)
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

  it('compartilha controles de transformação sem substituir a pose e o recorte de outros blocos', () => {
    const document = fixture(), original = actorClip(document)
    document.timeline = splitEditorV6Block(document.timeline, original.block.id, 90)
    const blocks = actorClip(document).track.blocks
    blocks[0].state = { ...blocks[0].state!, poseSlot: 1, width: 12, height: 40, characterScale: 80 }
    blocks[1].state = { ...blocks[1].state!, poseSlot: 2, width: 18, height: 50, characterScale: 120 }
    const edited = editEditorV6DocumentAtBlock(document, blocks[1].id, (working) => ({
      ...working, elements: working.elements.map((element) => ({ ...element, characterScale: 145, characterWidthScale: 115, characterHeightScale: 90, rotation: 12, flipX: true, zIndex: 4 }))
    }))
    const first = resolveEditorV6ElementsAtFrame(edited, 45)[0]
    const second = resolveEditorV6ElementsAtFrame(edited, 150)[0]
    for (const state of [first, second, edited.elements[0]]) expect(state).toMatchObject({ characterScale: 145, characterWidthScale: 115, characterHeightScale: 90, rotation: 12, flipX: true, zIndex: 4 })
    expect(first).toMatchObject({ poseSlot: 1, width: 12, height: 40 })
    expect(second).toMatchObject({ poseSlot: 2, width: 18, height: 50 })
    const resized = editEditorV6DocumentAtBlock(edited, blocks[1].id, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, characterScale: 160 })) }))
    expect(resolveEditorV6ElementsAtFrame(resized, 45)[0]).toMatchObject({ characterScale: 160, characterWidthScale: 115, poseSlot: 1 })
  })

  it('propaga o ajuste do personagem sem bloco selecionado', () => {
    const document = fixture(), original = actorClip(document)
    document.timeline = splitEditorV6Block(document.timeline, original.block.id, 90)
    const edited = editEditorV6DocumentAtBlock(document, null, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, characterScale: 140 })) }))
    expect(resolveEditorV6ElementsAtFrame(edited, 45)[0].characterScale).toBe(140)
    expect(resolveEditorV6ElementsAtFrame(edited, 150)[0].characterScale).toBe(140)
  })

  it('não altera o personagem de faixa bloqueada quando não há bloco selecionado', () => {
    const document = fixture(), original = actorClip(document)
    original.track.locked = true
    const edited = editEditorV6DocumentAtBlock(document, null, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, characterScale: 140 })) }))
    expect(edited.elements[0]).toEqual(document.elements[0])
    expect(actorClip(edited).block.state).toEqual(original.block.state)
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

  it('mantém o mesmo magnetismo usando o índice pré-calculado durante o arraste', () => {
    const document = fixture(), characterTrack = document.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.blocks = Array.from({ length: 200 }, (_, index) => ({ ...characterTrack.blocks[0], id: crypto.randomUUID(), startFrame: index * 10, durationFrames: 6 }))
    const excluded = characterTrack.blocks[75].id
    const points = document.timeline.tracks.flatMap((track) => track.blocks.flatMap((block, order) => block.id === excluded || block.parentBlockId === excluded ? [] : [
      { frame: block.startFrame, order: order * 2 }, { frame: block.startFrame + block.durationFrames, order: order * 2 + 1 }
    ])).sort((a, b) => a.frame - b.frame || a.order - b.order)
    for (let frame = 0; frame < 1990; frame += 7) {
      const cursor = (frame * 13) % 1999
      expect(snapEditorV6Frame(document.timeline, frame, cursor, excluded, 4, 12, points)).toEqual(snapEditorV6Frame(document.timeline, frame, cursor, excluded, 4, 12))
    }
  })

  it('preserva a primeira guia quando dois pontos empatam', () => {
    const first = { id: crypto.randomUUID(), startFrame: 102, durationFrames: 1 }
    const second = { id: crypto.randomUUID(), startFrame: 100, durationFrames: 200 }
    const timeline = { durationFrames: 300, tracks: [{ id: crypto.randomUUID(), kind: 'object', name: 'Empate', blocks: [first, second] }] } as unknown as EditorV6Timeline
    const points = [
      { frame: first.startFrame, order: 0 }, { frame: first.startFrame + first.durationFrames, order: 1 },
      { frame: second.startFrame, order: 2 }, { frame: second.startFrame + second.durationFrames, order: 3 }
    ].sort((a, b) => a.frame - b.frame || a.order - b.order)
    const expected = snapEditorV6Frame(timeline, 101, 250, 'excluded', 1)
    expect(expected.guide).toBe(102)
    expect(snapEditorV6Frame(timeline, 101, 250, 'excluded', 1, 0, points)).toEqual(expected)
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
