import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/domains/editorV6/exportProcess', () => ({ runExportCommand: vi.fn() }))

import { runExportCommand } from '../../electron/domains/editorV6/exportProcess'
import { probeExportMedia } from '../../electron/domains/editorV6/exportMediaProbe'

describe('sondagem de mídia do exportador V6', () => {
  beforeEach(() => vi.mocked(runExportCommand).mockReset())

  it('usa FFprobe e converte o JSON sem reformatar os dados da mídia', async () => {
    const parsed = { streams: [{ codec_type: 'video', width: 320, height: 180 }], format: { duration: '1.25' } }
    vi.mocked(runExportCommand).mockResolvedValue({ stdout: JSON.stringify(parsed), stderr: '' })
    const signal = new AbortController().signal

    await expect(probeExportMedia('ffprobe.exe', 'clip.synthetic.mp4', signal)).resolves.toEqual(parsed)
    expect(runExportCommand).toHaveBeenCalledWith('ffprobe.exe', [
      '-v', 'error', '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', 'clip.synthetic.mp4'
    ], signal)
  })

  it.each([
    [true, '-count_frames'],
    ['packets', '-count_packets']
  ] as const)('pede a contagem compatível quando count=%s', async (count, countArg) => {
    vi.mocked(runExportCommand).mockResolvedValue({ stdout: '{"streams":[],"format":{}}', stderr: '' })

    await probeExportMedia('ffprobe.exe', 'clip.synthetic.mp4', new AbortController().signal, count)

    const args = vi.mocked(runExportCommand).mock.calls[0]?.[1]
    expect(args).toContain(countArg)
    expect(args?.indexOf(countArg)).toBeLessThan(args?.indexOf('-show_streams') ?? -1)
  })

  it('propaga falhas do processo e JSON inválido', async () => {
    const failure = new Error('Falha sintética do FFprobe')
    vi.mocked(runExportCommand).mockRejectedValueOnce(failure)
    await expect(probeExportMedia('ffprobe.exe', 'clip.synthetic.mp4', new AbortController().signal)).rejects.toBe(failure)

    vi.mocked(runExportCommand).mockResolvedValueOnce({ stdout: '{invalid', stderr: '' })
    await expect(probeExportMedia('ffprobe.exe', 'clip.synthetic.mp4', new AbortController().signal)).rejects.toThrow(SyntaxError)
  })
})
