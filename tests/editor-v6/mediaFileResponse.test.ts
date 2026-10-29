import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMediaFileResponse } from '../../electron/domains/mediaLibrary/mediaFileResponse'

let folder: string, file: string
beforeAll(async () => { folder = await mkdtemp(join(tmpdir(), 'gacha-media-response-')); file = join(folder, 'synthetic.bin'); await writeFile(file, '0123456789') })
afterAll(async () => { await rm(folder, { recursive: true, force: true }) })
const request = (range?: string, method = 'GET') => new Request('https://fixture.invalid/media', { method, headers: range ? { range } : {} })

describe('authorized media byte delivery', () => {
  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-999999999999999999999999', '89', 'bytes 8-9/10'],
    ['bytes=-999999999999999999999999', '0123456789', 'bytes 0-9/10']
  ])('streams exact bytes for %s', async (range, body, contentRange) => {
    const response = await createMediaFileResponse(request(range), file, 'video/mp4')
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(contentRange)
    expect(response.headers.get('content-length')).toBe(String(body.length))
    expect(await response.text()).toBe(body)
  })
  it.each(['bytes=-0', 'bytes=10-', 'bytes=5-2', 'bytes=-', 'bytes=0-1,3-4', 'bytes=999999999999999999999-', 'garbage'])('rejects unsupported or unsatisfiable range %s', async range => {
    const response = await createMediaFileResponse(request(range), file, 'video/mp4')
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
    expect(response.body).toBeNull()
  })
  it('preserves full delivery and HEAD metadata without a response body', async () => {
    const full = await createMediaFileResponse(request(), file, 'audio/mpeg')
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('audio/mpeg')
    expect(await full.text()).toBe('0123456789')
    const head = await createMediaFileResponse(request('bytes=1-2', 'HEAD'), file, 'audio/mpeg')
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('10')
    expect(head.body).toBeNull()
  })
})
