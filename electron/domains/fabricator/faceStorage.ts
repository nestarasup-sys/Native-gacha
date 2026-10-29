/** Persistência e validação dos conjuntos, catálogo e assets faciais do Fabricador. */
import type { readFile as nativeReadFile, readdir as nativeReaddir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  FaceAssetKind, FaceAssetSave, FaceCatalogItem, FaceCatalogItemSave, FaceCatalogItemSummary,
  FaceComponentAsset, FaceComponentAssetSave, FaceComponentAssetSummary, FaceElementKind,
  FaceSet, FaceSetSave, FaceSheetKind
} from '../../../src/shared/fabricator'

type CatalogSaveOptions = {
  folder: string
  imageFolder: string
  manifestName: 'face.json' | 'item.json' | 'asset.json'
  manifest: unknown
  images: Array<{ id: string; bytes: Buffer }>
  expected: ReadonlySet<string>
  prune?: 'all'
}

type Dependencies = {
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  isValidFaceCatalogId: (id: string) => boolean
  paths: {
    faceModel: (modelSlot: number) => string
    faceSet: (modelSlot: number, id: string) => string
    faceCatalog: (modelSlot: number) => string
    faceCatalogItem: (modelSlot: number, id: string) => string
    faceComponent: (modelSlot: number) => string
    faceComponentItem: (modelSlot: number, id: string) => string
  }
  dataUrlBuffer: (dataUrl: string) => Buffer
  saveCatalog: (options: CatalogSaveOptions) => Promise<void>
  recoverCatalogManifest: (folder: string, imageFolder: string) => Promise<void>
  isCompatible: (kind: 'face' | 'face-catalog' | 'face-component', value: unknown) => boolean
  readCatalogPng: (identity: string, version: string, path: string) => Promise<Buffer>
  invalidateCatalogPng: (identity: string) => void
  files: {
    readFile: typeof nativeReadFile
    readdir: typeof nativeReaddir
  }
}

const faceSheetKinds: readonly FaceSheetKind[] = ['eyes', 'eyebrows', 'nose', 'mouth-closed', 'mouth-open']
const faceElementKinds: readonly FaceElementKind[] = ['eye-left', 'eye-right', 'brow-left', 'brow-right', 'nose', 'mouth']
const isMissing = (reason: unknown): boolean => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export function createFabricatorFaceStorage(deps: Dependencies) {
  const { readFile, readdir } = deps.files

  function validFaceSet(modelSlot: number, set: FaceSetSave): boolean {
    if (!deps.isValidModelSlot(modelSlot) || set?.schemaVersion !== 1 || set.modelSlot !== modelSlot || !deps.isValidWardrobeId(set.id)
      || typeof set.name !== 'string' || !set.name.trim() || set.name.length > 80
      || !Array.isArray(set.pieces) || set.pieces.length > 60 || !set.sheets || typeof set.sheets !== 'object'
      || !set.transforms || typeof set.transforms !== 'object') return false
    const ids = new Set<string>()
    for (const piece of set.pieces) {
      if (!deps.isValidWardrobeId(piece.id) || ids.has(piece.id) || !faceSheetKinds.includes(piece.sheet)
        || !Number.isInteger(piece.index) || piece.index < 0 || piece.index > 20
        || (piece.side !== undefined && piece.side !== 'left' && piece.side !== 'right')
        || !piece.crop || ![piece.crop.x, piece.crop.y, piece.crop.width, piece.crop.height, piece.width, piece.height].every(Number.isFinite)
        || piece.crop.width <= 0 || piece.crop.height <= 0 || piece.width <= 0 || piece.height <= 0) return false
      ids.add(piece.id)
    }
    for (const [kind, sheet] of Object.entries(set.sheets)) {
      if (!faceSheetKinds.includes(kind as FaceSheetKind) || !sheet || !Number.isFinite(sheet.width)
        || !Number.isFinite(sheet.height) || sheet.width <= 0 || sheet.height <= 0 || sheet.width * sheet.height > 32_000_000
        || !Number.isFinite(sheet.tolerance) || sheet.tolerance < 0 || sheet.tolerance > 280) return false
    }
    for (const kind of faceElementKinds) {
      const transform = set.transforms[kind]
      if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
        || transform.scaleX <= 0 || transform.scaleY <= 0) return false
    }
    return Number.isInteger(set.selectedNose) && set.selectedNose >= 0 && set.selectedNose <= 5
      && Number.isInteger(set.selectedExpression) && set.selectedExpression >= 0 && set.selectedExpression <= 20
      && typeof set.eyeLinked === 'boolean' && typeof set.browLinked === 'boolean'
  }

  async function writeFaceSet(modelSlot: number, set: FaceSetSave, assets: FaceAssetSave[]): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:set:${set.id}`)
    if (!validFaceSet(modelSlot, set)) throw new Error('Rosto inválido.')
    const expected = new Set([...set.pieces.map(piece => piece.id), ...Object.keys(set.sheets).map(kind => `sheet-${kind}`)])
    if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens do rosto inválidas.')
    const folder = deps.paths.faceSet(modelSlot, set.id)
    await deps.saveCatalog({
      folder, imageFolder: join(folder, 'images'), manifestName: 'face.json', manifest: set,
      images: assets.map(asset => ({ id: asset.id, bytes: deps.dataUrlBuffer(asset.dataUrl) })),
      expected, prune: 'all'
    })
  }

  async function readFaceSet(modelSlot: number, id: string): Promise<FaceSet | null> {
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Rosto inválido.')
    try {
      const folder = deps.paths.faceSet(modelSlot, id)
      await deps.recoverCatalogManifest(folder, join(folder, 'images'))
      const set = JSON.parse(await readFile(join(folder, 'face.json'), 'utf8')) as FaceSetSave
      if (!deps.isCompatible('face', set)) return null
      if (!validFaceSet(modelSlot, set) || set.id !== id) return null
      const version = set.updatedAt
      const identity = `${modelSlot}:set:${id}`
      const sheets = { ...set.sheets } as FaceSet['sheets']
      for (const kind of faceSheetKinds) if (sheets[kind]) sheets[kind] = { ...sheets[kind], dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `sheet-${kind}.png`))).toString('base64')}` }
      const pieces = await Promise.all(set.pieces.map(async (piece) => ({ ...piece, dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `${piece.id}.png`))).toString('base64')}` })))
      return { ...set, sheets, pieces }
    } catch (reason) {
      if (isMissing(reason)) return null
      throw reason
    }
  }

  function validFaceCatalogItem(modelSlot: number, item: FaceCatalogItemSave): boolean {
    const requiredElements: Record<FaceSheetKind, FaceElementKind[]> = {
      eyes: ['eye-left', 'eye-right'], eyebrows: ['brow-left', 'brow-right'], nose: ['nose'],
      'mouth-closed': ['mouth'], 'mouth-open': ['mouth']
    }
    if (!deps.isValidModelSlot(modelSlot) || item?.schemaVersion !== 1 || item.modelSlot !== modelSlot || !deps.isValidFaceCatalogId(item.id)
      || !faceSheetKinds.includes(item.category) || item.sheet?.kind !== item.category
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120
      || !Array.isArray(item.pieces) || item.pieces.length > 60 || !item.transforms || typeof item.transforms !== 'object'
      || !Number.isFinite(item.sheet.width) || !Number.isFinite(item.sheet.height) || item.sheet.width <= 0 || item.sheet.height <= 0
      || item.sheet.width * item.sheet.height > 32_000_000 || !Number.isFinite(item.sheet.tolerance) || item.sheet.tolerance < 0 || item.sheet.tolerance > 280) return false
    const ids = new Set<string>()
    for (const piece of item.pieces) {
      if (!deps.isValidWardrobeId(piece.id) || ids.has(piece.id) || piece.sheet !== item.category
        || !Number.isInteger(piece.index) || piece.index < 0 || piece.index > 20
        || (piece.side !== undefined && piece.side !== 'left' && piece.side !== 'right')
        || !piece.crop || ![piece.crop.x, piece.crop.y, piece.crop.width, piece.crop.height, piece.width, piece.height].every(Number.isFinite)
        || piece.crop.width <= 0 || piece.crop.height <= 0 || piece.width <= 0 || piece.height <= 0) return false
      ids.add(piece.id)
    }
    for (const element of requiredElements[item.category]) {
      const transform = item.transforms[element]
      if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
        || transform.scaleX <= 0 || transform.scaleY <= 0) return false
    }
    return typeof item.eyeLinked === 'boolean' && typeof item.browLinked === 'boolean'
      && (item.opacity === undefined || item.category === 'nose' && Number.isFinite(item.opacity) && item.opacity >= 0 && item.opacity <= 1)
      && Number.isInteger(item.selectedNose) && item.selectedNose >= 0 && item.selectedNose <= 5
      && Number.isInteger(item.selectedExpression) && item.selectedExpression >= 0 && item.selectedExpression <= 20
      && typeof item.updatedAt === 'string'
  }

  async function writeFaceCatalogItem(modelSlot: number, item: FaceCatalogItemSave, assets: FaceAssetSave[]): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:catalog:${item.id}`)
    if (!validFaceCatalogItem(modelSlot, item)) throw new Error('Peça facial inválida.')
    const expected = new Set([`sheet-${item.category}`, ...item.pieces.map(piece => piece.id)])
    if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens da peça facial inválidas.')
    const folder = deps.paths.faceCatalogItem(modelSlot, item.id)
    await deps.saveCatalog({
      folder, imageFolder: join(folder, 'images'), manifestName: 'item.json', manifest: item,
      images: assets.map(asset => ({ id: asset.id, bytes: deps.dataUrlBuffer(asset.dataUrl) })),
      expected, prune: 'all'
    })
  }

  function legacyFaceCatalogId(id: string): { setId: string; category: FaceSheetKind } | null {
    if (!id.startsWith('legacy_')) return null
    for (const category of faceSheetKinds) {
      const suffix = `_${category}`
      if (id.endsWith(suffix)) {
        const setId = id.slice('legacy_'.length, -suffix.length)
        if (deps.isValidWardrobeId(setId)) return { setId, category }
      }
    }
    return null
  }

  async function readFaceCatalogItem(modelSlot: number, id: string): Promise<FaceCatalogItem | null> {
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidFaceCatalogId(id)) throw new Error('Peça facial inválida.')
    try {
      const folder = deps.paths.faceCatalogItem(modelSlot, id)
      await deps.recoverCatalogManifest(folder, join(folder, 'images'))
      const item = JSON.parse(await readFile(join(folder, 'item.json'), 'utf8')) as FaceCatalogItemSave
      if (!deps.isCompatible('face-catalog', item)) return null
      if (!validFaceCatalogItem(modelSlot, item) || item.id !== id) return null
      const identity = `${modelSlot}:catalog:${id}`
      const version = item.updatedAt
      const sheet = { ...item.sheet, dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `sheet-${item.category}.png`))).toString('base64')}` }
      const pieces = await Promise.all(item.pieces.map(async (piece) => ({ ...piece, dataUrl: `data:image/png;base64,${(await deps.readCatalogPng(identity, version, join(folder, 'images', `${piece.id}.png`))).toString('base64')}` })))
      return { ...item, sheet, pieces }
    } catch (reason) {
      if (!isMissing(reason)) throw reason
      const legacy = legacyFaceCatalogId(id)
      if (!legacy) return null
      const set = await readFaceSet(modelSlot, legacy.setId)
      const sheet = set?.sheets[legacy.category]
      if (!set || !sheet) return null
      const elements: FaceElementKind[] = legacy.category === 'eyes' ? ['eye-left', 'eye-right'] : legacy.category === 'eyebrows' ? ['brow-left', 'brow-right'] : legacy.category === 'nose' ? ['nose'] : ['mouth']
      return {
        schemaVersion: 1, id, modelSlot, category: legacy.category, name: sheet.name.replace(/\.[^.]+$/, ''), sheet,
        pieces: set.pieces.filter((piece) => piece.sheet === legacy.category),
        transforms: Object.fromEntries(elements.map((element) => [element, set.transforms[element]])),
        eyeLinked: set.eyeLinked, browLinked: set.browLinked, selectedNose: set.selectedNose,
        selectedExpression: set.selectedExpression, updatedAt: set.updatedAt
      }
    }
  }

  async function listFaceCatalogItems(modelSlot: number): Promise<FaceCatalogItemSummary[]> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    const items = new Map<string, FaceCatalogItemSummary>()
    try {
      for (const entry of await readdir(deps.paths.faceCatalog(modelSlot), { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^item-[a-zA-Z0-9_-]{1,120}$/.test(entry.name)) continue
        const folder = join(deps.paths.faceCatalog(modelSlot), entry.name)
        await deps.recoverCatalogManifest(folder, join(folder, 'images'))
        try {
          const item = JSON.parse(await readFile(join(folder, 'item.json'), 'utf8')) as FaceCatalogItemSave
          if (validFaceCatalogItem(modelSlot, item) && item.id === entry.name.slice(5)) items.set(item.id, { id: item.id, modelSlot, category: item.category, name: item.name, updatedAt: item.updatedAt, pieceCount: item.pieces.length })
        } catch { /* Incomplete catalog items are hidden. */ }
      }
    } catch (reason) { if (!isMissing(reason)) throw reason }
    // Surface old complete face saves as category items until each category is saved individually.
    try {
      for (const entry of await readdir(deps.paths.faceModel(modelSlot), { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^set-[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) continue
        const setId = entry.name.slice(4)
        const folder = join(deps.paths.faceModel(modelSlot), entry.name)
        await deps.recoverCatalogManifest(folder, join(folder, 'images'))
        try {
          const set = JSON.parse(await readFile(join(folder, 'face.json'), 'utf8')) as FaceSetSave
          if (!validFaceSet(modelSlot, set) || set.id !== setId) continue
          for (const category of faceSheetKinds) {
            const sheet = set.sheets[category]
            if (!sheet) continue
            const id = `legacy_${setId}_${category}`
            if (items.has(id)) continue
            items.set(id, { id, modelSlot, category, name: sheet.name.replace(/\.[^.]+$/, ''), updatedAt: set.updatedAt, pieceCount: set.pieces.filter((piece) => piece.sheet === category).length })
          }
        } catch { /* Invalid legacy sets do not enter the new catalog. */ }
      }
    } catch (reason) { if (!isMissing(reason)) throw reason }
    return [...items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  function validFaceComponentAsset(modelSlot: number, asset: FaceComponentAssetSave): boolean {
    const transform = asset?.defaultTransform
    return deps.isValidModelSlot(modelSlot) && asset?.schemaVersion === 1 && asset.modelSlot === modelSlot
      && deps.isValidWardrobeId(asset.id) && ['eye', 'pupil', 'eye-closed', 'eyebrow', 'eye-highlight-left', 'eye-highlight-right', 'blush', 'facial-shadow', 'head-extra'].includes(asset.kind)
      && typeof asset.name === 'string' && asset.name.trim().length > 0 && asset.name.length <= 120
      && Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0 && asset.width * asset.height <= 32_000_000
      && (asset.rightSidePositioned === undefined || typeof asset.rightSidePositioned === 'boolean')
      && (asset.pairId === undefined || deps.isValidWardrobeId(asset.pairId))
      && Boolean(transform) && [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      && (transform.flipX === undefined || typeof transform.flipX === 'boolean')
      && transform.scaleX > 0 && transform.scaleY > 0 && transform.scaleX <= 20 && transform.scaleY <= 20
      && typeof asset.updatedAt === 'string'
  }

  async function listFaceComponentAssets(modelSlot: number, kind?: FaceAssetKind): Promise<FaceComponentAssetSummary[]> {
    if (!deps.isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
    const directory = deps.paths.faceComponent(modelSlot)
    const output: FaceComponentAssetSummary[] = []
    try {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^item-[a-zA-Z0-9_-]{1,120}$/.test(entry.name)) continue
        const folder = join(directory, entry.name)
        await deps.recoverCatalogManifest(folder, folder)
        try {
          const asset = JSON.parse(await readFile(join(folder, 'asset.json'), 'utf8')) as FaceComponentAssetSave
          if (!validFaceComponentAsset(modelSlot, asset) || asset.id !== entry.name.slice(5) || kind && asset.kind !== kind) continue
          const { defaultTransform: _transform, ...summary } = asset
          output.push(summary)
        } catch { /* Hide incomplete component assets. */ }
      }
    } catch (reason) { if (!isMissing(reason)) throw reason }
    return output.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async function readFaceComponentAsset(modelSlot: number, id: string): Promise<FaceComponentAsset | null> {
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Asset facial inválido.')
    try {
      const folder = deps.paths.faceComponentItem(modelSlot, id)
      await deps.recoverCatalogManifest(folder, folder)
      const asset = JSON.parse(await readFile(join(folder, 'asset.json'), 'utf8')) as FaceComponentAssetSave
      if (!deps.isCompatible('face-component', asset)) return null
      if (!validFaceComponentAsset(modelSlot, asset) || asset.id !== id) return null
      const dataUrl = `data:image/png;base64,${(await deps.readCatalogPng(`${modelSlot}:component:${id}`, asset.updatedAt, join(folder, 'asset.png'))).toString('base64')}`
      return { ...asset, dataUrl }
    } catch (reason) { if (isMissing(reason)) return null; throw reason }
  }

  async function writeFaceComponentAsset(modelSlot: number, asset: FaceComponentAssetSave, dataUrl: string): Promise<void> {
    deps.invalidateCatalogPng(`${modelSlot}:component:${asset.id}`)
    if (!validFaceComponentAsset(modelSlot, asset) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Asset facial inválido; use uma imagem PNG.')
    const folder = deps.paths.faceComponentItem(modelSlot, asset.id)
    await deps.saveCatalog({
      folder, imageFolder: folder, manifestName: 'asset.json', manifest: asset,
      images: [{ id: 'asset', bytes: deps.dataUrlBuffer(dataUrl) }], expected: new Set(['asset'])
    })
  }

  return {
    validFaceSet, writeFaceSet, readFaceSet,
    writeFaceCatalogItem, readFaceCatalogItem, listFaceCatalogItems,
    listFaceComponentAssets, readFaceComponentAsset, writeFaceComponentAsset
  }
}
