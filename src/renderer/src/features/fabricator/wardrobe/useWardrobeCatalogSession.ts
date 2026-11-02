import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { FabricatorPose, FabricatorProject, FabricatorSlotSummary, WardrobeSet, WardrobeSetSummary } from '../../../../../shared/fabricator'
import { loadWardrobeWorkspaceSnapshot } from './loadWardrobeWorkspaceSnapshot'
import { loadWardrobeSetForEditing } from './loadWardrobeSetForEditing'
import { recoverWardrobeReferenceModel } from './wardrobeReferenceRecovery'
import { createWardrobeGridHistory } from './wardrobeGridHistory'

type Setter<T> = Dispatch<SetStateAction<T>>
type WardrobeCatalogIssue = { id: string; reason: string }

type UseWardrobeCatalogSessionOptions = {
  modelSlot: number
  model: FabricatorProject | null
  referenceModel: FabricatorProject | null
  dirty: boolean
  processing: boolean
  saving: boolean
  openingSet: boolean
  requestRef: MutableRefObject<number>
  workerRef: MutableRefObject<Worker | null>
  pairedGridHistoryRef: MutableRefObject<ReturnType<typeof createWardrobeGridHistory>>
  invalidateTestPose: () => void
  clearDeformationSession: () => void
  setModelSlot: Setter<number>
  setModels: Setter<FabricatorSlotSummary[]>
  setModel: Setter<FabricatorProject | null>
  setSets: Setter<WardrobeSetSummary[]>
  setCatalogIssues: Setter<WardrobeCatalogIssue[]>
  setDraft: Setter<WardrobeSet | null>
  setActiveSetId: Setter<string | null>
  setSelectedId: Setter<string | null>
  setOpeningSet: Setter<boolean>
  setDirty: Setter<boolean>
  setError: Setter<string>
  setJoinJointsMode: Setter<boolean>
  setTestPose: Setter<FabricatorPose | null>
  setTestPoseLoading: Setter<boolean>
  setTestPosePickerOpen: Setter<boolean>
  setTestDragOffsets: Setter<Record<string, { x: number; y: number }>>
  setCalibratingPartId: Setter<string | null>
  setDeformMode: Setter<boolean>
}

/** Coordinates model-slot loading and saved-set activation, including stale-response guards. */
export function useWardrobeCatalogSession(options: UseWardrobeCatalogSessionOptions) {
  const {
    modelSlot, model, referenceModel, dirty, processing, saving, openingSet,
    requestRef, workerRef, pairedGridHistoryRef, invalidateTestPose,
    clearDeformationSession, setModelSlot, setModels, setModel, setSets,
    setCatalogIssues, setDraft, setActiveSetId, setSelectedId, setOpeningSet,
    setDirty, setError, setJoinJointsMode, setTestPose, setTestPoseLoading,
    setTestPosePickerOpen, setTestDragOffsets, setCalibratingPartId, setDeformMode
  } = options
  const invalidateTestPoseRef = useRef(invalidateTestPose)
  invalidateTestPoseRef.current = invalidateTestPose

  const reload = useCallback(async (targetSlot: number) => {
    const requestId = ++requestRef.current
    clearDeformationSession()
    workerRef.current?.terminate()
    setOpeningSet(false)
    setModel(null); setSets([]); setCatalogIssues([]); setDraft(null); setActiveSetId(null); setSelectedId(null)
    setError('')
    try {
      const snapshot = await loadWardrobeWorkspaceSnapshot(targetSlot, {
        listSlots: () => window.desktop.fabricator.listFabricatorSlots(),
        loadModel: (slot) => window.desktop.fabricator.loadFabricatorSlot(slot),
        listWardrobeSets: (slot) => window.desktop.fabricator.listWardrobeSetsDetailed(slot),
        loadHistory: (slot) => window.desktop.fabricator.loadFabricatorHistory(slot),
        recoverReference: recoverWardrobeReferenceModel
      })
      if (requestRef.current !== requestId) return
      if (snapshot.kind === 'redirect') {
        setModels(snapshot.models)
        setModelSlot(snapshot.targetSlot)
        return
      }
      setModels(snapshot.models); setModel(snapshot.model); setSets(snapshot.catalog.sets); setCatalogIssues(snapshot.catalog.issues)
      setActiveSetId(null); setDraft(null); setSelectedId(null); setDirty(false); setJoinJointsMode(false)
    } catch (reason) {
      if (requestRef.current !== requestId) return
      setModel(null); setSets([]); setCatalogIssues([]); setDraft(null); setActiveSetId(null); setSelectedId(null)
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de roupas.')
    }
  }, [clearDeformationSession, requestRef, setActiveSetId, setCatalogIssues, setDirty, setDraft, setError, setJoinJointsMode, setModel, setModelSlot, setModels, setOpeningSet, setSelectedId, setSets, workerRef])

  useEffect(() => { void reload(modelSlot) }, [modelSlot, reload])

  useEffect(() => () => {
    requestRef.current++
    invalidateTestPoseRef.current()
    workerRef.current?.terminate()
  }, [requestRef, workerRef])

  const openSet = async (id: string) => {
    if (!model || processing || saving || openingSet) return
    if (dirty && !window.confirm('Há alterações não salvas neste conjunto. Descartar e abrir outro?')) return
    invalidateTestPose()
    setTestPoseLoading(false)
    setTestPosePickerOpen(false)
    setDeformMode(false)
    const requestId = ++requestRef.current
    setOpeningSet(true)
    try {
      const { set: loaded, incompatibleComponents } = await loadWardrobeSetForEditing(modelSlot, id, {
        loadWardrobeSet: (slot, setId) => window.desktop.fabricator.loadWardrobeSet(slot, setId),
        referenceParts: referenceModel?.parts ?? [],
        currentModelParts: model.parts
      })
      if (requestRef.current !== requestId) return
      // Opening a legacy set only adapts the in-memory editing view; save owns persistence.
      clearDeformationSession()
      pairedGridHistoryRef.current.clear()
      setDraft(loaded); setActiveSetId(id); setSelectedId(loaded.components[0]?.id ?? null)
      setDirty(false); setJoinJointsMode(false); setTestPose(null); setTestDragOffsets({}); setCalibratingPartId(null)
      setError(incompatibleComponents.length
        ? `${incompatibleComponents.length} peça(s) sem vínculo compatível com o modelo original (${incompatibleComponents.map((component) => component.name || component.id).join(', ')}). O conjunto foi preservado; corrija os ossos antes de salvar.`
        : '')
    } catch (reason) { if (requestRef.current === requestId) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o conjunto.') }
    finally { if (requestRef.current === requestId) setOpeningSet(false) }
  }

  return { openSet }
}
