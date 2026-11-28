import type { EditorV6SceneElement } from '../../../../shared/editorV6'
import { getBalloonGeometry } from './speechBalloonPath'
import { fitSceneText, wrapSceneText } from './sceneTextLayout'

const BODY_FONT = { family: 'Arial, sans-serif', weight: 600 }
const SPEAKER_FONT = { family: 'Georgia, serif', weight: 700 }
const LINE_HEIGHT = 1.22
const MAX_LAYOUT_CACHE = 512
const layoutCache = new Map<string, BalloonAutoFitLayout>()

export type BalloonAutoFitLayout = {
  height: number
  compact?: boolean
  fontSize?: number
  englishFontSize?: number
  portugueseFontSize?: number
}

type BalloonPanelLayout = { height: number; fontSize?: number }

function fitsBalloonPanel(
  element: EditorV6SceneElement,
  width: number,
  height: number,
  text: string,
  fontSize: number,
  targetX: number,
  targetY: number
): boolean {
  const geometry = getBalloonGeometry(element.kind as 'speech' | 'thought', width, height, targetX, targetY, true)
  const safeWidth = Math.max(1, geometry.text.right - geometry.text.left)
  const safeHeight = Math.max(1, geometry.text.bottom - geometry.text.top)
  const speakerName = element.speakerName?.trim()
  const titleLines = speakerName
    ? wrapSceneText(speakerName, safeWidth, fontSize * 0.76, 1, SPEAKER_FONT)
    : []
  const titleHeight = titleLines.length
    ? fontSize * 0.76 * 1.18 + Math.max(3, fontSize * 0.14)
    : 0
  const bodyLines = wrapSceneText(text, safeWidth, fontSize, 10000, BODY_FONT)
  const requiredHeight = titleHeight + Math.max(1, bodyLines.length) * fontSize * LINE_HEIGHT
  return requiredHeight <= safeHeight
}

function compactPanelHeight(
  element: EditorV6SceneElement,
  width: number,
  maximumHeight: number,
  text: string,
  targetX: number,
  targetYAtHeight: (height: number) => number
): BalloonPanelLayout {
  const maximumGeometry = getBalloonGeometry(element.kind as 'speech' | 'thought', width, maximumHeight, targetX, targetYAtHeight(maximumHeight), true)
  const maximumSafeWidth = Math.max(1, maximumGeometry.text.right - maximumGeometry.text.left)
  const maximumSafeHeight = Math.max(1, maximumGeometry.text.bottom - maximumGeometry.text.top)
  const maximumFontSize = Math.max(8, Math.min(31, maximumSafeWidth * 0.085))
  const speakerName = element.speakerName?.trim()
  const maximumTitleLines = speakerName
    ? wrapSceneText(speakerName, maximumSafeWidth, maximumFontSize * 0.76, 1, SPEAKER_FONT)
    : []
  const maximumTitleHeight = maximumTitleLines.length
    ? maximumFontSize * 0.76 * 1.18 + Math.max(3, maximumFontSize * 0.14)
    : 0
  const maximumTextFit = fitSceneText(
    text,
    maximumSafeWidth,
    Math.max(1, maximumSafeHeight - maximumTitleHeight),
    maximumFontSize,
    8,
    BODY_FONT,
    LINE_HEIGHT
  )
  const allMaximumLines = wrapSceneText(text, maximumSafeWidth, maximumTextFit.fontSize, 10000, BODY_FONT)
  if (allMaximumLines.length > maximumTextFit.lines.length) return { height: maximumHeight }

  const fontSize = maximumTextFit.fontSize
  if (!fitsBalloonPanel(element, width, maximumHeight, text, fontSize, targetX, targetYAtHeight(maximumHeight))) return { height: maximumHeight }
  let low = 0
  let high = maximumHeight
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidate = (low + high) / 2
    if (fitsBalloonPanel(element, width, candidate, text, fontSize, targetX, targetYAtHeight(candidate))) high = candidate
    else low = candidate
  }
  return { height: high, fontSize }
}

/** Shrinks the drawn balloon to its text while treating the saved element size as a maximum. */
function computeEditorV6BalloonAutoFitLayout(element: EditorV6SceneElement, width: number, maximumHeight: number): BalloonAutoFitLayout {
  if ((element.kind !== 'speech' && element.kind !== 'thought') || !Number.isFinite(width) || !Number.isFinite(maximumHeight)) return { height: maximumHeight }
  const safeWidth = Math.max(1, width)
  const safeMaximumHeight = Math.max(1, maximumHeight)
  const targetX = element.speakerAnchorX ?? 0
  const targetY = element.speakerAnchorY ?? -1

  if (element.englishText === undefined) {
    const panel = compactPanelHeight(element, safeWidth, safeMaximumHeight, element.text, targetX, () => targetY)
    return { height: panel.height, compact: true, ...(panel.fontSize ? { fontSize: panel.fontSize } : {}) }
  }

  const gap = Math.min(6, safeMaximumHeight * 0.05)
  const maximumPanelHeight = Math.max(1, (safeMaximumHeight - gap) / 2)
  const panelGap = (height: number) => Math.min(6, (height * 2 + gap) * 0.05)
  const englishHeight = compactPanelHeight(
    element,
    safeWidth,
    maximumPanelHeight,
    element.englishText,
    targetX,
    (height) => targetY + (height + panelGap(height)) / 2
  )
  const portugueseHeight = compactPanelHeight(element, safeWidth, maximumPanelHeight, element.text, 0, () => -1)
  return {
    height: Math.min(safeMaximumHeight, Math.max(1, Math.max(englishHeight.height, portugueseHeight.height) * 2 + gap)),
    compact: true,
    ...(englishHeight.fontSize ? { englishFontSize: englishHeight.fontSize } : {}),
    ...(portugueseHeight.fontSize ? { portugueseFontSize: portugueseHeight.fontSize } : {})
  }
}

export function editorV6BalloonAutoFitLayout(element: EditorV6SceneElement, width: number, maximumHeight: number): BalloonAutoFitLayout {
  if ((element.kind !== 'speech' && element.kind !== 'thought') || !Number.isFinite(width) || !Number.isFinite(maximumHeight)) return { height: maximumHeight }
  const key = JSON.stringify([element.kind, element.text, element.englishText, element.speakerName, element.speakerAnchorX, element.speakerAnchorY, width, maximumHeight])
  const cached = layoutCache.get(key)
  if (cached) return cached
  const layout = computeEditorV6BalloonAutoFitLayout(element, width, maximumHeight)
  layoutCache.set(key, layout)
  if (layoutCache.size > MAX_LAYOUT_CACHE) layoutCache.delete(layoutCache.keys().next().value!)
  return layout
}

export const editorV6BalloonAutoFitHeight = (element: EditorV6SceneElement, width: number, maximumHeight: number) =>
  editorV6BalloonAutoFitLayout(element, width, maximumHeight).height
