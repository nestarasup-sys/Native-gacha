/** Persistência dos documentos e mídias do Studio Principal. */
import { join, resolve, dirname, basename } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { StudioAsset, StudioDocument } from '../../../src/shared/studio'
import { publishStudioAssetsAndManifest, recoverStudioAssetTransaction } from '../storage/studioAssetTransaction.ts'

type Files = Pick<typeof nodeFs, 'readFile' | 'writeFile' | 'mkdir' | 'access' | 'rename' | 'unlink' | 'rm'>

export function createStudioDocumentPersistence(deps: {
  files: Files
  studioPath: (id: string) => string
  studioLibraryPath: () => string
  validate: (document: unknown) => document is StudioDocument
  decodeImage: (dataUrl: string) => Buffer
  normalizeImage: (bytes: Buffer) => Promise<{ bytes: Buffer }>
}) {
  const { readFile, mkdir, rm } = deps.files
  const operations = new Map<string, Promise<void>>()

  function serialized<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const prior = operations.get(id) ?? Promise.resolve()
    const task = prior.catch(() => undefined).then(operation)
    const idle = task.then(() => undefined, () => undefined)
    operations.set(id, idle)
    void idle.then(() => { if (operations.get(id) === idle) operations.delete(id) })
    return task
  }

  function normalizeStudio(value: Record<string, unknown>, id: string): StudioDocument {
    return {
      schemaVersion: 1, id,
      title: String(value.title ?? 'Studio').slice(0, 100),
      color: String(value.color ?? '#d7b5cd'),
      createdAt: String(value.createdAt ?? new Date().toISOString()),
      updatedAt: String(value.updatedAt ?? new Date().toISOString()),
      backgroundColor: typeof value.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.backgroundColor) ? value.backgroundColor : '#d7b5cd',
      backgroundAssetId: typeof value.backgroundAssetId === 'string' ? value.backgroundAssetId : null,
      backgroundX: typeof value.backgroundX === 'number' && Number.isFinite(value.backgroundX) ? value.backgroundX : 0,
      backgroundY: typeof value.backgroundY === 'number' && Number.isFinite(value.backgroundY) ? value.backgroundY : 0,
      backgroundWidth: typeof value.backgroundWidth === 'number' && Number.isFinite(value.backgroundWidth) ? value.backgroundWidth : 100,
      backgroundHeight: typeof value.backgroundHeight === 'number' && Number.isFinite(value.backgroundHeight) ? value.backgroundHeight : 100,
      backgroundRotation: typeof value.backgroundRotation === 'number' && Number.isFinite(value.backgroundRotation) ? value.backgroundRotation : 0,
      ...(typeof value.thumbnailDataUrl === 'string' && /^data:image\/(jpeg|png);base64,/.test(value.thumbnailDataUrl) && value.thumbnailDataUrl.length <= 1_500_000 ? { thumbnailDataUrl: value.thumbnailDataUrl } : {}),
      assets: Array.isArray(value.assets) ? value.assets as StudioAsset[] : [],
      elements: Array.isArray(value.elements) ? value.elements as StudioDocument['elements'] : [],
    }
  }

  async function readStudio(id: string): Promise<StudioDocument | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
    try {
      const folder = deps.studioPath(id)
      await recoverStudioAssetTransaction(deps.files, folder)
      const raw = JSON.parse(await readFile(join(folder, 'studio.json'), 'utf8')) as Record<string, unknown>
      const normalized = normalizeStudio(raw, id)
      const assets = await Promise.all(normalized.assets.map(async (asset) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id)
          || !['background', 'object', 'character'].includes(asset.category)
          || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('Biblioteca de imagens do Studio inválida.')
        const extension = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.slice('image/'.length)
        const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
        const data = await readFile(join(folder, 'assets', categoryFolder, `${asset.id}.${extension}`))
        return { ...asset, dataUrl: `data:${asset.mimeType};base64,${data.toString('base64')}` }
      }))
      const document = { ...normalized, assets }
      if (!deps.validate(document)) throw new Error(`Os dados do Studio ${id} estão inválidos.`)
      return document
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw reason
    }
  }

  async function readStudioPoseReferences(id: string): Promise<Pick<StudioDocument, 'id' | 'title' | 'elements'> | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
    const folder = deps.studioPath(id)
    await recoverStudioAssetTransaction(deps.files, folder)
    let contents: string
    try {
      contents = await readFile(join(folder, 'studio.json'), 'utf8')
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw reason
    }
    const raw = JSON.parse(contents) as Record<string, unknown>
    if (raw.id !== id || !Array.isArray(raw.elements)) throw new Error(`Os vínculos de pose do Studio ${id} estão inválidos.`)
    return { id, title: String(raw.title ?? 'Studio').slice(0, 100), elements: raw.elements as StudioDocument['elements'] }
  }

  async function writeStudio(studio: StudioDocument): Promise<void> {
    if (!deps.validate(studio)) throw new Error('Dados do Studio inválidos.')
    const folder = deps.studioPath(studio.id)
    await Promise.all([
      mkdir(join(folder, 'assets', 'backgrounds'), { recursive: true }),
      mkdir(join(folder, 'assets', 'objects'), { recursive: true }),
      mkdir(join(folder, 'assets', 'characters'), { recursive: true }),
      mkdir(join(folder, 'prints'), { recursive: true }),
    ])
    const assetManifest: Array<Omit<StudioAsset, 'dataUrl'>> = []
    const assetWrites: Array<{ relativePath: string; bytes: Buffer }> = []
    for (const asset of studio.assets) {
      const sourceBytes = deps.decodeImage(asset.dataUrl)
      const canonical = asset.mimeType === 'image/png' ? { bytes: sourceBytes } : await deps.normalizeImage(sourceBytes)
      const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
      assetWrites.push({ relativePath: `assets/${categoryFolder}/${asset.id}.png`, bytes: canonical.bytes })
      const { dataUrl: _dataUrl, ...metadata } = asset
      assetManifest.push({ ...metadata, mimeType: 'image/png' })
    }
    const { assets: _assets, ...metadata } = studio
    await publishStudioAssetsAndManifest({
      files: deps.files, folder, assets: assetWrites,
      manifestValue: { ...metadata, title: studio.title.trim(), assets: assetManifest },
    })
  }

  async function removeStudio(id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
    const folder = resolve(deps.studioPath(id))
    if (dirname(folder) !== resolve(deps.studioLibraryPath()) || basename(folder) !== `studio-${id}`) throw new Error('Pasta do Studio inválida.')
    await rm(folder, { recursive: true, force: true })
  }

  return {
    readStudio: (id: string) => serialized(id, () => readStudio(id)),
    readStudioPoseReferences: (id: string) => serialized(id, () => readStudioPoseReferences(id)),
    writeStudio: (document: StudioDocument) => serialized(document.id, () => writeStudio(document)),
    removeStudio: (id: string) => serialized(id, () => removeStudio(id)),
  }
}
