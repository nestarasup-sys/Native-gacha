import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels.ts'
/** Canais legados de Poses DEV: transporte isolado, autorização obrigatória. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import { resolvePoseCategory, type FabricatorAssetSave, type FabricatorPose, type FabricatorPoseDraft, type FabricatorPoseDraftSave, type FabricatorPoseSave, type FabricatorPoseSummary } from '../../../src/shared/fabricator'
import type * as fs from 'node:fs/promises'

export type PoseIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  ensureLegacyPoseMigration: () => Promise<void>
  isValidModelSlot: (slot: number) => boolean
  isValidPoseSlot: (slot: number) => boolean
  slotCount: number
  poseSlotCount: number
  poseSlotPath: (model: number, slot: number) => string
  poseModelPath: (model: number) => string
  poseDraftPath: (model: number) => string
  queuePoseWrite: (operation: () => Promise<void>) => Promise<void>
  readPoseProject: (model: number, slot: number) => Promise<FabricatorPose | null>
  writePoseProject: (model: number, slot: number, project: FabricatorPoseSave, assets: FabricatorAssetSave[]) => Promise<void>
  readPoseDraft: (model: number) => Promise<FabricatorPoseDraft | null>
  writePoseDraft: (model: number, draft: FabricatorPoseDraftSave, assets: FabricatorAssetSave[]) => Promise<void>
  files: Pick<typeof fs, 'readFile' | 'writeFile' | 'mkdir' | 'rename' | 'rm'>
}

export function registerFabricatorPoseHandlers(deps: PoseIpcDependencies): void {
  const { ipcMain, assertTrustedSender, ensureLegacyPoseMigration, isValidModelSlot, isValidPoseSlot,
    slotCount, poseSlotCount, poseSlotPath, poseModelPath, poseDraftPath,
    queuePoseWrite, readPoseProject, writePoseProject, readPoseDraft, writePoseDraft } = deps
  const { readFile, writeFile, mkdir, rename, rm } = deps.files
  ipcMain.handle(fabricatorIpcChannels.listFabricatorPoseSlots, async (event, requestedModelSlot?: number): Promise<FabricatorPoseSummary[]> => {
    assertTrustedSender(event)
    await ensureLegacyPoseMigration()
    if (requestedModelSlot !== undefined && !isValidModelSlot(requestedModelSlot)) throw new Error('Modelo inválido.')
    const modelSlots = requestedModelSlot === undefined ? Array.from({ length: slotCount }, (_, index) => index + 1) : [requestedModelSlot]
    const allSlots: FabricatorPoseSummary[] = []
    for (const modelSlot of modelSlots) {
      for (let slot = 1; slot <= poseSlotCount; slot += 1) {
        try {
          const manifest = JSON.parse(await readFile(join(poseSlotPath(modelSlot, slot), 'pose.json'), 'utf8')) as FabricatorPoseSave
          if (manifest.sourceModelSlot !== modelSlot || manifest.slot !== slot) continue
          allSlots.push({ slot, sourceModelSlot: modelSlot, name: manifest.name, category: resolvePoseCategory(manifest), sourceModelName: manifest.sourceModelName, partCount: manifest.parts.length, updatedAt: manifest.updatedAt })
        } catch { /* Slots sem manifest válido aparecem vazios. */ }
      }
    }
    return requestedModelSlot === undefined ? allSlots : Array.from({ length: poseSlotCount }, (_, index) => allSlots.find((item) => item?.slot === index + 1) ?? null)
  })

  ipcMain.handle(fabricatorIpcChannels.getFabricatorExportPoseSlots, async (event, modelSlot: number): Promise<Array<number | null> | null> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    try {
      const parsed = JSON.parse(await readFile(join(poseModelPath(modelSlot), 'export-slots.json'), 'utf8')) as unknown
      if (!Array.isArray(parsed) || parsed.length !== 5 || parsed.some((slot) => slot !== null && (typeof slot !== 'number' || !isValidPoseSlot(slot)))) return null
      return parsed
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw reason
    }
  })

  ipcMain.handle(fabricatorIpcChannels.saveFabricatorExportPoseSlots, async (event, modelSlot: number, slots: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !Array.isArray(slots) || slots.length !== 5 || slots.some((slot) => slot !== null && (typeof slot !== 'number' || !isValidPoseSlot(slot)))) throw new Error('Os cinco slots de poses para exportação são inválidos.')
    const unique = slots.filter((slot): slot is number => slot !== null)
    if (new Set(unique).size !== unique.length) throw new Error('Cada pose pode ocupar apenas um slot de exportação.')
    await queuePoseWrite(async () => {
      const summaries = await Promise.all(unique.map(async (slot) => readPoseProject(modelSlot, slot)))
      if (summaries.some((pose) => !pose)) throw new Error('Uma das poses selecionadas não existe mais nesta biblioteca.')
      const folder = poseModelPath(modelSlot)
      await mkdir(folder, { recursive: true })
      const target = join(folder, 'export-slots.json')
      const temporary = `${target}.tmp`
      await writeFile(temporary, JSON.stringify(slots), 'utf8')
      await rename(temporary, target)
    })
  })

  ipcMain.handle(fabricatorIpcChannels.loadFabricatorPose, async (event, modelSlot: number, slot: number): Promise<FabricatorPose | null> => {
    assertTrustedSender(event)
    let loaded: FabricatorPose | null = null
    await queuePoseWrite(async () => { loaded = await readPoseProject(modelSlot, slot) })
    return loaded
  })

  ipcMain.handle(fabricatorIpcChannels.saveFabricatorPose, async (event, modelSlot: number, slot: number, project: FabricatorPoseSave, assets: FabricatorAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    await queuePoseWrite(() => writePoseProject(modelSlot, slot, project, assets))
  })

  ipcMain.handle(fabricatorIpcChannels.deleteFabricatorPose, async (event, modelSlot: number, slot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidPoseSlot(slot)) throw new Error('Slot de pose inválido.')
    await queuePoseWrite(async () => {
      const base = resolve(poseModelPath(modelSlot))
      const target = resolve(poseSlotPath(modelSlot, slot))
      if (dirname(target) !== base || basename(target) !== `slot-${slot}`) throw new Error('Caminho de exclusão de pose inválido.')
      await rm(target, { recursive: true, force: true })
    })
  })

  ipcMain.handle(fabricatorIpcChannels.loadFabricatorPoseDraft, async (event, modelSlot: number): Promise<FabricatorPoseDraft | null> => {
    assertTrustedSender(event)
    await ensureLegacyPoseMigration()
    let loaded: FabricatorPoseDraft | null = null
    await queuePoseWrite(async () => { loaded = await readPoseDraft(modelSlot) })
    return loaded
  })

  ipcMain.handle(fabricatorIpcChannels.saveFabricatorPoseDraft, async (event, modelSlot: number, draft: FabricatorPoseDraftSave, assets: FabricatorAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    await queuePoseWrite(() => writePoseDraft(modelSlot, draft, assets))
  })

  ipcMain.handle(fabricatorIpcChannels.deleteFabricatorPoseDraft, async (event, modelSlot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
    await queuePoseWrite(async () => {
      const base = resolve(poseModelPath(modelSlot))
      const target = resolve(poseDraftPath(modelSlot))
      if (dirname(target) !== base || basename(target) !== 'draft') throw new Error('Caminho de rascunho inválido.')
      await rm(target, { recursive: true, force: true })
    })
  })


}
