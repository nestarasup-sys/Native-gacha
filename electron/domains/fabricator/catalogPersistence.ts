/** Escrita da biblioteca de roupas, cabelos e rosto, sem dependência do Electron.
 * O processo principal valida schemas, caminhos e IDs antes de chamar o serviço.
 * O armazenamento é injetado para funcionar em arquivos e DomainFileSystem (SQLite).
 */
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import { publishJsonManifest } from '../storage/atomicManifest.ts'

type Files = Pick<typeof nodeFs, 'mkdir' | 'access' | 'writeFile' | 'rename' | 'unlink' | 'readdir'>
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

  async function recoverWardrobeManifest(folder: string): Promise<void> {
    const target = join(folder, 'wardrobe.json')
    const backup = join(folder, 'wardrobe.json.backup')
    try { await access(target); return } catch (reason) {
      if (!isMissing(reason)) throw reason
    }
    try { await rename(backup, target) } catch (reason) {
      if (!isMissing(reason)) throw reason
    }
  }

  async function commitWardrobeManifest(folder: string, set: unknown): Promise<void> {
    const target = join(folder, 'wardrobe.json')
    const backup = join(folder, 'wardrobe.json.backup')
    await recoverWardrobeManifest(folder)
    // Mantém o protocolo legado de swap, inclusive em Windows/DomainFileSystem.
    try {
      await access(target)
      await unlink(backup).catch(reason => { if (!isMissing(reason)) throw reason })
    } catch (reason) { if (!isMissing(reason)) throw reason }
    const temporary = join(folder, 'wardrobe.json.tmp')
    await writeFile(temporary, JSON.stringify(set), 'utf8')
    let previousManifest = false
    try { await rename(target, backup); previousManifest = true }
    catch (reason) { if (!isMissing(reason)) throw reason }
    try { await rename(temporary, target) }
    catch (reason) {
      if (previousManifest) await rename(backup, target).catch(() => undefined)
      throw reason
    }
    if (previousManifest) await unlink(backup)
  }

  async function saveCatalog(options: Options): Promise<void> {
    const { folder, imageFolder, manifestName, manifest, images, expected, prune, missingMessage } = options
    if (new Set(images.map(image => image.id)).size !== images.length ||
      images.some(image => !expected.has(image.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(image.id))) {
      throw new Error('Imagens de catálogo duplicadas ou inesperadas.')
    }
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
    for (const image of images) await writeImage(join(imageFolder, image.id + '.png'), image.bytes)
    // Confere a presença de todos os PNGs também depois da gravação.
    for (const id of expected) {
      try { await access(join(imageFolder, id + '.png')) }
      catch (reason) {
        if (!isMissing(reason)) throw reason
        throw new Error(missingMessage?.(id) ?? 'Imagem do catálogo ausente: ' + id)
      }
    }
    if (manifestName === 'wardrobe.json') {
      await commitWardrobeManifest(folder, manifest)
    } else {
      const path = join(folder, manifestName)
      await publishJsonManifest({
        files: { writeFile, rename, unlink },
        target: path, temporary: path + '.tmp', value: manifest
      })
    }
    // Só remove imagens obsoletas DEPOIS de promover o manifesto.
    if (!prune) return
    for (const filename of await readdir(imageFolder)) {
      if (!filename.endsWith('.png') || filename.endsWith('.paint.png') || expected.has(filename.slice(0, -4))) continue
      if (prune !== 'all' && !prune.includes(filename.slice(0, -4))) continue
      await unlink(join(imageFolder, filename))
    }
  }

  return { saveCatalog, recoverWardrobeManifest }
}
