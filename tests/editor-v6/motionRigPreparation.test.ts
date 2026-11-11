import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'
import { interpolateEditorV6Pose } from '../../src/shared/editorV6MotionInterpolation'
import { createEditorV6BakeSession } from '../../src/renderer/src/features/editorV6/motion/bakeSession'
import { createEditorV6MotionRigPreparer } from '../../src/renderer/src/features/editorV6/motion/motionRigPreparation'
import type { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'

type Artwork = ReturnType<typeof interpolateEditorV6Pose>

const artwork = (width: number): Artwork => ({ width, height: 200, parts: [], joints: [], layerOrder: [], hiddenPartIds: [] } as unknown as Artwork)
const character = { id: 'character-1', name: 'Synthetic' } as EditorV6MotionBakeRequest['character']
const source = { updatedAt: 'revision-1' } as never
const provider = {} as CharacterRenderAssetProvider
const materials = new Map() as never
const renderer = (dispose = vi.fn()) => ({ width: 100, height: 200, dispose }) as never
const builder = (value: unknown) => vi.fn(async () => value as never) as unknown as typeof prepareSavedCharacterRenderer

function preparer(options: { from?: Artwork; to?: Artwork; interpolate?: (progress: number) => Artwork; session?: ReturnType<typeof createEditorV6BakeSession>; buildRenderer?: typeof prepareSavedCharacterRenderer } = {}) {
  const fromPose = options.from ?? artwork(100)
  const toPose = options.to ?? fromPose
  return createEditorV6MotionRigPreparer({
    character, source, provider, materials, session: options.session,
    fromPose, toPose,
    interpolateArtwork: options.interpolate ?? (() => artwork(100)),
    buildRenderer: options.buildRenderer
  })
}

describe('Editor V6 motion rig preparation', () => {
  it('reuses one built renderer for a same-pose bake and disposes it when no session owns it', async () => {
    const dispose = vi.fn()
    const build = builder(renderer(dispose))
    const rig = preparer({ buildRenderer: build })

    const first = await rig.prepare(0)
    const second = await rig.prepare(1)

    expect(first).toBe(second)
    expect(rig.samePose).toBe(true)
    expect(build).toHaveBeenCalledOnce()
    expect(rig.metrics()).toEqual({ preparedRigs: 1, reusedRigs: 0, rigKeyLookups: 0, rigRebuilds: 0, rigBuildMilliseconds: expect.any(Number) })
    rig.disposeTransientReusable()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('reuses the exact cached artwork key and refreshes its insertion order', async () => {
    const session = createEditorV6BakeSession(provider)
    const cached = renderer()
    const fixedArtwork = artwork(100)
    const key = JSON.stringify([JSON.stringify([character, source.updatedAt]), fixedArtwork])
    session.endpointRenderers.set('older-key', renderer())
    session.endpointRenderers.set(key, cached)
    const build = builder(renderer())
    const rig = preparer({ from: artwork(100), to: artwork(101), interpolate: () => fixedArtwork, session, buildRenderer: build })

    const result = await rig.prepare(0.5)

    expect(result).toBe(cached)
    expect(build).not.toHaveBeenCalled()
    expect([...session.endpointRenderers.keys()]).toEqual(['older-key', key])
    expect(rig.metrics()).toMatchObject({ preparedRigs: 0, reusedRigs: 1, rigKeyLookups: 1, rigRebuilds: 0 })
  })

  it('counts a rebuilt exact key after it was previously evicted from the renderer pool', async () => {
    const session = createEditorV6BakeSession(provider)
    const fixedArtwork = artwork(100)
    const key = JSON.stringify([JSON.stringify([character, source.updatedAt]), fixedArtwork])
    session.rememberPose(key)
    const built = renderer()
    const build = builder(built)
    const rig = preparer({ from: artwork(100), to: artwork(101), interpolate: () => fixedArtwork, session, buildRenderer: build })

    expect(await rig.prepare(0.5)).toBe(built)
    expect(build).toHaveBeenCalledOnce()
    expect(rig.metrics()).toMatchObject({ preparedRigs: 1, reusedRigs: 0, rigKeyLookups: 1, rigRebuilds: 1 })
    expect(session.endpointRenderers.get(key)).toBe(built)
  })

  it('includes the character and source revision in keys so a different revision cannot reuse a rig', async () => {
    const session = createEditorV6BakeSession(provider)
    const fixedArtwork = artwork(100)
    const oldRevisionKey = JSON.stringify([JSON.stringify([character, 'revision-0']), fixedArtwork])
    session.endpointRenderers.set(oldRevisionKey, renderer())
    const built = renderer()
    const build = builder(built)
    const rig = preparer({ from: artwork(100), to: artwork(101), interpolate: () => fixedArtwork, session, buildRenderer: build })

    expect(await rig.prepare(0.5)).toBe(built)
    expect(build).toHaveBeenCalledOnce()
    expect(session.endpointRenderers.has(oldRevisionKey)).toBe(true)
    expect(session.endpointRenderers.size).toBe(2)
  })
})
