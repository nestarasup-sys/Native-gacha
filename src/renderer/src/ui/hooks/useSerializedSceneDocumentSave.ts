import { useCallback, useRef } from 'react'
import { SerializedDocumentSaveQueue } from '../../../../shared/serializedDocumentSave'
import { SceneThumbnailCache } from './sceneThumbnailCache'

type SaveableSceneDocument = {
  updatedAt: string
  thumbnailDataUrl?: string
}

type SerializedSceneDocumentSaveOptions<TDocument extends SaveableSceneDocument> = {
  createThumbnail: (document: TDocument) => Promise<string>
  thumbnailCacheKey: (document: TDocument) => readonly unknown[]
  write: (document: TDocument) => Promise<void>
  onSaved: (document: TDocument, savedDocument: TDocument) => void
  onError: (reason: unknown) => void
}

export function useSerializedSceneDocumentSave<TDocument extends SaveableSceneDocument>(
  activeDocument: TDocument | null,
  options: SerializedSceneDocumentSaveOptions<TDocument>
) {
  const queue = useRef(new SerializedDocumentSaveQueue())
  const thumbnailCache = useRef<SceneThumbnailCache | null>(null)
  if (!thumbnailCache.current) thumbnailCache.current = new SceneThumbnailCache()
  const currentThumbnailCache = thumbnailCache.current
  const generation = useRef(0)
  const { createThumbnail, thumbnailCacheKey, write, onSaved, onError } = options

  const invalidatePendingSaves = useCallback(() => { generation.current += 1 }, [])
  const writeInOrder = useCallback((document: TDocument) => queue.current.run(() => write(document)), [write])
  const save = useCallback(async (document = activeDocument) => {
    if (!document) return true
    const currentGeneration = ++generation.current
    try {
      const savedDocument = await queue.current.run(async () => {
        const thumbnailDataUrl = await currentThumbnailCache.get(
          thumbnailCacheKey(document),
          () => createThumbnail(document)
        ).catch(() => document.thumbnailDataUrl)
        const next = {
          ...document,
          ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
          updatedAt: new Date().toISOString()
        } as TDocument
        await write(next)
        return next
      })
      if (currentGeneration === generation.current) onSaved(document, savedDocument)
      return true
    } catch (reason) {
      if (currentGeneration === generation.current) onError(reason)
      return false
    }
  }, [activeDocument, createThumbnail, currentThumbnailCache, onError, onSaved, thumbnailCacheKey, write])

  return { save, writeInOrder, invalidatePendingSaves }
}
