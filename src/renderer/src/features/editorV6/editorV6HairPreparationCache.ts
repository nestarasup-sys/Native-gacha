import type { EditorV6Document } from '../../../../shared/editorV6'
import type { EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionBundle } from '../../../../shared/editorV6HairMotion'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'

type CacheEntry = {
  project: EditorV6Document
  timeline: EditorV6Document['timeline']
  elements: EditorV6Document['elements']
  assets: EditorV6Document['assets']
  revision: string
  signature: string
  bundle: EditorV6HairMotionBundle
}

function signatureOf(slot: number, preset: HairMotionPreset, options: EditorV6ExportOptions): string {
  // These are the export options consumed by hair preparation. Resolution,
  // encoder and turbo belong to FFmpeg/renderers and do not affect this bundle.
  return JSON.stringify([slot, preset, options.startFrame, options.endFrame, options.mouthLoop ?? false, options.mouthLoopCycleFrames ?? 30])
}
function encodedCharacters(bundle: EditorV6HairMotionBundle): number {
  return [...bundle.surfaces, ...bundle.textures].reduce((sum, item) => sum + item.dataUrl.length, 0)
}

/** The Editor V6's in-memory, single-entry cache for repeated identical exports.
 *
 * The project follows immutable React updates; source changes are separately
 * invalidated by the panel's Fabricator/Customizer/focus notifications.
 * Never cache failed/oversized work or export data across app sessions.
 */
export function createEditorV6HairPreparationCache(maxEncodedCharacters = 40_000_000) {
  let entry: CacheEntry | undefined
  let generation = 0

  function matches(project: EditorV6Document, signature: string): boolean {
    return Boolean(entry && entry.project === project && entry.timeline === project.timeline
      && entry.elements === project.elements && entry.assets === project.assets
      && entry.revision === project.updatedAt && entry.signature === signature)
  }
  function invalidate(): void { entry = undefined; generation++ }

  async function prepare(
    project: EditorV6Document, slot: number, preset: HairMotionPreset, options: EditorV6ExportOptions,
    build: () => Promise<EditorV6HairMotionBundle>
  ): Promise<EditorV6HairMotionBundle> {
    const signature = signatureOf(slot, preset, options)
    if (matches(project, signature)) return entry!.bundle

    const beganGeneration = generation
    const timeline = project.timeline, elements = project.elements, assets = project.assets, revision = project.updatedAt
    const bundle = await build()
    // Invalidation while a bake was pending must not reinsert stale outputs.
    if (generation === beganGeneration && project.timeline === timeline
      && project.elements === elements && project.assets === assets
      && project.updatedAt === revision && signatureOf(slot, preset, options) === signature
      && Number.isFinite(maxEncodedCharacters) && maxEncodedCharacters > 0
      && encodedCharacters(bundle) <= maxEncodedCharacters) {
      entry = { project, timeline, elements, assets, revision, signature, bundle }
    }
    return bundle
  }

  return { prepare, invalidate }
}
