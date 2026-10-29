import { constants } from 'node:fs'
import { access as nativeAccess, copyFile as nativeCopyFile, mkdir as nativeMkdir, readFile as nativeReadFile, rename as nativeRename, stat as nativeStat, unlink as nativeUnlink, writeFile as nativeWriteFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VideoLibraryItem } from '../../../src/shared/mediaLibrary'
import type { DomainFileSystem } from '../../domainFileSystem.cjs'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'
import { sha256File } from './videoCasShadow'

type StorageAdapter = Pick<DomainFileSystem, 'access' | 'copyFile' | 'mkdir' | 'readFile' | 'rename' | 'stat' | 'unlink' | 'writeFile'>
  & Partial<Pick<DomainFileSystem, 'resolvePhysicalPath'>>
let storage: StorageAdapter = { access: nativeAccess, copyFile: nativeCopyFile, mkdir: nativeMkdir, readFile: nativeReadFile,
rename: nativeRename, stat: nativeStat, unlink: nativeUnlink, writeFile: nativeWriteFile }
export function configureVideoLibraryStorage(adapter: StorageAdapter) { storage = adapter }
const access = (path: Parameters<StorageAdapter['access']>[0], mode?: Parameters<StorageAdapter['access']>[1]) => storage.access(path, mode)
const copyFile = (source: Parameters<StorageAdapter['copyFile']>[0], destination: Parameters<StorageAdapter['copyFile']>[1], mode?: Parameters<StorageAdapter['copyFile']>[2]) => storage.copyFile(source, destination, mode)
const mkdir = (path: Parameters<StorageAdapter['mkdir']>[0], options?: Parameters<StorageAdapter['mkdir']>[1]) => storage.mkdir(path, options)
function readFile(path: string): Promise<Buffer>
function readFile(path: string, options: BufferEncoding): Promise<string>
function readFile(path: string, options: { encoding: BufferEncoding }): Promise<string>
function readFile(path: string, options?: BufferEncoding | { encoding: BufferEncoding }): Promise<Buffer | string> { return storage.readFile(path, options as BufferEncoding | { encoding: BufferEncoding }) }
const rename = (oldPath: Parameters<StorageAdapter['rename']>[0], newPath: Parameters<StorageAdapter['rename']>[1]) => storage.rename(oldPath, newPath)
const stat = (path: Parameters<StorageAdapter['stat']>[0]) => storage.stat(path)
const unlink = (path: Parameters<StorageAdapter['unlink']>[0]) => storage.unlink(path)
const writeFile = (path: string, data: string | NodeJS.ArrayBufferView, options?: BufferEncoding): Promise<void> => storage.writeFile(path, data, options)

const formats = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' } as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxFrames = 60 * 60 * 60 * 24
type Entry = Omit<VideoLibraryItem, 'available'> & { sha256?: string }
type Catalog = { schemaVersion: 1; items: Entry[]; deleted: Array<{ id: string; extension: Entry['extension'] }> }
const validId = (id: unknown): id is string => typeof id === 'string' && uuid.test(id)
const requireId = (id: unknown) => { if (!validId(id)) throw new Error('Identificador de vídeo ou roteiro inválido.') }
const exists = async (path: string) => { try { await access(path); return true } catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return false; throw reason } }
function toLibraryItem(entry: Entry, available: boolean): VideoLibraryItem {
  const item = { ...entry } as Entry & { studios?: unknown }
  delete item.studios
  return { ...item, available }
}
function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false
  const item = value as Entry
  return validId(item.id) && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 255
    && Object.hasOwn(formats, item.extension) && formats[item.extension] === item.mimeType
    && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= 5 * 1024 ** 3
    && (item.durationFrames === null || Number.isSafeInteger(item.durationFrames) && item.durationFrames > 0 && item.durationFrames <= maxFrames)
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
    && (item.sha256 === undefined || /^[a-f0-9]{64}$/.test(item.sha256))
}

/** Owns shared video originals and their stable IDs for all consuming areas. */
export class VideoLibraryStore {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly pendingOperations = createPendingOperationTracker()
  constructor(private readonly workspacePath: () => string) {}
  private libraryPath() { return join(this.workspacePath(), 'media-library') }
  private mediaPath(item: Pick<Entry, 'id' | 'extension'>) { return join(this.libraryPath(), 'videos', `${item.id}.${item.extension}`) }
  private async hashStoredFile(filePath: string, expectedSha?: string) {
    // Active app-data domains expose logical paths, so resolve the content-addressed
    // file before using Node's native stream APIs. For legacy storage the path is physical.
    const physicalPath = await storage.resolvePhysicalPath?.(filePath) ?? filePath
    const sha256 = await sha256File(physicalPath)
    if (expectedSha && expectedSha !== sha256) throw new Error('Fonte mudou antes de entrar no catálogo de vídeos.')
    return sha256
  }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue
    const next = this.pendingOperations.track(() => previous.catch(() => undefined).then(operation))
    this.queue = next
    return next
  }
  getPendingWrites(): Promise<unknown>[] { return this.pendingOperations.getPending() }
  private async readCatalog(): Promise<Catalog> {
    try {
      const catalog = JSON.parse(await readFile(join(this.libraryPath(), 'catalog.json'), 'utf8')) as Catalog
      if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.items) || !catalog.items.every(validEntry)
        || new Set(catalog.items.map((item) => item.id)).size !== catalog.items.length
        || !Array.isArray(catalog.deleted) || !catalog.deleted.every((item) => validId(item?.id) && Object.hasOwn(formats, item.extension))) throw new Error('O catálogo da biblioteca de vídeos está inválido.')
      return catalog
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, items: [], deleted: [] }
      throw reason
    }
  }
  private async writeCatalog(catalog: Catalog) {
    await mkdir(join(this.libraryPath(), 'videos'), { recursive: true })
    const temporary = join(this.libraryPath(), `catalog-${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(catalog, null, 2), 'utf8')
    await rename(temporary, join(this.libraryPath(), 'catalog.json'))
  }
  private async copyVerified(source: string, destination: string, size: number) {
    if (!await exists(destination)) {
      await mkdir(dirname(destination), { recursive: true })
      const temporary = `${destination}.${randomUUID()}.tmp`
      try {
        await copyFile(source, temporary, constants.COPYFILE_EXCL)
        if ((await stat(temporary)).size !== size) throw new Error('O vídeo mudou durante a cópia. Tente importar novamente.')
        if (!await exists(destination)) await rename(temporary, destination)
      } finally {
        try { await unlink(temporary) } catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
      }
    }
    if ((await stat(destination)).size !== size) throw new Error('A cópia do vídeo tem um tamanho inesperado. O arquivo existente foi preservado.')
  }
  private async cleanupDeleted(catalog: Catalog) {
    // A playing preview can temporarily hold a deleted file open on Windows.
    for (const item of catalog.deleted) {
      try { await unlink(this.mediaPath(item)) } catch (reason) { if (!['ENOENT', 'EPERM', 'EBUSY', 'EACCES'].includes((reason as NodeJS.ErrnoException).code ?? '')) throw reason }
    }
  }
  async list(): Promise<VideoLibraryItem[]> {
    return this.run(async () => {
      const catalog = await this.readCatalog()
      await this.cleanupDeleted(catalog)
      return Promise.all(catalog.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(async (item) =>
        toLibraryItem(item, await exists(this.mediaPath(item)))))
    })
  }
  async importFile(source: string): Promise<VideoLibraryItem> {
    return this.run(async () => {
      const extension = extname(source).slice(1).toLowerCase() as Entry['extension']
      if (!Object.hasOwn(formats, extension)) throw new Error('Formato não compatível. Use MP4, WebM, MOV ou M4V.')
      const file = await stat(source)
      if (!file.isFile() || file.size <= 0 || file.size > 5 * 1024 ** 3) throw new Error('O vídeo deve ter até 5 GB.')
      const item: Entry = { id: randomUUID(), name: basename(source), extension, mimeType: formats[extension], size: file.size, durationFrames: null, createdAt: new Date().toISOString() }
      const catalog = await this.readCatalog()
      await this.copyVerified(source, this.mediaPath(item), item.size)
      const mediaPath = this.mediaPath(item)
      try {
        item.sha256 = await this.hashStoredFile(mediaPath)
        catalog.items.push(item)
        await this.writeCatalog(catalog)
      } catch (error) {
        // Do not leave an unlisted media object after a failed import. If the catalog
        // was committed despite a later I/O error, preserve the referenced file.
        const catalogContainsItem = await this.readCatalog().then((current) => current.items.some((entry) => entry.id === item.id)).catch(() => true)
        if (!catalogContainsItem) await unlink(mediaPath).catch(() => undefined)
        throw error
      }
      return toLibraryItem(item, true)
    })
  }
  async finishImport(id: string, durationFrames: number): Promise<VideoLibraryItem> {
    requireId(id)
    if (!Number.isSafeInteger(durationFrames) || durationFrames <= 0 || durationFrames > maxFrames) throw new Error('Duração do vídeo inválida.')
    return this.run(async () => {
      const catalog = await this.readCatalog()
      const item = catalog.items.find((entry) => entry.id === id)
      if (!item) throw new Error('Este vídeo foi removido da biblioteca.')
      item.durationFrames = durationFrames
      await this.writeCatalog(catalog)
      return toLibraryItem(item, await exists(this.mediaPath(item)))
    })
  }
  async rename(id: string, name: string): Promise<VideoLibraryItem> {
    requireId(id)
    const nextName = name.trim()
    if (!nextName || nextName.length > 255 || /[\\/\0-\x1f]/.test(nextName)) throw new Error('Nome de exibição inválido.')
    return this.run(async () => {
      const catalog = await this.readCatalog()
      const item = catalog.items.find((entry) => entry.id === id)
      if (!item) throw new Error('Vídeo não encontrado na biblioteca.')
      item.name = nextName
      await this.writeCatalog(catalog)
      return toLibraryItem(item, await exists(this.mediaPath(item)))
    })
  }
  async delete(id: string): Promise<void> {
    requireId(id)
    return this.run(async () => {
      const catalog = await this.readCatalog()
      const item = catalog.items.find((entry) => entry.id === id)
      if (!item) return
      catalog.items = catalog.items.filter((entry) => entry.id !== id)
      catalog.deleted.push({ id, extension: item.extension })
      await this.writeCatalog(catalog)
      // The catalog tombstone is the logical deletion commit point. A locked
      // file is retried by the next library scan, so cleanup errors must not
      // turn a completed deletion into an ambiguous partial failure.
      try { await this.cleanupDeleted(catalog) } catch { /* retry from the tombstone on next access */ }
    })
  }
  async resolveMedia(id: string): Promise<{ path: string; name: string; mimeType: Entry['mimeType']; extension: Entry['extension']; size: number; durationFrames: Entry['durationFrames'] }> {
    requireId(id)
    return this.run(async () => {
      const item = (await this.readCatalog()).items.find((entry) => entry.id === id)
      if (!item) throw new Error('Vídeo não encontrado na biblioteca.')
      return { path: this.mediaPath(item), name: item.name, mimeType: item.mimeType, extension: item.extension, size: item.size, durationFrames: item.durationFrames }
    })
  }
}
