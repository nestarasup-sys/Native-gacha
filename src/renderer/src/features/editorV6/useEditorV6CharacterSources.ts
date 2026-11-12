import { useEffect, useMemo, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { subscribeToCustomizerCharacterUpdates } from './editorV6CharacterSourceEvents.ts'
import {
  createEditorV6PoseRevisionSnapshot,
  createEditorV6ModelRevisionSnapshot,
  createEditorV6WardrobeRevisionSnapshot,
  createEditorV6HairRevisionSnapshot,
  createEditorV6HeadExtraRevisionSnapshot,
  createEditorV6EyeRevisionSnapshot,
  editorV6EyeAssetKinds,
  sameSourceRevisionSnapshot
} from './editorV6CharacterSourceRevisions.ts'
import { sameCustomizerCharacterCatalog } from './editorV6CharacterSourceModel.ts'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceRevisions.ts'

export {
  createEditorV6PoseRevisionSnapshot,
  createEditorV6ModelRevisionSnapshot,
  createEditorV6WardrobeRevisionSnapshot,
  createEditorV6HairRevisionSnapshot,
  createEditorV6HeadExtraRevisionSnapshot,
  createEditorV6EyeRevisionSnapshot,
  editorV6CharacterEyeSourceRevision,
  editorV6CharacterHeadExtraSourceRevision,
  editorV6CharacterHairSourceRevision,
  editorV6CharacterWardrobeSourceRevision,
  editorV6HeadExtraRevisionKey,
  editorV6EyeRevisionKey,
  editorV6HairRevisionKey,
  editorV6PoseRevisionKey,
  editorV6WardrobeRevisionKey,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot,
  sameSourceRevisionSnapshot
} from './editorV6CharacterSourceModel.ts'

/** Loads live character and Fabricator source revisions used by this project. */
export function useEditorV6CharacterSources(projectId: string | null, reportError: (message: string) => void) {
  const [availableCharacters, setAvailableCharacters] = useState<CustomizerCharacter[]>([])
  const [availableCharactersReady, setAvailableCharactersReady] = useState(false)
  const [poseSourceSnapshot, setPoseSourceSnapshot] = useState<PoseRevisionSnapshot | null>(null)
  const availableCharacterById = useMemo(() => new Map(availableCharacters.map((character) => [character.id, character])), [availableCharacters])
  const fabricatorModelSlots = useMemo(() => [...new Set(availableCharacters.flatMap((character) => [
    character.customization.modelSlot ?? 1,
    ...(character.customization.wardrobeGroups ?? []).map((group) => group.modelSlot),
    ...(character.customization.hairAppearance ? [character.customization.hairAppearance.modelSlot] : []),
    ...(character.customization.faceAppearance && Object.values(character.customization.faceAppearance.components ?? {}).some((component) => component?.assetId)
      ? [character.customization.faceAppearance.modelSlot]
      : []),
    ...(character.customization.faceAppearance && Object.values(character.customization.faceAppearance.headExtras ?? {}).some(Boolean)
      ? [character.customization.faceAppearance.modelSlot]
      : [])
  ]))].sort((left, right) => left - right), [availableCharacters])
  const fabricatorModelSlotsKey = fabricatorModelSlots.join(',')
  const activePoseSourceSnapshot = poseSourceSnapshot?.projectId === projectId ? poseSourceSnapshot : null

  useEffect(() => {
    let cancelled = false
    let requestRunning = false
    let requestQueued = false
    const refreshCharacters = () => {
      if (requestRunning) { requestQueued = true; return }
      requestRunning = true
      setAvailableCharactersReady(false)
      void window.desktop.customizer.listCustomizerCharacters().then((characters) => {
        if (!cancelled) {
          setAvailableCharacters((current) => sameCustomizerCharacterCatalog(current, characters) ? current : characters)
          setAvailableCharactersReady(true)
        }
      }).catch((reason: unknown) => {
        if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível carregar o elenco de personagens.')
      }).finally(() => {
        requestRunning = false
        if (requestQueued && !cancelled) { requestQueued = false; refreshCharacters() }
      })
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshCharacters() }
    const unsubscribeCustomizerUpdates = subscribeToCustomizerCharacterUpdates(window, refreshCharacters)
    refreshCharacters()
    window.addEventListener('focus', refreshCharacters)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      unsubscribeCustomizerUpdates()
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
            const [catalogs, models, wardrobeCatalogs, hairCatalogs, headExtraCatalogs, eyeCatalogs] = await Promise.all([
              Promise.all(fabricatorModelSlots.map(async (modelSlot) => ({
                modelSlot,
                poses: await window.desktop.fabricator.listFabricatorPoseSlots(modelSlot)
              }))),
              window.desktop.fabricator.listFabricatorSlots(),
              Promise.all(fabricatorModelSlots.map(async (modelSlot) => ({
                modelSlot,
                sets: await window.desktop.fabricator.listWardrobeSets(modelSlot)
              }))),
              Promise.all(fabricatorModelSlots.map(async (modelSlot) => ({
                modelSlot,
                styles: await window.desktop.fabricator.listHairStyles(modelSlot)
              }))),
              Promise.all(fabricatorModelSlots.map(async (modelSlot) => ({
                modelSlot,
                assets: await window.desktop.fabricator.listFaceComponentAssets(modelSlot, 'head-extra')
              }))),
              Promise.all(fabricatorModelSlots.flatMap((modelSlot) => editorV6EyeAssetKinds.map(async (kind) => ({
                modelSlot,
                kind,
                assets: await window.desktop.fabricator.listFaceComponentAssets(modelSlot, kind)
              }))))
            ])
            if (cancelled) return
            if (requestQueued) continue
            const next = {
              projectId,
              revisions: createEditorV6PoseRevisionSnapshot(catalogs),
              modelRevisions: createEditorV6ModelRevisionSnapshot(models),
              wardrobeRevisions: createEditorV6WardrobeRevisionSnapshot(wardrobeCatalogs),
              hairRevisions: createEditorV6HairRevisionSnapshot(hairCatalogs),
              headExtraRevisions: createEditorV6HeadExtraRevisionSnapshot(headExtraCatalogs),
              eyeRevisions: createEditorV6EyeRevisionSnapshot(eyeCatalogs)
            }
            setPoseSourceSnapshot((current) => current?.projectId === projectId && sameSourceRevisionSnapshot(current, next) ? current : next)
          } catch (reason) {
            if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível verificar as versões das fontes do personagem.')
          }
        } while (requestQueued && !cancelled)
      } finally { requestRunning = false }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      setPoseSourceSnapshot((current) => current?.projectId === projectId ? null : current)
      void refreshPoseSourceSnapshot()
    }
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

  return { availableCharacters, availableCharactersReady, availableCharacterById, activePoseSourceSnapshot }
}
