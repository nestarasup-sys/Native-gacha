import type { EditorV6VideoOverlay } from '../../../src/shared/editorV6VideoComposition'
import { EDITOR_V6_TIMELINE_FPS } from '../../../src/shared/editorV6Timing'
import { editorV6CardVideoSize } from '../../../src/shared/editorV6VideoPresentation'

export const editorV6OutputColorFilter = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709'
export type EditorV6VideoCompositionInput = {
  clips: readonly EditorV6VideoOverlay[]
  mediaPaths: readonly string[]
  partStartFrame: number
  width: number
  height: number
  layeredVideo: boolean
  inputFrameRate?: number
  qualityReference?: { frames: readonly number[]; outputPath: string }
}

export type EditorV6VideoComposition = {
  videoInputs: string[]
  filterArgs: string[]
  qualityOutputArgs?: string[]
  rawHeight: number
}

/** Builds FFmpeg inputs and filters in the same z-order as the timeline video plan. */
export function buildEditorV6VideoComposition({ clips, mediaPaths, partStartFrame, width, height, layeredVideo, inputFrameRate, qualityReference }: EditorV6VideoCompositionInput): EditorV6VideoComposition {
  const videoInputs = clips.flatMap((clip, index) => ['-ss', String(clip.mediaInFrame / EDITOR_V6_TIMELINE_FPS), '-t', String((clip.endFrame - clip.startFrame) / EDITOR_V6_TIMELINE_FPS), '-i', mediaPaths[index]])
  const normalizeInputFrameRate = inputFrameRate === undefined ? '' : `fps=${inputFrameRate},`
  const filters = layeredVideo
    ? inputFrameRate === undefined
      ? ['[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]', '[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]']
      : [
        `[0:v]${normalizeInputFrameRate}split=2[rawbase][rawfg]`,
        '[rawbase]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]',
        '[rawfg]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]'
      ]
    : [`[0:v]${normalizeInputFrameRate}setsar=1[base]`]
  let lastVideo = 'base'

  clips.forEach((clip, index) => {
    const offset = (clip.startFrame - partStartFrame) / EDITOR_V6_TIMELINE_FPS
    const end = (clip.endFrame - partStartFrame) / EDITOR_V6_TIMELINE_FPS
    const output = `mix${index}`
    const boxWidth = clip.layout.width * width / 100
    const boxHeight = clip.layout.height * height / 100
    const centerX = (50 + clip.layout.x) * width / 100
    const centerY = (50 + clip.layout.y) * height / 100
    const rotation = clip.layout.rotation * Math.PI / 180
    // A card measures the visible video, so use the same size and rotation
    // origin as the SVG. Keep the existing filter for undecorated clips.
    const size = clip.cardVideoSize && editorV6CardVideoSize(boxWidth, boxHeight, clip.cardVideoSize.aspect, true)
    const scale = size ? `${size.width}:${size.height}` : `${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`
    const rotate = size
      ? rotation === 0 ? '' : `,rotate=${rotation}:ow=ceil(rotw(${rotation})):oh=ceil(roth(${rotation})):c=none`
      : `,rotate=${rotation}:ow=rotw(iw):oh=roth(ih):c=none`
    filters.push(`[${index + 1}:v:0]scale=${scale},setsar=1,format=rgba${rotate},setpts=PTS-STARTPTS+${offset}/TB[clip${index}]`)
    filters.push(`[${lastVideo}][clip${index}]overlay=x='${centerX}-overlay_w/2':y='${centerY}-overlay_h/2':enable='gte(t,${offset})*lt(t,${end})':eof_action=pass:repeatlast=0[${output}]`)
    lastVideo = output
  })

  if (layeredVideo) {
    filters.push(`[${lastVideo}][fg]overlay=0:0:format=auto:eof_action=pass:repeatlast=1[mixed]`)
    lastVideo = 'mixed'
  }
  const qualitySelect = qualityReference?.frames.length
    ? `select=${qualityReference.frames.map(frame => `eq(n\\,${frame})`).join('+')}`
    : undefined
  filters.push(qualitySelect
    ? `[${lastVideo}]${editorV6OutputColorFilter},split=2[vout][qualitysource];[qualitysource]${qualitySelect}[quality]`
    : `[${lastVideo}]${editorV6OutputColorFilter}[vout]`)

  return {
    videoInputs,
    filterArgs: ['-filter_complex', filters.join(';'), '-map', '[vout]'],
    ...(qualityReference?.frames.length ? { qualityOutputArgs: [
      '-map', '[quality]',
      '-fps_mode', 'passthrough', '-pix_fmt', 'bgra',
      '-f', 'rawvideo', qualityReference.outputPath
    ] } : {}),
    rawHeight: height * (layeredVideo ? 2 : 1)
  }
}
