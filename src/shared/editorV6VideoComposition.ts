/** Video-overlay plan shared with the Editor V6 timeline contract.
 * FFmpeg overlays in array order: later blocks paint above earlier ones.
 * Always sort by the ORIGINAL start frame and block ID (same tie-break as
 * resolveEditorV6SceneAtFrame), even if several clips are trimmed to the
 * same export-part boundary. Sorting by filename or clipped start disagrees
 * with the preview when clips overlap or a Turbo part starts mid-overlap.
 */
import { editorV6DefaultVideoLayout, type EditorV6Document, type EditorV6VideoLayout } from './editorV6'
import { compareEditorV6TimelineBlocks } from './editorV6TimelineCore'

export type EditorV6VideoOverlay = {
  blockId: string
  fileName: string
  libraryVideoId?: string
  mediaInFrame: number
  startFrame: number
  endFrame: number
  layout: EditorV6VideoLayout
}

export function planEditorV6VideoOverlays(project: EditorV6Document, startFrame: number, endFrame: number): EditorV6VideoOverlay[] {
  const media = new Map((project.media ?? []).filter((asset) => asset.kind === 'video').map((asset) => [asset.id, asset]))
  const ordered = project.timeline.tracks
    .filter((track) => track.kind === 'video' && !track.hidden && !track.muted)
    .flatMap((track) => track.blocks
      .filter((block) => block.mediaId)
      .map((block) => ({ block, asset: media.get(block.mediaId!) }))
      .filter(({ asset, block }) => asset && block.startFrame < endFrame && block.startFrame + block.durationFrames > startFrame))
    .sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))

  return ordered.flatMap(({ block, asset }) => {
    if (!asset) return []
    const start = Math.max(startFrame, block.startFrame)
    const end = Math.min(endFrame, block.startFrame + block.durationFrames)
    return [{
      blockId: block.id,
      fileName: asset.fileName,
      ...(asset.libraryVideoId ? { libraryVideoId: asset.libraryVideoId } : {}),
      mediaInFrame: (block.mediaInFrame ?? 0) + start - block.startFrame,
      startFrame: start,
      endFrame: end,
      layout: block.mediaLayout ?? editorV6DefaultVideoLayout(asset.width, asset.height)
    }]
  })
}
