import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6MediaAsset, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { syncEditorV6TimelineElements } from '../../../../shared/editorV6'
import { addEditorV6ElementAtFrame, editEditorV6BackgroundAtFrame, normalizeEditorV6Timeline } from '../../../../shared/editorV6Timeline'

export function addEditorV6ImageAsset(document: EditorV6Document, asset: EditorV6Asset, category: 'background' | 'object', frame: number, createId: () => string): EditorV6Document {
  let next: EditorV6Document = category === 'background'
    ? editEditorV6BackgroundAtFrame({
        ...document,
        assets: [...document.assets, asset],
        updatedAt: new Date().toISOString()
      }, frame, {
        backgroundAssetId: asset.id,
        backgroundX: 0,
        backgroundY: 0,
        backgroundWidth: 100,
        backgroundHeight: 100,
        backgroundRotation: 0
      })
    : {
        ...document,
        assets: [...document.assets, asset],
        elements: [...document.elements, {
          id: createId(),
          kind: 'image',
          assetId: asset.id,
          text: '',
          x: 0,
          y: 0,
          width: 25,
          height: 25,
          rotation: 0,
          zIndex: Math.max(0, ...document.elements.map((item) => item.zIndex)) + 1
        } satisfies EditorV6Element],
        updatedAt: new Date().toISOString()
      }

  if (category !== 'background') next = addEditorV6ElementAtFrame(next, next.elements.at(-1)!, frame)
  return { ...next, timeline: normalizeEditorV6Timeline(syncEditorV6TimelineElements(next.timeline, next.elements)) }
}

export function addEditorV6TimelineMedia(document: EditorV6Document, media: EditorV6MediaAsset, frame: number, createId: () => string): { document: EditorV6Document; block: EditorV6TimelineBlock; startFrame: number } {
  const startFrame = Math.min(frame, document.timeline.durationFrames)
  const durationFrames = Math.max(1, Math.min(media.sourceFrames, 1_000_000 - startFrame))
  const block: EditorV6TimelineBlock = {
    id: createId(),
    mediaId: media.id,
    mediaInFrame: 0,
    label: media.name.slice(0, 120),
    startFrame,
    durationFrames,
    audioEnabled: true,
    gain: 1
  }
  const mediaList = document.media ?? []
  const timeline = normalizeEditorV6Timeline({
    ...document.timeline,
    durationFrames: Math.max(document.timeline.durationFrames, startFrame + durationFrames),
    tracks: document.timeline.tracks.map((track) => track.kind === media.kind ? { ...track, blocks: [...track.blocks, block] } : track)
  })
  return {
    document: {
      ...document,
      media: mediaList.some((item) => item.id === media.id) ? mediaList : [...mediaList, media],
      timeline,
      updatedAt: new Date().toISOString()
    },
    block,
    startFrame
  }
}
