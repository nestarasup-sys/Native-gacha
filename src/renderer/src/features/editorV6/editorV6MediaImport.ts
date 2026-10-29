import type { EditorV6Asset, EditorV6Document, EditorV6MediaAsset, EditorV6TimelineBlock } from '../../../../shared/editorV6.ts'

type ProjectLoader = () => Promise<EditorV6Document | null>
type PersistDocument = (source: EditorV6Document, next: EditorV6Document) => Promise<boolean>
type AddImageAsset = (document: EditorV6Document, asset: EditorV6Asset, category: 'background' | 'object', frame: number, createId: () => string) => EditorV6Document
type AddTimelineMedia = (document: EditorV6Document, media: EditorV6MediaAsset, frame: number, createId: () => string) => { document: EditorV6Document; block: EditorV6TimelineBlock; startFrame: number }
type FindClipAtFrame = (timeline: EditorV6Document['timeline'], elementId: string, frame: number) => { block: EditorV6TimelineBlock } | undefined

export type EditorV6ImageImportResult = {
  selectedElementId: string
  selectedTimelineBlockId?: string | null
  activeTool: 'background' | 'objects'
}

/** Coordinates image import, loading the latest document, publishing it, and returning UI selection. */
export async function importEditorV6ImageToProject({
  category, frame, importAsset, loadProject, persistDocument, createId, addImageAsset, findClipAtFrame, validateProject
}: {
  category: 'background' | 'object'
  frame: number
  importAsset: (category: 'background' | 'object') => Promise<EditorV6Asset | null>
  loadProject: ProjectLoader
  persistDocument: PersistDocument
  createId: () => string
  addImageAsset: AddImageAsset
  findClipAtFrame: FindClipAtFrame
  validateProject?: (project: EditorV6Document) => void
}): Promise<EditorV6ImageImportResult | null> {
  const asset = await importAsset(category)
  if (!asset) return null
  const current = await loadProject()
  if (!current) throw new Error('Não foi possível carregar o projeto para adicionar a imagem.')
  validateProject?.(current)
  const next = addImageAsset(current, asset, category, frame, createId)
  if (!await persistDocument(current, next)) return null

  if (category === 'background') return { selectedElementId: 'background', activeTool: 'background' }
  const image = next.elements.at(-1)
  if (!image) throw new Error('A imagem importada não foi adicionada à cena.')
  return {
    selectedElementId: image.id,
    selectedTimelineBlockId: findClipAtFrame(next.timeline, image.id, frame)?.block.id ?? null,
    activeTool: 'objects'
  }
}

export type EditorV6TimelineMediaImportResult = {
  blockId: string
  startFrame: number
}

/** Coordinates audio/video import and linking through the same document persistence path. */
export async function importEditorV6MediaToTimeline({
  frame, requestMedia, loadProject, persistDocument, createId, addTimelineMedia
}: {
  frame: number
  requestMedia: () => Promise<EditorV6MediaAsset | null>
  loadProject: ProjectLoader
  persistDocument: PersistDocument
  createId: () => string
  addTimelineMedia: AddTimelineMedia
}): Promise<EditorV6TimelineMediaImportResult | null> {
  const media = await requestMedia()
  if (!media) return null
  const current = await loadProject()
  if (!current) throw new Error('Não foi possível carregar o projeto para adicionar a mídia.')
  const result = addTimelineMedia(current, media, frame, createId)
  if (!await persistDocument(current, result.document)) return null
  return { blockId: result.block.id, startFrame: result.startFrame }
}
