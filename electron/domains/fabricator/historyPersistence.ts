import { createHash } from 'node:crypto'
import type { access as nativeAccess, mkdir as nativeMkdir, readFile as nativeReadFile, readdir as nativeReaddir, rename as nativeRename, unlink as nativeUnlink, writeFile as nativeWriteFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { FabricatorHistoryEntry, FabricatorHistorySaveEntry, FabricatorHistorySaveState, FabricatorHistoryState, FabricatorProject, ModelPart } from '../../../src/shared/fabricator'
import { areModelPartSkinContoursValid, isValidModelSkinContours } from '../../../src/shared/modelSkinContours'

type StoredHistoryEntry = {
  action: FabricatorHistoryEntry['action']
  project: Omit<FabricatorProject, 'sourceDataUrl' | 'parts'>
  parts: Array<{ part: Omit<ModelPart, 'dataUrl' | 'chromaBaseDataUrl'>; hash: string; chromaBaseHash?: string }>
}

type FabricatorHistoryPersistenceDependencies = {
  slotPath: (slot: number) => string
  isValidSlot: (slot: number) => boolean
  dataUrlBuffer: (dataUrl: string) => Buffer
  files: {
    access: typeof nativeAccess
    mkdir: typeof nativeMkdir
    readFile: typeof nativeReadFile
    readdir: typeof nativeReaddir
    rename: typeof nativeRename
    unlink: typeof nativeUnlink
    writeFile: typeof nativeWriteFile
  }
}

/** Owns the existing v1 history.json format and its content-addressed image files. */
export function createFabricatorHistoryPersistence(deps: FabricatorHistoryPersistenceDependencies) {
  const { slotPath, isValidSlot, dataUrlBuffer } = deps
  const { access, mkdir, readFile, readdir, rename, unlink, writeFile } = deps.files

  async function write(slot: number, history: FabricatorHistorySaveState): Promise<void> {
    if (!isValidSlot(slot) || !Array.isArray(history.undo) || !Array.isArray(history.redo) || history.undo.length > 50 || history.redo.length > 50) throw new Error('Histórico inválido.')
    const folder = join(slotPath(slot), 'history')
    const assetsFolder = join(folder, 'assets')
    await mkdir(assetsFolder, { recursive: true })
    const referencedAssets = new Set<string>()
    const storeAsset = async (bytes: Buffer, extension: string): Promise<string> => {
      const hash = createHash('sha256').update(bytes).digest('hex')
      const filename = `${hash}.${extension}`
      referencedAssets.add(filename)
      try { await access(join(assetsFolder, filename)) } catch { await writeFile(join(assetsFolder, filename), bytes) }
      return hash
    }
    const serializeEntry = async (entry: FabricatorHistorySaveEntry): Promise<StoredHistoryEntry> => {
      const snapshot = entry.project
      if (snapshot.slot !== slot || snapshot.schemaVersion !== 1 || snapshot.parts.length > 500) throw new Error('Snapshot de histórico inválido.')
      if (!areModelPartSkinContoursValid(snapshot.parts)) throw new Error('Contornos artificiais inválidos no histórico.')
      if (!/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(snapshot.sourceAssetName)) throw new Error('Imagem original no histórico inválida.')
      await access(join(slotPath(slot), snapshot.sourceAssetName))
      const parts = await Promise.all(snapshot.parts.map(async (part) => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)) throw new Error('Peça de histórico inválida.')
        return {
          part: (({ dataUrl: _dataUrl, chromaBaseDataUrl: _baseDataUrl, ...metadata }) => metadata)(part),
          hash: await storeAsset(dataUrlBuffer(part.dataUrl), 'png'),
          ...(part.chromaBaseDataUrl ? { chromaBaseHash: await storeAsset(dataUrlBuffer(part.chromaBaseDataUrl), 'png') } : {})
        }
      }))
      const { parts: _parts, ...metadata } = snapshot
      return { action: entry.action, project: metadata, parts }
    }
    const stored = {
      version: 1,
      undo: await Promise.all(history.undo.map(serializeEntry)),
      redo: await Promise.all(history.redo.map(serializeEntry))
    }
    const temporaryManifest = join(folder, 'history.json.tmp')
    await writeFile(temporaryManifest, JSON.stringify(stored), 'utf8')
    await rename(temporaryManifest, join(folder, 'history.json'))
    for (const filename of await readdir(assetsFolder)) if (!referencedAssets.has(filename)) await unlink(join(assetsFolder, filename))
    const keptSources = new Set([
      ...stored.undo.map((entry) => entry.project.sourceAssetName),
      ...stored.redo.map((entry) => entry.project.sourceAssetName)
    ])
    try {
      const current = JSON.parse(await readFile(join(slotPath(slot), 'project.json'), 'utf8')) as { sourceFile?: string }
      if (current.sourceFile) keptSources.add(current.sourceFile)
    } catch { /* The current project may not yet have a manifest. */ }
    for (const filename of await readdir(slotPath(slot))) {
      if (/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(filename) && !keptSources.has(filename)) await unlink(join(slotPath(slot), filename))
    }
  }

  async function read(slot: number): Promise<FabricatorHistoryState> {
    const folder = join(slotPath(slot), 'history')
    const assetsFolder = join(folder, 'assets')
    const stored = JSON.parse(await readFile(join(folder, 'history.json'), 'utf8')) as {
      version: number
      undo: StoredHistoryEntry[]
      redo: StoredHistoryEntry[]
    }
    if (stored.version !== 1 || !Array.isArray(stored.undo) || !Array.isArray(stored.redo) || stored.undo.length > 50 || stored.redo.length > 50) throw new Error('Arquivo de histórico inválido.')
    const cache = new Map<string, Buffer>()
    const readAsset = async (hash: string, extension: string) => {
      if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Referência de histórico inválida.')
      const key = `${hash}.${extension}`
      let bytes = cache.get(key)
      if (!bytes) { bytes = await readFile(join(assetsFolder, key)); cache.set(key, bytes) }
      return bytes
    }
    const restoreEntry = async (entry: StoredHistoryEntry): Promise<FabricatorHistoryEntry> => {
      if (!['edit', 'mixer', 'reset'].includes(entry.action) || entry.project.slot !== slot) throw new Error('Snapshot de histórico inválido.')
      if (!/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(entry.project.sourceAssetName)) throw new Error('Imagem original do histórico inválida.')
      const source = await readFile(join(slotPath(slot), entry.project.sourceAssetName))
      const extension = extname(entry.project.sourceAssetName).toLowerCase()
      const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
      const contoursValid = areModelPartSkinContoursValid(entry.parts.map(({ part }) => part))
      const parts = await Promise.all(entry.parts.map(async ({ part, hash, chromaBaseHash }) => ({
        ...part,
        fakeSkinContours: contoursValid && isValidModelSkinContours(part.fakeSkinContours) ? part.fakeSkinContours : undefined,
        dataUrl: `data:image/png;base64,${(await readAsset(hash, 'png')).toString('base64')}`,
        ...(chromaBaseHash ? { chromaBaseDataUrl: `data:image/png;base64,${(await readAsset(chromaBaseHash, 'png')).toString('base64')}` } : {})
      })))
      return {
        action: entry.action,
        project: { ...entry.project, sourceDataUrl: `data:${mime};base64,${source.toString('base64')}`, parts }
      }
    }
    return { undo: await Promise.all(stored.undo.map(restoreEntry)), redo: await Promise.all(stored.redo.map(restoreEntry)) }
  }

  return { read, write }
}
