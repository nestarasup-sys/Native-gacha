import type { AnimatorFrame } from '../../../../../shared/fabricator'

export function duplicateAnimatorFrame(
  frames: AnimatorFrame[],
  selectedFrameId: string,
  createId: () => string
): { frames: AnimatorFrame[]; frame: AnimatorFrame } | null {
  const selectedIndex = frames.findIndex((frame) => frame.id === selectedFrameId)
  if (selectedIndex < 0) return null

  const frame = { ...structuredClone(frames[selectedIndex]), id: createId() }
  const nextFrames = [...frames]
  nextFrames.splice(selectedIndex + 1, 0, frame)
  return { frames: nextFrames, frame }
}

export function deleteAnimatorFrame(
  frames: AnimatorFrame[],
  selectedFrameId: string
): { frames: AnimatorFrame[]; selectedFrame: AnimatorFrame } | null {
  const selectedIndex = frames.findIndex((frame) => frame.id === selectedFrameId)
  if (frames.length <= 1 || selectedIndex < 0) return null

  const nextFrames = frames.filter((frame) => frame.id !== selectedFrameId)
  const nextSelectedIndex = Math.max(0, selectedIndex - 1)
  return { frames: nextFrames, selectedFrame: nextFrames[nextSelectedIndex] }
}

export function reorderAnimatorFrame(
  frames: AnimatorFrame[],
  selectedFrameId: string,
  offset: -1 | 1
): { frames: AnimatorFrame[]; startTime: number } | null {
  const selectedIndex = frames.findIndex((frame) => frame.id === selectedFrameId)
  if (selectedIndex < 0) return null
  const targetIndex = selectedIndex + offset
  if (targetIndex < 0 || targetIndex >= frames.length) return null

  const nextFrames = [...frames]
  ;[nextFrames[selectedIndex], nextFrames[targetIndex]] = [nextFrames[targetIndex], nextFrames[selectedIndex]]
  const startTime = nextFrames.slice(0, targetIndex).reduce((sum, frame) => sum + frame.durationMs, 0)
  return { frames: nextFrames, startTime }
}

export function updateAnimatorFrameDuration(
  frames: AnimatorFrame[],
  selectedFrameId: string,
  value: number
): AnimatorFrame[] | null {
  if (!Number.isFinite(value)) return null
  const selected = frames.find((frame) => frame.id === selectedFrameId)
  if (!selected) return null

  const duration = Math.max(40, Math.min(10000, value))
  if (duration === selected.durationMs) return null
  return frames.map((frame) => frame.id === selectedFrameId ? { ...frame, durationMs: duration } : frame)
}

export function animatorFrameStartTime(frames: AnimatorFrame[], frame: AnimatorFrame): number {
  const index = frames.indexOf(frame)
  return frames.slice(0, index).reduce((sum, item) => sum + item.durationMs, 0)
}
