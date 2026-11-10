const x264Preset = () => {
  const stressX264Presets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium']
  const candidate = process.env.GACHA_EDITOR_V6_STRESS_X264_PRESET
  // Cold full-project A/B at 12 Mbps found ultrafast 6.4% faster with SSIM 0.9979,
  // PSNR 52.8 dB, and identical decoded audio versus veryfast.
  return process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1' && candidate && stressX264Presets.includes(candidate) ? candidate : 'ultrafast'
}

/** Stable H.264 arguments shared by export parts and encoder capability probes. */
export const encodingArgs = (encoder: string, threads: number) => [
  '-c:v', encoder,
  ...(encoder === 'libx264'
    ? ['-b:v', '12M', '-preset', x264Preset(), '-threads', String(threads)]
    : encoder === 'libopenh264'
      ? ['-b:v', '12M', '-rc_mode', 'quality', '-allow_skip_frames', '0', '-threads', String(threads)]
      : ['-b:v', '12M']),
  ...(encoder === 'h264_mf' ? ['-hw_encoding', '0'] : []),
  '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
  '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-profile:v', encoder === 'h264_mf' ? '100' : 'high',
  '-level:v', '4.1', '-g', '60', '-bf', '0', '-video_track_timescale', '30000'
]
