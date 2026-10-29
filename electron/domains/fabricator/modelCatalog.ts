/** Leitura do catálogo canônico do Fabricador DEV, sem gravações nem Electron.
 * Customizador/Studio continuam consumindo este formato via os canais IPC legados.
 */
import { extname, join } from 'node:path'
import { inspectFabricatorStorage } from '../../../src/shared/fabricatorStorageCompatibility.ts'
import { areModelPartSkinContoursValid, isValidModelSkinContours } from '../../../src/shared/modelSkinContours.ts'
import { isValidSkinTone } from '../../../src/shared/skinTones.ts'
import { VersionedAssetResolver } from './versionedAssetResolver.ts'
import type { FabricatorProject, FabricatorSlotSummary, ModelPart } from '../../../src/shared/fabricator'

export interface FabricatorModelFiles {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readFile(path: string): Promise<Uint8Array>
  readAssetImage(path: string): Promise<Uint8Array>
}

type ModelManifest = Omit<FabricatorProject, 'sourceDataUrl' | 'parts'> & {
  sourceFile: string
  parts: Array<Omit<ModelPart, 'dataUrl' | 'chromaBaseDataUrl'>>
}

export class FabricatorModelCatalog {
  private readonly slotCount: number
  private readonly slotPath: (slot: number) => string
  private readonly files: FabricatorModelFiles
  private readonly resolver: VersionedAssetResolver

  constructor(slotCount: number, slotPath: (slot: number) => string, files: FabricatorModelFiles, resolver = new VersionedAssetResolver()) {
    this.slotCount = slotCount
    this.slotPath = slotPath
    this.files = files
    this.resolver = resolver
  }

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 1 || slot > this.slotCount) throw new Error('Slot inválido.')
  }

  async listSlots(): Promise<FabricatorSlotSummary[]> {
    const slots: FabricatorSlotSummary[] = Array.from({ length: this.slotCount }, () => null)
    for (let slot = 1; slot <= this.slotCount; slot += 1) {
      try {
        const manifest = JSON.parse(await this.files.readFile(join(this.slotPath(slot), 'project.json'), 'utf8')) as ModelManifest
        if (!inspectFabricatorStorage('model', manifest).compatible) continue
        slots[slot - 1] = {
          slot,
          name: manifest.name,
          sourceName: manifest.sourceName,
          partCount: manifest.parts.length,
          updatedAt: manifest.updatedAt
        }
      } catch { /* Slots sem manifesto válido continuam vazios, como no G-V5. */ }
    }
    return slots
  }

  async loadSlot(slot: number): Promise<FabricatorProject | null> {
    this.assertSlot(slot)
    try {
      const folder = this.slotPath(slot)
      const manifest = JSON.parse(await this.files.readFile(join(folder, 'project.json'), 'utf8')) as ModelManifest
      if (!inspectFabricatorStorage('model', manifest).compatible
        || !/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(manifest.sourceFile)
        || manifest.parts.length > 500
        || manifest.parts.some((part) => !/^[a-zA-Z0-9_-]{1,80}$/.test(part.id))) return null
      const version = manifest.sourceFile + ':' + manifest.updatedAt
      const sourceBytes = await this.resolver.resolveBuffer('model', slot + ':source', version,
        () => this.files.readFile(join(folder, manifest.sourceFile)))
      const extension = extname(manifest.sourceFile).toLowerCase()
      const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
      const sourceDataUrl = `data:${mime};base64,${sourceBytes.toString('base64')}`
      const contoursValid = areModelPartSkinContoursValid(manifest.parts)
      const parts = await Promise.all(manifest.parts.map(async (part) => {
        const fakeSkinContours = contoursValid && isValidModelSkinContours(part.fakeSkinContours) ? part.fakeSkinContours : undefined
        return {
          ...part,
          fakeSkinContours,
          dataUrl: `data:image/png;base64,${(await this.resolver.resolveBuffer('model', slot + ':part:' + part.id, version,
            () => this.files.readAssetImage(join(folder, 'parts', `${part.id}.png`)))).toString('base64')}`,
          ...(part.chromaBaseSaved ? {
            chromaBaseDataUrl: `data:image/png;base64,${(await this.resolver.resolveBuffer('model', slot + ':chroma:' + part.id, version,
              () => this.files.readFile(join(folder, 'parts', `${part.id}.base.png`)))).toString('base64')}`
          } : {})
        }
      }))
      return {
        ...manifest,
        modelSkinTone: isValidSkinTone(manifest.modelSkinTone) ? manifest.modelSkinTone : undefined,
        modelOutlineColor: isValidSkinTone(manifest.modelOutlineColor) ? manifest.modelOutlineColor : undefined,
        sourceDataUrl,
        parts
      }
    } catch { return null }
  }
}
