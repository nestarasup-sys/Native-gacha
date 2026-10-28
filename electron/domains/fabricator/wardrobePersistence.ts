import type { readFile as nativeReadFile, rm as nativeRm } from 'node:fs/promises'
import { join } from 'node:path'
import type { WardrobeAssetSave, WardrobeCategory, WardrobeSet, WardrobeSetSave } from '../../../src/shared/fabricator'

const wardrobeCategories = [
  'camisa', 'jaqueta', 'manga-superior', 'manga-inferior', 'luvas', 'capa', 'cinto',
  'oculos', 'acessorio-cabeca', 'saia', 'calca-coxa', 'calca-canela', 'shorts', 'meia', 'sapato'
] as const satisfies readonly WardrobeCategory[]

type WardrobeCatalogSaveOptions = {
  folder: string
  imageFolder: string
  manifestName: 'wardrobe.json'
  manifest: WardrobeSetSave
  images: Array<{ id: string; bytes: Buffer }>
  expected: ReadonlySet<string>
  prune: 'all'
  missingMessage: (id: string) => string
}

type WardrobePersistenceDependencies = {
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  wardrobeSetPath: (modelSlot: number, id: string) => string
  deformationOriginalId: (componentId: string) => string
  dataUrlBuffer: (dataUrl: string) => Buffer
  saveCatalog: (options: WardrobeCatalogSaveOptions) => Promise<void>
  recoverWardrobeManifest: (folder: string) => Promise<void>
  isCompatible: (value: unknown) => boolean
  readCatalogPng: (identity: string, version: string, path: string) => Promise<Buffer>
  invalidateCatalogPng: (identity: string) => void
  files: {
    readFile: typeof nativeReadFile
    rm: typeof nativeRm
  }
}

export type FabricatorWardrobePersistence = ReturnType<typeof createFabricatorWardrobePersistence>

export function createFabricatorWardrobePersistence(deps: WardrobePersistenceDependencies) {
  let saveQueue: Promise<void> = Promise.resolve()
  const enqueueSave = (operation: () => Promise<void>): Promise<void> => {
    const next = saveQueue.catch(() => undefined).then(operation)
    saveQueue = next
    return next
  }

  async function writeSet(modelSlot: number, set: WardrobeSetSave, assets: WardrobeAssetSave[]): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:${set.id}`)
    if (!deps.isValidModelSlot(modelSlot) || set.schemaVersion !== 1 || (set.edition !== undefined && set.edition !== 1 && set.edition !== 2) || set.modelSlot !== modelSlot || !deps.isValidWardrobeId(set.id) || !Array.isArray(set.components) || set.components.length < 1 || set.components.length > 100) throw new Error('Conjunto de roupa inválido.')
    const ids = new Set(set.components.map(component => component.id))
    if (ids.size !== set.components.length || set.components.some(component => !deps.isValidWardrobeId(component.id) || !wardrobeCategories.includes(component.category)
      || !deps.isValidWardrobeId(component.attachedPartId)
      || component.hasDeformationOriginal !== undefined && component.hasDeformationOriginal !== true
      || component.isDeformed !== undefined && typeof component.isDeformed !== 'boolean'
      || component.isDeformed === true && component.hasDeformationOriginal !== true
      || component.deformationOriginalFrame !== undefined && ![
        component.deformationOriginalFrame.x, component.deformationOriginalFrame.y,
        component.deformationOriginalFrame.width, component.deformationOriginalFrame.height,
        component.deformationOriginalFrame.originX ?? 0, component.deformationOriginalFrame.originY ?? 0,
        component.deformationOriginalFrame.originWidth ?? 0, component.deformationOriginalFrame.originHeight ?? 0
      ].every(Number.isFinite)
      || component.deformationOriginalFrame !== undefined && (component.deformationOriginalFrame.width <= 0 || component.deformationOriginalFrame.height <= 0))) throw new Error('Peças do conjunto inválidas.')
    const backupIds = set.components.filter(component => component.hasDeformationOriginal === true).map(component => deps.deformationOriginalId(component.id))
    const expected = new Set([...ids, ...backupIds])
    if (expected.size !== ids.size + backupIds.length || Array.from(expected).some(id => !deps.isValidWardrobeId(id))) throw new Error('Cópias originais das roupas inválidas.')
    const folder = deps.wardrobeSetPath(modelSlot, set.id)
    await deps.saveCatalog({
      folder, imageFolder: join(folder, 'parts'), manifestName: 'wardrobe.json', manifest: set,
      // O contrato legado ignora assets extras não presentes no conjunto.
      images: assets.filter(asset => expected.has(asset.id)).map(asset => ({ id: asset.id, bytes: deps.dataUrlBuffer(asset.dataUrl) })),
      expected, prune: 'all',
      missingMessage: id => {
        const component = set.components.find(part => part.id === id)
        const original = set.components.find(part => deps.deformationOriginalId(part.id) === id)
        return original
          ? `Cópia original ausente para restaurar a deformação de: ${original.name ?? original.id}.`
          : `Imagem ausente no conjunto: ${component?.name ?? id} (${id}).`
      }
    })
  }

  async function read(modelSlot: number, id: string): Promise<WardrobeSet | null> {
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Conjunto de roupa inválido.')
    await saveQueue.catch(() => undefined)
    try {
      const folder = deps.wardrobeSetPath(modelSlot, id)
      await deps.recoverWardrobeManifest(folder)
      const set = JSON.parse(await deps.files.readFile(join(folder, 'wardrobe.json'), 'utf8')) as WardrobeSetSave
      if (!deps.isCompatible(set)) return null
      if (set.schemaVersion !== 1 || (set.edition !== undefined && set.edition !== 1 && set.edition !== 2) || set.modelSlot !== modelSlot || set.id !== id || !Array.isArray(set.components) || set.components.length > 100) return null
      const version = `${set.updatedAt}:${set.edition ?? 1}`
      const identity = `${modelSlot}:${id}`
      const components = await Promise.all(set.components.map(async (component) => {
        const dataUrl = `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'parts', `${component.id}.png`))).toString('base64')}`
        const deformationOriginalDataUrl = component.hasDeformationOriginal === true
          ? `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'parts', `${deps.deformationOriginalId(component.id)}.png`))).toString('base64')}`
          : undefined
        return {
          ...component,
          category: (component.category as string) === 'cinto-saia-1' ? 'cinto' as const : (component.category as string) === 'cinto-saia-2' ? 'saia' as const : component.category,
          renderAboveHair: (component.category === 'oculos' || component.category === 'acessorio-cabeca') && component.renderAboveHair === true,
          dataUrl,
          deformationOriginalDataUrl
        }
      }))
      return { ...set, components }
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw reason
    }
  }

  async function remove(target: string): Promise<void> {
    await enqueueSave(() => deps.files.rm(target, { recursive: true, force: true }))
  }

  return {
    read,
    save: (modelSlot: number, set: WardrobeSetSave, assets: WardrobeAssetSave[]) => enqueueSave(() => writeSet(modelSlot, set, assets)),
    remove,
    getPendingWrites: () => saveQueue
  }
}
