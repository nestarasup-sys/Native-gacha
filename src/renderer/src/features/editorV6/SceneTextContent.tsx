import { useMemo } from 'react'
import type { EditorV6SceneElement } from '../../../../shared/editorV6'
import { createSpeechBalloonPath, createThoughtBalloonPath, createThoughtBalloonSketchPath } from './speechBalloonPath'
import { wrapSceneText } from './sceneTextLayout'

const FONT = 'Arial, sans-serif'

/** Renders the static SVG content for narrator text and speech/thought balloons. */
export function SceneTextContent({ element, width, height }: {
  element: EditorV6SceneElement
  width: number
  height: number
}) {
  const isBalloon = element.kind === 'speech' || element.kind === 'thought'
  const fontSize = Math.max(8, Math.min(32, height * .3, width / 2)), lineHeight = fontSize * 1.22
  const speakerName = isBalloon ? element.speakerName?.trim() : undefined
  const speakerFontSize = speakerName ? fontSize : 0
  const speakerMaxChars = speakerName ? Math.max(4, Math.floor((width - 32) / (speakerFontSize * .62))) : 0
  const speakerLabel = speakerName && speakerName.length > speakerMaxChars ? `${speakerName.slice(0, Math.max(1, speakerMaxChars - 1))}…` : speakerName
  const textInset = isBalloon ? Math.max(20, width * .045) : 16
  const textTop = -height / 2 + (isBalloon ? 6 : 8)
  const balloonBodyBottom = element.kind === 'speech'
    ? height / 2 - Math.min(height * .2, Math.max(0, height / 2 - Math.min(width * .22, height * .25)))
    : element.kind === 'thought' ? -height / 2 + height * .83 : height / 2 - 8
  const textSafeHeight = Math.max(0, balloonBodyBottom - textTop - (isBalloon ? 6 : 0))
  const maxTextLines = isBalloon
    ? Math.max(1, Math.floor((textSafeHeight - (speakerName ? speakerFontSize + 8 : 8)) / lineHeight))
    : Math.max(1, Math.floor((height - (speakerName ? speakerFontSize + 28 : 18)) / lineHeight))
  const lines = useMemo(() => wrapSceneText(element.text, Math.max(1, width - textInset * 2), fontSize, maxTextLines), [element.text, width, textInset, fontSize, maxTextLines])
  const clipId = `v6-text-${element.id}`
  const balloonOutlineColor = element.speakerColor ?? '#624d5b'

  return <>
    {element.kind === 'speech' ? <path d={createSpeechBalloonPath(width, height)} fill="#ffffff" stroke={balloonOutlineColor} strokeWidth={5} strokeLinejoin="round" />
      : element.kind === 'thought' ? <><path d={createThoughtBalloonPath(width, height)} fill="#ffffff" stroke={balloonOutlineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /><path d={createThoughtBalloonSketchPath(width, height)} fill="none" stroke={balloonOutlineColor} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" opacity={.9} /></>
        : <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={16} fill="#ffffff" fillOpacity={.94} stroke={balloonOutlineColor} strokeWidth={2} />}
    <defs><clipPath id={clipId}><rect x={-width / 2 + (isBalloon ? textInset : 10)} y={textTop} width={Math.max(0, width - (isBalloon ? textInset * 2 : 20))} height={isBalloon ? textSafeHeight : height - 16} rx={isBalloon ? Math.min(width, height) * .12 : 0} /></clipPath></defs>
    {speakerLabel && <text x={0} y={-height / 2 + 8 + speakerFontSize / 2} fontFamily={FONT} fontSize={speakerFontSize} fontWeight={750} textAnchor="middle" dominantBaseline="middle" fill={element.speakerColor ?? '#624d5b'} clipPath={`url(#${clipId})`}>{speakerLabel}</text>}
    <text fontFamily={FONT} fontSize={fontSize} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="#352d35" clipPath={`url(#${clipId})`}>
      {lines.map((line, index) => <tspan key={index} x={0} y={speakerName ? -height / 2 + 12 + speakerFontSize + lineHeight * (.5 + index) : (index - (lines.length - 1) / 2) * lineHeight}>{line}</tspan>)}
    </text>
  </>
}
