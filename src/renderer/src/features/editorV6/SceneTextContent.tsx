import { useMemo } from 'react'
import type { EditorV6SceneElement } from '../../../../shared/editorV6'
import { createSpeechBalloonPath, createThoughtBalloonPath, getBalloonGeometry } from './speechBalloonPath'
import { fitSceneText, wrapSceneText } from './sceneTextLayout'

const BODY_FONT = 'Arial, sans-serif'
const SPEAKER_FONT = 'Georgia, serif'
const BALLOON_FILL = '#ffffff'
const DEFAULT_OUTLINE = '#624d5b'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

type SceneTextProps = {
  element: EditorV6SceneElement
  width: number
  height: number
}

/** Draws the same SVG in the preview and in export. */
export function SceneTextContent({ element, width, height }: SceneTextProps) {
  if (element.englishText === undefined) return <BalloonText element={element} width={width} height={height} />
  const gap = Math.min(6, height * 0.05)
  const panelHeight = (height - gap) / 2
  const offset = (panelHeight + gap) / 2
  return <>
    <g lang="en" transform={`translate(0 ${-offset})`}>
      <BalloonText element={{
        ...element, id: `${element.id}-english`, text: element.englishText,
        balloonAutoFitFontSize: element.balloonAutoFitEnglishFontSize,
        speakerAnchorY: element.speakerAnchorY === undefined ? -1 : element.speakerAnchorY + offset
      }} width={width} height={panelHeight} />
    </g>
    <g lang="pt" transform={`translate(0 ${offset})`}>
      <BalloonText element={{ ...element, balloonAutoFitFontSize: element.balloonAutoFitPortugueseFontSize, speakerAnchorX: 0, speakerAnchorY: -1 }} width={width} height={panelHeight} />
    </g>
  </>
}

function BalloonText({ element, width, height }: SceneTextProps) {
  const isBalloon = element.kind === 'speech' || element.kind === 'thought'
  const speakerName = isBalloon ? element.speakerName?.trim() : undefined
  const targetX = element.speakerAnchorX ?? 0
  const targetY = element.speakerAnchorY ?? -1
  const compact = element.balloonAutoFitEnabled === true
  const geometry = useMemo(() => isBalloon
    ? getBalloonGeometry(element.kind as 'speech' | 'thought', width, height, targetX, targetY, compact)
    : undefined, [compact, element.kind, height, isBalloon, targetX, targetY, width])
  const safe = geometry?.text ?? { left: -width / 2 + 14, top: -height / 2 + 10, right: width / 2 - 14, bottom: height / 2 - 10 }
  const safeWidth = Math.max(1, safe.right - safe.left)
  const safeHeight = Math.max(1, safe.bottom - safe.top)
  const maxFontSize = element.balloonAutoFitFontSize ?? Math.max(8, Math.min(31, safeWidth * 0.085))
  const speakerFontSize = speakerName ? maxFontSize * 0.76 : 0
  const speakerLineHeight = speakerFontSize * 1.18
  const titleGap = speakerName ? Math.max(3, maxFontSize * 0.14) : 0
  const titleLines = useMemo(() => speakerName
    ? wrapSceneText(speakerName, safeWidth, speakerFontSize, 1, { family: SPEAKER_FONT, weight: 700 })
    : [], [safeWidth, speakerFontSize, speakerName])
  const titleHeight = titleLines.length ? speakerLineHeight + titleGap : 0
  const bodyHeight = Math.max(1, safeHeight - titleHeight)
  const minimumFontSize = element.balloonAutoFitFontSize === undefined ? 8 : maxFontSize
  const fittedText = useMemo(() => fitSceneText(element.text, safeWidth, bodyHeight, maxFontSize, minimumFontSize), [bodyHeight, element.text, maxFontSize, minimumFontSize, safeWidth])
  const fontSize = fittedText.fontSize
  const lines = fittedText.lines
  const lineHeight = fontSize * 1.22
  const contentHeight = titleHeight + lines.length * lineHeight
  const contentTop = titleHeight > 0
    ? safe.top
    : safe.top + Math.max(0, (safeHeight - contentHeight) / 2)
  const contentCenterX = (safe.left + safe.right) / 2
  const titleY = contentTop + speakerLineHeight / 2
  const bodyTop = contentTop + titleHeight
  const clipId = `v6-text-${element.id}`
  const outline = element.speakerColor ?? DEFAULT_OUTLINE
  const strokeWidth = clamp(Math.min(width, height) * 0.03, 1.8, 4.5)
  const thoughtDots = geometry?.thoughtDots ?? []

  return <>
    <defs>
      <clipPath id={clipId}>
        <rect x={safe.left} y={safe.top} width={safeWidth} height={safeHeight} rx={Math.min(safeWidth, safeHeight) * 0.12} />
      </clipPath>
    </defs>
    <g data-balloon-shape="true">
      {element.kind === 'speech' ? <path
        d={createSpeechBalloonPath(width, height, targetX, targetY, compact)}
        fill={BALLOON_FILL}
        stroke={outline}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      /> : element.kind === 'thought' ? <>
        <path d={createThoughtBalloonPath(width, height, targetX, targetY, compact)} fill={BALLOON_FILL} stroke={outline} strokeWidth={strokeWidth} />
        {thoughtDots.map((dot, index) => <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.radius}
          fill={BALLOON_FILL}
          stroke={outline}
          strokeWidth={strokeWidth * 0.82}
        />)}
      </> : <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={16}
        fill={BALLOON_FILL}
        fillOpacity={0.94}
        stroke={outline}
        strokeWidth={strokeWidth}
      />}
    </g>
    <g data-balloon-content="true" clipPath={`url(#${clipId})`}>
      {titleLines.length > 0 && <text
        data-balloon-speaker="true"
        x={contentCenterX}
        y={titleY}
        fontFamily={SPEAKER_FONT}
        fontSize={speakerFontSize}
        fontWeight={700}
        letterSpacing="0.15"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={outline}
      >{titleLines[0]}</text>}
      <text
        fontFamily={BODY_FONT}
        fontSize={fontSize}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#352d35"
      >
        {lines.map((line, index) => <tspan key={index} x={contentCenterX} y={bodyTop + lineHeight * (index + 0.5)}>{line}</tspan>)}
      </text>
    </g>
  </>
}
