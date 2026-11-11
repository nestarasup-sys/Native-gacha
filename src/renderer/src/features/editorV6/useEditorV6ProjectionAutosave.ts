import { useEffect, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { getEditorV6ProjectionAutosaveAction, type EditorV6ProjectionAutosaveSignature } from './editorV6ProjectionAutosaveModel'

type SaveTimerRef = { current: number | null }
type Options = {
  project: EditorV6Document | null
  signature: string
  dragRef: { current: unknown }
  saveTimerRef: SaveTimerRef
  markUnsaved: () => void
  saveProject: (project: EditorV6Document) => Promise<unknown>
}

/** Persists character-projection changes while leaving document-save ownership in persistence. */
export function useEditorV6ProjectionAutosave({ project, signature, dragRef, saveTimerRef, markUnsaved, saveProject }: Options) {
  const previousSignatureRef = useRef<EditorV6ProjectionAutosaveSignature | null>(null)

  useEffect(() => {
    const action = getEditorV6ProjectionAutosaveAction(project?.id ?? null, signature, previousSignatureRef.current, Boolean(dragRef.current))
    if (action === 'reset') {
      previousSignatureRef.current = null
      return
    }
    if (action === 'skip') return
    if (!project) return

    previousSignatureRef.current = { projectId: project.id, value: signature }
    if (action === 'baseline') return

    markUnsaved()
    if (action === 'save-now') {
      void saveProject(project)
      return
    }

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    const timer = window.setTimeout(() => {
      if (saveTimerRef.current === timer) saveTimerRef.current = null
      void saveProject(project)
    }, 650)
    saveTimerRef.current = timer
    return () => {
      window.clearTimeout(timer)
      if (saveTimerRef.current === timer) saveTimerRef.current = null
    }
  }, [project, signature, dragRef, saveTimerRef, markUnsaved, saveProject])
}
