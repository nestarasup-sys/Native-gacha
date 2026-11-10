import { runExportCommand } from './exportProcess'

export type MediaProbe = {
  streams: Array<{
    codec_type: string
    codec_name: string
    profile?: string
    pix_fmt?: string
    width?: number
    height?: number
    r_frame_rate?: string
    time_base?: string
    has_b_frames?: number
    nb_read_frames?: string
    nb_read_packets?: string
    nb_frames?: string
    duration?: string
    extradata_hash?: string
  }>
  format: { duration?: string }
}

export async function probeExportMedia(ffprobe: string, path: string, signal: AbortSignal, count: boolean | 'packets' = false): Promise<MediaProbe> {
  const countArgs = count === 'packets' ? ['-count_packets'] : count ? ['-count_frames'] : []
  const result = await runExportCommand(ffprobe, ['-v', 'error', ...countArgs, '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path], signal)
  return JSON.parse(result.stdout) as MediaProbe
}
