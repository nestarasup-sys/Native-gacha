import type { EditorV6VideoOverlay } from '../../../src/shared/editorV6VideoComposition'

export const editorV6OutputColorFilter = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709'

export type EditorV6VideoCompositionInput = {
  clips: readonly EditorV6VideoOverlay[]
  mediaPaths: readonly string[]
  partStartFrame: number
  width: number
  height: number
  layeredVideo: boolean
}

export type EditorV6VideoComposition = {
  videoInputs: string[]
  filterArgs: string[]
  rawHeight: number
}

/** Builds FFmpeg inputs and filters in the same z-order as the timeline video plan. */
export function buildEditorV6VideoComposition({ clips, mediaPaths, partStartFrame, width, height, layeredVideo }: EditorV6VideoCompositionInput): EditorV6VideoComposition {
  const videoInputs = clips.flatMap((clip, index) => ['-ss', String(clip.mediaInFrame / 30), '-t', String((clip.endFrame - clip.startFrame) / 30), '-i', mediaPaths[index]])
  const filters = layeredVideo
    ? ['[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]', '[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]']
    : ['[0:v]setsar=1[base]']
  let lastVideo = 'base'

  clips.forEach((clip, index) => {
    const offset = (clip.startFrame - partStartFrame) / 30
    const end = (clip.endFrame - partStartFrame) / 30
    const output = `mix${index}`
    const boxWidth = clip.layout.width * width / 100
    const boxHeight = clip.layout.height * height / 100
    const centerX = (50 + clip.layout.x) * width / 100
    const centerY = (50 + clip.layout.y) * height / 100
    const rotation = clip.layout.rotation * Math.PI / 180
    filters.push(`[${index + 1}:v:0]scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=rgba,rotate=${rotation}:ow=rotw(iw):oh=roth(ih):c=none,setpts=PTS-STARTPTS+${offset}/TB[clip${index}]`)
    filters.push(`[${lastVideo}][clip${index}]overlay=x='${centerX}-overlay_w/2':y='${centerY}-overlay_h/2':enable='gte(t,${offset})*lt(t,${end})':eof_action=pass:repeatlast=0[${output}]`)
    lastVideo = output
  })

  if (layeredVideo) {
    filters.push(`[${lastVideo}][fg]overlay=0:0:format=auto:eof_action=pass:repeatlast=1[mixed]`)
    lastVideo = 'mixed'
  }
  filters.push(`[${lastVideo}]${editorV6OutputColorFilter}[vout]`)

  return {
    videoInputs,
    filterArgs: ['-filter_complex', filters.join(';'), '-map', '[vout]'],
    rawHeight: height * (layeredVideo ? 2 : 1)
  }
}
