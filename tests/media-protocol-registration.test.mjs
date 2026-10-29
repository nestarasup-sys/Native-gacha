import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { libraryAssetIdFromUrl, registerMediaProtocols } from '../electron/mediaProtocols.ts'

const videoId = '123e4567-e89b-42d3-a456-426614174000'
const projectId = '123e4567-e89b-42d3-a456-426614174001'

test('extrai somente IDs UUID da origem library e de uma única rota', () => {
  assert.equal(libraryAssetIdFromUrl(`gacha-video://library/${videoId}`), videoId)
  assert.equal(libraryAssetIdFromUrl(`gacha-video://LIBRARY/${videoId}`), null)
  assert.equal(libraryAssetIdFromUrl(`gacha-video://other/${videoId}`), null)
  assert.equal(libraryAssetIdFromUrl(`gacha-video://library/${videoId}/extra`), null)
  assert.equal(libraryAssetIdFromUrl('gacha-video://library/not-a-uuid'), null)
  assert.equal(libraryAssetIdFromUrl('not a URL'), null)
})

test('registra e serve vídeos, fundos e GIFs pelas bibliotecas autorizadas', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'gacha-media-protocols-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const mediaPath = join(root, 'asset.mp4')
  const bytes = Buffer.from('0123456789')
  await writeFile(mediaPath, bytes)

  const handlers = new Map()
  const calls = { video: [], background: [], gif: [], manifest: [] }
  registerMediaProtocols({
    protocol: { handle: (scheme, handler) => handlers.set(scheme, handler) },
    videoLibrary: {
      resolveMedia: async (id) => {
        calls.video.push(id)
        return { path: 'logical-video.mp4', name: 'fixture', mimeType: 'video/mp4', extension: 'mp4', size: bytes.length, durationFrames: 30 }
      }
    },
    backgroundLibrary: {
      resolve: async (id) => { calls.background.push(id); return { path: mediaPath, mimeType: 'image/png' } }
    },
    gifLibrary: {
      resolve: async (id) => { calls.gif.push(id); return mediaPath }
    },
    fileSystem: { resolvePhysicalPath: async () => mediaPath },
    readFile,
    editorV6Path: (id) => join(root, id),
    readEditorV6Manifest: async (id) => {
      calls.manifest.push(id)
      return { id, media: [{ libraryVideoId: videoId, mimeType: 'video/mp4' }] }
    }
  })

  assert.deepEqual([...handlers.keys()], ['gacha-video', 'gacha-editor-media', 'gacha-background', 'gacha-gif'])
  const video = await handlers.get('gacha-video')(new Request(`gacha-video://library/${videoId}`, { headers: { range: 'bytes=2-4' } }))
  assert.equal(video.status, 206)
  assert.equal(video.headers.get('content-type'), 'video/mp4')
  assert.equal(await video.text(), '234')

  const editorMedia = await handlers.get('gacha-editor-media')(new Request(`gacha-editor-media://library/${projectId}/${videoId}`, { headers: { range: 'bytes=5-7' } }))
  assert.equal(editorMedia.status, 206)
  assert.equal(await editorMedia.text(), '567')
  assert.deepEqual(calls.manifest, [projectId])

  const background = await handlers.get('gacha-background')(new Request(`gacha-background://library/${videoId}`))
  assert.equal(background.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await background.arrayBuffer()), bytes)

  const gif = await handlers.get('gacha-gif')(new Request(`gacha-gif://library/${videoId}`))
  assert.equal(gif.headers.get('content-type'), 'image/gif')
  assert.deepEqual(Buffer.from(await gif.arrayBuffer()), bytes)

  const rejected = await handlers.get('gacha-background')(new Request(`gacha-background://untrusted/${videoId}`))
  assert.equal(rejected.status, 404)
  assert.deepEqual(calls.video, [videoId, videoId])
  assert.deepEqual(calls.background, [videoId])
  assert.deepEqual(calls.gif, [videoId])
})
