import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { access as nativeAccess, stat as nativeStat, unlink as nativeUnlink } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { FabricatorAssetSave, FabricatorHistorySaveState, FabricatorHistoryState, FabricatorProjectSave } from '../../../src/shared/fabricator'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels'
import type { ModelSourceFiles, ModelSourcePublishRequest } from './modelSource'
import { publishModelSource } from './modelSource'
import { verifyModelSourceCommit } from './modelSourceJournal'
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

async function copyDirectoryContents(source: string, destination: string, files: ModelSourceFiles): Promise<void> {
  await files.mkdir(destination, { recursive: true })
  for (const entry of await files.readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) await copyDirectoryContents(from, to, files)
    else if (entry.isFile()) await files.writeFile(to, await files.readFile(from))
    else throw new Error('O modelo contém um arquivo que não pode ser duplicado com segurança.')
  }
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
  const queueSlots = async <T>(slots: number[], operation: () => Promise<T>): Promise<T> => {
    const orderedSlots = [...new Set(slots)].sort((left, right) => left - right)
    const acquire = (index: number): Promise<T> => index === orderedSlots.length
      ? operation()
      : queueWrite(orderedSlots[index], () => acquire(index + 1))
    return acquire(0)
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

  deps.ipcMain.handle(fabricatorIpcChannels.duplicateFabricatorSlot, async (
    event, sourceSlot: number, targetSlot: number
  ): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidSlot(sourceSlot) || !deps.isValidSlot(targetSlot) || targetSlot === sourceSlot) {
      throw new Error('Escolha um slot de destino diferente do modelo original.')
    }
    const library = resolve(deps.libraryPath())
    const source = resolve(deps.slotPath(sourceSlot))
    const destination = resolve(deps.slotPath(targetSlot))
    if (dirname(source) !== library || basename(source) !== `slot-${sourceSlot}`
      || dirname(destination) !== library || basename(destination) !== `slot-${targetSlot}`) {
      throw new Error('Caminho do modelo ou do slot de destino inválido.')
    }

    await queueSlots([sourceSlot, targetSlot], async () => {
      const assertDestinationEmpty = async () => {
        try { await deps.files.access(destination) } catch (reason) {
          if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return
          throw reason
        }
        throw new Error(`O slot ${targetSlot} já contém dados. Escolha um slot vazio para preservar o modelo existente.`)
      }
      await assertDestinationEmpty()
      const sourceProject = JSON.parse(await deps.files.readFile(join(source, 'project.json'), 'utf8')) as FabricatorProjectSave
      if (!sourceProject || sourceProject.schemaVersion !== 1 || sourceProject.slot !== sourceSlot
        || !Array.isArray(sourceProject.parts) || sourceProject.parts.length > 500
        || !Array.isArray(sourceProject.joints) || typeof sourceProject.sourceAssetName !== 'string') {
        throw new Error('O modelo original não pôde ser validado para duplicação.')
      }
      await verifyModelSourceCommit(source, sourceProject.sourceAssetName, deps.files)
      await deps.files.mkdir(library, { recursive: true })
      const transactionId = deps.createId()
      if (!/^[a-f0-9-]{36}$/i.test(transactionId)) throw new Error('Não foi possível identificar a cópia do modelo.')
      const staging = join(library, `.fabricator-duplicate-stage-${targetSlot}-${transactionId}`)
      let published = false
      let createdStaging = false
      try {
        await deps.files.mkdir(staging)
        createdStaging = true
        await deps.files.writeFile(join(staging, sourceProject.sourceAssetName), await deps.files.readFile(join(source, sourceProject.sourceAssetName)), { flag: 'wx' })
        const sourceParts = join(source, 'parts')
        const stagedParts = join(staging, 'parts')
        await copyDirectoryContents(sourceParts, stagedParts, deps.files)
        const copy = { ...sourceProject, slot: targetSlot, updatedAt: new Date().toISOString() }
        await deps.writeProject(copy, [], staging)
        await verifyModelSourceCommit(staging, sourceProject.sourceAssetName, deps.files)
        await assertDestinationEmpty()
        await deps.files.rename(staging, destination)
        published = true
        await verifyModelSourceCommit(destination, sourceProject.sourceAssetName, deps.files)
      } finally {
        if (createdStaging && !published) await deps.files.rm(staging, { recursive: true, force: true }).catch(() => undefined)
      }
    })
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
