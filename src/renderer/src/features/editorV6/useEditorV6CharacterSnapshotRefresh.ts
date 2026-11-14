import { useEffect, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { pruneEditorV6TimelineSnapshots } from '../../../../shared/editorV6TimelineEdits'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceRevisions'
import {
  applyEditorV6CharacterAssetCrops
} from './editorV6CharacterRefreshModel'
import { applyEditorV6CharacterRefreshResult } from './editorV6CharacterRefreshPublication'
import { prepareEditorV6LegacyCharacterCrops } from './editorV6LegacyCharacterCropNormalization'
import { planEditorV6CharacterRefresh } from './editorV6CharacterRefreshPlan'
import { renderEditorV6CharacterRefresh } from './characterSnapshotRefresh'

type EditorV6CharacterSnapshotRefreshOptions = {
  project: EditorV6Document | null
  availableCharacters: CustomizerCharacter[]
  availableCharactersReady: boolean
  poseSourceSnapshot: PoseRevisionSnapshot | null
  sceneRef: { current: HTMLDivElement | null }
  updateProject: (update: (project: EditorV6Document) => EditorV6Document) => void
  markUnsaved: () => void
  pausePlayback: () => void
  reportError: (message: string) => void
}

/** Keeps legacy character crops and cached scene/timeline snapshots aligned with their live sources. */
export function useEditorV6CharacterSnapshotRefresh({
  project,
  availableCharacters,
  availableCharactersReady,
  poseSourceSnapshot,
  sceneRef,
  updateProject,
  markUnsaved,
  pausePlayback,
  reportError
}: EditorV6CharacterSnapshotRefreshOptions): boolean {
  const normalizedProjectIdsRef = useRef(new Set<string>())
  const activeProjectIdRef = useRef<string | null>(null)
  const [refreshOnOpenProjectId, setRefreshOnOpenProjectId] = useState<string | null>(null)
  const [normalizedSourceVersion, setNormalizedSourceVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!project) {
      activeProjectIdRef.current = null
      setRefreshOnOpenProjectId(null)
      setRefreshing(false)
      return
    }
    if (activeProjectIdRef.current === project.id) return
    activeProjectIdRef.current = project.id
    setRefreshOnOpenProjectId(project.id)
    setRefreshing(false)
  }, [project?.id])

  useEffect(() => {
    if (!project || normalizedProjectIdsRef.current.has(project.id)) return
    let cancelled = false
    const projectId = project.id
    void (async () => {
      const crops = await prepareEditorV6LegacyCharacterCrops(project, () => cancelled)
      if (cancelled || !crops) return

      normalizedProjectIdsRef.current.add(projectId)
      setNormalizedSourceVersion((version) => version + 1)
      if (!crops.length) return

      updateProject((current) => current.id === projectId
        ? applyEditorV6CharacterAssetCrops(current, crops)
        : current)
      markUnsaved()
    })()

    return () => { cancelled = true }
  }, [project, markUnsaved, updateProject])

  useEffect(() => {
    if (!project || !availableCharactersReady || !normalizedProjectIdsRef.current.has(project.id)
      || poseSourceSnapshot?.projectId !== project.id) return

    const forceRefresh = refreshOnOpenProjectId === project.id
    if (!availableCharacters.length && !forceRefresh) return
    const plan = planEditorV6CharacterRefresh(project, availableCharacters, poseSourceSnapshot.revisions, poseSourceSnapshot.modelRevisions, poseSourceSnapshot.wardrobeRevisions, poseSourceSnapshot.hairRevisions, poseSourceSnapshot.headExtraRevisions, poseSourceSnapshot.eyeRevisions, forceRefresh)
    if (plan.missingCharacterNames.length) {
      reportError(`Não foi possível atualizar ${plan.missingCharacterNames.join(', ')} porque o personagem não está disponível no Customizador.`)
    }
    if (!plan.groups.length) {
      if (forceRefresh) setRefreshOnOpenProjectId(null)
      setRefreshing(false)
      return
    }

    setRefreshing(true)
    pausePlayback()
    let cancelled = false
    const projectId = project.id
    void (async () => {
      try {
        const result = await renderEditorV6CharacterRefresh(
          plan.groups,
          sceneRef.current?.clientWidth ?? 1000,
          sceneRef.current?.clientHeight ?? 562,
          () => cancelled
        )
        if (cancelled || !result) return

        if (forceRefresh) setRefreshOnOpenProjectId(null)
        updateProject((current) => current.id === projectId
          ? applyEditorV6CharacterRefreshResult(current, result, pruneEditorV6TimelineSnapshots)
          : current)
        markUnsaved()
      } catch (reason) {
        if (!cancelled) {
          if (forceRefresh) setRefreshOnOpenProjectId(null)
          reportError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o personagem e as poses salvas no Editor V6.')
        }
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    })()

    return () => { cancelled = true }
  }, [project, poseSourceSnapshot, availableCharacters, availableCharactersReady, normalizedSourceVersion, refreshOnOpenProjectId, sceneRef, pausePlayback, updateProject, markUnsaved, reportError])

  return refreshing || refreshOnOpenProjectId === project?.id
}
