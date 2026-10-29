/** Journal de publicação para PNGs e seu manifesto no Fabricador. */
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readFile' | 'writeFile' | 'rename' | 'rm' | 'unlink'>
export type PendingImage = { id: string; bytes: Buffer }
type Entry = { id: string; existed: boolean }
type Journal = { schemaVersion: 1; manifestName: ImageManifestName; nextHash: string; oldHash: string | null; entries: Entry[] }

const catalogNames = ['asset.json', 'face.json', 'hair-style.json', 'hair.json', 'item.json', 'wardrobe.json'] as const
const animatorNames = ['animation.json', 'draft.json'] as const
export const catalogManifestNames = Object.freeze(catalogNames)
export const animatorManifestNames = Object.freeze(animatorNames)
export type CatalogManifestName = (typeof catalogNames)[number]
export type AnimatorManifestName = (typeof animatorNames)[number]
type ImageManifestName = CatalogManifestName | AnimatorManifestName

const safeId = /^[a-zA-Z0-9_-]{1,80}$/
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown) => JSON.stringify(value)
const journalPath = (folder: string, journalDirectory: string) => join(folder, journalDirectory)
const catalogAllowedNames: ReadonlySet<string> = new Set(catalogNames)
const animatorAllowedNames: ReadonlySet<string> = new Set(animatorNames)

function validJournal(value: unknown, allowedManifestNames: ReadonlySet<string>, maximumEntries: number): value is Journal {
  if (!value || typeof value !== 'object') return false
  const journal = value as Journal
  return journal.schemaVersion === 1 && allowedManifestNames.has(journal.manifestName)
    && /^[0-9a-f]{64}$/.test(journal.nextHash)
    && (journal.oldHash === null || /^[0-9a-f]{64}$/.test(journal.oldHash))
    && Array.isArray(journal.entries) && journal.entries.length <= maximumEntries
    && journal.entries.every(entry => entry && safeId.test(entry.id) && typeof entry.existed === 'boolean')
    && new Set(journal.entries.map(entry => entry.id)).size === journal.entries.length
}

function invalidImageIdMessage(domainLabel: string): string {
  return domainLabel === 'catálogo' ? 'ID de imagem do catálogo inválido.' : 'ID de imagem da animação inválido.'
}

function imagePath(imageFolder: string, id: string, domainLabel: string): string {
  if (!safeId.test(id)) throw new Error(invalidImageIdMessage(domainLabel))
  return join(imageFolder, `${id}.png`)
}

async function maybeRead(files: Files, file: string): Promise<Buffer | null> {
  try { return await files.readFile(file) } catch (error) { if (isMissing(error)) return null; throw error }
}

async function recoverImageManifestTransaction(
  files: Files,
  folder: string,
  imageFolder: string,
  journalDirectory: string,
  allowedManifestNames: ReadonlySet<string>,
  maximumEntries: number,
  domainLabel: string
): Promise<void> {
  const journalFolder = journalPath(folder, journalDirectory)
  const record = await maybeRead(files, join(journalFolder, 'journal.json'))
  if (!record) {
    // A crash before the journal was published cannot have changed any PNG.
    await files.rm(journalFolder, { recursive: true, force: true })
    return
  }
  let journal: unknown
  try { journal = JSON.parse(record.toString('utf8')) }
  catch { throw new Error(`Journal de ${domainLabel} ilegível; gravação bloqueada para preservar os PNGs.`) }
  if (!validJournal(journal, allowedManifestNames, maximumEntries)) {
    throw new Error(`Journal de ${domainLabel} inválido; recuperação manual necessária.`)
  }
  const current = await maybeRead(files, join(folder, journal.manifestName))
  let currentHash: string | null = null
  if (current) {
    try { currentHash = hash(canonical(JSON.parse(current.toString('utf8')))) }
    catch { throw new Error(`Manifesto de ${domainLabel} ilegível; recuperação bloqueada para preservar os PNGs.`) }
  }
  const acknowledged = await maybeRead(files, join(journalFolder, 'committed.ok'))
  const committed = acknowledged?.toString('utf8') === journal.nextHash
    || (currentHash === journal.nextHash && journal.nextHash !== journal.oldHash)
  if (!committed) {
    // Validate every backup before changing any image during rollback.
    const backups = await Promise.all(journal.entries.map(async entry => {
      const bytes = entry.existed ? await files.readFile(join(journalFolder, `${entry.id}.bak`)) : null
      return { entry, bytes }
    }))
    for (const { entry, bytes } of backups) {
      const target = imagePath(imageFolder, entry.id, domainLabel)
      if (bytes) {
        await files.mkdir(dirname(target), { recursive: true })
        await files.writeFile(target, bytes)
      } else {
        try { await files.unlink(target) } catch (error) { if (!isMissing(error)) throw error }
      }
    }
  }
  await files.rm(journalFolder, { recursive: true, force: true })
}

type TransactionOptions<Name extends ImageManifestName> = {
  files: Files
  folder: string
  imageFolder: string
  journalDirectory: string
  manifestName: Name
  manifest: unknown
  images: readonly PendingImage[]
  writeImage: (path: string, bytes: Buffer) => Promise<void>
  promoteManifest: () => Promise<void>
  allowedManifestNames: ReadonlySet<string>
  maximumEntries: number
  domainLabel: string
}

async function runImageManifestTransaction<Name extends ImageManifestName>(options: TransactionOptions<Name>): Promise<void> {
  const { files, folder, imageFolder, journalDirectory, manifestName, manifest, images, writeImage, promoteManifest, allowedManifestNames, maximumEntries, domainLabel } = options
  if (!allowedManifestNames.has(manifestName)) throw new Error(`Manifesto de ${domainLabel} não autorizado.`)
  if (images.length > maximumEntries) throw new Error('O conjunto excede o limite de imagens suportado.')
  await recoverImageManifestTransaction(files, folder, imageFolder, journalDirectory, allowedManifestNames, maximumEntries, domainLabel)
  const unique = new Map<string, Buffer>()
  for (const image of images) {
    if (!safeId.test(image.id)) throw new Error(invalidImageIdMessage(domainLabel))
    const previous = unique.get(image.id)
    if (previous && !previous.equals(image.bytes)) throw new Error('Imagem duplicada com conteúdo diferente.')
    unique.set(image.id, image.bytes)
  }
  const journalFolder = journalPath(folder, journalDirectory)
  const nextHash = hash(canonical(manifest))
  if (images.length === 0) { await promoteManifest(); return }
  await files.mkdir(journalFolder, { recursive: true })
  const entries: Entry[] = []
  try {
    for (const image of images) {
      const existing = await maybeRead(files, imagePath(imageFolder, image.id, domainLabel))
      if (existing) await files.writeFile(join(journalFolder, `${image.id}.bak`), existing)
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
    for (const image of images) await writeImage(imagePath(imageFolder, image.id, domainLabel), image.bytes)
    await promoteManifest()
    promoted = true
    await files.writeFile(join(journalFolder, 'committed.ok'), nextHash, 'utf8')
  } finally {
    if (promoted) await files.rm(journalFolder, { recursive: true, force: true })
    else await recoverImageManifestTransaction(files, folder, imageFolder, journalDirectory, allowedManifestNames, maximumEntries, domainLabel)
  }
}

export type CatalogImageTransactionOptions = Omit<TransactionOptions<CatalogManifestName>, 'journalDirectory' | 'allowedManifestNames' | 'maximumEntries' | 'domainLabel'>
export type AnimatorImageTransactionOptions = Omit<TransactionOptions<AnimatorManifestName>, 'journalDirectory' | 'allowedManifestNames' | 'maximumEntries' | 'domainLabel'>

export function recoverCatalogImageTransaction(files: Files, folder: string, imageFolder: string): Promise<void> {
  return recoverImageManifestTransaction(files, folder, imageFolder, '.catalog-transaction', catalogAllowedNames, 200, 'catálogo')
}

export function recoverAnimatorImageTransaction(files: Files, folder: string, imageFolder: string, manifestName: AnimatorManifestName): Promise<void> {
  if (!animatorAllowedNames.has(manifestName)) throw new Error('Manifesto de animação não autorizado.')
  const allowedManifestNames = new Set([manifestName])
  return recoverImageManifestTransaction(files, folder, imageFolder, '.animator-image-transaction', allowedManifestNames, 500, 'animação')
}

export function runCatalogImageTransaction(options: CatalogImageTransactionOptions): Promise<void> {
  return runImageManifestTransaction({ ...options, journalDirectory: '.catalog-transaction', allowedManifestNames: catalogAllowedNames, maximumEntries: 200, domainLabel: 'catálogo' })
}

export function runAnimatorImageTransaction(options: AnimatorImageTransactionOptions): Promise<void> {
  if (!animatorAllowedNames.has(options.manifestName)) throw new Error('Manifesto de animação não autorizado.')
  const allowedManifestNames = new Set([options.manifestName])
  return runImageManifestTransaction({ ...options, journalDirectory: '.animator-image-transaction', allowedManifestNames, maximumEntries: 500, domainLabel: 'animação' })
}
