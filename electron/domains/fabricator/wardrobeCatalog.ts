/** Leitura isolada da biblioteca de roupas do Fabricador DEV.
 * Apenas consulta os manifestos; nunca grava assets ou altera personagens.
 */
import { join } from 'node:path'
import type { WardrobeSet, WardrobeSetSummary } from '../../../src/shared/fabricator'

export interface WardrobeCatalogFiles {
  readdir(folder: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>
  readFile(path: string, encoding: 'utf8'): Promise<string>
}

export class FabricatorWardrobeCatalog {
  private readonly modelPath: (modelSlot: number) => string
  private readonly files: WardrobeCatalogFiles
  private readonly modelSlotCount: number

  constructor(modelPath: (modelSlot: number) => string, files: WardrobeCatalogFiles, modelSlotCount: number) {
    this.modelPath = modelPath
    this.files = files
    this.modelSlotCount = modelSlotCount
  }

  async list(modelSlot: number): Promise<WardrobeSetSummary[]> {
    if (!Number.isInteger(modelSlot) || modelSlot < 1 || modelSlot > this.modelSlotCount) throw new Error('Modelo inválido.')
    const folder = this.modelPath(modelSlot)
    try {
      const entries = await this.files.readdir(folder, { withFileTypes: true })
      const sets: WardrobeSetSummary[] = []
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^set-[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) continue
        try {
          const set = JSON.parse(await this.files.readFile(join(folder, entry.name, 'wardrobe.json'), 'utf8')) as WardrobeSet
          if (set.schemaVersion === 1 && (set.edition === undefined || set.edition === 1 || set.edition === 2)
            && set.modelSlot === modelSlot && set.id === entry.name.slice(4) && Array.isArray(set.components)) {
            sets.push({ id: set.id, modelSlot, modelName: set.modelName, name: set.name,
              updatedAt: set.updatedAt, edition: set.edition ?? 1, componentCount: set.components.length })
          }
        } catch { /* Manifests inválidos nunca aparecem no catálogo. */ }
      }
      return sets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw reason
    }
  }
}
