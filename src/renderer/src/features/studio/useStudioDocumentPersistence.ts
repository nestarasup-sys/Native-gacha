import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import type { StudioDocument } from '../../../../shared/studio'
import { createPendingOperationTracker } from '../../ui/pendingOperations'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { useSerializedSceneDocumentSave } from '../../ui/hooks/useSerializedSceneDocumentSave'
import { makeStudioThumbnail } from './studioCanvasPrint'

type StudioListSetter = Dispatch<SetStateAction<StudioDocument[]>>
export type StudioSaveTimerRef = { current: number | null }

type StudioDocumentPersistenceOptions = {
  studios: StudioDocument[]
  activeStudio: StudioDocument | null
  activeStudioId: string | null
  saved: boolean
  setStudios: StudioListSetter
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
}

function studioThumbnailCacheKey(studio: StudioDocument): readonly unknown[] {
  return [studio.id, studio.assets, studio.elements, studio.backgroundColor, studio.backgroundAssetId,
    studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight,
    studio.backgroundRotation]
}

/** Owns Studio document writes, autosave flushing, and pending operation draining. */
export function useStudioDocumentPersistence({
  studios,
  activeStudio,
  activeStudioId,
  saved,
  setStudios,
  setSaved,
  setError
}: StudioDocumentPersistenceOptions) {
  const studiosRef = useRef(studios)
  const activeStudioIdRef = useRef(activeStudioId)
  const ipcWritesRef = useRef(new Set<Promise<unknown>>())
  const pendingOperations = useMemo(() => createPendingOperationTracker(), [])
  const saveTimerRef = useRef<number | null>(null)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)

  useLayoutEffect(() => { studiosRef.current = studios }, [studios])
  useLayoutEffect(() => { activeStudioIdRef.current = activeStudioId }, [activeStudioId])

  const trackIpcWrite = useCallback(<T,>(operation: Promise<T>) => {
    ipcWritesRef.current.add(operation)
    void operation.then(() => ipcWritesRef.current.delete(operation), () => ipcWritesRef.current.delete(operation))
    return operation
  }, [])
  const writeDocument = useCallback((studio: StudioDocument) => (
    trackIpcWrite(window.desktop.studio.saveStudio(studio))
  ), [trackIpcWrite])
  const onDocumentSaved = useCallback((document: StudioDocument, savedDocument: StudioDocument) => {
    if (savedDocument.thumbnailDataUrl !== document.thumbnailDataUrl) {
      setStudios((current) => current.map((studio) => studio.id === document.id && studio.updatedAt === document.updatedAt && studio.thumbnailDataUrl !== savedDocument.thumbnailDataUrl
        ? { ...studio, thumbnailDataUrl: savedDocument.thumbnailDataUrl }
        : studio))
    }
    setSaved(true)
    setError(null)
  }, [setError, setSaved, setStudios])
  const onDocumentSaveError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o Studio neste dispositivo.')
  }, [setError])
  const {
    save: saveDocument,
    writeInOrder,
    invalidatePendingSaves
  } = useSerializedSceneDocumentSave(activeStudio, {
    createThumbnail: makeStudioThumbnail,
    thumbnailCacheKey: studioThumbnailCacheKey,
    write: writeDocument,
    onSaved: onDocumentSaved,
    onError: onDocumentSaveError
  })

  const saveActiveStudio = useCallback((document = activeStudio) => {
    const pending = saveDocument(document)
    savePromiseRef.current = pending
    void pending.then(() => { if (savePromiseRef.current === pending) savePromiseRef.current = null })
    return pending
  }, [activeStudio, saveDocument])

  const flushDocumentWrites = useCallback(async () => {
    const hadPendingTimer = saveTimerRef.current !== null
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    try {
      const activeId = activeStudioIdRef.current
      const latest = activeId ? studiosRef.current.find((studio) => studio.id === activeId) ?? null : null
      if (latest && (hadPendingTimer || !saved) && !await saveActiveStudio(latest)) {
        throw new Error('Não foi possível salvar o Studio antes de continuar.')
      }
      const inFlightSave = savePromiseRef.current
      if (inFlightSave && !await inFlightSave) throw new Error('Não foi possível concluir o salvamento do Studio.')
      while (ipcWritesRef.current.size > 0) {
        const results = await Promise.allSettled([...ipcWritesRef.current])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o Studio antes de continuar.')
      throw reason
    }
  }, [saveActiveStudio, saved, setError])

  const flushWrites = useCallback(async () => {
    try {
      await pendingOperations.flush()
      await flushDocumentWrites()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir as operações do Studio antes de continuar.')
      throw reason
    }
  }, [flushDocumentWrites, pendingOperations, setError])

  useEffect(() => registerPendingWriteFlusher(flushWrites), [flushWrites])

  const markUnsaved = useCallback(() => {
    invalidatePendingSaves()
    setSaved(false)
  }, [invalidatePendingSaves, setSaved])

  return {
    studiosRef,
    activeStudioIdRef,
    trackOperation: pendingOperations.track,
    trackIpcWrite,
    writeDocument,
    writeInOrder,
    saveTimerRef,
    saveActiveStudio,
    flushDocumentWrites,
    flushWrites,
    markUnsaved
  }
}

/** Preserves Studio's debounce and immediate-save rule for expression changes. */
export function useStudioAutosave({
  activeStudio,
  autosaveSignature,
  saveTimerRef,
  save,
  markUnsaved
}: {
  activeStudio: StudioDocument | null
  autosaveSignature: string
  saveTimerRef: StudioSaveTimerRef
  save: (document?: StudioDocument | null) => Promise<boolean>
  markUnsaved: () => void
}) {
  const autosaveSignatureRef = useRef<{ studioId: string; value: string } | null>(null)

  useEffect(() => {
    if (!activeStudio) return
    markUnsaved()
    const previous = autosaveSignatureRef.current
    autosaveSignatureRef.current = { studioId: activeStudio.id, value: autosaveSignature }
    if (previous?.studioId === activeStudio.id && previous.value !== autosaveSignature) {
      void save(activeStudio)
      return
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    const timer = window.setTimeout(() => {
      if (saveTimerRef.current === timer) saveTimerRef.current = null
      void save(activeStudio)
    }, 650)
    saveTimerRef.current = timer
    return () => {
      window.clearTimeout(timer)
      if (saveTimerRef.current === timer) saveTimerRef.current = null
    }
  }, [activeStudio, autosaveSignature, markUnsaved, save, saveTimerRef])
}
