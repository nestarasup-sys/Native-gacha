import { createMediaFileResponse } from '../mediaLibrary/mediaFileResponse'
import type { EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'

type MediaPath = (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
type LibraryAssetResolver = (assetId: string) => Promise<{ path: string; mimeType: string }>
type FileResponse = typeof createMediaFileResponse
export type EditorV6WorkerAssetSources = ReadonlyMap<string, { dataUrl: string; mimeType: string }>

type Dependencies = {
  payload: EditorV6WorkerPayload
  mediaPath?: MediaPath
  resolveLibraryAsset?: LibraryAssetResolver
  assetSources?: EditorV6WorkerAssetSources
  createFileResponse?: FileResponse
}

function allowWorkerImageCors(response: Response): Response {
  const headers = new Headers(response.headers)
  // This handler is registered only on the worker's temporary Electron
  // session, and its routes are allowlisted against that export payload. The
  // worker needs CORS access so fetched image bytes can become origin-clean
  // ImageBitmaps for WebGL texture upload.
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Whether this worker has any project-scoped media route to register. */
export function hasEditorV6WorkerMedia(dependencies: Pick<Dependencies, 'payload' | 'mediaPath' | 'resolveLibraryAsset' | 'assetSources'>): boolean {
  const media = dependencies.payload.project.media
  const hasProjectMedia = Boolean(dependencies.mediaPath && media?.length)
  const hasLibraryAssets = Boolean(dependencies.resolveLibraryAsset && dependencies.payload.project.assets.some(asset => asset.libraryAssetId))
  return hasProjectMedia || hasLibraryAssets || Boolean(dependencies.assetSources?.size)
}

/** Serves only media already referenced by this export payload's project snapshot. */
export function createEditorV6WorkerMediaProtocolHandler({ payload, mediaPath, resolveLibraryAsset, assetSources, createFileResponse = createMediaFileResponse }: Dependencies) {
  const projectId = payload.project.id
  const media = payload.project.media
  const sharedAssets = payload.project.assets.filter(asset => asset.libraryAssetId)
  const snapshotUrls = new Set([
    ...payload.project.assets.map(asset => asset.dataUrl),
    ...(payload.hairAnimation?.surfaces ?? []).map(surface => surface.dataUrl),
    ...(payload.hairAnimation?.textures ?? []).map(texture => texture.dataUrl)
  ].filter(value => value.startsWith(`gacha-editor-media://snapshot/${projectId}/`)))

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean)
      if (!['project', 'library', 'asset', 'snapshot'].includes(url.hostname) || parts.length !== 2 || parts[0] !== projectId) {
        return new Response('Not found', { status: 404 })
      }
      if (url.hostname === 'snapshot') {
        const token = parts[1]
        const source = assetSources?.get(token)
        if (!source || !/^asset-\d+$/.test(token) || !snapshotUrls.has(url.href)) return new Response('Not found', { status: 404 })
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(source.dataUrl)
        if (!match || match[1].toLowerCase() !== source.mimeType) return new Response('Not found', { status: 404 })
        const bytes = Buffer.from(match[2], 'base64')
        return allowWorkerImageCors(new Response(bytes as unknown as BodyInit, { headers: { 'content-type': source.mimeType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }))
      }
      if (url.hostname === 'asset') {
        const assetId = parts[1]
        if (!resolveLibraryAsset || !sharedAssets.some(asset => asset.id === assetId && asset.libraryAssetId === assetId)) {
          return new Response('Not found', { status: 404 })
        }
        const resolved = await resolveLibraryAsset(assetId)
        return allowWorkerImageCors(await createFileResponse(request, resolved.path, resolved.mimeType))
      }

      if (!mediaPath || !media?.length) return new Response('Not found', { status: 404 })
      const item = url.hostname === 'library'
        ? media.find(candidate => candidate.libraryVideoId === parts[1])
        : media.find(candidate => candidate.fileName === parts[1])
      if (!item || !/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(item.fileName)) {
        return new Response('Not found', { status: 404 })
      }
      const path = await mediaPath(projectId, item.fileName, item.libraryVideoId)
      return allowWorkerImageCors(await createFileResponse(request, path, item.mimeType))
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }
}
