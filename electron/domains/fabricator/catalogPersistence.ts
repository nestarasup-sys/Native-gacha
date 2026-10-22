/** Escrita da biblioteca de roupas, cabelos e rosto, sem dependência do Electron.
 * O processo principal valida schemas, caminhos e IDs antes de chamar o serviço.
 * O armazenamento é injetado para funcionar em arquivos e DomainFileSystem (SQLite).
 */
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import { publishJsonManifest } from '../storage/atomicManifest.ts'
import { recoverCatalogImageTransaction, runCatalogImageTransaction } from './catalogImageTransaction.ts'

type Files = Pick<typeof nodeFs, 'mkdir' | 'access' | 'writeFile' | 'readFile' | 'rm' | 'rename' | 'unlink' | 'readdir'>
type Image = { id: string; bytes: Buffer }
type Options = {
  folder: string
  imageFolder: string
  manifestName: string
  manifest: unknown
  images: readonly Image[]
  expected: ReadonlySet<string>
  prune?: 'all' | readonly string[]
  missingMessage?: (id: string) => string
}
const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

export function createFabricatorCatalogPersistence(
  files: Files,
  writeImage: (path: string, bytes: Buffer) => Promise<void>
) {
  const { mkdir, access, writeFile, rename, unlink, readdir } = files

  // Mutex por conjunto: não permitir leitura de recuperação enquanto uma nova
  // versão ainda está montando backups, PNGs e manifesto (inclusive em SQLite).
  const inFlight = new Map<string, Promise<void>>()
  function serialized<T>(folder: string, task: () => Promise<T>): Promise<T> {
    const preceding = inFlight.get(folder) ?? Promise.resolve()
    const result = preceding.catch(() => undefined).then(task)
    const settled = result.then(() => undefined, () => undefined)
    inFlight.set(folder, settled)
    void settled.then(() => { if (inFlight.get(folder) === settled) inFlight.delete(folder) })
    return result
  }

  async function recoverLegacyWardrobeManifest(folder: string): Promise<void> {
    const target = join(folder, 'wardrobe.json')
    const backup = join(folder, 'wardrobe.json.backup')
    try { await access(target); return } catch (reason) {
      if (!isMissing(reason)) throw reason
    }
    // SQLite DomainFileSystem pode lançar "Origem não encontrada" sem code
    // para rename de arquivo ausente. Nunca chamar rename sem confirmar backup.
    try { await access(backup) } catch (reason) {
      if (isMissing(reason)) return
      throw reason
    }
    await rename(backup, target)
  }

  async function recoverCatalogManifest(folder: string, imageFolder: string): Promise<void> {
    await serialized(folder, () => recoverCatalogImageTransaction(files, folder, imageFolder))
  }
  async function recoverWardrobeManifest(folder: string): Promise<void> {
    await serialized(folder, async () => {
      await recoverCatalogImageTransaction(files, folder, join(folder, 'parts'))
      await recoverLegacyWardrobeManifest(folder)
    })
  }

  async function commitWardrobeManifest(folder: string, set: unknown): Promise<void> {
    const target = join(folder, 'wardrobe.json')
    const backup = join(folder, 'wardrobe.json.backup')
    await recoverLegacyWardrobeManifest(folder)
    // Mantém o protocolo legado de swap, inclusive em Windows/DomainFileSystem.
    try {
      await access(target)
      await unlink(backup).catch(reason => { if (!isMissing(reason)) throw reason })
    } catch (reason) { if (!isMissing(reason)) throw reason }
    const temporary = join(folder, 'wardrobe.json.tmp')
    await writeFile(temporary, JSON.stringify(set), 'utf8')
    let previousManifest = false
    try {
      await access(target)
      await rename(target, backup)
      previousManifest = true
    } catch (reason) {
      if (!isMissing(reason)) throw reason
    }
    try { await rename(temporary, target) }
    catch (reason) {
      if (previousManifest) await rename(backup, target).catch(() => undefined)
      throw reason
    }
    if (previousManifest) await unlink(backup)
  }

  async function saveCatalog(options: Options): Promise<void> {
    const { folder, imageFolder, manifestName, manifest, images, expected, prune, missingMessage } = options
    return serialized(folder, async () => {
    if (new Set(images.map(image => image.id)).size !== images.length ||
      images.some(image => !expected.has(image.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(image.id))) {
      throw new Error('Imagens de catálogo duplicadas ou inesperadas.')
    }
    // Restaura escrita anterior interrompida antes de verificar o conjunto atual.
    await recoverCatalogImageTransaction(files, folder, imageFolder)
    await mkdir(imageFolder, { recursive: true })
    // Pré-validação ANTES de escrever qualquer PNG: um conjunto incompleto não
    // deve sobrescrever peças antigas se outra peça estiver ausente.
    const provided = new Set(images.map(image => image.id))
    for (const id of expected) {
      if (provided.has(id)) continue
      try { await access(join(imageFolder, id + '.png')) }
      catch (reason) {
        if (!isMissing(reason)) throw reason
        throw new Error(missingMessage?.(id) ?? 'Imagem do catálogo ausente: ' + id)
      }
    }
    const promoteManifest = async () => {
      if (manifestName === 'wardrobe.json') {
        await commitWardrobeManifest(folder, manifest)
      } else {
        const path = join(folder, manifestName)
        await publishJsonManifest({
          files: { writeFile, rename, unlink },
          target: path, temporary: path + '.tmp', value: manifest
        })
      }
    }
    await runCatalogImageTransaction({
      files, folder, imageFolder, manifestName, manifest, images, writeImage, promoteManifest
    })
    // Revalidação: não confirmar um manifesto com PNG faltando.
    for (const id of expected) {
      try { await access(join(imageFolder, id + '.png')) }
      catch (reason) {
        if (!isMissing(reason)) throw reason
        throw new Error(missingMessage?.(id) ?? 'Imagem do catálogo ausente: ' + id)
      }
    }
    // Só remove imagens obsoletas DEPOIS de promover o manifesto.
    if (!prune) return
    for (const filename of await readdir(imageFolder)) {
      if (!filename.endsWith('.png') || filename.endsWith('.paint.png') || expected.has(filename.slice(0, -4))) continue
      if (prune !== 'all' && !prune.includes(filename.slice(0, -4))) continue
      await unlink(join(imageFolder, filename))
    }
    })
  }

  return { saveCatalog, recoverWardrobeManifest, recoverCatalogManifest }
}
