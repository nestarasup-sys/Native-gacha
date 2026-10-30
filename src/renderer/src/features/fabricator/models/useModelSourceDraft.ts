import { useEffect, useRef, useState } from 'react'
import type { FabricatorProject } from '../../../../../shared/fabricator'
import {
  composeModelSource,
  validateModelSourceChroma,
  validateModelSourceDimensions,
  type ModelSourceDimensions,
  type ModelSourceResult
} from './modelSource'

type UndoSnapshot = {
  project: FabricatorProject
  dimensions: ModelSourceDimensions
  tolerance: number
  selectedId: string
}

type MutationResult = {
  project: FabricatorProject
  selectedId: string
  status: string
}

type ModelSourceMutation = (
  materialized: FabricatorProject,
  result: ModelSourceResult
) => Promise<MutationResult | null>

export function useModelSourceDraft({
  project,
  downloading,
  clearGesture,
  setError,
  setStatus,
  clearDownloadInfo
}: {
  project: FabricatorProject
  downloading: boolean
  clearGesture: () => void
  setError: (message: string) => void
  setStatus: (message: string) => void
  clearDownloadInfo: () => void
}) {
  const [draft, setDraft] = useState(project)
  const [selectedId, setSelectedId] = useState(project.parts[0]?.id ?? '')
  const [dimensions, setDimensions] = useState<ModelSourceDimensions>({})
  const [chromaTolerance, setChromaTolerance] = useState(project.tolerance)
  const [busy, setBusy] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const undoStack = useRef<UndoSnapshot[]>([])
  const pixelEditAbort = useRef<AbortController | null>(null)

  const edited = draft !== project || Object.keys(dimensions).length > 0 || chromaTolerance !== project.tolerance
  const structureChanged = draft.parts.length !== project.parts.length
    || project.parts.some(part => !draft.parts.some(item => item.id === part.id))

  useEffect(() => () => {
    pixelEditAbort.current?.abort()
    pixelEditAbort.current = null
  }, [])

  const compile = async (): Promise<ModelSourceResult> => {
    validateModelSourceChroma(chromaTolerance)
    validateModelSourceDimensions(draft, dimensions)
    return composeModelSource(draft, dimensions, chromaTolerance)
  }

  const saveUndoSnapshot = () => {
    undoStack.current = [...undoStack.current, { project: draft, dimensions, tolerance: chromaTolerance, selectedId }].slice(-8)
    setUndoCount(undoStack.current.length)
  }

  const undo = () => {
    const snapshot = undoStack.current.pop()
    if (!snapshot) return
    setDraft(snapshot.project)
    setDimensions(snapshot.dimensions)
    setChromaTolerance(snapshot.tolerance)
    setSelectedId(snapshot.project.parts.some(part => part.id === snapshot.selectedId) ? snapshot.selectedId : snapshot.project.parts[0]?.id ?? '')
    setUndoCount(undoStack.current.length)
    clearGesture()
    setError('')
    setStatus('Última edição desfeita.')
    clearDownloadInfo()
  }

  const runMutation = async (mutate: ModelSourceMutation) => {
    if (busy || downloading) return
    setBusy(true)
    setError('')
    try {
      const result = await compile()
      const materialized: FabricatorProject = {
        ...draft,
        sourceDataUrl: result.sourceDataUrl,
        parts: result.parts,
        tolerance: result.tolerance,
        joints: result.joints,
        layerOrder: result.layerOrder,
        hiddenPartIds: result.hiddenPartIds
      }
      const mutation = await mutate(materialized, result)
      if (!mutation) return
      saveUndoSnapshot()
      setDraft(mutation.project)
      setDimensions({})
      setChromaTolerance(result.tolerance)
      setSelectedId(mutation.selectedId)
      clearGesture()
      setStatus(mutation.status)
      clearDownloadInfo()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível editar a peça.')
    } finally {
      setBusy(false)
    }
  }

  const runPixelEdit = async <T,>(edit: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    pixelEditAbort.current?.abort()
    const controller = new AbortController()
    pixelEditAbort.current = controller
    try {
      return await edit(controller.signal)
    } finally {
      if (pixelEditAbort.current === controller) pixelEditAbort.current = null
    }
  }

  return {
    draft,
    setDraft,
    selectedId,
    setSelectedId,
    dimensions,
    setDimensions,
    chromaTolerance,
    setChromaTolerance,
    busy,
    setBusy,
    undoCount,
    edited,
    structureChanged,
    compile,
    saveUndoSnapshot,
    undo,
    runMutation,
    runPixelEdit
  }
}
