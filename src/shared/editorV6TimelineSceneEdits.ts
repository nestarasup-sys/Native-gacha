/** Document edits based on the current Editor V6 scene. */
import type { EditorV6BackgroundState, EditorV6Document, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import { addEditorV6ElementAtFrame, editorV6ClipAtFrame, normalizeEditorV6Timeline, resolveEditorV6StaticElementsAtFrame } from './editorV6TimelineCore'
import { resolveEditorV6BackgroundAtFrame, resolveEditorV6SceneAtFrame } from './editorV6TimelineScene'

/** Background changes are persistent states on the visual lane. */
export function editEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number, values: Partial<EditorV6BackgroundState>, blockId: string = crypto.randomUUID()): EditorV6Document {
  const track = document.timeline.tracks.find((candidate) => candidate.kind === 'video')
  if (track?.locked) return document
  const startFrame = Math.min(document.timeline.durationFrames - 1, Math.max(0, Math.round(frame)))
  const background = { ...resolveEditorV6BackgroundAtFrame(document, startFrame), ...values }
  const existing = track?.blocks.find((block) => block.background && block.startFrame === startFrame)
  const name = document.assets.find((asset) => asset.id === background.backgroundAssetId)?.name
  const block: EditorV6TimelineBlock = { id: existing?.id ?? blockId, label: `Fundo: ${name ?? background.backgroundColor}`.slice(0, 120), startFrame, durationFrames: document.timeline.durationFrames - startFrame, background }
  const target: EditorV6TimelineTrack = track ?? { id: crypto.randomUUID(), kind: 'video', name: 'Vídeo', muted: false, locked: false, blocks: [] }
  const blocks = [...target.blocks.filter((item) => item.id !== block.id), block]
  return { ...document, timeline: normalizeEditorV6Timeline({ ...document.timeline, tracks: track ? document.timeline.tracks.map((item) => item.id === target.id ? { ...item, blocks } : item) : [...document.timeline.tracks, { ...target, blocks }] }) }
}

/** Prepare a character edit at the cursor without committing a click or a cancelled gesture. */
export function prepareEditorV6PositionAtFrame(document: EditorV6Document, elementId: string, frame: number): { document: EditorV6Document; blockId: string } | null {
  const scene = resolveEditorV6SceneAtFrame(document, frame)
  const element = resolveEditorV6StaticElementsAtFrame(document, scene.frame).find((item) => item.id === elementId)
  const clip = editorV6ClipAtFrame(document.timeline, elementId, scene.frame)
  if (!element || element.positionLocked || clip?.track.locked) return null
  if (element.kind !== 'character') return clip ? { document, blockId: clip.block.id } : null
  if (clip && clip.block.startFrame === scene.frame) return { document, blockId: clip.block.id }
  const blockId = crypto.randomUUID()
  return { document: addEditorV6ElementAtFrame(document, element, scene.frame, blockId), blockId }
}
