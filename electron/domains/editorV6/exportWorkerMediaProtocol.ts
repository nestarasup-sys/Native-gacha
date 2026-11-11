import { createMediaFileResponse } from '../mediaLibrary/mediaFileResponse'
import type { EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'

type MediaPath = (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
type LibraryAssetResolver = (assetId: string) => Promise<{ path: string; mimeType: string }>
type FileResponse = typeof createMediaFileResponse

type Dependencies = {
  payload: EditorV6WorkerPayload
  mediaPath?: MediaPath
  resolveLibraryAsset?: LibraryAssetResolver
  createFileResponse?: FileResponse
}

/** Whether this worker has any project-scoped media route to register. */
export function hasEditorV6WorkerMedia(dependencies: Pick<Dependencies, 'payload' | 'mediaPath' | 'resolveLibraryAsset'>): boolean {
  const media = dependencies.payload.project.media
  const hasProjectMedia = Boolean(dependencies.mediaPath && media?.length)
  const hasLibraryAssets = Boolean(dependencies.resolveLibraryAsset && dependencies.payload.project.assets.some(asset => asset.libraryAssetId))
  return hasProjectMedia || hasLibraryAssets
}

/** Serves only media already referenced by this export payload's project snapshot. */
export function createEditorV6WorkerMediaProtocolHandler({ payload, mediaPath, resolveLibraryAsset, createFileResponse = createMediaFileResponse }: Dependencies) {
  const projectId = payload.project.id
  const media = payload.project.media
  const sharedAssets = payload.project.assets.filter(asset => asset.libraryAssetId)

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean)
      if (!['project', 'library', 'asset'].includes(url.hostname) || parts.length !== 2 || parts[0] !== projectId) {
        return new Response('Not found', { status: 404 })
      }
      if (url.hostname === 'asset') {
        const assetId = parts[1]
        if (!resolveLibraryAsset || !sharedAssets.some(asset => asset.id === assetId && asset.libraryAssetId === assetId)) {
          return new Response('Not found', { status: 404 })
        }
        const resolved = await resolveLibraryAsset(assetId)
        return await createFileResponse(request, resolved.path, resolved.mimeType)
      }

      if (!mediaPath || !media?.length) return new Response('Not found', { status: 404 })
      const item = url.hostname === 'library'
        ? media.find(candidate => candidate.libraryVideoId === parts[1])
        : media.find(candidate => candidate.fileName === parts[1])
      if (!item || !/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(item.fileName)) {
        return new Response('Not found', { status: 404 })
      }
      const path = await mediaPath(projectId, item.fileName, item.libraryVideoId)
      return await createFileResponse(request, path, item.mimeType)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }
}
