import type { EditorV6ExportOptions } from '../../../src/shared/editorV6Export'
import { addEditorV6PhaseTime } from './exportMetrics'
import { encodingArgs } from './exportEncoding'
import { runExportCommand } from './exportProcess'
import type { EditorV6ExportReport } from './exportReport'

export type EditorV6EncoderProbe = (encoder: string) => Promise<boolean>
type ProbeDependencies = {
  ffmpeg: string
  signal: AbortSignal
  report: Pick<EditorV6ExportReport, 'encoderTests' | 'phaseMilliseconds'>
  runCommand?: typeof runExportCommand
}

/** Runs one tiny real encoder probe and records its status and elapsed time. */
export function createEditorV6EncoderProbe({ ffmpeg, signal, report, runCommand = runExportCommand }: ProbeDependencies): EditorV6EncoderProbe {
  return async (encoder) => {
    const probeStarted = performance.now()
    try {
      await runCommand(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30', '-frames:v', '1', ...encodingArgs(encoder, 1), '-an', '-f', 'null', '-'], signal)
      report.encoderTests.push({ encoder })
      return true
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted()
      report.encoderTests.push({ encoder, error: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      addEditorV6PhaseTime(report, 'encoderProbe', probeStarted)
    }
  }
}

export async function selectEditorV6ExportEncoder(preference: EditorV6ExportOptions['encoder'], probe: EditorV6EncoderProbe): Promise<string> {
  const candidates = preference === 'auto'
    ? ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_mf', 'libx264', 'libopenh264']
    : ['libx264', 'libopenh264']
  for (const encoder of candidates) if (await probe(encoder)) return encoder
  return ''
}

export async function selectEditorV6FallbackEncoder(encoder: string, probe: EditorV6EncoderProbe): Promise<string> {
  if (encoder === 'libx264' || encoder === 'libopenh264') return encoder
  if (await probe('libx264')) return 'libx264'
  if (await probe('libopenh264')) return 'libopenh264'
  return ''
}
