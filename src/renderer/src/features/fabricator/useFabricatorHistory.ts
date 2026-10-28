import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FabricatorHistoryAction, FabricatorHistorySaveState, FabricatorHistoryState, FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'
import { serializeFabricatorProject } from './models/projectSerialization'

type MutableValue<T> = { current: T }

type FabricatorHistoryDependencies = {
  projectRef: MutableValue<FabricatorProject | null>
  dirtyAssets: MutableValue<Map<string, string>>
  dirtyChromaBases: MutableValue<Map<string, string>>
  setProject: Dispatch<SetStateAction<FabricatorProject | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setSaveState: Dispatch<SetStateAction<'saved' | 'saving' | 'error'>>
  setError: Dispatch<SetStateAction<string>>
  setSlots: Dispatch<SetStateAction<FabricatorSlotSummary[]>>
  processing: boolean
  chromaApplying: boolean
}

const emptyHistory = (): FabricatorHistoryState => ({ undo: [], redo: [] })

export function useFabricatorHistory(deps: FabricatorHistoryDependencies) {
  const [history, setHistory] = useState<FabricatorHistoryState>(emptyHistory)
  const [historyBusy, setHistoryBusy] = useState(false)
  const historyRef = useRef<FabricatorHistoryState>(emptyHistory())
  const historyGestureRef = useRef(false)
  const historyGestureChangedRef = useRef(false)
  const historyGestureSnapshotRef = useRef<FabricatorProject | null>(null)
  const historyGestureActionRef = useRef<FabricatorHistoryAction>('edit')

  const replaceHistory = (next: FabricatorHistoryState) => {
    historyRef.current = next
    setHistory(next)
  }

  const publishHistory = (next: FabricatorHistoryState, currentProject: FabricatorProject) => {
    const bounded = { undo: next.undo.slice(-50), redo: next.redo.slice(-50) }
    replaceHistory(bounded)
    const forDisk: FabricatorHistorySaveState = {
      undo: bounded.undo.map(({ action, project: snapshot }) => { const { sourceDataUrl: _sourceDataUrl, ...project } = snapshot; return { action, project } }),
      redo: bounded.redo.map(({ action, project: snapshot }) => { const { sourceDataUrl: _sourceDataUrl, ...project } = snapshot; return { action, project } })
    }
    const currentForDisk = serializeFabricatorProject(currentProject)
    const changedAssets = currentProject.parts.flatMap((part) => {
      const dataUrl = deps.dirtyAssets.current.get(part.id)
      const chromaBaseDataUrl = deps.dirtyChromaBases.current.get(part.id)
      return dataUrl || chromaBaseDataUrl ? [{ id: part.id, dataUrl: dataUrl ?? part.dataUrl, ...(chromaBaseDataUrl ? { chromaBaseDataUrl } : {}) }] : []
    })
    deps.setSaveState('saving')
    void window.desktop.saveFabricatorHistory(currentProject.slot, forDisk, currentForDisk, changedAssets).then(() => {
      for (const asset of changedAssets) if (deps.dirtyAssets.current.get(asset.id) === asset.dataUrl) deps.dirtyAssets.current.delete(asset.id)
      deps.setSaveState('saved')
      deps.setSlots((current) => current.map((item, index) => index + 1 === currentProject.slot ? { slot: currentProject.slot, name: currentProject.name, sourceName: currentProject.sourceName, partCount: currentProject.parts.length, updatedAt: currentProject.updatedAt } : item))
    }).catch((reason: unknown) => {
      deps.setError(reason instanceof Error ? `Falha ao salvar o histórico: ${reason.message}` : 'Falha ao salvar o histórico local.')
      deps.setSaveState('error')
    })
  }

  const recordHistorySnapshot = (snapshot: FabricatorProject, action: FabricatorHistoryAction, currentProject: FabricatorProject) => {
    const current = historyRef.current
    publishHistory({ undo: [...current.undo, { action, project: snapshot }].slice(-50), redo: [] }, currentProject)
  }

  const startHistoryGesture = (action: FabricatorHistoryAction) => {
    if (historyGestureRef.current) return
    historyGestureRef.current = true
    historyGestureChangedRef.current = false
    historyGestureSnapshotRef.current = deps.projectRef.current
    historyGestureActionRef.current = action
  }

  const finishHistoryGesture = () => {
    const snapshot = historyGestureSnapshotRef.current
    const changed = historyGestureChangedRef.current
    const action = historyGestureActionRef.current
    historyGestureRef.current = false
    historyGestureChangedRef.current = false
    historyGestureSnapshotRef.current = null
    if (snapshot && changed && deps.projectRef.current) recordHistorySnapshot(snapshot, action, deps.projectRef.current)
  }

  const resetHistoryGesture = () => {
    historyGestureRef.current = false
    historyGestureChangedRef.current = false
    historyGestureSnapshotRef.current = null
  }

  const trackProjectChange = (current: FabricatorProject, next: FabricatorProject, action: FabricatorHistoryAction) => {
    if (historyGestureRef.current) historyGestureChangedRef.current = true
    else recordHistorySnapshot(current, action, next)
  }

  const restoreHistory = async (direction: 'undo' | 'redo') => {
    const currentProject = deps.projectRef.current
    const currentHistory = historyRef.current
    const sourceStack = currentHistory[direction]
    const entry = sourceStack[sourceStack.length - 1]
    if (!currentProject || !entry || historyBusy || deps.processing || deps.chromaApplying) return
    setHistoryBusy(true)
    try {
      const target = entry.project
      const nextHistory: FabricatorHistoryState = direction === 'undo'
        ? { undo: currentHistory.undo.slice(0, -1), redo: [...currentHistory.redo, { action: entry.action, project: currentProject }].slice(-50) }
        : { undo: [...currentHistory.undo, { action: entry.action, project: currentProject }].slice(-50), redo: currentHistory.redo.slice(0, -1) }
      for (const part of target.parts) {
        deps.dirtyAssets.current.set(part.id, part.dataUrl)
        if (part.chromaBaseDataUrl && part.chromaBaseSaved) deps.dirtyChromaBases.current.set(part.id, part.chromaBaseDataUrl)
      }
      deps.projectRef.current = target
      deps.setProject(target)
      deps.setSelectedIds((ids) => { const valid = ids.filter((id) => target.parts.some((part) => part.id === id)); return valid.length ? valid : target.parts[0] ? [target.parts[0].id] : [] })
      publishHistory(nextHistory, target)
    } catch (reason) {
      deps.setError(reason instanceof Error ? `Não foi possível restaurar o histórico: ${reason.message}` : 'Não foi possível restaurar esse estado.')
    } finally {
      setHistoryBusy(false)
    }
  }

  return {
    history,
    historyBusy,
    clearHistory: () => replaceHistory(emptyHistory()),
    replaceHistory,
    recordHistorySnapshot,
    startHistoryGesture,
    finishHistoryGesture,
    resetHistoryGesture,
    trackProjectChange,
    restoreHistory
  }
}
