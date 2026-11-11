import { describe, expect, it } from 'vitest'
import { createEditorV6TimelineZoomCommands } from '../../src/renderer/src/features/editorV6/editorV6TimelineZoomCommands'

function createHarness(initialZoom = 80) {
  let pixelsPerSecond = initialZoom
  const node = { scrollLeft: 300, clientWidth: 1000 }
  const frames: Array<() => void> = []
  const commands = createEditorV6TimelineZoomCommands({
    getScrollNode: () => node,
    getPixelsPerSecond: () => pixelsPerSecond,
    setPixelsPerSecond: (value) => { pixelsPerSecond = value },
    getHeading: () => 200,
    getDurationFrames: () => 3000,
    requestFrame: (callback) => { frames.push(callback) }
  })
  const flushFrames = () => { while (frames.length) frames.shift()?.() }
  return { commands, node, flushFrames, getPixelsPerSecond: () => pixelsPerSecond }
}

describe('comandos de zoom da timeline do Editor V6', () => {
  it('preserva o centro no zoom manual e alterna entre fit e escala anterior', () => {
    const { commands, node, flushFrames, getPixelsPerSecond } = createHarness()

    commands.zoomIn()
    expect(getPixelsPerSecond()).toBe(100)
    flushFrames()
    expect(node.scrollLeft).toBe(475)

    commands.fit()
    expect(getPixelsPerSecond()).toBeCloseTo(7.88)
    flushFrames()
    expect(node.scrollLeft).toBe(0)

    commands.fit()
    expect(getPixelsPerSecond()).toBe(100)
    flushFrames()
    expect(node.scrollLeft).toBeCloseTo(4676.1421319797)
  })

  it('limita os extremos e faz o zoom manual cancelar o estado de fit', () => {
    const { commands, flushFrames, getPixelsPerSecond } = createHarness(800)

    commands.zoomIn()
    expect(getPixelsPerSecond()).toBe(960)
    flushFrames()

    commands.fit()
    expect(getPixelsPerSecond()).toBeCloseTo(7.88)
    flushFrames()
    commands.zoomOut()
    expect(getPixelsPerSecond()).toBeCloseTo(6.304)
    flushFrames()

    commands.fit()
    expect(getPixelsPerSecond()).toBeCloseTo(7.88)
    flushFrames()
    commands.fit()
    expect(getPixelsPerSecond()).toBeCloseTo(6.304)
  })
})
