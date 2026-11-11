import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { EditorV6MotionBakeRequest } from '../../../../../shared/editorV6Motion'
import { interpolateEditorV6Pose } from '../../../../../shared/editorV6MotionInterpolation'
import { prepareSavedCharacterRenderer, type GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import type { EditorV6BakeSession } from './bakeSession'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type Source = NonNullable<Awaited<ReturnType<CharacterRenderAssetProvider['loadFabricatorSlot']>>>
type Artwork = ReturnType<typeof interpolateEditorV6Pose>

type EditorV6MotionRigPreparationOptions = {
  character: EditorV6MotionBakeRequest['character']
  source: Source
  provider: CharacterRenderAssetProvider
  materials: GachaReusableMaterialCache
  session?: EditorV6BakeSession
  fromPose: Artwork
  toPose: Artwork
  interpolateArtwork: (progress: number) => Artwork
  buildRenderer?: typeof prepareSavedCharacterRenderer
}

/** Owns exact-pose renderer reuse and build accounting for one motion bake. */
export function createEditorV6MotionRigPreparer({
  character,
  source,
  provider,
  materials,
  session,
  fromPose,
  toPose,
  interpolateArtwork,
  buildRenderer = prepareSavedCharacterRenderer
}: EditorV6MotionRigPreparationOptions) {
  const poseSignature = (pose: Artwork) => JSON.stringify([pose.width, pose.height, pose.parts, pose.joints, pose.layerOrder, pose.hiddenPartIds])
  const samePose = poseSignature(fromPose) === poseSignature(toPose)
  const rigCharacterKey = session ? JSON.stringify([character, source.updatedAt]) : ''
  let rigKeyLookups = 0, rigRebuilds = 0, rigBuildMilliseconds = 0
  let preparedRigs = 0, reusedRigs = 0, reusable: Renderer | undefined

  const prepare = async (progress: number): Promise<Renderer> => {
    if (samePose && reusable) return reusable
    const artwork = interpolateArtwork(progress)
    // No hash: one-byte changes and tiny pivot variations must not reuse a rig.
    // Facial elements are still repainted for every requested frame.
    // Keep the exact character, model revision and artwork bytes in the key.
    const key = session ? JSON.stringify([rigCharacterKey, artwork]) : undefined
    if (key) {
      rigKeyLookups++
      const cached = session!.endpointRenderers.get(key)
      if (cached) {
        session!.endpointRenderers.delete(key)
        session!.endpointRenderers.set(key, cached)
        reusedRigs++
        if (samePose) reusable = cached
        return cached
      }
    }

    const beganRig = performance.now()
    const renderer = await buildRenderer(character, { source, artwork, assetProvider: provider, materialCache: materials })
    rigBuildMilliseconds += performance.now() - beganRig
    preparedRigs++
    if (key) {
      if (session!.hasSeenPose(key)) rigRebuilds++
      session!.rememberPose(key)
      session!.endpointRenderers.set(key, renderer)
    }
    if (samePose) reusable = renderer
    return renderer
  }

  return {
    samePose,
    prepare,
    metrics: () => ({ preparedRigs, reusedRigs, rigKeyLookups, rigRebuilds, rigBuildMilliseconds }),
    disposeTransientReusable() {
      if (reusable && !(session && [...session.endpointRenderers.values()].includes(reusable))) reusable.dispose()
      reusable = undefined
    }
  }
}
