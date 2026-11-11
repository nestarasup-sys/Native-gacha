import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'
import type { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { createEditorV6MotionFrameRenderer } from '../../src/renderer/src/features/editorV6/motion/motionFrameRenderer'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>

function createRenderer() {
  const canvas = { width: 32, height: 48 } as HTMLCanvasElement
  const mouthCanvas = { width: 8, height: 6 } as HTMLCanvasElement
  const layers = { behindFace: [], face: [] }
  const renderer = {
    canIsolateMouth: vi.fn(() => true),
    renderToCanvasWithLayers: vi.fn().mockResolvedValue({ canvas, width: 32, height: 48, layers }),
    renderToCanvas: vi.fn().mockResolvedValue({ canvas, width: 32, height: 48 }),
    renderMouthToCanvas: vi.fn().mockResolvedValue({ canvas: mouthCanvas, width: 8, height: 6 }),
    dispose: vi.fn()
  } as unknown as Renderer
  return { renderer, canvas, mouthCanvas, layers }
}

function createFrameRenderer(options: { renderer: Renderer; samePose?: boolean; mouthScaleSamples?: number[]; session?: { endpointRenderers: Map<string, Renderer> } }) {
  const crop = { left: 1, top: 2, width: 30, height: 45 }
  const readCrop = vi.fn(() => crop)
  const render = createEditorV6MotionFrameRenderer({
    request: { mouthScaleSamples: options.mouthScaleSamples } as EditorV6MotionBakeRequest,
    from: { kind: 'character', activeFaceMode: 'talk-blink', faceTransforms: {} } as EditorV6Element,
    to: { kind: 'character', activeFaceMode: 'talk-blink', faceTransforms: {} } as EditorV6Element,
    prepare: vi.fn(async () => options.renderer),
    samePose: options.samePose ?? true,
    session: options.session as never,
    readCrop
  })
  return { render, readCrop, crop }
}

describe('render de amostras de movimento', () => {
  it('renderiza corpo, camadas e boca isolada com o modo de transição compatível', async () => {
    const { renderer, canvas, mouthCanvas, layers } = createRenderer()
    const { render, readCrop, crop } = createFrameRenderer({ renderer, mouthScaleSamples: [1, 1.2] })

    const frame = await render(0.5, undefined, 1.2, true, undefined, false, true)

    expect(renderer.renderToCanvasWithLayers).toHaveBeenCalledWith(undefined, expect.objectContaining({ mouth: expect.objectContaining({ width: 120, height: 120 }) }), undefined, 'talk', { mouthLayer: 'without-mouth' })
    expect(renderer.renderToCanvas).not.toHaveBeenCalled()
    expect(renderer.renderMouthToCanvas).toHaveBeenCalledWith(undefined, expect.any(Object), undefined, 'talk')
    expect(readCrop).toHaveBeenNthCalledWith(1, canvas, true)
    expect(readCrop).toHaveBeenNthCalledWith(2, mouthCanvas, true, 0)
    expect(frame).toMatchObject({ canvas, layers, mouthCanvas, crop, mouthCrop: crop })
  })

  it('usa o render completo quando não captura camadas e libera renderer transitório', async () => {
    const { renderer } = createRenderer()
    const { render } = createFrameRenderer({ renderer, samePose: false })

    const frame = await render(0.25)
    frame.dispose()

    expect(renderer.renderToCanvas).toHaveBeenCalledWith(undefined, {}, undefined, 'talk', undefined)
    expect(renderer.renderToCanvasWithLayers).not.toHaveBeenCalled()
    expect(renderer.renderMouthToCanvas).not.toHaveBeenCalled()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('preserva renderers guardados na sessão e libera o renderer quando o desenho falha', async () => {
    const cached = createRenderer().renderer
    const session = { endpointRenderers: new Map([['cached', cached]]) }
    const { render: renderCached } = createFrameRenderer({ renderer: cached, samePose: false, session })
    const cachedFrame = await renderCached(0)
    cachedFrame.dispose()
    expect(cached.dispose).not.toHaveBeenCalled()

    const failing = createRenderer().renderer
    vi.mocked(failing.renderToCanvas).mockRejectedValueOnce(new Error('Falha sintética'))
    const { render } = createFrameRenderer({ renderer: failing, samePose: false })
    await expect(render(0)).rejects.toThrow('Falha sintética')
    expect(failing.dispose).toHaveBeenCalledTimes(1)
  })
})
