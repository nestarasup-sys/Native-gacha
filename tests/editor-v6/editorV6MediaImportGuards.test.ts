import { describe, expect, it, vi } from 'vitest'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6MediaAsset } from '../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { timelineClips } from '../../src/shared/editorV6TimelineCore'
import { addEditorV6ImageAsset, addEditorV6TimelineMedia } from '../../src/renderer/src/features/editorV6/editorV6MediaChanges'
import { importEditorV6ImageToProject, importEditorV6MediaToTimeline } from '../../src/renderer/src/features/editorV6/editorV6MediaImport'

function fixture(): EditorV6Document {
  return {
    schemaVersion: 1, id: crypto.randomUUID(), title: 'Importação segura',
    color: '#d7b5cd', createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [], assets: [], timeline: createEditorV6Timeline()
  }
}
function media(kind: 'video' | 'audio'): EditorV6MediaAsset {
  const id = crypto.randomUUID()
  return { id, name: kind === 'audio' ? 'Voz.wav' : 'Vídeo.mp4', fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
    kind, mimeType: kind === 'audio' ? 'audio/wav' : 'video/mp4',
    sourceFrames: 120, hasAudio: true, sizeBytes: 1234 }
}
function image(category: 'background' | 'object'): EditorV6Asset {
  return { id: crypto.randomUUID(), name: 'Teste.png', category, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
}
function lockLane(document: EditorV6Document, kind: 'video' | 'audio' | 'object'): EditorV6Document {
  return { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) =>
    track.kind === kind ? { ...track, locked: true } : track) } }
}
const nextId = () => crypto.randomUUID()

describe('Editor V6: importação na versão mais recente do projeto', () => {
  it.each(['audio', 'video'] as const)('recusa %s quando a faixa foi bloqueada durante o seletor nativo', async (kind) => {
    const current = fixture()
    const latest = lockLane(current, kind)
    const snapshot = JSON.stringify(latest)
    const persistDocument = vi.fn(async () => true)
    await expect(importEditorV6MediaToTimeline({
      frame: 30, requestMedia: async () => media(kind), loadProject: async () => latest,
      persistDocument, createId: nextId, addTimelineMedia: addEditorV6TimelineMedia
    })).rejects.toThrow(/Desbloqueie a faixa/)
    expect(persistDocument).not.toHaveBeenCalled()
    expect(JSON.stringify(latest)).toBe(snapshot)
  })

  it.each(['background', 'object'] as const)('recusa imagem %s se a faixa foi bloqueada após o seletor', async (category) => {
    const latest = lockLane(fixture(), category === 'background' ? 'video' : 'object')
    const snapshot = JSON.stringify(latest)
    const persistDocument = vi.fn(async () => true)
    await expect(importEditorV6ImageToProject({
      category, frame: 10, importAsset: async () => image(category),
      loadProject: async () => latest, persistDocument, createId: nextId,
      addImageAsset: addEditorV6ImageAsset,
      findClipAtFrame: (timeline, id, frame) =>
        timelineClips(timeline).find(({ block }) => block.elementId === id && block.startFrame <= frame)
    })).rejects.toThrow(/Desbloqueie a faixa/)
    expect(persistDocument).not.toHaveBeenCalled()
    expect(JSON.stringify(latest)).toBe(snapshot)
  })

  it.each(['audio', 'video'] as const)('importa %s na faixa desbloqueada e produz documento válido', async (kind) => {
    const original = fixture()
    const asset = media(kind)
    const originalSnapshot = JSON.stringify(original)
    const persistDocument = vi.fn(async (_source: EditorV6Document, next: EditorV6Document) =>
      editorV6DocumentSchema.safeParse(next).success)
    const result = await importEditorV6MediaToTimeline({
      frame: 45, requestMedia: async () => asset, loadProject: async () => original,
      persistDocument, createId: nextId, addTimelineMedia: addEditorV6TimelineMedia
    })
    expect(result?.startFrame).toBe(45)
    expect(persistDocument).toHaveBeenCalledOnce()
    const published = persistDocument.mock.calls[0][1]
    const clip = timelineClips(published.timeline).find(({ block }) => block.id === result?.blockId)
    expect(clip?.track.kind).toBe(kind)
    expect(clip?.block).toMatchObject({ mediaId: asset.id, startFrame: 45, durationFrames: 120 })
    expect(JSON.stringify(original)).toBe(originalSnapshot)
  })

  it('não publica mídia órfã se a faixa de destino estiver ausente ou duplicada', () => {
    const original = fixture(), audio = media('audio')
    const withoutAudio = { ...original, timeline: { ...original.timeline,
      tracks: original.timeline.tracks.filter((track) => track.kind !== 'audio') } }
    const duplicatedAudio = { ...original, timeline: { ...original.timeline,
      tracks: [...original.timeline.tracks, { ...original.timeline.tracks.find((track) => track.kind === 'audio')!, id: crypto.randomUUID() }] } }
    expect(() => addEditorV6TimelineMedia(withoutAudio, audio, 20, nextId)).toThrow(/não está disponível de forma única/)
    expect(() => addEditorV6TimelineMedia(duplicatedAudio, audio, 20, nextId)).toThrow(/não está disponível de forma única/)
    expect(withoutAudio.media).toBeUndefined()
    expect(duplicatedAudio.media).toBeUndefined()
  })

  it('mantém quadros e duração dentro dos limites do documento', () => {
    const original = fixture(), audio = media('audio')
    expect(addEditorV6TimelineMedia(original, audio, -40, nextId).startFrame).toBe(0)
    expect(addEditorV6TimelineMedia(original, audio, 10_000_000, nextId).startFrame).toBe(300)
    // O cursor continua limitado ao fim do projeto; só um projeto longo alcança o limite global.
    const longProject = { ...original, timeline: { ...original.timeline, durationFrames: 1_000_000 } }
    const last = addEditorV6TimelineMedia(longProject, audio, 10_000_000, nextId)
    expect(last.startFrame).toBe(999_999)
    expect(last.block.durationFrames).toBe(1)
    expect(editorV6DocumentSchema.safeParse(last.document).success).toBe(true)
    for (const frame of [NaN, Infinity, -Infinity]) {
      expect(() => addEditorV6TimelineMedia(original, audio, frame, nextId)).toThrow(/quadro de importação/)
    }
    for (const duration of [0, NaN, Infinity, 1_000_001]) {
      expect(() => addEditorV6TimelineMedia(original, { ...audio, sourceFrames: duration }, 0, nextId)).toThrow(/duração da mídia/)
    }
  })
})
