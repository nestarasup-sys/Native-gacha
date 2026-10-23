/** Leitura isolada da biblioteca de roupas do Fabricador DEV.
 * Apenas consulta os manifestos; nunca grava assets ou altera personagens.
 */
import { join } from 'node:path'
import type { WardrobeCatalogListing, WardrobeSet, WardrobeSetSummary } from '../../../src/shared/fabricator'

export interface WardrobeCatalogFiles {
  readdir(folder: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>
  readFile(path: string, encoding: 'utf8'): Promise<string>
}

export class FabricatorWardrobeCatalog {
  private readonly modelPath: (modelSlot: number) => string
  private readonly files: WardrobeCatalogFiles
  private readonly modelSlotCount: number
  private readonly recoverCatalogManifest?: (folder: string, imageFolder: string) => Promise<void>

  constructor(
    modelPath: (modelSlot: number) => string,
    files: WardrobeCatalogFiles,
    modelSlotCount: number,
    recoverCatalogManifest?: (folder: string, imageFolder: string) => Promise<void>
  ) {
    this.modelPath = modelPath
    this.files = files
    this.modelSlotCount = modelSlotCount
    this.recoverCatalogManifest = recoverCatalogManifest
  }

  async list(modelSlot: number): Promise<WardrobeSetSummary[]> {
    return (await this.listDetailed(modelSlot)).sets
  }

  async listDetailed(modelSlot: number): Promise<WardrobeCatalogListing> {
    if (!Number.isInteger(modelSlot) || modelSlot < 1 || modelSlot > this.modelSlotCount) throw new Error('Modelo inválido.')
    const folder = this.modelPath(modelSlot)
    try {
      const entries = await this.files.readdir(folder, { withFileTypes: true })
      const sets: WardrobeSetSummary[] = []
      const issues: WardrobeCatalogListing['issues'] = []
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^set-[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) continue
        const setFolder = join(folder, entry.name)
        try {
          await this.recoverCatalogManifest?.(setFolder, join(setFolder, 'parts'))
        } catch (reason) {
          // A damaged journal is NEVER cleaned or ignored. Other sets remain
          // available; the affected set is quarantined from the listing only.
          issues.push({ id: entry.name.slice(4), reason: reason instanceof Error ? reason.message : 'Recuperação bloqueada.' })
          continue
        }
        try {
          const set = JSON.parse(await this.files.readFile(join(setFolder, 'wardrobe.json'), 'utf8')) as WardrobeSet
          if (set.schemaVersion === 1 && (set.edition === undefined || set.edition === 1 || set.edition === 2)
            && set.modelSlot === modelSlot && set.id === entry.name.slice(4) && Array.isArray(set.components)) {
            sets.push({ id: set.id, modelSlot, modelName: set.modelName, name: set.name,
              updatedAt: set.updatedAt, edition: set.edition ?? 1, componentCount: set.components.length })
          } else {
            issues.push({ id: entry.name.slice(4), reason: 'Manifesto incompatível ou inválido; nenhum arquivo foi alterado.' })
          }
        } catch (reason) {
          issues.push({ id: entry.name.slice(4), reason:
            (reason as NodeJS.ErrnoException)?.code === 'ENOENT'
              ? 'Manifesto ausente; conjunto preservado no disco.'
              : 'Manifesto ilegível; conjunto preservado para revisão.' })
        }
      }
      return { sets: sets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), issues }
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return { sets: [], issues: [] }
      throw reason
    }
  }
}
