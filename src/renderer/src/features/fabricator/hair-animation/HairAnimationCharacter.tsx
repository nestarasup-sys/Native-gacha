import { useEffect, useState, type CSSProperties, type MutableRefObject } from 'react'
import { getCharacterProportions, type CustomizerCharacter, type HairPartId } from '../../../../../shared/customizer'
import type { HairAsset, HairTransform, ModelPart } from '../../../../../shared/fabricator'
import { hairAppearanceStyleIds } from '../../../../../shared/hairCategories'
import { characterShapeScale, resolveSavedCharacterSource } from '../../../characters/characterSourceResolver'
import { HairMotionMesh } from './HairMotionMesh'
import { hairAnimationGeometry } from './hairAnimationGeometry'
import type { HairMotionSettings } from './hairMotionPhysics'
import type { HairSide } from '../hairWorkspaceModel'

type Layer = { part: HairPartId; side: HairSide; asset: HairAsset; transform: HairTransform }
type Preview = { dataUrl: string; overlayDataUrl?: string; width: number; height: number; artworkWidth: number; artworkHeight: number; scaleX: number; scaleY: number; sourceHead: ModelPart; targetHead: ModelPart; layers: Layer[] }
type Props = { character: CustomizerCharacter; physics: Omit<HairMotionSettings, 'enabled'>; enabled: Record<HairSide, boolean>; intensity: Record<HairSide, number>; playing: boolean; headX: MutableRefObject<number>; impulse: number; resetToken: number; position: { x: number; y: number }; zoom: number }

export function HairAnimationCharacter({ character, physics, enabled, intensity, playing, headX, impulse, resetToken, position, zoom }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setPreview(null); setError('')
    void (async () => {
      const [{ prepareSavedCharacterRenderer }, { loadCharacterTintedImage, resolvedHairColors }] = await Promise.all([
        import('../../../characters/editorV6CharacterRenderer'), import('../../../characters/characterRenderer')
      ])
      if (cancelled) return
      const resolved = await resolveSavedCharacterSource(character)
      if (cancelled) return
      const sourceHead = resolved.source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
      const targetHead = resolved.artwork.parts.find((part) => part.id === sourceHead?.id)
      if (!sourceHead || !targetHead) throw new Error('O modelo deste personagem não tem uma cabeça disponível.')
      const hairless = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
      const renderer = await prepareSavedCharacterRenderer(hairless, { source: resolved.source, artwork: resolved.sourceArtwork })
      let rendered: { dataUrl: string; overlayDataUrl?: string; width: number; height: number }
      try {
        if (cancelled) return
        const frame = await renderer.renderLayersToCanvas(undefined, undefined, undefined, 'idle')
        const canvas = document.createElement('canvas'); canvas.width = frame.outputWidth; canvas.height = frame.outputHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Não foi possível preparar as camadas do personagem.')
        const draw = (sources: Array<HTMLCanvasElement | null>) => {
          context.clearRect(0, 0, canvas.width, canvas.height)
          context.save(); context.translate(canvas.width / 2, canvas.height / 2); context.scale(frame.shapeScaleX, frame.shapeScaleY)
          for (const source of sources) if (source) context.drawImage(source, -frame.width / 2, -frame.height / 2)
          context.restore()
          return canvas.toDataURL('image/png')
        }
        const dataUrl = draw([frame.behindFace, frame.face])
        const overlayDataUrl = frame.inFrontOfFace ? draw([frame.inFrontOfFace]) : undefined
        rendered = { dataUrl, ...(overlayDataUrl ? { overlayDataUrl } : {}), width: canvas.width, height: canvas.height }
        canvas.width = canvas.height = 1
      } finally { renderer.dispose() }
      if (cancelled) return
      const appearance = character.customization.hairAppearance
      const references = appearance?.modelSlot === resolved.modelSlot ? hairAppearanceStyleIds(appearance) : []
      const ids = [...new Set(references.map((item) => item.id))]
      const styles = new Map((await Promise.all(ids.map(async (id) => [id, await window.desktop.fabricator.loadHairStyle(resolved.modelSlot, id)] as const))))
      if (cancelled) return
      const layers = (await Promise.all(references.map(async ({ id, side, part }): Promise<Layer | null> => {
        const style = styles.get(id), original = style?.[side], base = style?.transforms[side]
        const override = character.customization.partOverrides?.[`head:${part}`]
        if (override?.hidden) return null
        if (!original || !base) throw new Error(`Não foi possível carregar a camada de cabelo ${part} deste personagem.`)
        const transform = override ? { ...base, x: base.x + (override.x ?? 0), y: base.y + (override.y ?? 0), scaleX: base.scaleX * (override.scaleX ?? 1), scaleY: base.scaleY * (override.scaleY ?? 1), rotation: base.rotation + (override.rotation ?? 0) } : base
        const colors = resolvedHairColors(appearance, part)
        let dataUrl = original.dataUrl
        if (Object.keys(colors).length) {
          const image = await loadCharacterTintedImage(original.dataUrl, colors)
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Não foi possível aplicar as cores do cabelo.')
          context.drawImage(image, 0, 0); dataUrl = canvas.toDataURL('image/png')
        }
        return { part, side, asset: { ...original, dataUrl }, transform }
      }))).filter((layer): layer is Layer => layer !== null)
      const scale = characterShapeScale(getCharacterProportions(character.customization))
      if (!cancelled) setPreview({ ...rendered, artworkWidth: resolved.artwork.width, artworkHeight: resolved.artwork.height, scaleX: scale.x, scaleY: scale.y, sourceHead, targetHead, layers })
    })().catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o personagem.') })
    return () => { cancelled = true }
  }, [character])

  if (error) return <p role="alert" className="hair-animation-character-error">{error}</p>
  if (!preview) return <div className="hair-animation-overlay" role="status">Preparando personagem…</div>
  const { sourceHead, targetHead } = preview
  const artworkStyle: CSSProperties = { width: `${preview.artworkWidth / preview.width * 100}%`, height: `${preview.artworkHeight / preview.height * 100}%`, transform: `translate(-50%, -50%) scale(${preview.scaleX}, ${preview.scaleY})` }
  const headStyle: CSSProperties = { left: `${targetHead.x / preview.artworkWidth * 100}%`, top: `${targetHead.y / preview.artworkHeight * 100}%`, width: `${targetHead.width / preview.artworkWidth * 100}%`, height: `${targetHead.height / preview.artworkHeight * 100}%`, transform: `rotate(${targetHead.rotation}deg)` }
  const layersFor = (back: boolean) => preview.layers.filter((layer) => (layer.side === 'back') === back).map((layer, index) => <div key={`${layer.part}:${index}`} className="hair-animation-piece" style={{ ...hairAnimationGeometry(sourceHead, layer.asset, layer.transform), zIndex: index + 1 }}><HairMotionMesh source={layer.asset.dataUrl} name={`cabelo ${layer.part}`} settings={{ ...physics, enabled: enabled[layer.side] }} intensity={intensity[layer.side]} playing={playing} headX={headX} impulse={impulse} resetToken={resetToken} phase={index * 1.2 + (back ? 0 : 1.2)} flipped={Boolean(layer.transform.flipX)} /></div>)
  const artwork = (back: boolean) => <div className={`hair-animation-character-artwork ${back ? 'back' : 'front'}`} style={artworkStyle}><div className="hair-animation-character-head" style={headStyle}>{layersFor(back)}</div></div>
  return <div className="hair-animation-character" style={{ aspectRatio: `${preview.width} / ${preview.height}`, transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }}>
    {artwork(true)}<img className="hair-animation-character-image" src={preview.dataUrl} alt={`Personagem ${character.name}`} draggable={false} />{artwork(false)}{preview.overlayDataUrl && <img className="hair-animation-character-overlay" src={preview.overlayDataUrl} alt="" draggable={false} />}
    {!preview.layers.length && <div className="hair-animation-overlay">Este personagem não tem cabelo selecionado no Customizador.</div>}
  </div>
}
