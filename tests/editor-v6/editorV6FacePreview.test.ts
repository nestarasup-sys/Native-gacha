import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document } from '../../src/shared/editorV6'
import {
  createEditorV6FaceRendererCache,
  editorV6FacePreviewTarget,
  isCurrentEditorV6FacePreviewTarget,
  type EditorV6FacePreviewJob,
  type PreparedEditorV6FaceRenderer
} from '../../src/renderer/src/features/editorV6/useEditorV6FacePreview'

function character(name = 'Teste'): CustomizerCharacter {
  return { name, customization: { modelSlot: 1, poseSlot: null } } as CustomizerCharacter
}

function renderer(): PreparedEditorV6FaceRenderer {
  return { dispose: vi.fn() } as unknown as PreparedEditorV6FaceRenderer
}

function createCache(prepare: (value: CustomizerCharacter) => Promise<PreparedEditorV6FaceRenderer>) {
  return createEditorV6FaceRendererCache(prepare, (value, revision, modelRevision) => `${value.name}:${revision ?? 'sem-pose'}:${modelRevision ?? 'sem-modelo'}`)
}

describe('cache da prévia facial do Editor V6', () => {
  it('reutiliza o renderer e descarta a versão anterior quando muda a revisão da pose', async () => {
    const first = renderer()
    const second = renderer()
    const prepare = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const cache = createCache(prepare)

    await expect(cache.get(character(), 'pose-a')).resolves.toBe(first)
    await expect(cache.get(character(), 'pose-a')).resolves.toBe(first)
    await expect(cache.get(character(), 'pose-b')).resolves.toBe(second)

    expect(prepare).toHaveBeenCalledTimes(2)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    cache.dispose()
    expect(second.dispose).toHaveBeenCalledTimes(1)
  })

  it('descarta o renderer quando muda a revisão da folha original do modelo', async () => {
    const first = renderer()
    const second = renderer()
    const prepare = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const cache = createCache(prepare)

    await expect(cache.get(character(), 'pose-a', undefined, 'model-a')).resolves.toBe(first)
    await expect(cache.get(character(), 'pose-a', undefined, 'model-b')).resolves.toBe(second)

    expect(prepare).toHaveBeenCalledTimes(2)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    cache.dispose()
    expect(second.dispose).toHaveBeenCalledTimes(1)
  })

  it('descarta um renderer preparado para uma edição que já ficou obsoleta', async () => {
    const current = renderer()
    const obsolete = renderer()
    const prepare = vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(obsolete)
    const cache = createCache(prepare)

    await expect(cache.get(character(), 'pose-a')).resolves.toBe(current)
    await expect(cache.get(character('Outra'), 'pose-b', () => false)).resolves.toBeNull()
    await expect(cache.get(character(), 'pose-a')).resolves.toBe(current)

    expect(obsolete.dispose).toHaveBeenCalledTimes(1)
    expect(current.dispose).not.toHaveBeenCalled()
    cache.dispose()
    expect(current.dispose).toHaveBeenCalledTimes(1)
  })

  it('descarta preparações duplicadas concorrentes sem substituir o renderer já ativo', async () => {
    const first = renderer()
    const duplicate = renderer()
    const pending: Array<(value: PreparedEditorV6FaceRenderer) => void> = []
    const prepare = vi.fn(() => new Promise<PreparedEditorV6FaceRenderer>((resolve) => pending.push(resolve)))
    const cache = createCache(prepare)
    const firstRequest = cache.get(character(), 'pose-a')
    const duplicateRequest = cache.get(character(), 'pose-a')

    pending[0](first)
    await expect(firstRequest).resolves.toBe(first)
    pending[1](duplicate)
    await expect(duplicateRequest).resolves.toBe(first)

    expect(duplicate.dispose).toHaveBeenCalledTimes(1)
    cache.dispose()
    expect(first.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('publicação de prévia facial', () => {
  const job: EditorV6FacePreviewJob = {
    projectId: 'project-1', elementId: 'character-1', assetId: 'asset-1', poseSlot: 3, poseSourceRevision: 'pose-rev-1',
    character: { ...character('Chloe'), id: 'chloe-1', updatedAt: 'source-rev-1' }, transforms: {}
  }
  const project = (): EditorV6Document => ({
    id: 'project-1', elements: [{
      id: 'character-1', kind: 'character', characterId: 'chloe-1', assetId: 'asset-1',
      poseSlot: 3, poseSourceRevision: 'pose-rev-1', characterSourceUpdatedAt: 'source-rev-1'
    }]
  } as unknown as EditorV6Document)

  it('permite publicar somente se projeto, asset e fonte ainda correspondem ao trabalho', () => {
    expect(isCurrentEditorV6FacePreviewTarget(job, project(), 'project-1')).toBe(true)
    expect(isCurrentEditorV6FacePreviewTarget(job, project(), 'project-2')).toBe(false)

    const changedPose = project()
    changedPose.elements[0].poseSourceRevision = 'pose-rev-2'
    expect(isCurrentEditorV6FacePreviewTarget(job, changedPose, 'project-1')).toBe(false)

    const changedPoseSlot = project()
    changedPoseSlot.elements[0].poseSlot = 4
    expect(isCurrentEditorV6FacePreviewTarget(job, changedPoseSlot, 'project-1')).toBe(false)

    const changedCharacter = project()
    changedCharacter.elements[0].characterId = 'another-character'
    expect(isCurrentEditorV6FacePreviewTarget(job, changedCharacter, 'project-1')).toBe(false)
  })

  it('preserva pose neutra explícita como diferente de uma pose herdada', () => {
    const neutralProject = project()
    neutralProject.elements[0].poseSlot = null
    const neutralJob = { ...job, poseSlot: null }
    expect(isCurrentEditorV6FacePreviewTarget(neutralJob, neutralProject, 'project-1')).toBe(true)
    expect(isCurrentEditorV6FacePreviewTarget(job, neutralProject, 'project-1')).toBe(false)
  })

  it('descarta a prévia se o elemento ou a versão da personagem deixou de existir', () => {
    const removedElement = project()
    removedElement.elements = []
    expect(isCurrentEditorV6FacePreviewTarget(job, removedElement, 'project-1')).toBe(false)

    const changedAsset = project()
    changedAsset.elements[0].assetId = 'new-asset'
    expect(isCurrentEditorV6FacePreviewTarget(job, changedAsset, 'project-1')).toBe(false)

    const changedSource = project()
    if (changedSource.elements[0].kind === 'character') changedSource.elements[0].characterSourceUpdatedAt = 'source-rev-2'
    expect(isCurrentEditorV6FacePreviewTarget(job, changedSource, 'project-1')).toBe(false)
  })

  it('valida e atualiza o snapshot do bloco selecionado, sem confundi-lo com a pose base', () => {
    const projectWithPoseSnapshot = project()
    projectWithPoseSnapshot.elements[0].poseSlot = 1
    projectWithPoseSnapshot.timeline = { tracks: [{ blocks: [{ id: 'clip-1', elementId: 'character-1', state: {
      id: 'character-1', kind: 'character', characterId: 'chloe-1', assetId: 'asset-1',
      poseSlot: 3, poseSourceRevision: 'pose-rev-1', characterSourceUpdatedAt: 'source-rev-1'
    } }] }] } as unknown as EditorV6Document['timeline']
    const snapshotJob = { ...job, blockId: 'clip-1' }

    expect(isCurrentEditorV6FacePreviewTarget(snapshotJob, projectWithPoseSnapshot, 'project-1')).toBe(true)
    expect(editorV6FacePreviewTarget(snapshotJob, projectWithPoseSnapshot)?.poseSlot).toBe(3)
    expect(isCurrentEditorV6FacePreviewTarget({ ...snapshotJob, blockId: 'removed-clip' }, projectWithPoseSnapshot, 'project-1')).toBe(false)
  })
})
