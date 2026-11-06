import type { EditorV6ExportOptions } from '../../../../../shared/editorV6Export'
import { hairMotionPosteriorOnlyPreset, HAIR_MOTION_PRESET_KEY, parseHairMotionPresets, type HairMotionPreset } from '../../../../../shared/hairMotionEngine'
import type { EditorV6Document } from '../../../../../shared/editorV6'
import type { EditorV6HairMotionBundle } from '../../../../../shared/editorV6HairMotion'
import { runEditorV6ExportCommand } from '../editorV6ExportCommands'
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
      options: EditorV6ExportOptions,
      projectSnapshot?: EditorV6Document,
      presetSnapshot?: HairMotionPreset
    ) => Promise<PreparationResult>
    __editorV6StartRealProjectExportForStress?: (
      projectId: string,
      presetSlot: number | null,
      options: EditorV6ExportOptions
    ) => Promise<{ status: import('../../../../../shared/editorV6Export').EditorV6ExportStatus | null; commandToStartedMs: number; preparationMs: number; preparationRendererMs: number; preparationStages: Record<string, { samples: number; totalMs: number; maxMs: number }>; bundleBytes: number; bundleSerializationMs: number; rigCount: number; preparedTransitions: number; presetFingerprint: string }>
  }
}

/** Installs an opt-in benchmark bridge; it is only loaded by the isolated stress profile. */
export function installRealProjectHairPreparationHarness(): void {
  window.__editorV6PrepareRealProjectHairForStress = async (projectId, presetSlot, options, projectSnapshot, presetSnapshot) => {
    const presets = parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY))
    const storedPreset = presetSnapshot ?? presets[presetSlot - 1]
    if (!storedPreset) throw Error(`O Preset ${presetSlot} de cabelo não está salvo no perfil isolado.`)
    // Match EditorV6ExportPanel.start(), which passes this posterior-only copy
    // into the preparation pipeline when the default export profile is active.
    const preset = presetSnapshot ? storedPreset : options.hairPosteriorOnly ? hairMotionPosteriorOnlyPreset(storedPreset) : storedPreset
    const project = projectSnapshot ?? await window.desktop.editorV6.loadEditorV6Project(projectId)
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
  window.__editorV6StartRealProjectExportForStress = async (projectId, presetSlot, options) => {
    const storedPreset = presetSlot === null ? null : parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY))[presetSlot - 1]
    if (presetSlot !== null && !storedPreset) throw Error(`O Preset ${presetSlot} de cabelo não está salvo no perfil isolado.`)
    const preset = storedPreset && options.hairPosteriorOnly ? hairMotionPosteriorOnlyPreset(storedPreset) : storedPreset
    const project = await window.desktop.editorV6.loadEditorV6Project(projectId)
    if (!project) throw Error('O projeto isolado do Editor V6 não foi encontrado pelo renderer.')
    let preparationMs = 0, preparationRendererMs = 0, bundleBytes = 0, bundleSerializationMs = 0, rigCount = 0, preparedTransitions = 0, preparationStages: PreparationResult['preparationStages'] = {}, presetFingerprint = ''
    const commandStarted = performance.now()
    const status = await runEditorV6ExportCommand({
      project, options, hairPresetSlot: presetSlot ?? 0, hairPreset: preset,
      prepareHair: async (document, slot, selectedPreset, exportOptions) => {
        const started = performance.now()
        const prepared = await window.__editorV6PrepareRealProjectHairForStress!(projectId, slot, exportOptions, document, selectedPreset)
        preparationMs = performance.now() - started
        preparationRendererMs = prepared.preparationMs
        preparationStages = prepared.preparationStages
        bundleBytes = prepared.bundleBytes
        bundleSerializationMs = prepared.bundleSerializationMs
        rigCount = prepared.bundle.rigs.length
        preparedTransitions = prepared.bundle.motionTransitions?.length ?? 0
        presetFingerprint = prepared.presetFingerprint
        return prepared.bundle
      },
      startExport: (document, exportOptions, hairMotion) => window.desktop.editorV6.startEditorV6Export(document, exportOptions, hairMotion)
    })
    return { status, commandToStartedMs: performance.now() - commandStarted, preparationMs, preparationRendererMs, preparationStages, bundleBytes, bundleSerializationMs, rigCount, preparedTransitions, presetFingerprint }
  }
}
