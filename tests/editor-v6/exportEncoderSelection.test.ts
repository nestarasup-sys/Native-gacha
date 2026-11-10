import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'

import { encodingArgs } from '../../electron/domains/editorV6/exportEncoding'
import { createEditorV6EncoderProbe, selectEditorV6ExportEncoder, selectEditorV6FallbackEncoder } from '../../electron/domains/editorV6/exportEncoderSelection'

function createReport() {
  return {
    encoderTests: [] as Array<{ encoder: string; error?: string }>,
    phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 }
  }
}

describe('sondagem e seleção de codificador do Editor V6', () => {
  it('sonda um codificador e registra sucesso e tempo', async () => {
    const runCommand = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const signal = new AbortController().signal
    const report = createReport()
    const probe = createEditorV6EncoderProbe({ ffmpeg: 'ffmpeg.exe', signal, report, runCommand })

    await expect(probe('libx264')).resolves.toBe(true)

    const args = runCommand.mock.calls[0]?.[1]
    expect(runCommand).toHaveBeenCalledWith('ffmpeg.exe', expect.any(Array), signal)
    expect(args).toEqual(expect.arrayContaining(['color=c=black:s=320x180:r=30', ...encodingArgs('libx264', 1), '-frames:v', '1', '-f', 'null', '-']))
    expect(report.encoderTests).toEqual([{ encoder: 'libx264' }])
    expect(report.phaseMilliseconds.encoderProbe).toBeGreaterThanOrEqual(0)
  })

  it('registra erro comum como codificador indisponível', async () => {
    const failure = new Error('codificador indisponível')
    const signal = new AbortController().signal
    const report = createReport()
    const runCommand = vi.fn(async () => { throw failure })
    const probe = createEditorV6EncoderProbe({ ffmpeg: 'ffmpeg.exe', signal, report, runCommand })

    expect(signal.aborted).toBe(false)
    await expect(probe('h264_nvenc')).resolves.toBe(false)
    expect(report.encoderTests).toEqual([{ encoder: 'h264_nvenc', error: 'codificador indisponível' }])
  })

  it('propaga o motivo do cancelamento sem registrar o encoder como indisponível', async () => {
    const failure = new Error('exportação cancelada')
    const cancelled = new AbortController()
    cancelled.abort(failure)
    const cancelledReport = createReport()
    const runCommand = vi.fn(async () => { throw new Error('processo interrompido') })
    const cancelledProbe = createEditorV6EncoderProbe({ ffmpeg: 'ffmpeg.exe', signal: cancelled.signal, report: cancelledReport, runCommand })

    await expect(cancelledProbe('libx264')).rejects.toBe(failure)
    expect(cancelledReport.encoderTests).toEqual([])
  })

  it('preserva a ordem de preferência e encerra na primeira sonda aceita', async () => {
    const probe = vi.fn(async (encoder: string) => encoder === 'h264_amf')

    await expect(selectEditorV6ExportEncoder('auto', probe)).resolves.toBe('h264_amf')

    expect(probe.mock.calls.map(([encoder]) => encoder)).toEqual(['h264_nvenc', 'h264_qsv', 'h264_amf'])
  })

  it('tenta os codificadores de CPU em ordem e retorna vazio quando nenhum funciona', async () => {
    const probe = vi.fn(async (encoder: string) => encoder === 'libopenh264')

    await expect(selectEditorV6ExportEncoder('cpu', probe)).resolves.toBe('libopenh264')
    expect(probe.mock.calls.map(([encoder]) => encoder)).toEqual(['libx264', 'libopenh264'])

    const unavailable = vi.fn(async () => false)
    await expect(selectEditorV6ExportEncoder('cpu' satisfies EditorV6ExportOptions['encoder'], unavailable)).resolves.toBe('')
    expect(unavailable).toHaveBeenCalledTimes(2)
  })

  it('mantém CPU atual no fallback e só testa CPU quando a tentativa usou GPU', async () => {
    const probe = vi.fn(async (encoder: string) => encoder === 'libopenh264')

    await expect(selectEditorV6FallbackEncoder('libx264', probe)).resolves.toBe('libx264')
    expect(probe).not.toHaveBeenCalled()
    await expect(selectEditorV6FallbackEncoder('h264_nvenc', probe)).resolves.toBe('libopenh264')
    expect(probe.mock.calls.map(([encoder]) => encoder)).toEqual(['libx264', 'libopenh264'])
  })
})
