import { memo, type SyntheticEvent } from 'react'
import type { EditorV6IntroClip } from '../../../../shared/editorV6Intro'
import { SceneImageContent } from './SceneImageContent'
import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import type { EditorV6Asset, EditorV6SceneElement } from '../../../../shared/editorV6'
import { resolveEditorV6IntroPortrait } from '../../../../shared/editorV6Intro'
import { fitSceneText } from './sceneTextLayout'
import type { SceneSurfaceInteraction } from './SceneVideoLayer'

const IntroText = memo(function IntroText({ text, x, y, width, height, color, maxFontSize }: {
  text: string; x: number; y: number; width: number; height: number; color: string; maxFontSize: number
}) {
  const { fontSize, lines } = fitSceneText(text, width, height, maxFontSize, 12)
  const lineHeight = fontSize * 1.22
  return <text x={x} y={y - (lines.length - 1) * lineHeight / 2} textAnchor="middle"
    dominantBaseline="central" fontFamily="Arial, sans-serif" fontWeight={600} fontSize={fontSize} fill={color}>
    {lines.map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}
  </text>
})

export const SceneIntro = memo(function SceneIntro({ intro, backgroundColor, portrait, character, mouthAsset, rasterCanvas, frame, blockId, selected, locked, interaction, onImageLoad }: {
  intro: EditorV6IntroClip
  backgroundColor: string
  portrait?: EditorV6Asset
  character?: EditorV6SceneElement
  mouthAsset?: EditorV6Asset
  rasterCanvas?: HTMLCanvasElement
  frame?: number
  blockId?: string
  selected?: boolean
  locked?: boolean
  interaction?: SceneSurfaceInteraction
  onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void
}) {
  if (intro.kind === 'black') return <g aria-label="Tela preta">
    <rect width={1920} height={1080} fill="#000000" />
    <IntroText text={intro.text} x={960} y={540} width={1600} height={880} color="#ffffff" maxFontSize={76} />
  </g>
  const layout = resolveEditorV6IntroPortrait(intro)
  const x = (50 + layout.x) * 19.2, y = (50 + layout.y) * 10.8
  const sx = layout.characterScale * layout.characterWidthScale / 10_000
  const sy = layout.characterScale * layout.characterHeightScale / 10_000
  const interactive = interaction && blockId
  const animated = intro.portraitAspect || character?.motionSprite || rasterCanvas
  const size = animated && character ? editorV6ElementSize(character) : undefined
  const animatedTransform = size && character && `translate(${(50 + character.x) * 19.2} ${(50 + character.y) * 10.8}) rotate(${character.rotation})`
  const portraitLayer = (portrait || rasterCanvas) && <g key="portrait"
    transform={animatedTransform ?? `translate(${x} ${y}) rotate(${layout.rotation}) scale(${sx} ${sy})`}
    aria-label="Retrato da Intro" role={interactive ? 'button' : undefined}
    style={interactive ? { cursor: locked || layout.positionLocked ? 'default' : 'move', touchAction: 'none' } : undefined}
    onPointerDown={interactive ? event => interaction.start(event, 'intro:' + blockId) : undefined}
    onPointerMove={interactive ? interaction.move : undefined} onPointerUp={interactive ? interaction.end : undefined}
    onPointerCancel={interactive ? interaction.end : undefined}>
    {character && size
      ? <SceneImageContent element={character} asset={portrait} mouthAsset={mouthAsset}
        rasterCanvas={rasterCanvas} rasterFrame={frame} width={size.width * 19.2} height={size.height * 10.8}
        onImageLoad={onImageLoad} />
      : <image href={portrait?.dataUrl} x={-424} y={-492} width={848} height={984} preserveAspectRatio="xMidYMid meet"
        transform={layout.flipX ? 'scale(-1 1)' : undefined} onLoad={onImageLoad} />}
    {selected && interactive && <rect x={-424 * (size ? sx : 1)} y={-492 * (size ? sy : 1)} width={848 * (size ? sx : 1)} height={984 * (size ? sy : 1)} fill="none"
      stroke="#e84f88" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
  </g>
  return <g aria-label="Apresentação de personagem">
    <rect width={1920} height={1080} fill={backgroundColor} />
    {layout.zIndex === 0 && portraitLayer}
    <g key="card">
      <rect x={960} width={960} height={1080} fill="#ffffff" />
      <line x1={1040} x2={1840} y1={540} y2={540} stroke="#ddd5df" strokeWidth={2} />
      <IntroText text={intro.englishText} x={1440} y={290} width={800} height={420} color="#211721" maxFontSize={58} />
      <IntroText text={intro.text} x={1440} y={790} width={800} height={420} color="#211721" maxFontSize={58} />
    </g>
    {layout.zIndex === 1 && portraitLayer}
  </g>
})
