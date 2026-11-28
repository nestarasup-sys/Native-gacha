export const EDITOR_V6_PIPE_RAW_CAPTURE_DEFAULT_FRAME_COUNT = 150
export const EDITOR_V6_PIPE_RAW_CAPTURE_MAX_FRAME_COUNT = 600

export function editorV6PipeRawCaptureKind(value?: string): 'without-video' | 'with-video' | undefined {
  if (value === undefined) return undefined
  if (value === 'without-video' || value === 'with-video') return value
  throw Error('O tipo de captura bruta precisa ser without-video ou with-video.')
}

export function editorV6PipeRawCaptureFrameCount(value?: string): number {
  if (value === undefined) return EDITOR_V6_PIPE_RAW_CAPTURE_DEFAULT_FRAME_COUNT

  const frameCount = Number(value)
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > EDITOR_V6_PIPE_RAW_CAPTURE_MAX_FRAME_COUNT)
    throw Error(`A captura bruta precisa conter entre 1 e ${EDITOR_V6_PIPE_RAW_CAPTURE_MAX_FRAME_COUNT} quadros.`)

  return frameCount
}

export function editorV6PipeRawCaptureFirstFrame(
  kind: 'without-video' | 'with-video',
  partStartFrame: number,
  partEndFrame: number,
  offsetValue?: string,
  frameCount = EDITOR_V6_PIPE_RAW_CAPTURE_DEFAULT_FRAME_COUNT
): number {
  if (!Number.isSafeInteger(partStartFrame) || !Number.isSafeInteger(partEndFrame) || partEndFrame <= partStartFrame)
    throw Error('O intervalo da parte para captura bruta é inválido.')
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > EDITOR_V6_PIPE_RAW_CAPTURE_MAX_FRAME_COUNT)
    throw Error(`A captura bruta precisa conter entre 1 e ${EDITOR_V6_PIPE_RAW_CAPTURE_MAX_FRAME_COUNT} quadros.`)

  const offsetFrames = kind === 'with-video' && offsetValue !== undefined ? Number(offsetValue) : 0
  if (!Number.isSafeInteger(offsetFrames) || offsetFrames < 0)
    throw Error('O deslocamento da captura bruta precisa ser um número inteiro de quadros não negativo.')

  const firstFrame = partStartFrame + offsetFrames
  if (firstFrame + frameCount > partEndFrame)
    throw Error('A janela de captura bruta precisa caber dentro da parte exportada.')

  return firstFrame
}
