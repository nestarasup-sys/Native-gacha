import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { access as nativeAccess, stat as nativeStat, unlink as nativeUnlink } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { FabricatorAssetSave, FabricatorHistorySaveState, FabricatorHistoryState, FabricatorProjectSave } from '../../../src/shared/fabricator'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels'
import type { ModelSourceFiles, ModelSourcePublishRequest } from './modelSource'
import { publishModelSource } from './modelSource'
import { recoverModelSourceSlot } from './modelSourceRecovery'

type FabricatorProjectIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidSlot: (slot: number) => boolean
  libraryPath: () => string
  slotPath: (slot: number) => string
  writeProject: (project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[], folderOverride?: string) => Promise<void>
  history: {
    read: (slot: number) => Promise<FabricatorHistoryState>
    write: (slot: number, history: FabricatorHistorySaveState) => Promise<void>
  }
  openImportDialog: (mode: 'import' | 'reimport') => Promise<string | null>
  normalizeImage: (bytes: Buffer) => Promise<{ bytes: Buffer; bitDepth: number; width: number; height: number }>
  createId: () => string
  files: ModelSourceFiles & { access: typeof nativeAccess; stat: typeof nativeStat; unlink: typeof nativeUnlink }
}

export function registerFabricatorProjectHandlers(deps: FabricatorProjectIpcDependencies) {
  const saveQueues = new Map<number, Promise<unknown>>()
  const queueWrite = async <T>(slot: number, operation: () => Promise<T>): Promise<T> => {
    const previous = saveQueues.get(slot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    saveQueues.set(slot, current)
    try { return await current }
    finally { if (saveQueues.get(slot) === current) saveQueues.delete(slot) }
  }

  deps.ipcMain.handle('fabricator:import-model', async (event, slot: number, mode: 'import' | 'reimport' = 'import') => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(slot)) throw new Error('Slot inválido.')
    if (mode !== 'import' && mode !== 'reimport') throw new Error('Modo de importação inválido.')
    const path = await deps.openImportDialog(mode)
    if (!path) return null
    const extension = extname(path).toLowerCase()
    const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
    if (!supportedExtensions.has(extension)) throw new Error('Formato incompatível. Use PNG, JPG ou WebP.')
    const fileStat = await deps.files.stat(path)
    if (fileStat.size > 50 * 1024 * 1024) throw new Error('A imagem excede o limite de 50 MB.')
    if (fileStat.size === 0) throw new Error('O arquivo de imagem está vazio.')
    const bytes = await deps.files.readFile(path)
    const canonical = await deps.normalizeImage(bytes)
    if (canonical.bitDepth > 8) throw new Error('O Fabricador processa a folha em 8 bits. O PNG de 16 bits não foi alterado; converta uma cópia para 8 bits para importar neste editor.')
    if (mode === 'reimport') {
      const existing = JSON.parse(await deps.files.readFile(join(deps.slotPath(slot), 'project.json'), 'utf8')) as { width?: number; height?: number }
      if (canonical.width !== existing.width || canonical.height !== existing.height) {
        throw new Error(`Para preservar as configurações do modelo, a imagem precisa ter ${existing.width} × ${existing.height} pixels.`)
      }
    }
    const sourceDataUrl = `data:image/png;base64,${canonical.bytes.toString('base64')}`
    const destination = deps.slotPath(slot)
    const sourceAssetName = `source-${deps.createId()}.png`
    await deps.files.mkdir(destination, { recursive: true })
    await deps.files.writeFile(join(destination, sourceAssetName), canonical.bytes)
    return { sourceName: basename(path), sourceAssetName, sourceDataUrl }
  })

  deps.ipcMain.handle('fabricator:save-project', async (event, project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(project.slot)) throw new Error('Projeto inválido.')
    await queueWrite(project.slot, () => deps.writeProject(project, changedAssets))
  })

  deps.ipcMain.handle(fabricatorIpcChannels.publishFabricatorModelSource, async (event, request: ModelSourcePublishRequest): Promise<string> => {
    deps.assertTrustedSender(event)
    if (!request || !deps.isValidSlot(request.project?.slot)) throw new Error('Slot inválido.')
    const slot = request.project.slot
    return queueWrite(slot, async () => {
      await recoverModelSourceSlot(slot, deps.slotPath, deps.files)
      return publishModelSource(request, deps.slotPath, deps.writeProject, deps.files)
    })
  })

  deps.ipcMain.handle('fabricator:load-history', async (event, slot: number): Promise<FabricatorHistoryState> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(slot)) throw new Error('Slot inválido.')
    try { return await deps.history.read(slot) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return { undo: [], redo: [] }
      throw reason
    }
  })

  deps.ipcMain.handle('fabricator:save-history', async (event, slot: number, history: FabricatorHistorySaveState, current: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(slot) || current.slot !== slot) throw new Error('Slot inválido.')
    await queueWrite(slot, async () => {
      await deps.history.write(slot, history)
      await deps.writeProject(current, changedAssets)
    })
  })

  deps.ipcMain.handle('fabricator:delete-slot', async (event, slot: number): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(slot)) throw new Error('Slot inválido.')
    await queueWrite(slot, async () => {
      const base = resolve(deps.libraryPath())
      const target = resolve(deps.slotPath(slot))
      if (dirname(target) !== base || basename(target) !== `slot-${slot}`) throw new Error('Caminho de exclusão inválido.')
      await deps.files.rm(target, { recursive: true, force: true })
    })
  })

  return { getPendingWrites: () => [...saveQueues.values()] }
}
