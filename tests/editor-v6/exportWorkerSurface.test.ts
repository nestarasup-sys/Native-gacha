import { describe, expect, it } from 'vitest'
import type { SyntheticEvent } from 'react'
import { createEditorV6SvgImageReadiness, encodeEditorV6PaintToken } from '../../src/renderer/src/features/editorV6/exportWorkerSurface'

function imageWithSource(source: string) {
  const target = new EventTarget() as EventTarget & { getAttribute: (name: string) => string | null; source: string }
  target.source = source
  target.getAttribute = (name) => name === 'href' ? target.source : null
  return target as unknown as SVGImageElement & EventTarget & { source: string }
}

describe('Editor V6 export worker surface', () => {
  it('encodes a frame token into the same 24 least-significant-bit-first cells', () => {
    const colors = encodeEditorV6PaintToken(0x800001)
    expect(colors).toHaveLength(24)
    expect(colors[0]).toBe('#fff')
    expect(colors[1]).toBe('#000')
    expect(colors[23]).toBe('#fff')
  })

  it('rejects token values that cannot identify a captured frame', () => {
    expect(() => encodeEditorV6PaintToken(0)).toThrow('Identificador de quadro inválido')
    expect(() => encodeEditorV6PaintToken(0x1000000)).toThrow('Identificador de quadro inválido')
    expect(() => encodeEditorV6PaintToken(1.5)).toThrow('Identificador de quadro inválido')
  })

  it('waits for the expected SVG source before resolving', async () => {
    const readiness = createEditorV6SvgImageReadiness()
    const image = imageWithSource('data:image/svg+xml,old')
    const ready = readiness.waitForImage(image, 'data:image/svg+xml,new')
    image.source = 'data:image/svg+xml,new'
    image.dispatchEvent(new Event('load'))
    await ready
    readiness.onLoad({ currentTarget: image } as SyntheticEvent<SVGImageElement>)
    await expect(readiness.waitForImage(image, 'data:image/svg+xml,new')).resolves.toBeUndefined()
  })

  it('reports image errors', async () => {
    const readiness = createEditorV6SvgImageReadiness()
    const image = imageWithSource('data:image/svg+xml,bad')
    const ready = readiness.waitForImage(image, 'data:image/svg+xml,expected')
    image.dispatchEvent(new Event('error'))
    await expect(ready).rejects.toThrow('Uma imagem da cena falhou')
  })
})
