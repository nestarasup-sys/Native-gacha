/** Canais legados do Animador DEV; operações do mesmo modelo são serializadas. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import type { AnimatorAnimation, AnimatorAnimationAsset, AnimatorAnimationDraft, AnimatorAnimationSave, AnimatorAnimationSummary } from '../../../src/shared/fabricator'
import type * as fs from 'node:fs/promises'
import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels.ts'

export type AnimatorIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidModelSlot: (slot: number) => boolean
  isValidAnimatorSlot: (slot: number) => boolean
  poseSlotCount: number
  animatorLibraryPath: () => string
  animatorModelPath: (model: number) => string
  animatorSlotPath: (model: number, slot: number) => string
  animatorDraftPath: (model: number) => string
  readAnimatorAnimation: (model: number, slot: number) => Promise<AnimatorAnimation | null>
  recoverAnimatorAnimation: (model: number, slot: number) => Promise<void>
  writeAnimatorAnimation: (model: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]) => Promise<void>
  readAnimatorDraft: (model: number) => Promise<AnimatorAnimationDraft | null>
  recoverAnimatorDraft: (model: number) => Promise<void>
  writeAnimatorDraft: (model: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]) => Promise<void>
  files: Pick<typeof fs, 'readFile' | 'readdir' | 'rm'>
}

export function registerFabricatorAnimatorHandlers(deps: AnimatorIpcDependencies): { getPendingWrites: () => Promise<void>[] } {
  const { ipcMain, assertTrustedSender, isValidModelSlot, isValidAnimatorSlot, poseSlotCount,
    animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
    readAnimatorAnimation, recoverAnimatorAnimation, writeAnimatorAnimation, readAnimatorDraft, recoverAnimatorDraft, writeAnimatorDraft } = deps
  const { readFile, readdir, rm } = deps.files
  const modelOperations = createKeyedOperationQueue({ retainFailures: true })
  const queueModelOperation = <T>(modelSlot: number, operation: () => Promise<T>): Promise<T> =>
    modelOperations.run(String(modelSlot), operation)

  ipcMain.handle(fabricatorIpcChannels.listAnimatorModelSlots, async (event): Promise<number[]> => {
    assertTrustedSender(event)
    try {
      const entries = await readdir(animatorLibraryPath(), { withFileTypes: true })
      return entries.flatMap((entry) => {
        const match = entry.isDirectory() ? /^model-(\d{1,3})$/.exec(entry.name) : null
        const slot = match ? Number(match[1]) : 0
        return slot && isValidModelSlot(slot) ? [slot] : []
      }).sort((a, b) => a - b)
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw reason
    }
  })

  ipcMain.handle(fabricatorIpcChannels.listAnimatorAnimations, async (event, modelSlot: number): Promise<AnimatorAnimationSummary[]> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    return queueModelOperation(modelSlot, async () => {
      const entries: AnimatorAnimationSummary[] = []
      for (let slot = 1; slot <= poseSlotCount; slot += 1) {
        await recoverAnimatorAnimation(modelSlot, slot)
        try {
          const animation = JSON.parse(await readFile(join(animatorSlotPath(modelSlot, slot), 'animation.json'), 'utf8')) as AnimatorAnimationSave
          if (animation.schemaVersion !== 1 || animation.sourceModelSlot !== modelSlot || animation.slot !== slot) continue
          entries.push({ slot, sourceModelSlot: modelSlot, name: animation.name, sourceModelName: animation.sourceModelName, sourceModelUpdatedAt: animation.sourceModelUpdatedAt, sourceModelPartCount: animation.sourceModelPartCount, thumbnailDataUrl: animation.thumbnailDataUrl, updatedAt: animation.updatedAt })
        } catch { /* Slots inválidos ou ainda vazios são ignorados. */ }
      }
      return entries
    })
  })

  ipcMain.handle(fabricatorIpcChannels.loadAnimatorAnimation, async (event, modelSlot: number, slot: number): Promise<AnimatorAnimation | null> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
    return queueModelOperation(modelSlot, () => readAnimatorAnimation(modelSlot, slot))
  })

  ipcMain.handle(fabricatorIpcChannels.saveAnimatorAnimation, async (event, modelSlot: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
    return queueModelOperation(modelSlot, () => writeAnimatorAnimation(modelSlot, slot, animation, assets))
  })

  ipcMain.handle(fabricatorIpcChannels.deleteAnimatorAnimation, async (event, modelSlot: number, slot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
    return queueModelOperation(modelSlot, async () => {
      const base = resolve(animatorModelPath(modelSlot))
      const target = resolve(animatorSlotPath(modelSlot, slot))
      if (dirname(target) !== base || basename(target) !== `slot-${slot}`) throw new Error('Caminho de exclusão de animação inválido.')
      await recoverAnimatorAnimation(modelSlot, slot)
      await rm(target, { recursive: true, force: true })
    })
  })

  ipcMain.handle(fabricatorIpcChannels.loadAnimatorDraft, async (event, modelSlot: number): Promise<AnimatorAnimationDraft | null> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
    return queueModelOperation(modelSlot, () => readAnimatorDraft(modelSlot))
  })

  ipcMain.handle(fabricatorIpcChannels.saveAnimatorDraft, async (event, modelSlot: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
    return queueModelOperation(modelSlot, () => writeAnimatorDraft(modelSlot, draft, assets))
  })

  ipcMain.handle(fabricatorIpcChannels.deleteAnimatorDraft, async (event, modelSlot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
    return queueModelOperation(modelSlot, async () => {
      const base = resolve(animatorModelPath(modelSlot))
      const target = resolve(animatorDraftPath(modelSlot))
      if (dirname(target) !== base || basename(target) !== 'draft') throw new Error('Caminho de rascunho inválido.')
      await recoverAnimatorDraft(modelSlot)
      await rm(target, { recursive: true, force: true })
    })
  })

  return { getPendingWrites: modelOperations.getPendingWrites }
}
