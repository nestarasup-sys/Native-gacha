/** Persistência do Studio Principal e dos snapshots de Video Studio.
 * Files e operações externas injetados para preservar DomainFileSystem, SQLite,
 * canais públicos e formatos legados. Nenhuma migração implícita.
 */
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type * as nodeFs from 'node:fs/promises'
import type { StudioAsset, StudioDocument, VideoTimelineDocument, VideoStudioCardSummary } from '../../../src/shared/studio'
import { publishJsonManifest } from '../storage/atomicManifest'

export type StudioWorkspaceStorage = 'studio' | 'video'
type Files = Pick<typeof nodeFs, 'readFile' | 'writeFile' | 'mkdir' | 'access' | 'rename' | 'unlink'>

export function createStudioDocumentPersistence(deps: {
  files: Files
  studioPath: (id: string, workspace: StudioWorkspaceStorage) => string
  validate: (document: unknown) => document is StudioDocument
  decodeImage: (dataUrl: string) => Buffer
  normalizeImage: (bytes: Buffer) => Promise<{ bytes: Buffer }>
  ensureVideoAssets: (id: string, assets: NonNullable<VideoTimelineDocument['videoAssets']>) => Promise<unknown>
  videoStudioCardSummary: (value: Record<string, unknown>, id: string) => VideoStudioCardSummary
}) {
  const { readFile, writeFile, mkdir, access, rename, unlink } = deps.files
  const studioPath = deps.studioPath
  const isStudioDocument = deps.validate
  const importedImageDataUrlBuffer = deps.decodeImage
  const normalizeImageBuffer = deps.normalizeImage
  const videoLibrary = { ensureProjectAssets: deps.ensureVideoAssets }
  const videoStudioCardSummary = deps.videoStudioCardSummary

function normalizeStudio(value: Record<string, unknown>, id: string, workspace: StudioWorkspaceStorage = 'studio'): StudioDocument {
  return {
    schemaVersion: 1,
    id,
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
    ...(workspace === 'video' && value.videoTimeline && typeof value.videoTimeline === 'object' ? { videoTimeline: value.videoTimeline as VideoTimelineDocument } : {})
  }
}

async function readStudio(id: string, workspace: StudioWorkspaceStorage = 'studio'): Promise<StudioDocument | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
  try {
    const raw = JSON.parse(await readFile(join(studioPath(id, workspace), 'studio.json'), 'utf8')) as Record<string, unknown>
    const normalized = normalizeStudio(raw, id, workspace)
    const folder = studioPath(id, workspace)
    const assets = await Promise.all(normalized.assets.map(async (asset) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id)
        || !['background', 'object', 'character'].includes(asset.category)
        || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('Biblioteca de imagens do Studio inválida.')
      const extension = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.slice('image/'.length)
      const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
      const data = await readFile(join(folder, 'assets', categoryFolder, `${asset.id}.${extension}`))
      return { ...asset, dataUrl: `data:${asset.mimeType};base64,${data.toString('base64')}` }
    }))
    if (workspace === 'video' && normalized.videoTimeline) {
      const restoreImage = async (state: VideoTimelineDocument['characterKeys'][number]['state']) => {
        if (!state?.imageDataUrl.startsWith('@video-frame:')) return
        const hash = state.imageDataUrl.slice('@video-frame:'.length)
        if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Quadro de vídeo inválido.')
        const cached = videoFrameDataUrlCache.get(hash)
        if (cached) {
          videoFrameDataUrlCache.delete(hash)
          videoFrameDataUrlCache.set(hash, cached)
          state.imageDataUrl = cached
          return
        }
        let pending = videoFrameDataUrlLoads.get(hash)
        if (!pending) {
          pending = (async () => {
            const bytes = await readFile(join(folder, 'assets', 'video-frames', `${hash}.png`))
            if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Quadro de vídeo corrompido.')
            return `data:image/png;base64,${bytes.toString('base64')}`
          })()
          videoFrameDataUrlLoads.set(hash, pending)
        }
        try {
          const dataUrl = await pending
          const weight = dataUrl.length * 2
          if (!videoFrameDataUrlCache.has(hash) && weight <= VIDEO_FRAME_DATA_URL_CACHE_LIMIT) {
            videoFrameDataUrlCache.set(hash, dataUrl)
            videoFrameDataUrlCacheWeight += weight
            while (videoFrameDataUrlCacheWeight > VIDEO_FRAME_DATA_URL_CACHE_LIMIT && videoFrameDataUrlCache.size) {
              const oldestHash = videoFrameDataUrlCache.keys().next().value
              if (!oldestHash) break
              const oldest = videoFrameDataUrlCache.get(oldestHash)!
              videoFrameDataUrlCache.delete(oldestHash)
              videoFrameDataUrlCacheWeight -= oldest.length * 2
            }
          }
          state.imageDataUrl = dataUrl
        } finally {
          videoFrameDataUrlLoads.delete(hash)
        }
      }
      await Promise.all([
        ...Object.values(normalized.videoTimeline.characterBases ?? {}).map(restoreImage),
        ...normalized.videoTimeline.characterKeys.map((key) => restoreImage(key.state))
      ])
    }
    const document = { ...normalized, assets }
    if (!isStudioDocument(document)) throw new Error(`Os dados do Studio ${id} estão inválidos.`)
    return document
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

const VIDEO_FRAME_DATA_URL_CACHE_LIMIT = 96 * 1024 * 1024
const videoFrameDataUrlCache = new Map<string, string>()
const videoFrameDataUrlLoads = new Map<string, Promise<string>>()
let videoFrameDataUrlCacheWeight = 0

async function writeStudio(studio: StudioDocument, workspace: StudioWorkspaceStorage = 'studio'): Promise<void> {
  if (!isStudioDocument(studio)) throw new Error('Dados do Studio inválidos.')
  const folder = studioPath(studio.id, workspace)
  await Promise.all([
    mkdir(join(folder, 'assets', 'backgrounds'), { recursive: true }),
    mkdir(join(folder, 'assets', 'objects'), { recursive: true }),
    mkdir(join(folder, 'assets', 'characters'), { recursive: true }),
    mkdir(join(folder, 'prints'), { recursive: true })
  ])
  if (workspace === 'video' && studio.videoTimeline?.videoAssets?.length) await videoLibrary.ensureProjectAssets(studio.id, studio.videoTimeline.videoAssets)
  const assetManifest: Array<Omit<StudioAsset, 'dataUrl'>> = []
  for (const asset of studio.assets) {
    const sourceBytes = importedImageDataUrlBuffer(asset.dataUrl)
    const canonical = asset.mimeType === 'image/png'
      ? { bytes: sourceBytes }
      : await normalizeImageBuffer(sourceBytes)
    const extension = 'png'
    const bytes = canonical.bytes
    const categoryFolder = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
    await writeFile(join(folder, 'assets', categoryFolder, `${asset.id}.${extension}`), bytes)
    const { dataUrl: _dataUrl, ...metadata } = asset
    assetManifest.push({ ...metadata, mimeType: 'image/png' })
  }
  const temporary = join(folder, `studio.json.${randomUUID()}.tmp`)
  const { assets: _assets, ...metadata } = studio
  const savedMetadata = { ...metadata, videoTimeline: studio.videoTimeline ? structuredClone(studio.videoTimeline) : undefined }
  if (workspace === 'video' && savedMetadata.videoTimeline) {
    const frameFolder = join(folder, 'assets', 'video-frames')
    await mkdir(frameFolder, { recursive: true })
    const storeImage = async (state: VideoTimelineDocument['characterKeys'][number]['state']) => {
      if (!state) return
      const bytes = Buffer.from(state.imageDataUrl.slice(state.imageDataUrl.indexOf(',') + 1), 'base64')
      const hash = createHash('sha256').update(bytes).digest('hex')
      const path = join(frameFolder, `${hash}.png`)
      try { await access(path) } catch { await writeFile(path, bytes) }
      state.imageDataUrl = `@video-frame:${hash}`
    }
    await Promise.all([
      ...Object.values(savedMetadata.videoTimeline.characterBases ?? {}).map(storeImage),
      ...savedMetadata.videoTimeline.characterKeys.map((key) => storeImage(key.state))
    ])
  }
  await publishJsonManifest({
    files: { writeFile, rename, unlink },
    temporary, target: join(folder, 'studio.json'),
    value: { ...savedMetadata, title: studio.title.trim(), assets: assetManifest },
    indent: 2,
    afterCommit: async () => {
      if (workspace === 'video') {
        const card = videoStudioCardSummary(savedMetadata as unknown as Record<string, unknown>, studio.id)
        await writeFile(join(folder, 'studio-card.json'), JSON.stringify(card), 'utf8')
      }
    },
    onCleanupError: () => console.error('Não foi possível remover o manifesto temporário do Studio após gravar.')
  })
}

  return { readStudio, writeStudio }
}
