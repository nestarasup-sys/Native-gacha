import type { Protocol } from 'electron'
import { createEditorV6MediaHandler } from './domains/editorV6/mediaProtocol.ts'
import { createMediaFileResponse } from './domains/mediaLibrary/mediaFileResponse.ts'
import type { VideoLibraryStore } from './domains/mediaLibrary/videoLibraryStore'
import type { VideoBackgroundLibraryStore } from './backgroundLibrary'
import type { RoteiroUiGifLibraryStore } from './roteiroUiGifLibrary'
import type { DomainFileSystem } from './domainFileSystem.cjs'

const libraryAssetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const videoMimeTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' } as const

type MediaProtocolDependencies = {
  protocol: Pick<Protocol, 'handle'>
  videoLibrary: Pick<VideoLibraryStore, 'resolveMedia'>
  backgroundLibrary: Pick<VideoBackgroundLibraryStore, 'resolve'>
  gifLibrary: Pick<RoteiroUiGifLibraryStore, 'resolve'>
  fileSystem: Pick<DomainFileSystem, 'resolvePhysicalPath'>
  readFile: (path: string) => Promise<Buffer>
  editorV6Path: (id: string) => string
  readEditorV6Manifest: (id: string) => Promise<unknown>
}

/** Aceita somente um UUID na origem e na rota de asset usadas pelas bibliotecas do app. */
export function libraryAssetIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    return url.hostname === 'library' && parts.length === 1 && libraryAssetIdPattern.test(parts[0])
      ? parts[0]
      : null
  } catch {
    return null
  }
}

/** Registra os protocolos privados de mídia junto para manter regras de URL e resolução alinhadas. */
export function registerMediaProtocols({
  protocol,
  videoLibrary,
  backgroundLibrary,
  gifLibrary,
  fileSystem,
  readFile,
  editorV6Path,
  readEditorV6Manifest
}: MediaProtocolDependencies): void {
  protocol.handle('gacha-video', async (request) => {
    try {
      const id = libraryAssetIdFromUrl(request.url)
      if (!id) return new Response('Not found', { status: 404 })
      const media = await videoLibrary.resolveMedia(id)
      const path = await fileSystem.resolvePhysicalPath(media.path) ?? media.path
      return await createMediaFileResponse(request, path, videoMimeTypes[media.extension])
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle('gacha-editor-media', createEditorV6MediaHandler({
    projectPath: editorV6Path,
    readManifest: readEditorV6Manifest,
    resolveLibraryMedia: async (id) => {
      const media = await videoLibrary.resolveMedia(id)
      return { path: await fileSystem.resolvePhysicalPath(media.path) ?? media.path, mimeType: media.mimeType }
    }
  }))

  protocol.handle('gacha-background', async (request) => {
    try {
      const id = libraryAssetIdFromUrl(request.url)
      if (!id) return new Response('Not found', { status: 404 })
      const image = await backgroundLibrary.resolve(id)
      const bytes = await readFile(image.path)
      return new Response(bytes as unknown as BodyInit, { headers: { 'content-type': image.mimeType, 'cache-control': 'no-store' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle('gacha-gif', async (request) => {
    try {
      const id = libraryAssetIdFromUrl(request.url)
      if (!id) return new Response('Not found', { status: 404 })
      const path = await gifLibrary.resolve(id)
      const gif = await readFile(path)
      return new Response(gif as unknown as BodyInit, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
