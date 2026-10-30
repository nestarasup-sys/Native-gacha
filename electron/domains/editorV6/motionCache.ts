import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { editorV6MotionResultSchema } from '../../../src/shared/editorV6Schema'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

/** Bump when baking changes without an authored timeline change. */
export const MOTION_CACHE_VERSION = 3
const MAX_MOTION_CACHE_ENTRIES = 512
const MAX_MOTION_CACHE_BYTES = 768 * 1024 * 1024
const MAX_MOTION_CACHE_ENTRY_BYTES = 32 * 1024 * 1024
export type EditorV6MotionCacheStats = { memoryHits: number; diskHits: number; misses: number; rasterized: number; diskMissing: number; diskRejected: number; diskReadErrors: number; diskWrites: number; diskWriteSkipped: number; diskWriteErrors: number; diskBytesRead: number; diskBytesWritten: number }

async function readBoundedFile(path: string, maximumBytes: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maximumBytes) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, bytes)
}

export function motionCacheKey(request: EditorV6MotionBakeRequest): string {
  const key = request.maxAtlasPixels === undefined
    ? [MOTION_CACHE_VERSION, request.plan.key, request.mouthScaleSamples ?? null, request.character]
    : [MOTION_CACHE_VERSION, request.plan.key, request.mouthScaleSamples ?? null, request.maxAtlasPixels, request.character]
  return createHash('sha256').update(JSON.stringify(key)).digest('hex')
}
function validateCachedMotion(request: EditorV6MotionBakeRequest, result: EditorV6MotionBakeResult): EditorV6MotionBakeResult {
  const parsed = editorV6MotionResultSchema.parse(result)
  if (parsed.motion.key !== request.plan.key || parsed.motion.frames.map((frame) => frame.offset).join() !== request.plan.samples.map((sample) => sample.offset).join()) throw Error('A transição em cache não corresponde à requisição.')
  return parsed
}
export function createMotionDiskCache(folder: string, maximumBytes = MAX_MOTION_CACHE_BYTES) {
  let maintenance = Promise.resolve()
  return {
    async read(request: EditorV6MotionBakeRequest): Promise<EditorV6MotionBakeResult | undefined> {
      const entry = await this.readWithStats(request)
      return 'result' in entry ? entry.result : undefined
    },
    async readWithStats(request: EditorV6MotionBakeRequest): Promise<{ result: EditorV6MotionBakeResult; bytes: number } | { miss: 'missing' | 'rejected' | 'error' }> {
      const target = join(folder, motionCacheKey(request) + '.json')
      let size: number
      try {
        size = (await stat(target)).size
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { miss: 'missing' } : { miss: 'error' }
      }
      if (size > MAX_MOTION_CACHE_ENTRY_BYTES) return { miss: 'rejected' }
      try {
        const bytes = await readBoundedFile(target, MAX_MOTION_CACHE_ENTRY_BYTES)
        if (!bytes) return { miss: 'rejected' }
        const envelope = JSON.parse(bytes.toString('utf8')) as { payload: string; checksum: string }
        if (typeof envelope.payload !== 'string' || createHash('sha256').update(envelope.payload).digest('hex') !== envelope.checksum) return { miss: 'rejected' }
        const result = validateCachedMotion(request, JSON.parse(envelope.payload))
        const now = new Date()
        await utimes(target, now, now).catch(() => {})
        return { result, bytes: bytes.byteLength }
      } catch { return { miss: 'rejected' }
      }
    },
    async write(request: EditorV6MotionBakeRequest, result: EditorV6MotionBakeResult): Promise<{ stored: boolean; bytes: number }> {
      const payload = JSON.stringify(validateCachedMotion(request, result))
      const contents = JSON.stringify({ payload, checksum: createHash('sha256').update(payload).digest('hex') })
      const bytes = Buffer.byteLength(contents)
      if (bytes > Math.min(maximumBytes, 32 * 1024 * 1024)) return { stored: false, bytes }
      await mkdir(folder, { recursive: true })
      const target = join(folder, motionCacheKey(request) + '.json'), temporary = target + '.' + randomUUID() + '.tmp'
      try { await writeFile(temporary, contents, { flag: 'wx' }); await rename(temporary, target) }
      finally { await unlink(temporary).catch(() => {}) }
      maintenance = maintenance.catch(() => {}).then(async () => {
        const names = await readdir(folder)
        await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.tmp$/.test(name)).map(async (name) => {
          try { if (Date.now() - (await stat(join(folder, name))).mtimeMs > 3_600_000) await unlink(join(folder, name)) } catch { /* Concurrent cleanup is harmless. */ }
        }))
        const entries = (await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => {
          try { const info = await stat(join(folder, name)); return { name, size: info.size, modified: info.mtimeMs } } catch { return undefined }
        }))).filter((entry) => entry !== undefined).sort((a, b) => b.modified - a.modified)
        let bytes = 0
        for (const [index, entry] of entries.entries()) {
          bytes += entry.size
          if (index >= MAX_MOTION_CACHE_ENTRIES || bytes > maximumBytes) await unlink(join(folder, entry.name)).catch(() => {})
        }
      })
      await maintenance
      return { stored: true, bytes }
    },
  }
}
