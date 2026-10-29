import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { createPendingOperationTracker } from '../../ui/pendingOperations'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { useSerializedSceneDocumentSave } from '../../ui/hooks/useSerializedSceneDocumentSave'
import { useEditorV6Store } from './editorV6Store'

type SaveTimerRef = { current: number | null }
type EditorV6DocumentPersistenceOptions = {
  activeProject: EditorV6Document | null
  activeProjectIdRef: { current: string | null }
  saved: boolean
  saveTimerRef: SaveTimerRef
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
  updateActiveProject: (update: (project: EditorV6Document) => EditorV6Document) => void
}

async function makeEditorV6Thumbnail(project: EditorV6Document): Promise<string> {
  const { captureEditorV6Frame } = await import('./sceneCapture')
  return captureEditorV6Frame(project, 0, 480, 270, 'image/jpeg')
}

function editorV6ThumbnailCacheKey(project: EditorV6Document): readonly unknown[] {
  return [project.id, project.assets, project.elements, project.timeline, project.media ?? null,
    project.backgroundColor, project.backgroundAssetId, project.backgroundX, project.backgroundY,
    project.backgroundWidth, project.backgroundHeight, project.backgroundRotation]
}

/** Owns Editor V6 document writes, autosave flushing, and operation draining. */
export function useEditorV6DocumentPersistence({
  activeProject,
  activeProjectIdRef,
  saved,
  saveTimerRef,
  setSaved,
  setError,
  updateActiveProject
}: EditorV6DocumentPersistenceOptions) {
  const pendingOperations = useMemo(() => createPendingOperationTracker(), [])
  const trackOperation = pendingOperations.track
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const writeDocument = useCallback((document: EditorV6Document) => (
    trackOperation(() => window.desktop.editorV6.saveEditorV6Project(document))
  ), [trackOperation])
  const onDocumentSaved = useCallback((document: EditorV6Document, savedDocument: EditorV6Document) => {
    if (savedDocument.thumbnailDataUrl !== document.thumbnailDataUrl) {
      updateActiveProject((project) => project.id === document.id && project.updatedAt === document.updatedAt && project.thumbnailDataUrl !== savedDocument.thumbnailDataUrl
        ? { ...project, thumbnailDataUrl: savedDocument.thumbnailDataUrl }
        : project)
    }
    setSaved(true)
    setError(null)
  }, [setError, setSaved, updateActiveProject])
  const onDocumentSaveError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o projeto do Editor V6 neste dispositivo.')
  }, [setError])
  const {
    save: saveDocument,
    writeInOrder,
    invalidatePendingSaves
  } = useSerializedSceneDocumentSave(activeProject, {
    createThumbnail: makeEditorV6Thumbnail,
    thumbnailCacheKey: editorV6ThumbnailCacheKey,
    write: writeDocument,
    onSaved: onDocumentSaved,
    onError: onDocumentSaveError
  })

  const saveActiveProject = useCallback((document = activeProject) => {
    const pending = saveDocument(document)
    savePromiseRef.current = pending
    void pending.then(() => { if (savePromiseRef.current === pending) savePromiseRef.current = null })
    return pending
  }, [activeProject, saveDocument])

  const flushDocumentWrites = useCallback(async () => {
    const hadPendingTimer = saveTimerRef.current !== null
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    try {
      const activeId = activeProjectIdRef.current
      const stored = useEditorV6Store.getState().activeProject
      const latest = activeId && stored?.id === activeId ? stored : null
      if (latest && (hadPendingTimer || !saved) && !await saveActiveProject(latest)) throw new Error('Não foi possível salvar o projeto do Editor V6 antes de continuar.')
      const inFlightSave = savePromiseRef.current
      if (inFlightSave && !await inFlightSave) throw new Error('Não foi possível concluir o salvamento do Editor V6.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o projeto do Editor V6 antes de continuar.')
      throw reason
    }
  }, [activeProjectIdRef, saveActiveProject, saveTimerRef, saved, setError])

  const flushWrites = useCallback(async () => {
    try {
      await pendingOperations.flush()
      await flushDocumentWrites()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o projeto do Editor V6 antes de continuar.')
      throw reason
    }
  }, [flushDocumentWrites, pendingOperations, setError])

  useEffect(() => registerPendingWriteFlusher(flushWrites), [flushWrites])

  const markUnsaved = useCallback(() => {
    invalidatePendingSaves()
    setSaved(false)
  }, [invalidatePendingSaves, setSaved])

  return {
    trackOperation,
    writeDocument,
    writeInOrder,
    saveActiveProject,
    flushDocumentWrites,
    flushWrites,
    markUnsaved
  }
}
