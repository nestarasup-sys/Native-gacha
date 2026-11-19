import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { prepareEditorV6MouthlessBaseAssets, type MotionMouthlessBaseFrame } from '../../src/renderer/src/features/editorV6/motion/motionMouthlessBaseAssets'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type Frame = MotionMouthlessBaseFrame

function canvas(width: number, height: number, dataUrl = 'data:canvas') {
  return { width, height, toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement
}

function frame(renderer: Renderer, dataUrl = 'data:frame'): Frame {
  return { canvas: canvas(20, 30, dataUrl), width: 20, height: 30, crop: { left: 1, top: 2, width: 18, height: 27 }, renderer, dispose: vi.fn() }
}

const from = { activeFaceMode: 'talk', faceAppearance: { expressionIndex: 0 }, faceTransforms: {}, activeExpressionEffects: undefined } as unknown as EditorV6Element

describe('Editor V6 mouthless base assets', () => {
  it('unions talk and talk-blink crops, writes both assets and preserves borrowed Canvases', async () => {
    const fullTalkCanvas = canvas(30, 40), fullBlinkCanvas = canvas(32, 45)
    const renderToCanvas = vi.fn().mockResolvedValueOnce({ canvas: fullTalkCanvas }).mockResolvedValueOnce({ canvas: fullBlinkCanvas })
    const renderer = { renderToCanvas } as unknown as Renderer
    const baseline = frame(renderer), isolated = frame(renderer, 'data:isolated'), talkBlink = frame(renderer, 'data:blink')
    const render = vi.fn(async (_progress: number, mode?: string) => mode === 'talk-blink' ? talkBlink : isolated)
    const cropCalls: Array<{ source: HTMLCanvasElement; bounds: unknown; result: HTMLCanvasElement }> = []
    const readCrop = vi.fn((source: HTMLCanvasElement) => source === fullTalkCanvas
      ? { left: 4, top: 6, width: 10, height: 12 }
      : { left: 2, top: 3, width: 16, height: 18 })
    const cropCanvas = vi.fn((source: HTMLCanvasElement, bounds: { left: number; top: number; width: number; height: number }) => {
      const result = canvas(bounds.width, bounds.height, source === isolated.canvas ? 'data:talk-base' : 'data:blink-base')
      cropCalls.push({ source, bounds, result })
      return result
    })
    const createId = vi.fn().mockReturnValueOnce('talk-id').mockReturnValueOnce('blink-id')

    const result = await prepareEditorV6MouthlessBaseAssets({ from, baseline, render, readCrop, cropCanvas, createId })

    expect(readCrop).toHaveBeenCalledWith(fullTalkCanvas, false, 0)
    expect(readCrop).toHaveBeenCalledWith(fullBlinkCanvas, false, 0)
    expect(result.sourceCrop).toEqual({ left: 2, top: 3, width: 16, height: 18 })
    expect(cropCalls.map(call => call.bounds)).toEqual([result.sourceCrop, result.sourceCrop])
    expect(result.assets.map(({ faceMode, asset }) => [faceMode, asset.id, asset.dataUrl])).toEqual([
      ['talk', 'talk-id', 'data:talk-base'], ['talk-blink', 'blink-id', 'data:blink-base']
    ])
    expect(isolated.dispose).toHaveBeenCalledOnce()
    expect(talkBlink.dispose).toHaveBeenCalledOnce()
    expect([fullTalkCanvas.width, fullTalkCanvas.height, fullBlinkCanvas.width, fullBlinkCanvas.height]).toEqual([30, 40, 32, 45])
    expect(cropCalls.map(call => [call.result.width, call.result.height])).toEqual([[1, 1], [1, 1]])
    expect(createId).toHaveBeenCalledTimes(2)
  })

  it('expands mouthless base crops to cover enlarged mouth pixels', async () => {
    const talkCanvas = canvas(80, 80), blinkCanvas = canvas(80, 80)
    const renderer = { renderToCanvas: vi.fn()
      .mockResolvedValueOnce({ canvas: talkCanvas })
      .mockResolvedValueOnce({ canvas: blinkCanvas }) } as unknown as Renderer
    const baseline = frame(renderer), isolated = frame(renderer)
    const cropCalls: Array<{ left: number; top: number; width: number; height: number }> = []
    const cropCanvas = vi.fn((_source: HTMLCanvasElement, bounds: { left: number; top: number; width: number; height: number }) => {
      cropCalls.push(bounds)
      return canvas(bounds.width, bounds.height)
    })
    const blink = frame(renderer)
    const render = vi.fn(async (_progress: number, mode?: string) => mode === 'talk-blink' ? blink : isolated)
    const result = await prepareEditorV6MouthlessBaseAssets({
      from, baseline, render,
      requiredCrop: { left: 14, top: 15, width: 12, height: 9 },
      readCrop: () => ({ left: 2, top: 3, width: 20, height: 24 }),
      cropCanvas
    })
    expect(result.sourceCrop).toEqual({ left: 2, top: 3, width: 24, height: 24 })
    expect(cropCalls).toEqual([result.sourceCrop, result.sourceCrop])
    expect(render.mock.calls.map(([, mode]) => mode)).toEqual(['talk', 'talk-blink'])
    expect(blink.dispose).toHaveBeenCalledOnce()
    expect(isolated.dispose).toHaveBeenCalledOnce()
    expect(baseline.dispose).not.toHaveBeenCalled()
  })

  it('reuses the talk base when talk-blink assets are unavailable', async () => {
    const renderToCanvas = vi.fn().mockResolvedValueOnce({ canvas: canvas(30, 40) }).mockRejectedValueOnce(Error('Blink precisa de olhos fechados correspondentes'))
    const renderer = { renderToCanvas } as unknown as Renderer
    const baseline = frame(renderer), isolated = frame(renderer, 'data:talk-base')
    const render = vi.fn(async (_progress: number, mode?: string) => {
      if (mode === 'talk-blink') throw Error('Blink precisa de olhos fechados correspondentes')
      return isolated
    })
    const cropCanvas = vi.fn(() => canvas(8, 9, 'data:mouthless-talk'))
    const createId = vi.fn().mockReturnValueOnce('talk-id').mockReturnValueOnce('fallback-blink-id')

    const result = await prepareEditorV6MouthlessBaseAssets({ from, baseline, render, readCrop: () => ({ left: 0, top: 0, width: 8, height: 9 }), cropCanvas, createId })

    expect(result.assets.map(({ faceMode, asset }) => [faceMode, asset.dataUrl])).toEqual([
      ['talk', 'data:mouthless-talk'], ['talk-blink', 'data:mouthless-talk']
    ])
    expect(isolated.dispose).toHaveBeenCalledOnce()
    expect(createId).toHaveBeenCalledTimes(2)
  })

  it('disposes the isolated baseline if a non-blink talk-blink render error escapes', async () => {
    const renderToCanvas = vi.fn().mockResolvedValueOnce({ canvas: canvas(30, 40) }).mockResolvedValueOnce({ canvas: canvas(32, 45) })
    const renderer = { renderToCanvas } as unknown as Renderer
    const baseline = frame(renderer), isolated = frame(renderer)
    const render = vi.fn(async (_progress: number, mode?: string) => {
      if (mode === 'talk-blink') throw Error('Falha sintética ao renderizar a base com piscada')
      return isolated
    })

    await expect(prepareEditorV6MouthlessBaseAssets({ from, baseline, render, readCrop: () => ({ left: 0, top: 0, width: 8, height: 9 }), cropCanvas: () => canvas(8, 9) }))
      .rejects.toThrow('Falha sintética ao renderizar a base com piscada')
    expect(isolated.dispose).toHaveBeenCalledOnce()
    expect(baseline.dispose).not.toHaveBeenCalled()
  })
})
