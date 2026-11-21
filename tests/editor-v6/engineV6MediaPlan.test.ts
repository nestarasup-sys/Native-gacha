import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6MediaAsset, type EditorV6TimelineBlock } from '../../src/shared/editorV6'
import { engineV6MediaSampleAt, prepareEngineV6MediaPlan } from '../../src/engine-v6/engineMediaPlan'

function media(id: string, kind: EditorV6MediaAsset['kind'], overrides: Partial<EditorV6MediaAsset> = {}): EditorV6MediaAsset {
  return { id, name: id, fileName: `${id}.mp4`, kind, mimeType: kind === 'video' ? 'video/mp4' : 'audio/wav',
    sourceFrames: 900, hasAudio: kind === 'video', width: kind === 'video' ? 1920 : undefined,
    height: kind === 'video' ? 1080 : undefined, sizeBytes: 1_000, ...overrides }
}

function block(id: string, startFrame: number, durationFrames: number, mediaId: string,
  options: Partial<EditorV6TimelineBlock> = {}): EditorV6TimelineBlock {
  return { id, label: id, startFrame, durationFrames, mediaId, ...options }
}

function project(): EditorV6Document {
  const timeline = createEditorV6Timeline()
  timeline.durationFrames = 300
  timeline.tracks.find(track => track.kind === 'video')!.blocks = [
    block('video-a', 5, 20, 'vid-a', { mediaInFrame: 10, audioEnabled: false,
      mediaLayout: { x: -20, y: 5, width: 30, height: 40, rotation: 12 } }),
    block('video-b', 10, 20, 'vid-b', { mediaInFrame: 3, gain: .25 })
  ]
  timeline.tracks.find(track => track.kind === 'audio')!.blocks = [
    block('audio-a', 0, 40, 'aud-a', { mediaInFrame: 4, gain: .5 }),
    block('audio-disabled', 8, 15, 'aud-a', { audioEnabled: false })
  ]
  return {
    schemaVersion: 1, id: 'synthetic-media-plan', title: 'Media plan', color: '#445566',
    createdAt: '2026-11-21T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z',
    backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [], assets: [], timeline,
    media: [media('vid-a', 'video', { hasAudio: false }), media('vid-b', 'video'), media('aud-a', 'audio', { hasAudio: true })],
    exportAudio: [{ id: 'export-audio', name: 'export-audio', fileName: 'export-audio.wav', sourceFrames: 900,
      startFrame: 30, sourceInFrame: 10, durationFrames: 40, gain: .75, muted: false }]
  }
}

describe('Engine V6 — plano offline de mídia', () => {
  it('plans clipped overlapping video layers and audio by stable IDs and rational seconds', () => {
    const prepared = prepareEngineV6MediaPlan(project(), { startFrame: 20, endFrame: 40, fps: 24 })
    expect(prepared).toMatchObject({ contractVersion: 1, projectId: 'synthetic-media-plan', outputFrames: 16 })
    expect(prepared.videoLayers).toEqual([
      { blockId: 'video-a', mediaId: 'vid-a', startFrame: 20, endFrame: 25, sourceInFrame: 25,
        layout: { x: -20, y: 5, width: 30, height: 40, rotation: 12 },
        startTime: { numerator: 0, denominator: 30 }, endTime: { numerator: 5, denominator: 30 },
        sourceTime: { numerator: 25, denominator: 30 } },
      { blockId: 'video-b', mediaId: 'vid-b', startFrame: 20, endFrame: 30, sourceInFrame: 13,
        layout: expect.objectContaining({ rotation: 0 }),
        startTime: { numerator: 0, denominator: 30 }, endTime: { numerator: 10, denominator: 30 },
        sourceTime: { numerator: 13, denominator: 30 } }
    ])
    expect(prepared.audioClips).toEqual([
      { clipId: 'export-audio', sourceId: 'export-audio', sourceInFrame: 10, durationFrames: 10, gain: .75,
        startTime: { numerator: 10, denominator: 30 }, endTime: { numerator: 20, denominator: 30 },
        sourceTime: { numerator: 10, denominator: 30 } },
      { clipId: 'video-b', sourceId: 'vid-b', sourceInFrame: 13, durationFrames: 10, gain: .25,
        startTime: { numerator: 0, denominator: 30 }, endTime: { numerator: 10, denominator: 30 },
        sourceTime: { numerator: 13, denominator: 30 } },
      { clipId: 'audio-a', sourceId: 'aud-a', sourceInFrame: 24, durationFrames: 20, gain: .5,
        startTime: { numerator: 0, denominator: 30 }, endTime: { numerator: 20, denominator: 30 },
        sourceTime: { numerator: 24, denominator: 30 } }
    ])
  })

  it('supports random access, exact half-open media boundaries and output PTS at 24/30 fps', () => {
    for (const fps of [24, 30] as const) {
      const plan = prepareEngineV6MediaPlan(project(), { startFrame: 20, endFrame: 40, fps })
      const sample = engineV6MediaSampleAt(plan, 4)
      expect(sample.presentationTime).toEqual({ numerator: 4, denominator: fps })
      expect(sample.timelineFrame).toBe(fps === 24 ? 25 : 24)
      expect(sample.activeVideo.map(layer => layer.mediaId)).toEqual(fps === 24 ? ['vid-b'] : ['vid-a', 'vid-b'])
      expect(sample.activeVideo.find(layer => layer.mediaId === 'vid-b')?.sourceFrame).toBe(fps === 24 ? 18 : 17)
      const randomSeek = engineV6MediaSampleAt(plan, 9)
      expect(engineV6MediaSampleAt(plan, 4)).toEqual(sample)
      expect(engineV6MediaSampleAt(plan, 9)).toEqual(randomSeek)
      if (fps === 30) expect(engineV6MediaSampleAt(plan, 5).activeVideo.map(layer => layer.mediaId)).toEqual(['vid-b'])
      expect(() => engineV6MediaSampleAt(plan, plan.outputFrames)).toThrow(/fora dos limites/)
    }
  })

  it('rejects invalid output ranges before planning media', () => {
    const doc = project()
    expect(() => prepareEngineV6MediaPlan(doc, { startFrame: 20, endFrame: 20, fps: 24 })).toThrow(/Intervalo de mídia inválido/)
    expect(() => prepareEngineV6MediaPlan(doc, { startFrame: 0, endFrame: 301, fps: 30 })).toThrow(/Intervalo de mídia inválido/)
    expect(() => prepareEngineV6MediaPlan(doc, { startFrame: 0, endFrame: 10, fps: 25 as 24 })).toThrow(/Intervalo de mídia inválido/)
  })

  it('fails clearly when an active timeline clip refers to missing or wrong-kind media', () => {
    const missingVideo = project()
    missingVideo.media = missingVideo.media!.filter(asset => asset.id !== 'vid-a')
    expect(() => prepareEngineV6MediaPlan(missingVideo, { startFrame: 0, endFrame: 40, fps: 30 }))
      .toThrow(/Fonte de vídeo ausente ou incompatível no bloco video-a/)

    const missingAudio = project()
    missingAudio.media = missingAudio.media!.filter(asset => asset.id !== 'aud-a')
    expect(() => prepareEngineV6MediaPlan(missingAudio, { startFrame: 0, endFrame: 40, fps: 30 }))
      .toThrow(/Fonte de áudio ausente ou incompatível no bloco audio-a/)

    const wrongKind = project()
    wrongKind.media = wrongKind.media!.map(asset => asset.id === 'vid-a' ? { ...asset, kind: 'audio' as const } : asset)
    expect(() => prepareEngineV6MediaPlan(wrongKind, { startFrame: 0, endFrame: 40, fps: 30 }))
      .toThrow(/Fonte de vídeo ausente ou incompatível no bloco video-a/)
  })
})
