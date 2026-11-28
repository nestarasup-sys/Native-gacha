import { EDITOR_V6_TIMELINE_FPS } from '../../../../shared/editorV6Timing'

export function editorV6ExportFramesToSeconds(value: number): number {
  return Number((value / EDITOR_V6_TIMELINE_FPS).toFixed(4))
}

export function editorV6ExportSecondsToFrames(value: string, maximum = 1_000_000): number {
  return Math.max(0, Math.min(maximum, Math.round(Number(value) * EDITOR_V6_TIMELINE_FPS) || 0))
}
