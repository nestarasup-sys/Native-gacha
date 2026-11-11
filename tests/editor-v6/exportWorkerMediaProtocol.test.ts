import { describe, expect, it, vi } from 'vitest'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { createEditorV6WorkerMediaProtocolHandler, hasEditorV6WorkerMedia } from '../../electron/domains/editorV6/exportWorkerMediaProtocol'

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const mediaFile = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4'
const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function payload(overrides: Record<string, unknown> = {}): EditorV6WorkerPayload {
  return {
    project: {
      id: projectId,
      media: [
        { id: 'local-video', fileName: mediaFile, mimeType: 'video/mp4' },
        { id: 'shared-video', fileName: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.webm', libraryVideoId: 'shared-video-id', mimeType: 'video/webm' }
      ],
      assets: [{ id: assetId, category: 'object', libraryAssetId: assetId, dataUrl: `gacha-editor-media://asset/${projectId}/${assetId}` }]
    }, width: 1920, height: 1080, layeredVideo: false,
    ...overrides
  } as unknown as EditorV6WorkerPayload
}

function request(url: string): Request { return { url, method: 'GET', headers: new Headers(), signal: new AbortController().signal } as Request }

describe('Editor V6 worker media protocol', () => {
  it('registers only when the snapshot has media and a matching resolver', () => {
    expect(hasEditorV6WorkerMedia({ payload: payload({ project: { ...payload().project, media: [], assets: [] } }), mediaPath: () => 'unused' })).toBe(false)
    expect(hasEditorV6WorkerMedia({ payload: payload(), mediaPath: () => 'unused' })).toBe(true)
    expect(hasEditorV6WorkerMedia({ payload: payload({ project: { ...payload().project, media: [], assets: [] } }), resolveLibraryAsset: async () => ({ path: 'unused', mimeType: 'image/png' }) })).toBe(false)
    expect(hasEditorV6WorkerMedia({ payload: payload(), resolveLibraryAsset: async () => ({ path: 'unused', mimeType: 'image/png' }) })).toBe(true)
  })

  it('serves project, library and referenced asset files through their owning resolvers', async () => {
    const mediaPath = vi.fn((id: string, fileName: string, libraryId?: string) => `project:${id}/${fileName}${libraryId ? `#${libraryId}` : ''}`)
    const resolveLibraryAsset = vi.fn(async id => ({ path: `library:${id}`, mimeType: 'image/png' }))
    const createFileResponse = vi.fn(async (_request: Request, path: string, mimeType: string) => new Response(`${path}|${mimeType}`))
    const handle = createEditorV6WorkerMediaProtocolHandler({ payload: payload(), mediaPath, resolveLibraryAsset, createFileResponse })

    const local = await handle(request(`gacha-editor-media://project/${projectId}/${mediaFile}`))
    const sharedVideo = await handle(request(`gacha-editor-media://library/${projectId}/shared-video-id`))
    const sharedAsset = await handle(request(`gacha-editor-media://asset/${projectId}/${assetId}`))

    expect(await local.text()).toBe(`project:${projectId}/${mediaFile}|video/mp4`)
    expect(await sharedVideo.text()).toBe(`project:${projectId}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webm#shared-video-id|video/webm`)
    expect(await sharedAsset.text()).toBe('library:cccccccc-cccc-4ccc-8ccc-cccccccccccc|image/png')
    expect(mediaPath).toHaveBeenCalledTimes(2)
    expect(resolveLibraryAsset).toHaveBeenCalledWith(assetId)
  })

  it('returns not found for unknown hosts, foreign projects, unreferenced files and unsafe filenames', async () => {
    const mediaPath = vi.fn(() => 'must-not-resolve')
    const resolveLibraryAsset = vi.fn(async () => ({ path: 'must-not-resolve', mimeType: 'image/png' }))
    const handle = createEditorV6WorkerMediaProtocolHandler({ payload: payload(), mediaPath, resolveLibraryAsset })
    const blocked = await Promise.all([
      handle(request(`gacha-editor-media://other/${projectId}/${mediaFile}`)),
      handle(request(`gacha-editor-media://project/ffffffff-ffff-4fff-8fff-ffffffffffff/${mediaFile}`)),
      handle(request(`gacha-editor-media://project/${projectId}/../../secret.mp4`)),
      handle(request(`gacha-editor-media://library/${projectId}/unknown-id`)),
      handle(request(`gacha-editor-media://asset/${projectId}/dddddddd-dddd-4ddd-8ddd-dddddddddddd`))
    ])

    expect(blocked.map(response => response.status)).toEqual([404, 404, 404, 404, 404])
    expect(mediaPath).not.toHaveBeenCalled()
    expect(resolveLibraryAsset).not.toHaveBeenCalled()
  })

  it('converts resolver failures to a not-found response', async () => {
    const handle = createEditorV6WorkerMediaProtocolHandler({ payload: payload(), mediaPath: () => { throw Error('private path details') } })
    const response = await handle(request(`gacha-editor-media://project/${projectId}/${mediaFile}`))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
