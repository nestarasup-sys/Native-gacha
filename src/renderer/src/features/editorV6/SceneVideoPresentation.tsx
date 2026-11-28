import { memo, type SyntheticEvent } from 'react'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'
import { editorV6CardVideoSize } from '../../../../shared/editorV6VideoPresentation'
import { fitSceneText } from './sceneTextLayout'
import loadingFrames from './assets/loading-frames.png?inline'

const CARD_FONT = { family: 'Arial, sans-serif', weight: 700 }

function VideoCard({ text, width, height, y }: { text: string; width: number; height: number; y: number }) {
  const { fontSize, lines } = fitSceneText(text, width * 0.94, height * 0.84, Math.min(30, height * 0.56), 4, CARD_FONT, 1.12)
  const spacing = fontSize * 1.12
  return <g aria-label={text}>
    <rect x={-width / 2} y={y} width={width} height={height} rx={Math.min(12, height / 4)} fill="#301524" />
    <text textAnchor="middle" dominantBaseline="central" fontFamily={CARD_FONT.family} fontWeight={CARD_FONT.weight} fontSize={fontSize} fill="#fff">
      {lines.map((line, index) => <tspan key={index} x={0} y={y + height / 2 + (index - (lines.length - 1) / 2) * spacing}>{line}</tspan>)}
    </text>
  </g>
}

export const SceneVideoCards = memo(function SceneVideoCards({ cards, items, outputScale }: {
  cards?: EditorV6ResolvedScene['videoCards']
  items?: EditorV6ResolvedScene['videoCardItems']
  outputScale?: number
}) {
  if (!cards && !items?.length) return null
  const scale = outputScale ?? 1
  const independentPositions = new Set((items ?? []).map(card => card.position))
  const legacy = cards ? [{ position: 'top' as const, text: cards.timeCard, layout: cards.layout, aspect: cards.aspect }, { position: 'bottom' as const, text: cards.bottomCard, layout: cards.layout, aspect: cards.aspect }].filter(card => !independentPositions.has(card.position)) : []
  const englishVisible = independentPositions.has('english')
  const byPosition = new Map([...legacy, ...(items ?? [])].filter(card => card.text).map(card => [card.position, card]))
  return <>
    {[...byPosition.values()].map((card, index) => {
      const { layout, aspect, position, text } = card
      const size = editorV6CardVideoSize(layout.width * 19.2 * scale, layout.height * 10.8 * scale, aspect, outputScale !== undefined)
      const width = size.width / scale, height = size.height / scale
      const cardHeight = position === 'top' ? Math.min(52, width * 0.32) : Math.min(82, width * 0.44)
      const y = position === 'top' ? -height / 2 - cardHeight : height / 2 + (position === 'bottom' && englishVisible ? cardHeight : 0)
      return <g key={'blockId' in card ? `${card.blockId}-${position}` : `legacy-${index}`} pointerEvents="none" transform={`translate(${(50 + layout.x) * 19.2} ${(50 + layout.y) * 10.8}) rotate(${layout.rotation})`}>
        <VideoCard text={text!} width={width} height={cardHeight} y={y} />
      </g>
    })}
  </>
})

export function SceneVideoLoading({ frame, onImageLoad }: { frame: number; onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void }) {
  return <svg x={780} y={480} width={360} height={120} viewBox={`${frame * 360} 0 360 120`} overflow="hidden" pointerEvents="none" aria-label="Loading...">
    <image href={loadingFrames} width={1440} height={120} onLoad={onImageLoad} />
  </svg>
}
