import { useEffect, useRef, useState } from 'react'
import type { StudioDocument } from '../../../../shared/studio'
import { recordStudioHistory, redoStudioHistory, undoStudioHistory, type StudioHistory } from '../../../../shared/studioHistory'

type Dependencies = {
  activeStudio: StudioDocument | null
  activeStudioId: string | null
  patchStudio: (transform: (studio: StudioDocument) => StudioDocument) => void
}

/** Owns Studio undo/redo state while delegating immutable snapshots to the shared history model. */
export function useStudioHistory({ activeStudio, activeStudioId, patchStudio }: Dependencies) {
  const [historyVersion, setHistoryVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const historyRef = useRef<StudioHistory>({ undo: [], redo: [] })

  useEffect(() => {
    if (!activeStudioId) return
    historyRef.current = { undo: [], redo: [] }
    setCanUndo(false)
    setCanRedo(false)
    setHistoryVersion((value) => value + 1)
  }, [activeStudioId])

  const recordHistory = (document = activeStudio) => {
    if (!document) return
    historyRef.current = recordStudioHistory(historyRef.current, document)
    setCanUndo(historyRef.current.undo.length > 0)
    setCanRedo(false)
    setHistoryVersion((value) => value + 1)
  }

  const undo = () => {
    if (!activeStudio) return
    const result = undoStudioHistory(historyRef.current, activeStudio)
    if (!result) return
    historyRef.current = result.history
    patchStudio(() => result.document)
    setCanUndo(result.history.undo.length > 0)
    setCanRedo(true)
    setHistoryVersion((value) => value + 1)
  }

  const redo = () => {
    if (!activeStudio) return
    const result = redoStudioHistory(historyRef.current, activeStudio)
    if (!result) return
    historyRef.current = result.history
    patchStudio(() => result.document)
    setCanUndo(true)
    setCanRedo(result.history.redo.length > 0)
    setHistoryVersion((value) => value + 1)
  }

  return { historyVersion, canUndo, canRedo, recordHistory, undo, redo }
}
