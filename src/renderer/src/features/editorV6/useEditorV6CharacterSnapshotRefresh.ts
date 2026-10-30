import { useEffect, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { pruneEditorV6TimelineSnapshots } from '../../../../shared/editorV6TimelineEdits'
import { trimTransparentImage, type TrimmedImage } from '../../characters/characterGeometry'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceModel'
import {
  applyEditorV6CharacterAssetCrops,
  applyEditorV6CharacterRefreshResult
} from './editorV6CharacterRefreshModel'
import {
  planEditorV6CharacterRefresh,
  renderEditorV6CharacterRefresh
} from './characterSnapshotRefresh'

type EditorV6CharacterSnapshotRefreshOptions = {
  project: EditorV6Document | null
  availableCharacters: CustomizerCharacter[]
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
  poseSourceSnapshot,
  sceneRef,
  updateProject,
  markUnsaved,
  pausePlayback,
  reportError
}: EditorV6CharacterSnapshotRefreshOptions): void {
  const normalizedProjectIdsRef = useRef(new Set<string>())
  const [normalizedSourceVersion, setNormalizedSourceVersion] = useState(0)

  useEffect(() => {
    if (!project || normalizedProjectIdsRef.current.has(project.id)) return
    let cancelled = false
    const projectId = project.id
    const referencedCharacterAssetIds = new Set(project.elements.flatMap((element) =>
      element.kind === 'character' && element.assetId ? [element.assetId] : []
    ))
    const characterAssets = project.assets.filter((asset) =>
      asset.category === 'character' && referencedCharacterAssetIds.has(asset.id)
    )

    void (async () => {
      const crops = await mapConcurrentItems(characterAssets, async (asset) => {
        const crop = await trimTransparentImage(asset.dataUrl)
        return crop ? { assetId: asset.id, crop } : null
      }, () => cancelled)
      if (cancelled) return

      normalizedProjectIdsRef.current.add(projectId)
      setNormalizedSourceVersion((version) => version + 1)
      const availableCrops = crops.filter((entry): entry is { assetId: string; crop: TrimmedImage } => entry !== null)
      if (!availableCrops.length) return

      updateProject((current) => current.id === projectId
        ? applyEditorV6CharacterAssetCrops(current, availableCrops)
        : current)
      markUnsaved()
    })()

    return () => { cancelled = true }
  }, [project, markUnsaved, updateProject])

  useEffect(() => {
    if (!project || !normalizedProjectIdsRef.current.has(project.id) || !availableCharacters.length
      || poseSourceSnapshot?.projectId !== project.id) return

    const plan = planEditorV6CharacterRefresh(project, availableCharacters, poseSourceSnapshot.revisions, poseSourceSnapshot.modelRevisions)
    if (plan.missingCharacterNames.length) {
      reportError(`Não foi possível atualizar ${plan.missingCharacterNames.join(', ')} porque o personagem não está disponível no Customizador.`)
    }
    if (!plan.groups.length) return

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

        updateProject((current) => current.id === projectId
          ? applyEditorV6CharacterRefreshResult(current, result, pruneEditorV6TimelineSnapshots)
          : current)
        markUnsaved()
      } catch (reason) {
        if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o personagem e as poses salvas no Editor V6.')
      }
    })()

    return () => { cancelled = true }
  }, [project, poseSourceSnapshot, availableCharacters, normalizedSourceVersion, sceneRef, pausePlayback, updateProject, markUnsaved, reportError])
}
