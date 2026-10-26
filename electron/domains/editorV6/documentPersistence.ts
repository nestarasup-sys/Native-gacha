/** Persistência dos documentos e mídias do EditorV6 Principal. */
import { join, resolve, dirname, basename } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import { createEditorV6Timeline, syncEditorV6TimelineElements, type EditorV6Asset, type EditorV6Document, type EditorV6Timeline } from '../../../src/shared/editorV6'
import { publishEditorV6AssetsAndManifest, recoverEditorV6AssetTransaction } from './assetTransaction.ts'

type Files = Pick<typeof nodeFs, 'readFile' | 'writeFile' | 'mkdir' | 'access' | 'rename' | 'unlink' | 'rm'>

export function createEditorV6DocumentPersistence(deps: {
  files: Files
  editorV6Path: (id: string) => string
  editorV6LibraryPath: () => string
  validate: (document: unknown) => document is EditorV6Document
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

  function normalizeEditorV6(value: Record<string, unknown>, id: string): EditorV6Document {
    const elements = Array.isArray(value.elements) ? value.elements as EditorV6Document['elements'] : []
    return {
      schemaVersion: 1, id,
      title: String(value.title ?? 'Editor V6').slice(0, 100),
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
      assets: Array.isArray(value.assets) ? value.assets as EditorV6Asset[] : [],
      elements,
      timeline: value.timeline && typeof value.timeline === 'object'
        ? syncEditorV6TimelineElements(value.timeline as EditorV6Timeline, elements)
        : createEditorV6Timeline(elements),
    }
  }

  async function readEditorV6(id: string): Promise<EditorV6Document | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de EditorV6 inválido.')
    try {
      const folder = deps.editorV6Path(id)
      await recoverEditorV6AssetTransaction(deps.files, folder)
      const raw = JSON.parse(await readFile(join(folder, 'editorV6.json'), 'utf8')) as Record<string, unknown>
      const normalized = normalizeEditorV6(raw, id)
      const assets = await Promise.all(normalized.assets.map(async (asset) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id)
          || !['background', 'object', 'character'].includes(asset.category)
          || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('Biblioteca de imagens do EditorV6 inválida.')
        const extension = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.slice('image/'.length)
        const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
        const data = await readFile(join(folder, 'assets', categoryFolder, `${asset.id}.${extension}`))
        return { ...asset, dataUrl: `data:${asset.mimeType};base64,${data.toString('base64')}` }
      }))
      const document = { ...normalized, assets }
      if (!deps.validate(document)) throw new Error(`Os dados do EditorV6 ${id} estão inválidos.`)
      return document
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw reason
    }
  }

  async function writeEditorV6(editorV6: EditorV6Document): Promise<void> {
    if (!deps.validate(editorV6)) throw new Error('Dados do EditorV6 inválidos.')
    const folder = deps.editorV6Path(editorV6.id)
    await Promise.all([
      mkdir(join(folder, 'assets', 'backgrounds'), { recursive: true }),
      mkdir(join(folder, 'assets', 'objects'), { recursive: true }),
      mkdir(join(folder, 'assets', 'characters'), { recursive: true }),
      mkdir(join(folder, 'prints'), { recursive: true }),
    ])
    const assetManifest: Array<Omit<EditorV6Asset, 'dataUrl'>> = []
    const assetWrites: Array<{ relativePath: string; bytes: Buffer }> = []
    for (const asset of editorV6.assets) {
      const sourceBytes = deps.decodeImage(asset.dataUrl)
      const canonical = asset.mimeType === 'image/png' ? { bytes: sourceBytes } : await deps.normalizeImage(sourceBytes)
      const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
      assetWrites.push({ relativePath: `assets/${categoryFolder}/${asset.id}.png`, bytes: canonical.bytes })
      const { dataUrl: _dataUrl, ...metadata } = asset
      assetManifest.push({ ...metadata, mimeType: 'image/png' })
    }
    const { assets: _assets, ...metadata } = editorV6
    await publishEditorV6AssetsAndManifest({
      files: deps.files, folder, assets: assetWrites,
      manifestValue: { ...metadata, title: editorV6.title.trim(), assets: assetManifest },
    })
  }

  async function removeEditorV6(id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de EditorV6 inválido.')
    const folder = resolve(deps.editorV6Path(id))
    if (dirname(folder) !== resolve(deps.editorV6LibraryPath()) || basename(folder) !== `editorV6-${id}`) throw new Error('Pasta do EditorV6 inválida.')
    await rm(folder, { recursive: true, force: true })
  }

  return {
    readEditorV6: (id: string) => serialized(id, () => readEditorV6(id)),
    writeEditorV6: (document: EditorV6Document) => serialized(document.id, () => writeEditorV6(document)),
    removeEditorV6: (id: string) => serialized(id, () => removeEditorV6(id)),
  }
}
