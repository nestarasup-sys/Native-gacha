import { useEffect, useMemo, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import {
  createEditorV6PoseRevisionSnapshot,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot
} from './editorV6CharacterSourceModel.ts'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceModel.ts'

export {
  createEditorV6PoseRevisionSnapshot,
  editorV6PoseRevisionKey,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot
} from './editorV6CharacterSourceModel.ts'

/** Loads the live character catalog and tracks the pose revisions used by this project. */
export function useEditorV6CharacterSources(projectId: string | null, reportError: (message: string) => void) {
  const [availableCharacters, setAvailableCharacters] = useState<CustomizerCharacter[]>([])
  const [poseSourceSnapshot, setPoseSourceSnapshot] = useState<PoseRevisionSnapshot | null>(null)
  const availableCharacterById = useMemo(() => new Map(availableCharacters.map((character) => [character.id, character])), [availableCharacters])
  const fabricatorModelSlots = useMemo(() => [...new Set(availableCharacters.map((character) => character.customization.modelSlot ?? 1))].sort((left, right) => left - right), [availableCharacters])
  const fabricatorModelSlotsKey = fabricatorModelSlots.join(',')
  const activePoseSourceSnapshot = poseSourceSnapshot?.projectId === projectId ? poseSourceSnapshot : null

  useEffect(() => {
    let cancelled = false
    let requestRunning = false
    let requestQueued = false
    const refreshCharacters = () => {
      if (requestRunning) { requestQueued = true; return }
      requestRunning = true
      void window.desktop.customizer.listCustomizerCharacters().then((characters) => {
        if (!cancelled) setAvailableCharacters((current) => sameCustomizerCharacterCatalog(current, characters) ? current : characters)
      }).catch((reason: unknown) => {
        if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível carregar o elenco de personagens.')
      }).finally(() => {
        requestRunning = false
        if (requestQueued && !cancelled) { requestQueued = false; refreshCharacters() }
      })
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshCharacters() }
    refreshCharacters()
    window.addEventListener('focus', refreshCharacters)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshCharacters)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [reportError])

  useEffect(() => {
    if (!projectId) { setPoseSourceSnapshot(null); return }
    let cancelled = false
    let requestRunning = false
    let requestQueued = false
    const refreshPoseSourceSnapshot = async () => {
      if (requestRunning) { requestQueued = true; return }
      requestRunning = true
      try {
        do {
          requestQueued = false
          try {
            const catalogs = await Promise.all(fabricatorModelSlots.map(async (modelSlot) => ({
              modelSlot,
              poses: await window.desktop.fabricator.listFabricatorPoseSlots(modelSlot)
            })))
            if (cancelled) return
            const revisions = createEditorV6PoseRevisionSnapshot(catalogs)
            setPoseSourceSnapshot((current) => current?.projectId === projectId && samePoseRevisionSnapshot(current.revisions, revisions)
              ? current : { projectId, revisions })
          } catch (reason) {
            if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível verificar as versões das poses salvas.')
          }
        } while (requestQueued && !cancelled)
      } finally { requestRunning = false }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshPoseSourceSnapshot() }
    void refreshPoseSourceSnapshot()
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('fabricator:assets-updated', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('fabricator:assets-updated', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [projectId, fabricatorModelSlotsKey])

  return { availableCharacters, availableCharacterById, activePoseSourceSnapshot }
}
