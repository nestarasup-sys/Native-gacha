import type { EditorV6ExportOptions } from '../../../../../shared/editorV6Export'
import { HAIR_MOTION_PRESET_KEY, parseHairMotionPresets } from '../../../../../shared/hairMotionEngine'
import type { EditorV6HairMotionBundle } from '../../../../../shared/editorV6HairMotion'
import { prepareEditorV6HairMotionBundle } from '../editorV6HairMotionPreparation'

type PreparationResult = {
  bundle: EditorV6HairMotionBundle
  preparationMs: number
  preparationStages: Record<string, { samples: number; totalMs: number; maxMs: number }>
  bundleBytes: number
  bundleSerializationMs: number
  presetFingerprint: string
  presetSlot: number
}

declare global {
  interface Window {
    __editorV6PrepareRealProjectHairForStress?: (
      projectId: string,
      presetSlot: number,
      options: EditorV6ExportOptions
    ) => Promise<PreparationResult>
  }
}

/** Installs an opt-in benchmark bridge; it is only loaded by the isolated stress profile. */
export function installRealProjectHairPreparationHarness(): void {
  window.__editorV6PrepareRealProjectHairForStress = async (projectId, presetSlot, options) => {
    const presets = parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY))
    const preset = presets[presetSlot - 1]
    if (!preset) throw Error(`O Preset ${presetSlot} de cabelo não está salvo no perfil isolado.`)
    const project = await window.desktop.editorV6.loadEditorV6Project(projectId)
    if (!project) throw Error('O projeto isolado do Editor V6 não foi encontrado pelo renderer.')

    const startedAt = performance.now()
    const stageAccumulators = new Map<string, { samples: number; totalMs: number; maxMs: number }>()
    const bundle = await prepareEditorV6HairMotionBundle(project, presetSlot, preset, options, () => false, { onStage: (stage, milliseconds) => {
      const previous = stageAccumulators.get(stage) ?? { samples: 0, totalMs: 0, maxMs: 0 }
      stageAccumulators.set(stage, { samples: previous.samples + 1, totalMs: previous.totalMs + milliseconds, maxMs: Math.max(previous.maxMs, milliseconds) })
    } })
    const preparationMs = performance.now() - startedAt
    const bundleSerializationStarted = performance.now()
    const serialized = JSON.stringify(bundle)
    const bundleSerializationMs = performance.now() - bundleSerializationStarted
    const preparationStages = Object.fromEntries(stageAccumulators)
    const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(preset)))
    const presetFingerprint = [...new Uint8Array(fingerprint)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return { bundle, preparationMs, preparationStages, bundleBytes: new TextEncoder().encode(serialized).byteLength, bundleSerializationMs, presetFingerprint, presetSlot }
  }
}
