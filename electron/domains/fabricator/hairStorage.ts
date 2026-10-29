/** Persistência dos rascunhos e conjuntos de cabelo do Fabricador. */
import type {
  access as nativeAccess, mkdir as nativeMkdir, readFile as nativeReadFile,
  rm as nativeRm, writeFile as nativeWriteFile
} from 'node:fs/promises'
import { join } from 'node:path'
import type {
  HairStyle, HairStyleAsset, HairStyleSave, HairWorkspace, HairWorkspaceAsset, HairWorkspaceSave
} from '../../../src/shared/fabricator'
import { hairCategories } from '../../../src/shared/hairCategories.ts'

type CatalogSaveOptions = {
  folder: string
  imageFolder: string
  manifestName: 'hair.json' | 'hair-style.json'
  manifest: unknown
  images: Array<{ id: string; bytes: Buffer }>
  expected: ReadonlySet<string>
  prune?: readonly string[]
  missingMessage?: (id: string) => string
}

type Dependencies = {
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  paths: {
    hairModel: (modelSlot: number) => string
    hairStyle: (modelSlot: number, id: string) => string
  }
  dataUrlBuffer: (dataUrl: string) => Buffer
  saveCatalog: (options: CatalogSaveOptions) => Promise<void>
  recoverCatalogManifest: (folder: string, imageFolder: string) => Promise<void>
  isCompatible: (kind: 'hair' | 'hair-style', value: unknown) => boolean
  readCatalogPng: (identity: string, version: string, path: string) => Promise<Buffer>
  invalidateCatalogPng: (identity: string) => void
  legacyHairStyle: (modelSlot: number, workspace: HairWorkspace | null) => HairStyle | null
  files: {
    access: typeof nativeAccess
    mkdir: typeof nativeMkdir
    readFile: typeof nativeReadFile
    rm: typeof nativeRm
    writeFile: typeof nativeWriteFile
  }
}

const isMissing = (reason: unknown): boolean => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export function createFabricatorHairStorage(deps: Dependencies) {
  const { access, mkdir, readFile, rm, writeFile } = deps.files

  function validHairWorkspace(modelSlot: number, workspace: HairWorkspaceSave): boolean {
    if (!deps.isValidModelSlot(modelSlot) || workspace?.schemaVersion !== 1 || workspace.modelSlot !== modelSlot || !workspace.transforms) return false
    for (const side of ['front', 'back', 'fringe'] as const) {
      const category = workspace.categoryBySide?.[side]
      if (category !== undefined && !hairCategories.some((item) => item.id === category && item.side === side)) return false
    }
    for (const side of ['front', 'back', 'fringe'] as const) {
      const asset = workspace[side]
      const transform = workspace.transforms[side]
      if (side === 'fringe' && !asset && !transform) continue
      if (asset && (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 32_000_000)) return false
      if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
        || Math.abs(transform.x) > 100_000 || Math.abs(transform.y) > 100_000 || transform.scaleX <= 0 || transform.scaleY <= 0 || transform.scaleX > 20 || transform.scaleY > 20
        || (transform.flipX !== undefined && typeof transform.flipX !== 'boolean')) return false
    }
    if (workspace.chromaTolerance !== undefined && (!Number.isFinite(workspace.chromaTolerance) || workspace.chromaTolerance < 0 || workspace.chromaTolerance > 100)) return false
    if (workspace.chromaMode !== undefined && !['auto', 'green', 'checker'].includes(workspace.chromaMode)) return false
    if (workspace.sourceImageSaved !== undefined && typeof workspace.sourceImageSaved !== 'boolean') return false
    if (workspace.sourceAppliesToDraft !== undefined && typeof workspace.sourceAppliesToDraft !== 'boolean') return false
    return typeof workspace.updatedAt === 'string'
  }

  async function writeHairWorkspace(modelSlot: number, workspace: HairWorkspaceSave, assets: HairWorkspaceAsset[]): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:workspace`)
    if (!validHairWorkspace(modelSlot, workspace)) throw new Error('Configuração de cabelo inválida.')
    const expected = new Set<string>((['front', 'back', 'fringe'] as const).filter(side => workspace[side] != null))
    if (workspace.sourceImageSaved) expected.add('source')
    if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens de cabelo inválidas.')
    const folder = deps.paths.hairModel(modelSlot)
    await deps.saveCatalog({
      folder, imageFolder: join(folder, 'images'), manifestName: 'hair.json', manifest: workspace,
      images: assets.map(asset => ({ id: asset.id, bytes: deps.dataUrlBuffer(asset.dataUrl) })),
      expected, prune: ['front', 'back', 'fringe', 'source'],
      missingMessage: id => `Imagem de cabelo ausente: ${id}.`
    })
  }

  async function readHairWorkspace(modelSlot: number): Promise<HairWorkspace | null> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    try {
      const folder = deps.paths.hairModel(modelSlot)
      await deps.recoverCatalogManifest(folder, join(folder, 'images'))
      const saved = JSON.parse(await readFile(join(folder, 'hair.json'), 'utf8')) as HairWorkspaceSave
      if (!deps.isCompatible('hair', saved)) return null
      if (!validHairWorkspace(modelSlot, saved)) return null
      const identity = `${modelSlot}:workspace`
      const version = saved.updatedAt
      const loadPart = async (side: 'front' | 'back' | 'fringe') => saved[side]
        ? { ...saved[side]!, dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `${side}.png`))).toString('base64')}` }
        : null
      let sourceImageDataUrl: string | undefined
      if (saved.sourceImageSaved) {
        try { sourceImageDataUrl = `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', 'source.png'))).toString('base64')}` }
        catch (reason) { if (!isMissing(reason)) throw reason }
      }
      return { ...saved, front: await loadPart('front'), back: await loadPart('back'), fringe: await loadPart('fringe'), ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}) }
    } catch (reason) {
      if (isMissing(reason)) return null
      throw reason
    }
  }

  async function clearHairWorkspace(modelSlot: number): Promise<void> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    const folder = deps.paths.hairModel(modelSlot)
    const images = join(folder, 'images')
    // Resolve an interrupted publication before removing its journal and assets.
    await deps.recoverCatalogManifest(folder, images)
    await rm(join(folder, 'hair.json'), { force: true })
    await rm(join(folder, 'hair.json.tmp'), { force: true })
    await rm(join(folder, 'hair.json.backup'), { force: true })
    await rm(images, { recursive: true, force: true })
  }

  type LegacyHairCatalogState = 'active' | 'dismissed' | null
  const legacyHairCatalogStatePath = (modelSlot: number) => join(deps.paths.hairModel(modelSlot), 'hair-legacy-catalog-state-v1')

  async function readLegacyHairCatalogState(modelSlot: number): Promise<LegacyHairCatalogState> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    try {
      const state = (await readFile(legacyHairCatalogStatePath(modelSlot), 'utf8')).trim()
      if (state === 'active' || state === 'dismissed') return state
      throw new Error('Estado de catálogo legado de cabelo inválido.')
    } catch (reason) {
      if (isMissing(reason)) return null
      throw reason
    }
  }

  async function writeLegacyHairCatalogState(modelSlot: number, state: Exclude<LegacyHairCatalogState, null>): Promise<void> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    const folder = deps.paths.hairModel(modelSlot)
    await mkdir(folder, { recursive: true })
    const previous = await readLegacyHairCatalogState(modelSlot)
    const next = state === 'active' && previous === 'dismissed' ? 'dismissed' : state
    await writeFile(legacyHairCatalogStatePath(modelSlot), next, 'utf8')
  }

  function validHairStyle(modelSlot: number, style: HairStyleSave): boolean {
    if (!deps.isValidModelSlot(modelSlot) || style?.schemaVersion !== 1 || style.modelSlot !== modelSlot || !deps.isValidWardrobeId(style.id)
      || typeof style.name !== 'string' || !style.name.trim() || style.name.length > 80 || !style.transforms) return false
    if (!style.front && !style.back && !style.fringe) return false
    if (style.category !== undefined) {
      const category = hairCategories.find((item) => item.id === style.category)
      if (!category || !style[category.side]) return false
    }
    if (style.categoryBySide !== undefined && (!style.categoryBySide || Array.isArray(style.categoryBySide) || typeof style.categoryBySide !== 'object')) return false
    if (style.categoryBySide !== undefined) {
      for (const side of ['front', 'back', 'fringe'] as const) {
        const categoryId = style.categoryBySide[side]
        if (categoryId !== undefined && !hairCategories.some((item) => item.id === categoryId && item.side === side)) return false
        if (categoryId !== undefined && !style[side]) return false
      }
    }
    if (style.sourceImageSaved !== undefined && typeof style.sourceImageSaved !== 'boolean') return false
    if (style.sourceAppliesToDraft !== undefined && typeof style.sourceAppliesToDraft !== 'boolean') return false
    if (style.sourceAppliesToDraft === true && style.sourceImageSaved !== true) return false
    if (style.chromaTolerance !== undefined && (!Number.isFinite(style.chromaTolerance) || style.chromaTolerance < 0 || style.chromaTolerance > 100)) return false
    if (style.chromaMode !== undefined && !['auto', 'green', 'checker'].includes(style.chromaMode)) return false
    for (const side of ['front', 'back', 'fringe'] as const) {
      const asset = style[side]
      const transform = style.transforms[side]
      if (side === 'fringe' && !asset && !transform) continue
      if (asset && (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 32_000_000)) return false
      if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
        || Math.abs(transform.x) > 100_000 || Math.abs(transform.y) > 100_000 || transform.scaleX <= 0 || transform.scaleY <= 0 || transform.scaleX > 20 || transform.scaleY > 20
        || (transform.flipX !== undefined && typeof transform.flipX !== 'boolean')) return false
    }
    return typeof style.createdAt === 'string' && typeof style.updatedAt === 'string'
  }

  async function writeHairStyle(modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:style:${style.id}`)
    if (!validHairStyle(modelSlot, style)) throw new Error('Estilo de cabelo inválido.')
    const expected = new Set<string>((['front', 'back', 'fringe'] as const).filter(side => style[side] != null))
    if (style.sourceImageSaved) expected.add('source')
    if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens do cabelo inválidas.')
    const folder = deps.paths.hairStyle(modelSlot, style.id)
    await deps.saveCatalog({
      folder, imageFolder: join(folder, 'images'), manifestName: 'hair-style.json', manifest: style,
      images: assets.map(asset => ({ id: asset.id, bytes: deps.dataUrlBuffer(asset.dataUrl) })),
      expected, prune: ['front', 'back', 'fringe', 'source'],
      missingMessage: id => `Imagem de cabelo ausente: ${id}.`
    })
  }

  async function readHairStyle(modelSlot: number, id: string, includeSource = false): Promise<HairStyle | null> {
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Estilo de cabelo inválido.')
    try {
      const folder = deps.paths.hairStyle(modelSlot, id)
      await deps.recoverCatalogManifest(folder, join(folder, 'images'))
      const saved = JSON.parse(await readFile(join(folder, 'hair-style.json'), 'utf8')) as HairStyleSave
      if (!deps.isCompatible('hair-style', saved)) return null
      if (!validHairStyle(modelSlot, saved) || saved.id !== id) return null
      const identity = `${modelSlot}:style:${id}`
      const version = saved.updatedAt
      const loadPart = async (side: 'front' | 'back' | 'fringe') => saved[side]
        ? { ...saved[side]!, dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `${side}.png`))).toString('base64')}` }
        : null
      const sourceImageDataUrl = includeSource && saved.sourceImageSaved
        ? `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', 'source.png'))).toString('base64')}`
        : undefined
      return { ...saved, front: await loadPart('front'), back: await loadPart('back'), fringe: await loadPart('fringe'), ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}) }
    } catch (reason) {
      if (!isMissing(reason)) throw reason
      if (id === 'legacy-workspace') {
        if (await readLegacyHairCatalogState(modelSlot) === 'dismissed') return null
        try { await access(join(deps.paths.hairModel(modelSlot), 'hair-style-migration-v1')); return null }
        catch (markerError) { if (!isMissing(markerError)) throw markerError }
        return deps.legacyHairStyle(modelSlot, await readHairWorkspace(modelSlot))
      }
      return null
    }
  }

  return {
    validHairWorkspace, writeHairWorkspace, readHairWorkspace, clearHairWorkspace,
    readLegacyHairCatalogState, writeLegacyHairCatalogState,
    validHairStyle, writeHairStyle, readHairStyle
  }
}
