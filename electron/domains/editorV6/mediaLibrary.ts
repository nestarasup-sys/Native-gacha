/** Persistent, typed libraries for Editor V6 object images and audio. */
import { access as nativeAccess, copyFile as nativeCopyFile, mkdir as nativeMkdir, readFile as nativeReadFile, rename as nativeRename, stat as nativeStat, unlink as nativeUnlink, writeFile as nativeWriteFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EditorV6LibraryMediaItem } from '../../../src/shared/editorV6'
import type { DomainFileSystem } from '../../domainFileSystem.cjs'
import { normalizeImageBuffer } from '../../imageIngestion.cjs'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'

type Storage = Pick<DomainFileSystem, 'access' | 'copyFile' | 'mkdir' | 'readFile' | 'rename' | 'stat' | 'unlink' | 'writeFile'>
let storage: Storage = { access: nativeAccess, copyFile: nativeCopyFile, mkdir: nativeMkdir, readFile: nativeReadFile, rename: nativeRename, stat: nativeStat, unlink: nativeUnlink, writeFile: nativeWriteFile }
export function configureEditorV6MediaLibraryStorage(adapter: Storage) { storage = adapter }

const imageMime: Record<string, string> = { png: 'image/png' }
const audioMime: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus', webm: 'audio/webm' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Category = 'object' | 'audio'
type Entry = Omit<EditorV6LibraryMediaItem, 'available' | 'references'>
type Catalog = { schemaVersion: 1; items: Entry[] }
const validEntry = (value: unknown, category: Category): value is Entry => {
  if (!value || typeof value !== 'object') return false
  const item = value as Entry
  const expected = category === 'object' ? imageMime : audioMime
  return item.category === category && uuid.test(item.id) && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 255
    && typeof item.extension === 'string' && expected[item.extension] === item.mimeType && Number.isSafeInteger(item.size) && item.size > 0
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
}

export class EditorV6MediaLibraryStore {
  private readonly operations = createPendingOperationTracker()
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly root: () => string, private readonly resolveReferences: (category: Category, id: string) => Promise<EditorV6LibraryMediaItem['references']>, private readonly resolveAllReferences?: (category: Category, ids: readonly string[]) => Promise<Map<string, EditorV6LibraryMediaItem['references']>>) {}
  private folder(category: Category) { return join(this.root(), category === 'object' ? 'objects-library' : 'audio-library') }
  private file(category: Category, item: Pick<Entry, 'id' | 'extension'>) { return join(this.folder(category), 'files', `${item.id}.${item.extension}`) }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.track(() => this.queue.catch(() => undefined).then(operation))
    this.queue = next
    return next
  }
  getPendingWrites() { return this.operations.getPending() }
  private async readCatalog(category: Category): Promise<Catalog> {
    try {
      const value = JSON.parse(await storage.readFile(join(this.folder(category), 'catalog.json'), 'utf8')) as Catalog
      if (value.schemaVersion !== 1 || !Array.isArray(value.items) || !value.items.every((item) => validEntry(item, category)) || new Set(value.items.map((item) => item.id)).size !== value.items.length) throw Error('O catálogo da biblioteca do Editor V6 está inválido.')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, items: [] }; throw error }
  }
  private async writeCatalog(category: Category, catalog: Catalog) {
    await storage.mkdir(this.folder(category), { recursive: true })
    const temporary = join(this.folder(category), `catalog-${randomUUID()}.tmp`)
    await storage.writeFile(temporary, JSON.stringify(catalog, null, 2), 'utf8')
    await storage.rename(temporary, join(this.folder(category), 'catalog.json'))
  }
  async list(category: Category): Promise<EditorV6LibraryMediaItem[]> {
    return this.run(async () => {
      const catalog = await this.readCatalog(category)
      const references = this.resolveAllReferences
        ? await this.resolveAllReferences(category, catalog.items.map((item) => item.id))
        : new Map(await Promise.all(catalog.items.map(async (item) => [item.id, await this.resolveReferences(category, item.id)] as const)))
      return Promise.all([...catalog.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(async (item) => {
        let available = false
        try { available = (await storage.stat(this.file(category, item))).size === item.size } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        return { ...item, available, references: references.get(item.id) ?? [], ...(category === 'object' ? { previewUrl: `gacha-editor-media://catalog/${item.id}` } : {}) }
      }))
    })
  }
  async importFile(category: Category, source: string): Promise<EditorV6LibraryMediaItem> {
    return this.run(async () => {
      const extension = extname(source).slice(1).toLowerCase()
      const allowed = category === 'object' ? ['png', 'jpg', 'jpeg', 'webp'] : Object.keys(audioMime)
      if (!allowed.includes(extension)) throw Error(`Formato não compatível para a biblioteca de ${category === 'object' ? 'objetos' : 'áudios'}.`)
      const sourceStats = await storage.stat(source)
      const maxBytes = category === 'object' ? 50 * 1024 ** 2 : 2 * 1024 ** 3
      if (sourceStats.size <= 0 || sourceStats.size > maxBytes) throw Error(`O arquivo excede o limite de ${category === 'object' ? '50 MB' : '2 GB'}.`)
      const id = randomUUID(), catalog = await this.readCatalog(category)
      let bytes: Buffer | null = null, mimeType: string, canonicalExtension: string, size: number
      if (category === 'object') { const normalized = await normalizeImageBuffer(await storage.readFile(source)); bytes = normalized.bytes; mimeType = 'image/png'; canonicalExtension = 'png'; size = bytes.length }
      else { mimeType = audioMime[extension]; canonicalExtension = extension; size = sourceStats.size }
      const item: Entry = { id, category, name: basename(source).slice(0, 255), mimeType, extension: canonicalExtension, size, createdAt: new Date().toISOString() }
      await storage.mkdir(join(this.folder(category), 'files'), { recursive: true })
      const target = this.file(category, item), temporary = `${target}.${randomUUID()}.tmp`
      if (bytes) await storage.writeFile(temporary, bytes)
      else await storage.copyFile(source, temporary, constants.COPYFILE_EXCL)
      if ((await storage.stat(temporary)).size !== item.size) { await storage.unlink(temporary); throw Error('A mídia não passou na verificação de integridade.') }
      await storage.rename(temporary, target)
      catalog.items.push(item)
      try { await this.writeCatalog(category, catalog) } catch (error) { await storage.unlink(target).catch(() => undefined); throw error }
      return { ...item, available: true, references: [] }
    })
  }
  async rename(category: Category, id: string, rawName: string): Promise<void> {
    if (!uuid.test(id)) throw Error('Identificador de mídia inválido.')
    const name = rawName.trim()
    if (!name || name.length > 255 || /[\\/\0]/.test(name)) throw Error('O nome deve ter de 1 a 255 caracteres e não pode conter barras.')
    await this.run(async () => { const catalog = await this.readCatalog(category), item = catalog.items.find((entry) => entry.id === id); if (!item) throw Error('Mídia não encontrada.'); item.name = name; await this.writeCatalog(category, catalog) })
  }
  async delete(category: Category, id: string): Promise<void> {
    if (!uuid.test(id)) throw Error('Identificador de mídia inválido.')
    await this.run(async () => {
      const catalog = await this.readCatalog(category), item = catalog.items.find((entry) => entry.id === id)
      if (!item) return
      catalog.items = catalog.items.filter((entry) => entry.id !== id)
      await this.writeCatalog(category, catalog)
      try { await storage.unlink(this.file(category, item)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    })
  }
  async resolve(category: Category, id: string): Promise<{ path: string; mimeType: string; name: string; extension: string; size: number }> {
    if (!uuid.test(id)) throw Error('Identificador de mídia inválido.')
    return this.run(async () => {
      const item = (await this.readCatalog(category)).items.find((entry) => entry.id === id)
      if (!item || (await storage.stat(this.file(category, item))).size !== item.size) throw Error('A mídia não está disponível na biblioteca.')
      return { path: this.file(category, item), mimeType: item.mimeType, name: item.name, extension: item.extension, size: item.size }
    })
  }
}
