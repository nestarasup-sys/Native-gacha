import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels'
import type { HairStyle, HairStyleAsset, HairStyleSave, HairStyleSummary, HairWorkspace, HairWorkspaceAsset, HairWorkspaceSave } from '../../../src/shared/fabricator'

type HairIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidModelSlot: (slot: number) => boolean
  isValidHairStyleId: (id: string) => boolean
  hairModelPath: (modelSlot: number) => string
  hairStylePath: (modelSlot: number, id: string) => string
  readWorkspace: (modelSlot: number) => Promise<HairWorkspace | null>
  writeWorkspace: (modelSlot: number, workspace: HairWorkspaceSave, assets: HairWorkspaceAsset[]) => Promise<void>
  clearWorkspace: (modelSlot: number) => Promise<void>
  listStyles: (modelSlot: number) => Promise<HairStyleSummary[]>
  readStyle: (modelSlot: number, id: string, includeSource?: boolean) => Promise<HairStyle | null>
  writeStyle: (modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]) => Promise<void>
  setLegacyHairCatalogState: (modelSlot: number, state: 'active'|'dismissed') => Promise<void>
  removeDirectory: (path: string) => Promise<void>
}

export function registerFabricatorHairHandlers(deps: HairIpcDependencies) {
  const saveQueues = new Map<number, Promise<void>>()
  const queueSave = async (modelSlot: number, operation: () => Promise<void>): Promise<void> => {
    const previous = saveQueues.get(modelSlot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    saveQueues.set(modelSlot, current)
    try { await current }
    finally { if (saveQueues.get(modelSlot) === current) saveQueues.delete(modelSlot) }
  }

  deps.ipcMain.handle(fabricatorIpcChannels.loadHairWorkspace, async (event, modelSlot: number): Promise<HairWorkspace | null> => {
    deps.assertTrustedSender(event)
    return deps.readWorkspace(modelSlot)
  })
  deps.ipcMain.handle(fabricatorIpcChannels.saveHairWorkspace, async (event, modelSlot: number, workspace: HairWorkspaceSave, assets: HairWorkspaceAsset[]): Promise<void> => {
    deps.assertTrustedSender(event)
    await queueSave(modelSlot, () => deps.writeWorkspace(modelSlot, workspace, assets))
  })
  deps.ipcMain.handle(fabricatorIpcChannels.listHairStyles, async (event, modelSlot: number): Promise<HairStyleSummary[]> => {
    deps.assertTrustedSender(event)
    return deps.listStyles(modelSlot)
  })
  deps.ipcMain.handle(fabricatorIpcChannels.loadHairStyle, async (event, modelSlot: number, id: string, includeSource = false): Promise<HairStyle | null> => {
    deps.assertTrustedSender(event)
    return deps.readStyle(modelSlot, id, includeSource === true)
  })
  deps.ipcMain.handle(fabricatorIpcChannels.saveHairStyle, async (event, modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]): Promise<void> => {
    deps.assertTrustedSender(event)
    await queueSave(modelSlot, async () => {
      await deps.writeStyle(modelSlot, style, assets)
      await deps.clearWorkspace(modelSlot)
      await deps.setLegacyHairCatalogState(modelSlot, 'active')
    })
  })
  deps.ipcMain.handle(fabricatorIpcChannels.deleteHairStyle, async (event, modelSlot: number, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidHairStyleId(id)) throw new Error('Estilo de cabelo inválido.')
    const base = resolve(join(deps.hairModelPath(modelSlot), 'styles'))
    const target = resolve(deps.hairStylePath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `style-${id}`) throw new Error('Caminho de exclusão inválido.')
    await queueSave(modelSlot, async () => {
      if (id === 'legacy-workspace') {
        await deps.clearWorkspace(modelSlot)
        await deps.removeDirectory(target)
        await deps.setLegacyHairCatalogState(modelSlot, 'dismissed')
        return
      }
      await deps.setLegacyHairCatalogState(modelSlot, 'active')
      await deps.clearWorkspace(modelSlot)
      await deps.removeDirectory(target)
    })
  })

  return { getPendingWrites: () => [...saveQueues.values()] }
}
