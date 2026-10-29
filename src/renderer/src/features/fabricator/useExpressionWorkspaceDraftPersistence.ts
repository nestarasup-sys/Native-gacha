import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FaceExpressionWorkspaceDraft } from '../../../../shared/fabricator'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { createExpressionWorkspaceDraftQueue, type ExpressionWorkspaceDraftSaveStatus } from './expressionWorkspaceDraftQueue'

export type { ExpressionWorkspaceDraftSaveStatus } from './expressionWorkspaceDraftQueue'

export const expressionWorkspaceDraftStorageKey = (modelSlot: number) =>
  `fabricator.expression-workspace-draft.v1.model-${modelSlot}`

/** Persists a local recovery copy immediately and serializes debounced disk writes. */
export function useExpressionWorkspaceDraftPersistence({
  modelSlot,
  snapshot,
  reportError
}: {
  modelSlot: number
  snapshot: FaceExpressionWorkspaceDraft | null
  reportError: (message: string) => void
}) {
  const [status, setStatus] = useState<ExpressionWorkspaceDraftSaveStatus>('saved')
  const queue = useMemo(() => createExpressionWorkspaceDraftQueue({
    write: (draft) => window.desktop.fabricator.saveFaceExpressionWorkspaceDraft(draft.modelSlot, draft),
    scheduleTimer: (callback, delay) => setTimeout(callback, delay),
    cancelTimer: clearTimeout,
    setStatus,
    reportError
  }), [reportError])
  const flush = useCallback(() => queue.flush(modelSlot), [modelSlot, queue])

  useEffect(() => registerPendingWriteFlusher(flush), [flush])

  useEffect(() => {
    queue.reset()
    setStatus('saved')
  }, [modelSlot, queue])

  useEffect(() => {
    if (!snapshot) return
    setStatus('saving')
    try {
      localStorage.setItem(expressionWorkspaceDraftStorageKey(modelSlot), JSON.stringify(snapshot))
    } catch (reason) {
      setStatus('failed')
      reportError(reason instanceof Error ? `Não foi possível guardar o rascunho local: ${reason.message}` : 'Não foi possível guardar o rascunho local.')
    }
    queue.schedule(snapshot)
    return () => {
      queue.cancelScheduled()
    }
  }, [snapshot, modelSlot, queue, reportError])

  return { status }
}
