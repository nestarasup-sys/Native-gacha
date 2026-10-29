/** Shared model skin/outline settings consumed by Fabricator workspaces outside Modelos. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { serializeFabricatorProject } from './models/projectSerialization'

export function useFabricatorModelAppearance(deps: {
  activeSection: string
  activeSlot: number
  project: FabricatorProject | null
  setSlots: Dispatch<SetStateAction<FabricatorSlotSummary[]>>
}) {
  const { activeSection, activeSlot, project, setSlots } = deps
  const [appearanceTargetSlot, setAppearanceTargetSlotState] = useState<number | null>(null)
  const [otherAppearanceProject, setOtherAppearanceProject] = useState<FabricatorProject | null>(null)
  const [appearanceSaveState, setAppearanceSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [appearanceSaveError, setAppearanceSaveError] = useState('')
  const appearanceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAppearanceSave = useRef<FabricatorProject | null>(null)
  const appearanceSaveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const appearanceTargetRef = useRef<number | null>(null)

  const persistExternalAppearance = useCallback(async (snapshot: FabricatorProject) => {
    const previous = appearanceSaveQueue.current
    const current = previous.catch(() => undefined).then(async () => {
      await window.desktop.fabricator.saveFabricatorProject(serializeFabricatorProject(snapshot), [])
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setSlots((items) => items.map((item) => item?.slot === snapshot.slot ? { ...item, updatedAt: snapshot.updatedAt } : item))
      if (!pendingAppearanceSave.current) {
        setAppearanceSaveState('saved')
        setAppearanceSaveError('')
      }
    })
    appearanceSaveQueue.current = current
    try {
      await current
    } catch (reason) {
      setAppearanceSaveState('error')
      setAppearanceSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar as cores deste modelo.')
      throw reason
    }
  }, [])

  const flushExternalAppearanceSave = useCallback(async () => {
    if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
    appearanceSaveTimer.current = null
    const snapshot = pendingAppearanceSave.current
    if (snapshot) {
      pendingAppearanceSave.current = null
      try {
        await persistExternalAppearance(snapshot)
      } catch (reason) {
        if (!pendingAppearanceSave.current) pendingAppearanceSave.current = snapshot
        throw reason
      }
    }
    await appearanceSaveQueue.current
  }, [persistExternalAppearance])

  const setAppearanceTargetSlot = useCallback((slot: number | null) => {
    if (slot === null) return
    if (appearanceTargetRef.current === slot) {
      void flushExternalAppearanceSave().catch(() => undefined)
      return
    }
    void flushExternalAppearanceSave().then(() => {
      appearanceTargetRef.current = slot
      setAppearanceTargetSlotState(slot)
    }).catch(() => undefined)
  }, [flushExternalAppearanceSave])

  const scheduleExternalAppearanceSave = useCallback((snapshot: FabricatorProject) => {
    setOtherAppearanceProject(snapshot)
    pendingAppearanceSave.current = snapshot
    setAppearanceSaveState('saving')
    setAppearanceSaveError('')
    if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
    appearanceSaveTimer.current = setTimeout(() => {
      appearanceSaveTimer.current = null
      void flushExternalAppearanceSave().catch(() => undefined)
    }, 500)
  }, [flushExternalAppearanceSave])

  useEffect(() => registerPendingWriteFlusher(flushExternalAppearanceSave), [flushExternalAppearanceSave])

  const visibleAppearanceSlot = activeSection === 'Modelos' ? activeSlot : appearanceTargetSlot ?? activeSlot
  const appearanceProject = project?.slot === visibleAppearanceSlot
    ? project
    : otherAppearanceProject?.slot === visibleAppearanceSlot ? otherAppearanceProject : null

  useEffect(() => {
    if (visibleAppearanceSlot === project?.slot) {
      setOtherAppearanceProject(null)
      setAppearanceSaveState('saved')
      setAppearanceSaveError('')
      return
    }
    let active = true
    void window.desktop.fabricator.loadFabricatorSlot(visibleAppearanceSlot).then((loaded) => {
      if (active) {
        setOtherAppearanceProject(loaded)
        setAppearanceSaveState('saved')
        setAppearanceSaveError('')
      }
    }).catch((reason: unknown) => {
      if (active) {
        setOtherAppearanceProject(null)
        setAppearanceSaveState('error')
        setAppearanceSaveError(reason instanceof Error ? reason.message : 'Não foi possível carregar as cores deste modelo.')
      }
    })
    return () => { active = false }
  }, [visibleAppearanceSlot, project?.slot])

  useEffect(() => () => {
    if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
    appearanceSaveTimer.current = null
  }, [])

  return {
    appearanceTargetSlot,
    appearanceProject,
    appearanceSaveState,
    appearanceSaveError,
    visibleAppearanceSlot,
    setAppearanceTargetSlot,
    scheduleExternalAppearanceSave,
    flushExternalAppearanceSave
  }
}
