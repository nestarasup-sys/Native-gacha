import { describe, expect, it } from 'vitest'
import type { EditorV6Asset, EditorV6Document, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { applyEditorV6TimelineUpdate } from '../../src/renderer/src/features/editorV6/editorV6TimelineDocumentUpdate'

const timestamp = '2026-11-11T12:00:00.000Z'

function createDocument(assets: EditorV6Asset[], block: EditorV6TimelineBlock): EditorV6Document {
  const track: EditorV6TimelineTrack = { id: 'track-1', kind: 'speech', name: 'Speech', muted: false, locked: false, blocks: [block] }
  const timeline: EditorV6Timeline = { fps: 30, durationFrames: 100, tracks: [track] }
  return { id: 'project-1', title: 'Fixture', backgroundAssetId: null, assets, elements: [], timeline } as EditorV6Document
}

function asset(id: string, timelineSnapshot = false): EditorV6Asset {
  return { id, category: 'background', name: id, mimeType: 'image/png', dataUrl: `data:${id}`, timelineSnapshot }
}

describe('transação de atualização da timeline no documento V6', () => {
  it('normaliza a timeline, grava timestamp e remove snapshots sem referência', () => {
    const block: EditorV6TimelineBlock = { id: 'block-1', label: 'Speech', startFrame: 10, durationFrames: 20 }
    const document = createDocument([asset('snapshot-unused', true), asset('asset-kept')], block)

    const changed = applyEditorV6TimelineUpdate(document, (timeline) => ({
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        blocks: track.blocks.map((current) => current.id === 'block-1' ? { ...current, startFrame: -4, durationFrames: 2.6 } : current)
      }))
    }), timestamp)

    expect(changed.updatedAt).toBe(timestamp)
    expect(changed.timeline.tracks[0].blocks[0]).toMatchObject({ startFrame: 0, durationFrames: 3 })
    expect(changed.assets.map(({ id }) => id)).toEqual(['asset-kept'])
    expect(document.timeline.tracks[0].blocks[0]).toEqual(block)
  })

  it('mantém snapshot de asset referenciado por bloco da timeline', () => {
    const block: EditorV6TimelineBlock = {
      id: 'block-1', label: 'Speech', startFrame: 0, durationFrames: 20,
      background: { backgroundColor: '#000000', backgroundAssetId: 'snapshot-used', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }
    }
    const document = createDocument([asset('snapshot-used', true)], block)

    const changed = applyEditorV6TimelineUpdate(document, (timeline) => timeline, timestamp)

    expect(changed.assets.map(({ id }) => id)).toEqual(['snapshot-used'])
  })
})
