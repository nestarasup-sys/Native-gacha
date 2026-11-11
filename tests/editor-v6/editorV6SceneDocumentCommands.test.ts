import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import { createEditorV6SceneDocumentCommands } from '../../src/renderer/src/features/editorV6/editorV6SceneDocumentCommands'

const actor: EditorV6Element = { id: 'actor', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'A', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 0 }
const prop: EditorV6Element = { id: 'prop', kind: 'image', assetId: 'asset-2', text: 'P', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1 }
const videoBlock = { id: 'video-block', label: 'Vídeo', startFrame: 0, durationFrames: 90, mediaId: 'media-1', gain: 1 }

function project(): EditorV6Document {
  return {
    schemaVersion: 1, id: 'project-1', title: 'Projeto', color: '#abc', createdAt: 'created', updatedAt: 'before',
    backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [
      { id: 'asset-1', category: 'character', name: 'Actor', mimeType: 'image/png', dataUrl: 'data:actor' },
      { id: 'asset-2', category: 'object', name: 'Prop', mimeType: 'image/png', dataUrl: 'data:prop' }
    ], elements: [actor, prop],
    timeline: { fps: 30, durationFrames: 300, tracks: [{ id: 'video-track', kind: 'video', name: 'Vídeo', muted: false, locked: false, blocks: [videoBlock] }] }
  }
}

function harness(document = project()) {
  const events: unknown[] = []
  const context = createEditorV6SceneDocumentCommands({
    selectedElementId: 'actor', setSelectedElementId: (id) => events.push(['selection', id]),
    now: () => 'now', getFrame: () => 36,
    patchDocument: (transform, editSelection) => events.push(['patch', transform(document), editSelection]),
    changeScene: (transform) => events.push(['scene', transform(document)])
  })
  return { context, events }
}

describe('comandos de edição da cena do Editor V6', () => {
  it('remove personagem, limpa asset sem referências e limpa seleção correspondente', () => {
    const { context, events } = harness()
    context.removeStageCharacter(actor)
    const [sceneEvent, selectionEvent] = events as [unknown[], unknown[]]
    const updated = sceneEvent[1] as EditorV6Document
    expect(sceneEvent[0]).toBe('scene')
    expect(updated.elements.map((item) => item.id)).toEqual(['prop'])
    expect(updated.assets.map((asset) => asset.id)).toEqual(['asset-2'])
    expect(updated.updatedAt).toBe('now')
    expect(selectionEvent).toEqual(['selection', null])
  })

  it('mantém asset compartilhado por outro elemento ao remover o personagem selecionado', () => {
    const sharedActor = { ...actor, id: 'actor-2', characterId: 'character-2' }
    const document = project()
    document.elements.push(sharedActor)
    const { context, events } = harness(document)
    context.removeStageCharacter(actor)
    const updated = (events[0] as unknown[])[1] as EditorV6Document
    expect(updated.elements.map((element) => element.id)).toEqual(['prop', 'actor-2'])
    expect(updated.assets.map((asset) => asset.id)).toContain('asset-1')
  })

  it('separa alteração registrada de atualização direta de elemento', () => {
    const { context, events } = harness()
    context.updateElement('prop', { x: 24 })
    context.updateElement('prop', { y: 12 }, false)
    const [scene, patch] = events as [unknown[], unknown[]]
    expect((scene[1] as EditorV6Document).elements.find((item) => item.id === 'prop')?.x).toBe(24)
    expect((scene[1] as EditorV6Document).updatedAt).toBe('now')
    expect(patch[0]).toBe('patch')
    expect((patch[1] as EditorV6Document).elements.find((item) => item.id === 'prop')?.y).toBe(12)
    expect(patch[2]).toBeUndefined()
  })

  it('atualiza propriedades de nome e balão sem adicionar histórico', () => {
    const { context, events } = harness()
    context.updateCharacterNameColor('character-1', '#123456')
    context.updateBalloonScale(125)
    context.updateBalloonOffsetY(-8)
    expect(events).toHaveLength(3)
    for (const [kind, updated, editSelection] of events as ['patch', EditorV6Document, boolean][]) {
      expect(kind).toBe('patch')
      expect(editSelection).toBe(false)
      expect(updated.updatedAt).toBe('now')
    }
    expect((events[0] as unknown[])[1]).toMatchObject({ characterNameColors: { 'character-1': '#123456' } })
    expect((events[1] as unknown[])[1]).toMatchObject({ balloonScalePercent: 125 })
    expect((events[2] as unknown[])[1]).toMatchObject({ balloonOffsetY: -8 })
  })

  it('normaliza a timeline do bloco de vídeo e respeita modo com ou sem histórico', () => {
    const { context, events } = harness()
    context.updateVideoBlock('video-block', { gain: 0.4, audioEnabled: false })
    context.updateVideoBlock('video-block', { mediaInFrame: 12 }, false)
    const [scene, patch] = events as [unknown[], unknown[]]
    const sceneDoc = scene[1] as EditorV6Document
    const patchedDoc = patch[1] as EditorV6Document
    expect(sceneDoc.timeline.tracks[0].blocks[0]).toMatchObject({ gain: 0.4, audioEnabled: false })
    expect(sceneDoc.updatedAt).toBe('now')
    expect(patch[0]).toBe('patch')
    expect(patchedDoc.timeline.tracks[0].blocks[0]).toMatchObject({ mediaInFrame: 12 })
    expect(patch[2]).toBeUndefined()
  })

  it('aplica fundo no playhead e mantém a rota de histórico selecionável', () => {
    const { context, events } = harness()
    context.updateBackground({ backgroundColor: '#222' })
    context.updateBackground({ backgroundX: 5 }, false)
    const [scene, patch] = events as [unknown[], unknown[]]
    const sceneDoc = scene[1] as EditorV6Document
    const patchDoc = patch[1] as EditorV6Document
    expect(sceneDoc.timeline.tracks[0].blocks.find((block) => block.background)).toMatchObject({ startFrame: 36, background: { backgroundColor: '#222' } })
    expect(sceneDoc.updatedAt).toBe('now')
    expect(patchDoc.timeline.tracks[0].blocks.find((block) => block.background)?.background).toMatchObject({ backgroundX: 5 })
    expect(patch[2]).toBeUndefined()
  })
})
