import { describe, expect, it } from 'vitest'
import { createEditorV6ExportFrameReuseState } from '../../src/renderer/src/features/editorV6/exportFrameReuse'

describe('createEditorV6ExportFrameReuseState', () => {
  it('reuses a full frame only after that exact full-frame key was committed', () => {
    const reuse = createEditorV6ExportFrameReuseState()
    const keys = { background: 'bg-0', foreground: 'fg-0' }

    expect(reuse.decide('frame-0', undefined, keys)).toBeNull()
    reuse.recordRendered('frame-0', keys, undefined)
    expect(reuse.decide('frame-0', undefined, keys)).toBe('frame')
    expect(reuse.decide('frame-1', undefined, keys)).toBeNull()
  })

  it('tracks background and foreground commits independently across layered captures', () => {
    const reuse = createEditorV6ExportFrameReuseState()
    const first = { background: 'bg-0', foreground: 'fg-0' }
    reuse.recordRendered('frame-0', first, undefined)

    const next = { background: 'bg-0', foreground: 'fg-1' }
    expect(reuse.decide('frame-1', 'background', next)).toBe('background')
    expect(reuse.decide('frame-1', 'foreground', next)).toBeNull()
    reuse.recordRendered('frame-1', next, 'foreground')
    expect(reuse.decide('frame-1', undefined, next)).toBe('frame')

    const newBackground = { background: 'bg-1', foreground: 'fg-1' }
    expect(reuse.decide('frame-2', 'background', newBackground)).toBeNull()
    reuse.recordRendered('frame-2', newBackground, 'background')
    expect(reuse.decide('frame-2', 'foreground', newBackground)).toBe('foreground')
    expect(reuse.decide('frame-2', undefined, newBackground)).toBe('frame')
  })

  it('advances the full-frame key when a foreground-only capture can be reused', () => {
    const reuse = createEditorV6ExportFrameReuseState()
    const first = { background: 'bg-0', foreground: 'fg-0' }
    reuse.recordRendered('frame-0', first, undefined)

    expect(reuse.decide('frame-1', 'foreground', { background: 'bg-1', foreground: 'fg-0' })).toBe('foreground')
    expect(reuse.decide('frame-1', undefined, { background: 'bg-1', foreground: 'fg-0' })).toBe('frame')
  })
})
