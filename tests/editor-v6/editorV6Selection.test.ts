import { describe, expect, it } from 'vitest'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6MediaAsset } from '../../src/shared/editorV6'
import { resolveEditorV6InspectorSelection } from '../../src/renderer/src/features/editorV6/editorV6Selection'

function element(id: string, overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id, kind: 'character', characterId: 'character-1', assetId: `asset-${id}`, text: id,
    x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, ...overrides
  }
}

function asset(id: string): EditorV6Asset {
  return { id, category: 'background', name: id, mimeType: 'image/png', dataUrl: `data:image/png;base64,${id}` }
}

function media(id: string): EditorV6MediaAsset {
  return { id, name: id, fileName: `${id}.mp4`, kind: 'video', mimeType: 'video/mp4', sourceFrames: 30, hasAudio: true, sizeBytes: 1 }
}

function project(overrides: Partial<EditorV6Document> = {}): EditorV6Document {
  const base = element('base')
  const first = element('actor-frame-1', { text: 'Primeiro estado' })
  const second = element('actor-frame-2', { text: 'Estado no playhead' })
  return {
    id: 'project-1', schemaVersion: 1, title: 'Teste', color: '#000000', createdAt: '', updatedAt: '',
    backgroundColor: '#ffffff', backgroundAssetId: 'background-1', backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [asset('background-1')], elements: [base], timeline: {
      fps: 30, durationFrames: 60, knownElementIds: [base.id],
      tracks: [{ id: 'character-track', kind: 'character', characterId: 'character-1', name: 'Personagem', muted: false, locked: false, blocks: [
        { id: 'clip-first', elementId: base.id, label: 'Primeiro', startFrame: 0, durationFrames: 20, state: first },
        { id: 'clip-second', elementId: base.id, label: 'Segundo', startFrame: 20, durationFrames: 20, state: second }
      ] }]
    },
    ...overrides
  }
}

describe('seleção do Inspector no Editor V6', () => {
  it('prioriza o bloco selecionado e resolve o ator vivo visível pelo personagem', () => {
    const visibleActor = element('visible-actor', { text: 'Ator ao vivo' })
    const selected = resolveEditorV6InspectorSelection({
      project: project(), visibleElements: [visibleActor], backgroundAssetId: 'background-1',
      selectedTimelineBlockId: 'clip-first', selectedElementId: 'base', playheadFrame: 25
    })

    expect(selected.selectedElement?.text).toBe('Primeiro estado')
    expect(selected.selectedCharacterElement).toBe(visibleActor)
    expect(selected.selectedBackgroundAsset?.id).toBe('background-1')
  })

  it('usa o estado do playhead se o bloco selecionado não corresponder ao elemento', () => {
    const selected = resolveEditorV6InspectorSelection({
      project: project(), visibleElements: [], backgroundAssetId: null,
      selectedTimelineBlockId: 'block-from-another-layer', selectedElementId: 'base', playheadFrame: 25
    })

    expect(selected.selectedElement?.text).toBe('Estado no playhead')
    expect(selected.selectedCharacterElement).toBe(selected.selectedElement)
  })

  it('cai para o elemento visível e depois para o snapshot-base quando não há clip ativo', () => {
    const visibleActor = element('base', { text: 'Ator visível' })
    const common = {
      backgroundAssetId: null, selectedTimelineBlockId: null, selectedElementId: 'base', playheadFrame: 55
    }
    const noClips = project({ timeline: { fps: 30, durationFrames: 60, tracks: [], knownElementIds: [] } })
    const fromVisible = resolveEditorV6InspectorSelection({ project: noClips, visibleElements: [visibleActor], ...common })
    const fromBase = resolveEditorV6InspectorSelection({ project: noClips, visibleElements: [], ...common })

    expect(fromVisible.selectedElement).toBe(visibleActor)
    expect(fromBase.selectedElement?.id).toBe('base')
  })

  it('resolve a mídia de vídeo pela seleção da timeline sem selecionar elemento de cena', () => {
    const video = media('video-1')
    const document = project({
      media: [video],
      timeline: {
        fps: 30, durationFrames: 60,
        tracks: [{ id: 'video-track', kind: 'video', name: 'Vídeo', muted: false, locked: false, blocks: [
          { id: 'video-block', mediaId: video.id, label: 'Clip', startFrame: 0, durationFrames: 30 }
        ] }]
      }
    })
    const selected = resolveEditorV6InspectorSelection({
      project: document, visibleElements: [], backgroundAssetId: null,
      selectedTimelineBlockId: 'video-block', selectedElementId: null, playheadFrame: 5
    })

    expect(selected.selectedTimelineVideoClip?.block.id).toBe('video-block')
    expect(selected.selectedTimelineVideo).toBe(video)
    expect(selected.selectedElement).toBeNull()
  })

  it('returns a safe empty selection without an open project', () => {
    const selected = resolveEditorV6InspectorSelection({
      project: null, visibleElements: [], backgroundAssetId: 'stale-background',
      selectedTimelineBlockId: 'stale-block', selectedElementId: 'stale-element', playheadFrame: 10
    })

    expect(selected).toEqual({
      selectedTimelineVideoClip: undefined, selectedTimelineVideo: undefined, selectedElement: null,
      selectedCharacterElement: null, selectedBackgroundAsset: null
    })
  })
})
