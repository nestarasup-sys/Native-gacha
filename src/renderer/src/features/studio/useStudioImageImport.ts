import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { StudioDocument } from '../../../../shared/studio'
import { addStudioImageAsset } from './studioImageChanges'

type StudioTool = 'background' | 'objects' | null
type StudioListSetter = Dispatch<SetStateAction<StudioDocument[]>>
type TrackOperation = <T,>(operation: () => Promise<T>) => Promise<T>

type StudioImageImportOptions = {
  activeStudio: StudioDocument | null
  studiosRef: MutableRefObject<StudioDocument[]>
  activeStudioIdRef: MutableRefObject<string | null>
  setStudios: StudioListSetter
  trackOperation: TrackOperation
  writeInOrder: (document: StudioDocument) => Promise<unknown>
  recordHistory: (document?: StudioDocument) => void
  markUnsaved: () => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
  setSelectedElementId: (id: string | null) => void
  setActiveTool: (tool: StudioTool) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: 'editor' | 'custom') => void
}

/** Coordinates importing an image, applying it to the latest Studio snapshot, and persisting it in order. */
export function useStudioImageImport({
  activeStudio,
  studiosRef,
  activeStudioIdRef,
  setStudios,
  trackOperation,
  writeInOrder,
  recordHistory,
  markUnsaved,
  setSaved,
  setError,
  setSelectedElementId,
  setActiveTool,
  setInspectorOpen,
  setInspectorTab
}: StudioImageImportOptions) {
  return useCallback((category: 'background' | 'object') => trackOperation(async () => {
    if (!activeStudio) return
    const studioId = activeStudio.id
    try {
      const asset = await window.desktop.studio.importStudioImage(category)
      if (!asset) return
      const studioAtImport = studiosRef.current.find((studio) => studio.id === studioId)
      if (!studioAtImport) { setError('Não foi possível carregar o Studio para adicionar a imagem.'); return }
      const nextStudio = addStudioImageAsset(studioAtImport, asset, category, () => crypto.randomUUID())
      const isActive = activeStudioIdRef.current === studioId
      const nextStudios = studiosRef.current.map((studio) => studio.id === studioId ? nextStudio : studio)
      studiosRef.current = nextStudios
      setStudios(nextStudios)
      if (isActive) {
        recordHistory(studioAtImport)
        markUnsaved()
      }
      await writeInOrder(nextStudio)
      const currentStudio = studiosRef.current.find((studio) => studio.id === studioId)
      const isStillCurrent = isActive
        && activeStudioIdRef.current === studioId
        && currentStudio?.updatedAt === nextStudio.updatedAt
      if (isStillCurrent) {
        setSaved(true)
        setError(null)
        setSelectedElementId(category === 'background' ? 'background' : nextStudio.elements.at(-1)?.id ?? null)
        setActiveTool(category === 'background' ? 'background' : 'objects')
        setInspectorOpen(true)
        setInspectorTab('editor')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }), [activeStudio, activeStudioIdRef, markUnsaved, recordHistory, setActiveTool, setError, setInspectorOpen, setInspectorTab, setSaved, setSelectedElementId, setStudios, studiosRef, trackOperation, writeInOrder])
}
