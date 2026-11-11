import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import { createEditorV6BakeSession } from '../../src/renderer/src/features/editorV6/motion/bakeSession'

function provider() {
  return { loadFabricatorSlot: vi.fn(async () => null) } as unknown as CharacterRenderAssetProvider
}

function renderer(width: number, height: number, dispose = vi.fn()) {
  return { width, height, dispose } as never
}

describe('Editor V6 motion bake session', () => {
  it('keeps a bounded pose history and refreshes the order when a key is seen again', () => {
    const session = createEditorV6BakeSession(provider())
    for (let index = 0; index < 48; index++) session.rememberPose(`pose-${index}`)
    session.rememberPose('pose-0')
    session.rememberPose('pose-48')

    expect(session.hasSeenPose('pose-0')).toBe(true)
    expect(session.hasSeenPose('pose-1')).toBe(false)
    expect(session.hasSeenPose('pose-48')).toBe(true)
  })

  it('trims renderer pools over 12 entries and disposes the oldest renderer first', () => {
    const session = createEditorV6BakeSession(provider())
    const oldestDispose = vi.fn()
    session.endpointRenderers.set('oldest', renderer(100, 100, oldestDispose))
    for (let index = 1; index < 13; index++) session.endpointRenderers.set(`renderer-${index}`, renderer(100, 100))

    session.trim()

    expect(session.endpointRenderers.size).toBe(12)
    expect(session.endpointRenderers.has('oldest')).toBe(false)
    expect(oldestDispose).toHaveBeenCalledOnce()
  })

  it('trims the oldest renderer when aggregate estimated surfaces exceed 96 MiB', () => {
    const session = createEditorV6BakeSession(provider())
    const oldestDispose = vi.fn()
    session.endpointRenderers.set('oldest', renderer(1920, 1080, oldestDispose))
    session.endpointRenderers.set('newest', renderer(1920, 1080))

    session.trim()

    expect([...session.endpointRenderers.keys()]).toEqual(['newest'])
    expect(oldestDispose).toHaveBeenCalledOnce()
  })

  it('disposes retained renderers and clears pose history and reusable materials', () => {
    const session = createEditorV6BakeSession(provider())
    const dispose = vi.fn()
    session.endpointRenderers.set('rig', renderer(100, 100, dispose))
    session.rememberPose('pose')
    session.materials.set('material', {} as never)

    session.dispose()

    expect(dispose).toHaveBeenCalledOnce()
    expect(session.endpointRenderers.size).toBe(0)
    expect(session.hasSeenPose('pose')).toBe(false)
    expect(session.materials.size).toBe(0)
  })
})
