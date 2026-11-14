import { describe, expect, it } from 'vitest'
import type { SyntheticEvent } from 'react'
import { createEditorV6SvgImageReadiness, encodeEditorV6PaintToken, updateEditorV6PaintTokenCells } from '../../src/renderer/src/features/editorV6/exportWorkerSurface'

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

  it('repaints only changed paint-token bits while preserving exact BGRA marker colors', () => {
    const colors = Array.from({ length: 24 }, () => '#000')
    const writes: number[] = []
    const cells = colors.map((_, bit) => ({
      style: {
        get backgroundColor() { return colors[bit] },
        set backgroundColor(value: string) { colors[bit] = value; writes.push(bit) }
      }
    }))
    let previous = updateEditorV6PaintTokenCells(cells, 1, 0)
    expect(writes).toEqual([0])
    expect(colors).toEqual(encodeEditorV6PaintToken(1))
    writes.length = 0

    previous = updateEditorV6PaintTokenCells(cells, 2, previous)
    expect(writes).toEqual([0, 1])
    expect(colors).toEqual(encodeEditorV6PaintToken(2))
    writes.length = 0

    previous = updateEditorV6PaintTokenCells(cells, 3, previous)
    expect(writes).toEqual([0])
    expect(colors).toEqual(encodeEditorV6PaintToken(3))
    writes.length = 0

    previous = updateEditorV6PaintTokenCells(cells, 0x800001, previous)
    expect(colors).toEqual(encodeEditorV6PaintToken(0x800001))
    expect(writes.length).toBeLessThan(24)
    writes.length = 0

    previous = updateEditorV6PaintTokenCells(cells, 0x800001, previous)
    expect(previous).toBe(0x800001)
    expect(writes).toEqual([])
  })

  it('rejects incomplete paint-token strips and invalid previous values', () => {
    const cells = Array.from({ length: 24 }, () => ({ style: { backgroundColor: '#000' } }))
    expect(() => updateEditorV6PaintTokenCells(cells.slice(0, 23), 1, 0)).toThrow('Marcador de captura incompleto')
    expect(() => updateEditorV6PaintTokenCells(cells, 0, 0)).toThrow('Identificador de quadro inválido')
    expect(() => updateEditorV6PaintTokenCells(cells, 1, -1)).toThrow('Identificador anterior de quadro inválido')
  })

  it('waits for the expected SVG source before resolving', async () => {
    const readiness = createEditorV6SvgImageReadiness()
    const image = imageWithSource('data:image/svg+xml,old')
    const ready = readiness.waitForImage(image, 'data:image/svg+xml,new')
    image.source = 'data:image/svg+xml,new'
    image.dispatchEvent(new Event('load'))
    await ready
    readiness.onLoad({ currentTarget: image } as SyntheticEvent<SVGImageElement>)
    expect(readiness.waitForImage(image, 'data:image/svg+xml,new')).toBeUndefined()
  })

  it('reports image errors', async () => {
    const readiness = createEditorV6SvgImageReadiness()
    const image = imageWithSource('data:image/svg+xml,bad')
    const ready = readiness.waitForImage(image, 'data:image/svg+xml,expected')
    image.dispatchEvent(new Event('error'))
    await expect(ready).rejects.toThrow('Uma imagem da cena falhou')
  })
})
