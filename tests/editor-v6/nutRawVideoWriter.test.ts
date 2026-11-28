import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { NutRawVideoWriter } from '../../electron/domains/editorV6/nutRawVideoWriter'

const ffmpegPath = process.env.GACHA_EDITOR_V6_FFMPEG_PATH ?? path.resolve('out/editor-v6-stress/tools/round13/ffmpeg.exe')
const canRunFfmpeg = existsSync(ffmpegPath)

describe('writer NUT BGRA isolado', () => {
  it.skipIf(!canRunFfmpeg)('expande corridas de 1, 2 e 54 quadros e um grande salto de PTS sem divergência', async () => {
    const cases = [
      { width: 2, height: 2, pts: [0], values: [0x13] },
      { width: 2, height: 2, pts: [0, 1], values: [0x13, 0x57] },
      { width: 2, height: 2, pts: [0, 54], values: [0x13, 0xa9] },
      { width: 2, height: 2, pts: [0, 1, 54], values: [0x13, 0xa9, 0xa9] },
      { width: 2, height: 2, pts: [0, 2, 54], values: [0x13, 0x57, 0xa9] },
      { width: 2, height: 2, pts: [0, 1, 300], values: [0x13, 0x57, 0xa9] },
    ]
    for (const testCase of cases) {
      const frameBytes = testCase.width * testCase.height * 4
      const uniqueFrames = testCase.values.map(value => solidFrame(frameBytes, value))
      const count = testCase.pts.at(-1)! + 1
      const expectedHash = createHash('sha256')
      let current = 0
      for (let frame = 0; frame < count; frame += 1) {
        while (current + 1 < testCase.pts.length && testCase.pts[current + 1]! <= frame) current += 1
        expectedHash.update(uniqueFrames[current]!)
      }
      const actual = await decodeNut(testCase.width, testCase.height, testCase.pts, uniqueFrames, count)
      expect(actual).toMatchObject({ hash: expectedHash.digest('hex'), bytes: count * frameBytes })
    }
  }, 30_000)

  it.skipIf(!canRunFfmpeg)('mantém pixels em 1920×1080 e 1920×2160 com backpressure ativo', async () => {
    for (const height of [1080, 2160]) {
      const width = 1920
      const frameBytes = width * height * 4
      const frames = [solidFrame(frameBytes, 0x31), solidFrame(frameBytes, 0xc2)]
      const actual = await decodeNut(width, height, [0, 3], frames, 4)
      const expectedHash = createHash('sha256').update(frames[0]!).update(frames[0]!).update(frames[0]!).update(frames[1]!).digest('hex')
      expect(actual).toMatchObject({ hash: expectedHash, bytes: frameBytes * 4 })
      expect(actual.drains).toBeGreaterThan(0)
    }
  }, 60_000)

  it.skipIf(!canRunFfmpeg)('preserva o mapeamento de quadro de timeline para saída a 24 FPS', async () => {
    const fps = 24
    const timelineFrames = Array.from({ length: fps }, (_, index) => Math.floor(index * 30 / fps))
    const outputFrames = timelineFrames.map(frame => solidFrame(16, frame + 1))
    const pts = Array.from({ length: fps }, (_, index) => index)
    const expectedHash = createHash('sha256')
    for (const frame of outputFrames) expectedHash.update(frame)
    const actual = await decodeNut(2, 2, pts, outputFrames, fps, fps, fps)
    expect(actual).toMatchObject({ hash: expectedHash.digest('hex'), bytes: fps * 16 })
  }, 30_000)

  it('propaga falha de escrita do sink', async () => {
    const failingSink = new Writable({ write: (_chunk, _encoding, callback) => callback(new Error('synthetic pipe failure')) })
    const writer = new NutRawVideoWriter({ width: 2, height: 2, writable: failingSink })
    await expect(writer.writeHeader()).rejects.toThrow('synthetic pipe failure')
    failingSink.destroy()
  })

  it('cancela uma escrita sob backpressure e fecha o sink', async () => {
    const controller = new AbortController()
    const blockedSink = new Writable({
      highWaterMark: 1,
      write: () => {},
    })
    const writer = new NutRawVideoWriter({ width: 2, height: 2, writable: blockedSink, signal: controller.signal })
    const pending = writer.writeHeader()
    controller.abort()
    await expect(pending).rejects.toThrow('NUT output was cancelled.')
    expect(blockedSink.destroyed).toBe(true)
  })

  it('cancela uma escrita aceita pelo stream cujo callback fica pendente', async () => {
    const controller = new AbortController()
    const callbackPendingSink = new Writable({
      highWaterMark: 1024,
      write: () => {}
    })
    const writer = new NutRawVideoWriter({ width: 2, height: 2, writable: callbackPendingSink, signal: controller.signal })
    const pending = writer.writeHeader()
    expect(callbackPendingSink.writableNeedDrain).toBe(false)
    controller.abort()

    await expect(pending).rejects.toThrow('NUT output was cancelled.')
    expect(callbackPendingSink.destroyed).toBe(true)
  })
})

function solidFrame(size: number, value: number): Buffer {
  return Buffer.alloc(size, value)
}

async function decodeNut(width: number, height: number, pts: number[], frames: Buffer[], count: number, fps = 30, inputFps = 30): Promise<{ hash: string; bytes: number; drains: number }> {
  const child = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-f', 'nut', '-i', 'pipe:0', '-vf', `fps=${fps}`,
    '-fps_mode', 'cfr', '-frames:v', String(count), '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const outputHash = createHash('sha256')
  let outputBytes = 0
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => {
    outputHash.update(chunk)
    outputBytes += chunk.byteLength
  })
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const input = new PassThrough()
  let drains = 0
  input.on('drain', () => { drains += 1 })
  input.pipe(child.stdin)
  const writer = new NutRawVideoWriter({ width, height, fps: inputFps, writable: input })
  try {
    await writer.writeHeader()
    for (let index = 0; index < pts.length; index += 1) await writer.writeFrame(pts[index]!, frames[index]!)
    await writer.end()
  } catch (error) {
    child.kill()
    throw error
  }
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve(code))
  })
  expect({ exitCode, stderr: Buffer.concat(stderr).toString('utf8') }).toEqual({ exitCode: 0, stderr: '' })
  return { hash: outputHash.digest('hex'), bytes: outputBytes, drains }
}
