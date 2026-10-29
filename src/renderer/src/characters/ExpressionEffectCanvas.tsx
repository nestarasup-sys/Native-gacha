import { useEffect, useRef } from 'react'
import type { FaceExpressionEffects, FabricatorProject } from '../../../shared/fabricator'
import { drawFaceExpressionEffects, type ExpressionEffectMouthPlacement, type ExpressionEffectPhase } from './expressionEffectRender'

type HeadPart = FabricatorProject['parts'][number]

type ExpressionEffectCanvasProps = {
  head: HeadPart
  modelSlot: number
  effects: FaceExpressionEffects
  phase: Exclude<ExpressionEffectPhase, 'all'>
  mouthPlacement?: ExpressionEffectMouthPlacement
  mouthBlushEnabled?: boolean
  mouthBlushColor?: string
  mouthBlushOpacity?: number
  className: string
}

/** Canvas-backed effect preview shared by Preset DEV and its transition workspace. */
export function ExpressionEffectCanvas({ head, modelSlot, effects, phase, mouthPlacement, mouthBlushEnabled = true, mouthBlushColor, mouthBlushOpacity, className }: ExpressionEffectCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const width = Math.max(1, Math.round(head.width))
    const height = Math.max(1, Math.round(head.height))
    canvas.width = width
    canvas.height = height
    const target = canvas.getContext('2d')
    target?.clearRect(0, 0, width, height)

    const stagedCanvas = document.createElement('canvas')
    stagedCanvas.width = width
    stagedCanvas.height = height
    const stagedContext = stagedCanvas.getContext('2d')
    if (!stagedContext) return () => { cancelled = true }

    const artwork = { width: head.width, height: head.height }
    const previewHead = { ...head, x: 0, y: 0, rotation: 0 }
    const appearance = {
      modelSlot, eyeState: 0 as const, eyebrows: false, noseIndex: 0, expressionIndex: 0, mouthOpen: false,
      mouthBlushEnabled, mouthBlushColor, mouthBlushOpacity
    }
    void drawFaceExpressionEffects(stagedContext, artwork, previewHead, appearance, effects, phase, mouthPlacement).then(() => {
      if (cancelled) return
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, width, height)
      context.drawImage(stagedCanvas, 0, 0)
    })
    return () => { cancelled = true }
  }, [head, modelSlot, effects, phase, mouthPlacement?.x, mouthPlacement?.y, mouthPlacement?.rotation, mouthBlushEnabled, mouthBlushColor, mouthBlushOpacity])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
