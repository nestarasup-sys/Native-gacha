import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

/** Called only after the owning protocol has authorized the media reference. */
export async function createMediaFileResponse(request: Request, path: string, mimeType: string): Promise<Response> {
  const { size } = await stat(path)
  const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': mimeType, 'cache-control': 'no-store' })
  if (request.method === 'HEAD') {
    headers.set('content-length', String(size))
    return new Response(null, { status: 200, headers })
  }
  const range = request.headers.get('range')
  if (range) {
    const invalid = () => new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size === 0) return invalid()
    // Parse before clamping so enormous decimal offsets never lose precision.
    const length = BigInt(size)
    const start = match[1] ? BigInt(match[1]) : length > BigInt(match[2]) ? length - BigInt(match[2]) : 0n
    const requestedEnd = match[1] && match[2] ? BigInt(match[2]) : length - 1n
    const end = requestedEnd < length ? requestedEnd : length - 1n
    if (start >= length || end < start || (!match[1] && BigInt(match[2]) === 0n)) return invalid()
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
    headers.set('content-length', String(end - start + 1n))
    const stream = createReadStream(path, { start: Number(start), end: Number(end), signal: request.signal })
    return new Response(Readable.toWeb(stream) as unknown as BodyInit, { status: 206, headers })
  }
  headers.set('content-length', String(size))
  return new Response(Readable.toWeb(createReadStream(path, { signal: request.signal })) as unknown as BodyInit, { status: 200, headers })
}
