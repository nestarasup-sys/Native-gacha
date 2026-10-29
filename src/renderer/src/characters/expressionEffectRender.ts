import type { CustomizerFaceAppearance } from '../../../shared/customizer'
import type { FaceExpressionEffect, FaceExpressionEffects, FaceTransform, FabricatorProject } from '../../../shared/fabricator'

type Artwork = Pick<FabricatorProject, 'width' | 'height'>
type HeadPart = FabricatorProject['parts'][number]

export type ExpressionEffectPhase = 'underlay' | 'mouth' | 'all'
export type ExpressionEffectMouthPlacement = Pick<FaceTransform, 'x' | 'y' | 'rotation'>
const headMaskCache = new Map<string, Promise<HTMLImageElement>>()

function loadHeadMask(source: string): Promise<HTMLImageElement> {
  const cached = headMaskCache.get(source)
  if (cached) {
    headMaskCache.delete(source)
    headMaskCache.set(source, cached)
    return cached
  }
  const image = new Image()
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a máscara da cabeça.'))
    image.src = source
  })
  headMaskCache.set(source, pending)
  while (headMaskCache.size > 8) headMaskCache.delete(headMaskCache.keys().next().value!)
  void pending.catch(() => { if (headMaskCache.get(source) === pending) headMaskCache.delete(source) })
  return pending
}

function rgba(hex: string, alpha: number) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '000000'
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${Math.max(0, Math.min(1, alpha))})`
}

function radialBlob(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, angle: number, effect: FaceExpressionEffect, alpha = 1) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.scale(Math.max(1, width / 2), Math.max(1, height / 2))
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1)
  gradient.addColorStop(0, rgba(effect.color, effect.opacity * alpha))
  const transparentAt = Math.max(.05, Math.min(1, .4 + effect.softness * .58))
  gradient.addColorStop(transparentAt, rgba(effect.color, 0))
  gradient.addColorStop(1, rgba(effect.color, 0))
  context.fillStyle = gradient
  context.fillRect(-1, -1, 2, 2)
  context.restore()
}

export function drawExpressionEffectBlob(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, rotation: number, effect: FaceExpressionEffect, alpha = 1) {
  radialBlob(context, x, y, width, height, rotation * Math.PI / 180, effect, alpha)
}

/** Paints one face-effect phase so both the preset preview and final render share identical geometry. */
export async function drawFaceExpressionEffects(
  context: CanvasRenderingContext2D,
  artwork: Artwork,
  head: HeadPart,
  appearance: CustomizerFaceAppearance,
  effects?: FaceExpressionEffects,
  phase: ExpressionEffectPhase = 'all',
  mouthPlacement?: ExpressionEffectMouthPlacement
): Promise<void> {
  const drawUnderlay = phase !== 'mouth'
  const drawMouth = phase !== 'underlay'
  const mouthEffect = effects?.mouthBlush
  const mouthBlush: FaceExpressionEffect | undefined = drawMouth && appearance.mouthBlushEnabled && mouthEffect?.enabled !== false
    ? {
      softness: .78, size: .12, width: .12, height: .0624, rotation: 0, offsetY: 0, aspectRatio: .52,
      ...mouthEffect,
      color: appearance.mouthBlushColor ?? mouthEffect?.color ?? '#e86388',
      opacity: appearance.mouthBlushOpacity ?? mouthEffect?.opacity ?? .38,
      enabled: true
    }
    : undefined
  const hasUnderlayEffects = drawUnderlay && Boolean(effects && (
    effects.shadow.enabled && effects.shadow.opacity > 0
    || effects.blush.enabled && effects.blush.opacity > 0
  ))
  const hasMouthEffect = Boolean(mouthBlush?.enabled && mouthBlush.opacity > 0 && mouthPlacement)
  if (!hasUnderlayEffects && !hasMouthEffect) return

  const layer = document.createElement('canvas')
  layer.width = context.canvas.width
  layer.height = context.canvas.height
  const paint = layer.getContext('2d')
  if (!paint) return
  paint.setTransform(layer.width / artwork.width, 0, 0, layer.height / artwork.height, 0, 0)
  const cx = head.x + head.width / 2
  const cy = head.y + head.height / 2

  if (drawUnderlay) {
    const shadow = effects?.shadow
    if (shadow?.enabled && shadow.opacity > 0 && shadow.size > 0) {
      const extent = head.height * shadow.size
      const startY = head.y + shadow.offsetY * head.height
      const gradient = paint.createLinearGradient(0, startY, 0, startY + extent)
      gradient.addColorStop(0, rgba(shadow.color, shadow.opacity * .78))
      gradient.addColorStop(Math.max(.05, 1 - shadow.softness), rgba(shadow.color, shadow.opacity * .6))
      gradient.addColorStop(1, rgba(shadow.color, 0))
      paint.fillStyle = gradient
      paint.fillRect(head.x, startY, head.width, extent)
    }

    const blush = effects?.blush
    if (blush?.enabled && blush.opacity > 0) {
      const width = head.width * blush.size
      const height = head.height * blush.size * (blush.aspectRatio ?? .52)
      const x = cx + head.width * (blush.offsetX ?? 0)
      const y = cy + head.height * blush.offsetY
      const angle = head.rotation * Math.PI / 180
      switch (blush.style ?? 'cheeks') {
        case 'cheeks':
          radialBlob(paint, x - width * .23, y, width * .54, height * .82, angle, blush, .54)
          radialBlob(paint, x + width * .23, y, width * .54, height * .82, angle, blush, .54)
          break
        case 'bands':
          radialBlob(paint, x, y - height * .24, width * .92, height * .28, angle, blush, .44)
          radialBlob(paint, x, y, width * .96, height * .28, angle, blush, .38)
          radialBlob(paint, x, y + height * .24, width * .92, height * .28, angle, blush, .32)
          break
        case 'diagonal': radialBlob(paint, x, y, width * .92, height * .58, angle - .28, blush, .54); break
        case 'spot': radialBlob(paint, x, y, width * .62, height * .62, angle, blush, .68); break
        default: radialBlob(paint, x, y, width, height, angle, blush, .54)
      }
    }
  }

  if (mouthBlush?.enabled && mouthBlush.opacity > 0 && mouthPlacement) {
    const headAngle = head.rotation * Math.PI / 180
    const localX = mouthPlacement.x
    const localY = mouthPlacement.y
    const x = cx + (localX - head.width / 2) * Math.cos(headAngle) - (localY - head.height / 2) * Math.sin(headAngle) + head.width * (mouthBlush.offsetX ?? 0)
    const y = cy + (localX - head.width / 2) * Math.sin(headAngle) + (localY - head.height / 2) * Math.cos(headAngle) + head.height * mouthBlush.offsetY
    const width = mouthBlush.width ?? mouthBlush.size
    const height = mouthBlush.height ?? mouthBlush.size * (mouthBlush.aspectRatio ?? .52)
    const angle = headAngle + (mouthPlacement.rotation + (mouthBlush.rotation ?? 0)) * Math.PI / 180
    radialBlob(paint, x, y, head.width * width, head.height * height, angle, mouthBlush)
  }

  try {
    const mask = await loadHeadMask(head.dataUrl)
    paint.globalCompositeOperation = 'destination-in'
    paint.save()
    paint.translate(cx, cy)
    paint.rotate(head.rotation * Math.PI / 180)
    paint.drawImage(mask, -head.width / 2, -head.height / 2, head.width, head.height)
    paint.restore()
  } catch { return }

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(layer, 0, 0)
  context.restore()
}
