import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels'
/** Canais legados do Animador DEV com fila de gravação única por processo. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import type { AnimatorAnimation, AnimatorAnimationAsset, AnimatorAnimationDraft, AnimatorAnimationSave, AnimatorAnimationSummary } from '../../../src/shared/fabricator'
import type * as fs from 'node:fs/promises'

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
  writeAnimatorAnimation: (model: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]) => Promise<void>
  readAnimatorDraft: (model: number) => Promise<AnimatorAnimationDraft | null>
  writeAnimatorDraft: (model: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]) => Promise<void>
  getQueue: () => Promise<void>
  setQueue: (pending: Promise<void>) => void
  files: Pick<typeof fs, 'readFile' | 'readdir' | 'rm'>
}

export function registerFabricatorAnimatorHandlers(deps: AnimatorIpcDependencies): void {
  const { ipcMain, assertTrustedSender, isValidModelSlot, isValidAnimatorSlot, poseSlotCount,
    animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
    readAnimatorAnimation, writeAnimatorAnimation, readAnimatorDraft, writeAnimatorDraft,
    getQueue, setQueue } = deps
  const { readFile, readdir, rm } = deps.files
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
    const entries: AnimatorAnimationSummary[] = []
    for (let slot = 1; slot <= poseSlotCount; slot += 1) {
      try {
        const animation = JSON.parse(await readFile(join(animatorSlotPath(modelSlot, slot), 'animation.json'), 'utf8')) as AnimatorAnimationSave
        if (animation.schemaVersion !== 1 || animation.sourceModelSlot !== modelSlot || animation.slot !== slot) continue
        entries.push({ slot, sourceModelSlot: modelSlot, name: animation.name, sourceModelName: animation.sourceModelName, sourceModelUpdatedAt: animation.sourceModelUpdatedAt, sourceModelPartCount: animation.sourceModelPartCount, thumbnailDataUrl: animation.thumbnailDataUrl, updatedAt: animation.updatedAt })
      } catch { /* Slots inválidos ou ainda vazios são ignorados. */ }
    }
    return entries
  })

  ipcMain.handle(fabricatorIpcChannels.loadAnimatorAnimation, async (event, modelSlot: number, slot: number): Promise<AnimatorAnimation | null> => {
    assertTrustedSender(event)
    let loaded: AnimatorAnimation | null = null
    const next = getQueue().catch(() => undefined).then(async () => { loaded = await readAnimatorAnimation(modelSlot, slot) })
    setQueue(next)
    await next
    return loaded
  })

  ipcMain.handle(fabricatorIpcChannels.saveAnimatorAnimation, async (event, modelSlot: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]): Promise<void> => {
    assertTrustedSender(event)
    const next = getQueue().catch(() => undefined).then(() => writeAnimatorAnimation(modelSlot, slot, animation, assets))
    setQueue(next)
    await next
  })

  ipcMain.handle(fabricatorIpcChannels.deleteAnimatorAnimation, async (event, modelSlot: number, slot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
    const next = getQueue().catch(() => undefined).then(async () => {
      const base = resolve(animatorModelPath(modelSlot))
      const target = resolve(animatorSlotPath(modelSlot, slot))
      if (dirname(target) !== base || basename(target) !== `slot-${slot}`) throw new Error('Caminho de exclusão de animação inválido.')
      await rm(target, { recursive: true, force: true })
    })
    setQueue(next)
    await next
  })

  ipcMain.handle(fabricatorIpcChannels.loadAnimatorDraft, async (event, modelSlot: number): Promise<AnimatorAnimationDraft | null> => {
    assertTrustedSender(event)
    let loaded: AnimatorAnimationDraft | null = null
    const next = getQueue().catch(() => undefined).then(async () => { loaded = await readAnimatorDraft(modelSlot) })
    setQueue(next)
    await next
    return loaded
  })

  ipcMain.handle(fabricatorIpcChannels.saveAnimatorDraft, async (event, modelSlot: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]): Promise<void> => {
    assertTrustedSender(event)
    const next = getQueue().catch(() => undefined).then(() => writeAnimatorDraft(modelSlot, draft, assets))
    setQueue(next)
    await next
  })

  ipcMain.handle(fabricatorIpcChannels.deleteAnimatorDraft, async (event, modelSlot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
    const next = getQueue().catch(() => undefined).then(async () => {
      const base = resolve(animatorModelPath(modelSlot))
      const target = resolve(animatorDraftPath(modelSlot))
      if (dirname(target) !== base || basename(target) !== 'draft') throw new Error('Caminho de rascunho inválido.')
      await rm(target, { recursive: true, force: true })
    })
    setQueue(next)
    await next
  })


}
