export const EDITOR_V6_MOTION_ATLAS_BUDGET_ERROR = 'EDITOR_V6_MOTION_ATLAS_BUDGET'

export type EditorV6MotionAtlasBudget = {
  width: number
  height: number
  pixels: number
  limitPixels: number
}

/** Stable IPC-safe marker lets export omit one optional transition without swallowing other failures. */
export function editorV6MotionAtlasBudgetError(details: EditorV6MotionAtlasBudget): Error {
  const payload = [details.width, details.height, details.pixels, details.limitPixels].join(':')
  return new Error(`${EDITOR_V6_MOTION_ATLAS_BUDGET_ERROR}:${payload}:A transição excede o orçamento seguro do atlas em resolução nativa; nenhuma imagem foi reduzida.`)
}

export function parseEditorV6MotionAtlasBudgetError(error: unknown): EditorV6MotionAtlasBudget | undefined {
  const message = error instanceof Error ? error.message : String(error)
  const match = new RegExp(`^${EDITOR_V6_MOTION_ATLAS_BUDGET_ERROR}:(\\d+):(\\d+):(\\d+):(\\d+)(?=:|$)`).exec(message)
  if (!match) return undefined
  const [width, height, pixels, limitPixels] = match.slice(1).map(Number)
  if (![width, height, pixels, limitPixels].every(Number.isSafeInteger) || width < 1 || height < 1 || pixels < 1 || limitPixels < 1) return undefined
  if (pixels <= limitPixels && width <= 4096 && height <= 4096) return undefined
  return { width, height, pixels, limitPixels }
}
