import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { NutRawVideoWriter } from '../../electron/domains/editorV6/nutRawVideoWriter'
import { NutUniqueFrameInput } from '../../electron/domains/editorV6/nutUniqueFrameInput'

const ffmpegPath = process.env.GACHA_EDITOR_V6_FFMPEG_PATH ?? path.resolve('out/editor-v6-stress/tools/round13/ffmpeg.exe')
const canRunFfmpeg = existsSync(ffmpegPath)

describe('NUT de entrada por corridas de quadros iguais', () => {
  it('emite uma imagem por corrida, conserva a duração com marcador terminal e reproduz os pixels CFR', async () => {
    const frameA = Buffer.alloc(16, 0x11)
    const frameB = Buffer.alloc(16, 0x82)
    const frames = [frameA, frameA, frameB, frameB, frameA]
    const writtenPackets: Array<{ pts: number; bytes: Buffer }> = []
    const end = vi.fn(async () => undefined)
    const fakeWriter = {
      writeFrame: async (pts: number, bytes: Buffer) => {
        writtenPackets.push({ pts, bytes: Buffer.from(bytes) })
        return 20 + bytes.byteLength
      },
      end
    }
    const input = new NutUniqueFrameInput(fakeWriter, 45)
    for (let index = 0; index < frames.length; index += 1) await input.writeFrame(index, frames[index]!)
    await input.finish(frames.length)

    expect(writtenPackets.map(({ pts }) => pts)).toEqual([0, 2, 4, 5])
    expect(input.stats).toEqual({
      logicalFrames: 5,
      uniqueRunFrames: 3,
      repeatedFrames: 2,
      framePackets: 4,
      bitmapPayloadBytes: 64,
      nutBytesWritten: 189
    })
    expect(end).toHaveBeenCalledOnce()
  })

  it.skipIf(!canRunFfmpeg)('decodifica o replay NUT ao mesmo CFR em 24 FPS', async () => {
    const fps = 24
    const frames = Array.from({ length: fps }, (_, index) => Buffer.alloc(16, Math.floor(index / 4)))
    const expected = createHash('sha256')
    for (const frame of frames) expected.update(frame)
    const child = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-f', 'nut', '-i', 'pipe:0', '-vf', `fps=${fps}`,
      '-fps_mode', 'cfr', '-frames:v', String(frames.length), '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const actual = createHash('sha256')
    let bytes = 0
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { actual.update(chunk); bytes += chunk.byteLength })
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    const writer = new NutRawVideoWriter({ width: 2, height: 2, fps, writable: child.stdin })
    const input = new NutUniqueFrameInput(writer, await writer.writeHeader())
    for (let index = 0; index < frames.length; index += 1) await input.writeFrame(index, frames[index]!)
    await input.finish(frames.length)
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })

    expect({ exitCode, stderr: Buffer.concat(stderr).toString('utf8') }).toEqual({ exitCode: 0, stderr: '' })
    expect({ hash: actual.digest('hex'), bytes }).toEqual({ hash: expected.digest('hex'), bytes: fps * 16 })
    expect(input.stats.repeatedFrames).toBe(18)
  }, 30_000)

  it('exige frames contíguos e recusa escrita posterior ao fechamento', async () => {
    const writer = { writeFrame: async () => 0, end: async () => undefined }
    const input = new NutUniqueFrameInput(writer)
    await expect(input.writeFrame(1, Buffer.alloc(4))).rejects.toThrow('expected frame 0')
    await expect(input.finish(0)).rejects.toThrow('cannot finish at frame count 0')
    await input.writeFrame(0, Buffer.alloc(4))
    await input.finish(1)
    await expect(input.writeFrame(1, Buffer.alloc(4))).rejects.toThrow('already finished')
  })
})
