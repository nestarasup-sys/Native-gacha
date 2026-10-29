import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createEditorV6MediaHandler } from '../../electron/domains/editorV6/mediaProtocol'

const projectId = '11111111-1111-4111-8111-111111111111'
const mediaId = '22222222-2222-4222-8222-222222222222'
let folder: string
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'gacha-media-protocol-'))
  await mkdir(join(folder, 'media'))
  await writeFile(join(folder, 'media', `${mediaId}.mp4`), '0123456789')
})
afterAll(async () => { await rm(folder, { recursive: true, force: true }) })
function fixture(manifest: unknown = { id: projectId, media: [{ id: mediaId, fileName: `${mediaId}.mp4`, mimeType: 'video/mp4' }, { libraryVideoId: mediaId }] }) {
  const readManifest = vi.fn(async () => manifest)
  const resolveLibraryMedia = vi.fn(async () => ({ path: join(folder, 'media', `${mediaId}.mp4`), mimeType: 'video/mp4' }))
  return { handler: createEditorV6MediaHandler({ projectPath: () => folder, readManifest, resolveLibraryMedia }), readManifest, resolveLibraryMedia }
}
const request = (host = 'project', file = `${mediaId}.mp4`) => new Request(`gacha-editor-media://${host}/${projectId}/${file}`, { headers: { range: 'bytes=2-4' } })

describe('Editor V6 project media authorization', () => {
  it('delivers authorized local and library media through the same byte contract', async () => {
    const { handler, resolveLibraryMedia } = fixture()
    for (const input of [request(), request('library', mediaId)]) {
      const response = await handler(input)
      expect(response.status).toBe(206)
      expect(await response.text()).toBe('234')
    }
    expect(resolveLibraryMedia).toHaveBeenCalledExactlyOnceWith(mediaId)
  })

  it.each([null, {}, { id: 'other', media: [] }, { id: projectId, media: {} }, { id: projectId, media: [null, 1, {}] }])('refuses malformed or unrelated manifests before library resolution: %j', async manifest => {
    const { handler, resolveLibraryMedia } = fixture(manifest)
    expect((await handler(request('library', mediaId))).status).toBe(404)
    expect(resolveLibraryMedia).not.toHaveBeenCalled()
  })

  it('rejects unsupported hosts and filenames before reading the manifest', async () => {
    const { handler, readManifest } = fixture()
    for (const input of [request('external', mediaId), request('project', 'private.json'), request('library', 'not-an-id')]) expect((await handler(input)).status).toBe(404)
    expect(readManifest).not.toHaveBeenCalled()
  })

  it('rejects unsupported MIME and does not leak missing file errors', async () => {
    const badType = fixture({ id: projectId, media: [{ id: mediaId, fileName: `${mediaId}.mp4`, mimeType: 'text/html' }] })
    expect((await badType.handler(request())).status).toBe(404)
    const absent = fixture({ id: projectId, media: [{ id: mediaId, fileName: `${mediaId}.webm`, mimeType: 'video/webm' }] })
    expect((await absent.handler(request('project', `${mediaId}.webm`))).status).toBe(404)
  })
})
