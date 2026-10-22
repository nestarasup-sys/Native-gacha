/** Recuperação de publicação de múltiplos PNGs do catálogo Fabricador.
 * Journal por conjunto, usando o mesmo adapter de arquivos (inclusive SQLite).
 * Não altera os formatos de manifestos ou dos PNGs/fontes .paint.png.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readFile' | 'writeFile' | 'rename' | 'rm' | 'unlink'>
export type CatalogPendingImage = { id: string; bytes: Buffer }
type Entry = { id: string; existed: boolean }
type Journal = { schemaVersion: 1; manifestName: string; nextHash: string; oldHash: string | null; entries: Entry[] }
const safeId = /^[a-zA-Z0-9_-]{1,80}$/
const safeManifest = /^(?:wardrobe|hair|hair-style|face|item)\.json$/
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown) => JSON.stringify(value)
const paths = (folder: string) => ({ journal: join(folder, '.catalog-transaction'), imageFolder: join(folder, 'parts') })
async function maybeRead(files: Files, file: string): Promise<Buffer | null> {
  try { return await files.readFile(file) } catch (error) { if (isMissing(error)) return null; throw error }
}
function imagePath(imageFolder: string, id: string): string {
  if (!safeId.test(id)) throw new Error('ID de imagem do catálogo inválido.')
  return join(imageFolder, id + '.png')
}
function validJournal(value: unknown): value is Journal {
  if (!value || typeof value !== 'object') return false
  const j = value as Journal
  return j.schemaVersion === 1 && safeManifest.test(j.manifestName)
    && /^[0-9a-f]{64}$/.test(j.nextHash)
    && (j.oldHash === null || /^[0-9a-f]{64}$/.test(j.oldHash))
    && Array.isArray(j.entries) && j.entries.length <= 200
    && j.entries.every(e => e && safeId.test(e.id) && typeof e.existed === 'boolean')
    && new Set(j.entries.map(e => e.id)).size === j.entries.length
}
/** Chamar antes de qualquer read de catálogo ou save do mesmo conjunto. */
export async function recoverCatalogImageTransaction(files: Files, folder: string, imageFolder: string): Promise<void> {
  const journalFolder = paths(folder).journal
  const record = await maybeRead(files, join(journalFolder, 'journal.json'))
  if (!record) {
    // Backups órfãos são anteriores a qualquer alteração de PNG.
    await files.rm(journalFolder, { recursive: true, force: true })
    return
  }
  let journal: unknown
  try { journal = JSON.parse(record.toString('utf8')) } catch { throw new Error('Journal de catálogo ilegível; gravação bloqueada para preservar os PNGs.') }
  if (!validJournal(journal)) throw new Error('Journal de catálogo inválido; recuperação manual necessária.')
  const current = await maybeRead(files, join(folder, journal.manifestName))
  let currentHash: string | null = null
  if (current) {
    try { currentHash = hash(canonical(JSON.parse(current.toString('utf8')))) }
    catch { throw new Error('Manifesto de catálogo ilegível; recuperação bloqueada para preservar os PNGs.') }
  }
  const acknowledged = await maybeRead(files, join(journalFolder, 'committed.ok'))
  const committed = acknowledged?.toString('utf8') === journal.nextHash
    || (currentHash === journal.nextHash && journal.nextHash !== journal.oldHash)
  if (!committed) {
    // Fail closed: validar todos os backups antes de modificar qualquer PNG.
    const backups = await Promise.all(journal.entries.map(async entry => {
      const bytes = entry.existed ? await files.readFile(join(journalFolder, entry.id + '.bak')) : null
      return { entry, bytes }
    }))
    for (const { entry, bytes } of backups) {
      const target = imagePath(imageFolder, entry.id)
      if (bytes) await files.writeFile(target, bytes)
      else {
        try { await files.unlink(target) } catch (error) { if (!isMissing(error)) throw error }
      }
    }
  }
  await files.rm(journalFolder, { recursive: true, force: true })
}
export async function runCatalogImageTransaction(options: {
  files: Files
  folder: string
  imageFolder: string
  manifestName: string
  manifest: unknown
  images: readonly CatalogPendingImage[]
  writeImage: (path: string, bytes: Buffer) => Promise<void>
  promoteManifest: () => Promise<void>
}): Promise<void> {
  const { files, folder, imageFolder, manifestName, manifest, images, writeImage, promoteManifest } = options
  if (!safeManifest.test(manifestName)) throw new Error('Manifesto de catálogo não autorizado.')
  await recoverCatalogImageTransaction(files, folder, imageFolder)
  const journalFolder = paths(folder).journal
  const nextHash = hash(canonical(manifest))
  if (images.length === 0) { await promoteManifest(); return }
  await files.mkdir(journalFolder, { recursive: true })
  const entries: Entry[] = []
  try {
    for (const image of images) {
      const existing = await maybeRead(files, imagePath(imageFolder, image.id))
      if (existing) await files.writeFile(join(journalFolder, image.id + '.bak'), existing)
      entries.push({ id: image.id, existed: existing !== null })
    }
    const previous = await maybeRead(files, join(folder, manifestName))
    let oldHash: string | null = null
    if (previous) oldHash = hash(canonical(JSON.parse(previous.toString('utf8'))))
    const journal: Journal = { schemaVersion: 1, manifestName, nextHash, oldHash, entries }
    const draft = join(journalFolder, 'journal.json.tmp')
    await files.writeFile(draft, JSON.stringify(journal), 'utf8')
    await files.rename(draft, join(journalFolder, 'journal.json'))
  } catch (error) {
    await files.rm(journalFolder, { recursive: true, force: true })
    throw error
  }
  let promoted = false
  try {
    for (const image of images) await writeImage(imagePath(imageFolder, image.id), image.bytes)
    await promoteManifest()
    promoted = true
    await files.writeFile(join(journalFolder, 'committed.ok'), nextHash, 'utf8')
  } finally {
    if (promoted) await files.rm(journalFolder, { recursive: true, force: true })
    else await recoverCatalogImageTransaction(files, folder, imageFolder)
  }
}
