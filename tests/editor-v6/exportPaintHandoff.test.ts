import { describe, expect, it, vi } from 'vitest'
import { createEditorV6ExportPaintHandoff } from '../../src/renderer/src/features/editorV6/exportPaintHandoff'

describe('paint-token export compositor handoff', () => {
  it('does not wait for a display-refresh tick when paint-token capture guards the pixels', async () => {
    const requestFrame = vi.fn()
    const wait = createEditorV6ExportPaintHandoff(false, requestFrame)
    await wait()
    await wait()
    expect(requestFrame).not.toHaveBeenCalled()
  })

  it('keeps a selectable legacy RAF gate for driver A/B comparisons', async () => {
    let advance!: FrameRequestCallback
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      advance = callback
      return 1
    })
    const wait = createEditorV6ExportPaintHandoff(true, requestFrame)
    let settled = false
    const pending = wait().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(requestFrame).toHaveBeenCalledOnce()
    advance(16.67)
    await pending
    expect(settled).toBe(true)
  })
})
