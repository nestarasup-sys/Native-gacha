import { join } from 'node:path'
import { createMediaFileResponse } from '../mediaLibrary/mediaFileResponse'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const mediaFile = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i
const supportedTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/opus', 'audio/webm'])
type Dependencies = {
  projectPath: (id: string) => string
  readManifest: (id: string) => Promise<unknown>
  resolveLibraryMedia: (id: string) => Promise<{ path: string; mimeType: string }>
}

/** Project membership is checked before accessing local or library media. */
export function createEditorV6MediaHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const missing = () => new Response('Not found', { status: 404 })
    try {
      const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 2 || !uuid.test(parts[0])) return missing()
      const file = url.hostname === 'project' ? mediaFile.exec(parts[1]) : null
      if (!file && !(url.hostname === 'library' && uuid.test(parts[1]))) return missing()
      const raw = await deps.readManifest(parts[0])
      if (!raw || typeof raw !== 'object' || !('id' in raw) || raw.id !== parts[0] || !('media' in raw) || !Array.isArray(raw.media)) return missing()
      const media = raw.media.find((item: unknown): item is Record<string, unknown> => {
        if (!item || typeof item !== 'object') return false
        return file ? 'id' in item && item.id === file[1] && 'fileName' in item && item.fileName === parts[1]
          : 'libraryVideoId' in item && item.libraryVideoId === parts[1]
      })
      if (!media) return missing()
      let path: string, mimeType: unknown
      if (file) { path = join(deps.projectPath(parts[0]), 'media', parts[1]); mimeType = media.mimeType }
      else { const resolved = await deps.resolveLibraryMedia(parts[1]); path = resolved.path; mimeType = resolved.mimeType }
      if (typeof mimeType !== 'string' || !supportedTypes.has(mimeType)) return missing()
      return await createMediaFileResponse(request, path, mimeType)
    } catch { return missing() }
  }
}
