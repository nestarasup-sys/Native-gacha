import { useEffect, useState } from 'react'
import type { EditorV6Document, EditorV6LibraryMediaItem } from '../../../../shared/editorV6'
import { EDITOR_V6_DEFAULT_EXPORT_PROFILE, EDITOR_V6_DEFAULT_HAIR_PRESET_SLOT, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../../shared/editorV6Export'
import { FIRST_HAIR_MOTION_PRESET, HAIR_MOTION_PRESET_KEY, hairMotionPosteriorOnlyPreset, parseHairMotionPresets, type HairMotionPreset } from '../../../../shared/hairMotionEngine'
import { prepareEditorV6HairMotionBundle } from './editorV6HairMotionPreparation'
import { saveEditorV6HairPresetSlot } from './editorV6HairPresetStorage'
import { cancelEditorV6ExportCommand, runEditorV6ExportCommand } from './editorV6ExportCommands'
import { isEditorV6ExportFinished, startEditorV6ExportStatusPolling } from './editorV6ExportStatusPolling'

const DEFAULT_EXPORT_SETTINGS = EDITOR_V6_DEFAULT_EXPORT_PROFILE
let rememberedJob: EditorV6ExportStatus | null = null

export type EditorV6ExportPanelControllerOptions = {
  project: EditorV6Document
  open: boolean
  characterSourceRefreshRequired: boolean
  onChange: (update: (project: EditorV6Document) => EditorV6Document) => void
  onActivity?: (active: boolean) => void
  trackOperation: <T,>(operation: () => Promise<T>) => Promise<T>
  prepareHair?: typeof prepareEditorV6HairMotionBundle
}

/** Owns export dialog state, asynchronous commands and status polling. */
export function useEditorV6ExportPanelController({ project, open, characterSourceRefreshRequired, onChange, onActivity, trackOperation, prepareHair = prepareEditorV6HairMotionBundle }: EditorV6ExportPanelControllerOptions) {
  const [job, setJob] = useState(rememberedJob)
  const [exportFolder, setExportFolder] = useState<string | null>(null)
  const [options, setOptions] = useState<EditorV6ExportOptions>({ startFrame: 0, endFrame: project.timeline.durationFrames, ...DEFAULT_EXPORT_SETTINGS })
  const [hairPresetSlot, setHairPresetSlot] = useState(EDITOR_V6_DEFAULT_HAIR_PRESET_SLOT)
  const [hairPresets, setHairPresets] = useState<Array<ReturnType<typeof parseHairMotionPresets>[number]>>([structuredClone(FIRST_HAIR_MOTION_PRESET), null, null, null, null])
  const [presetDraft, setPresetDraft] = useState<{ slot: number; value: HairMotionPreset } | null>(null)
  const [editingHairPreset, setEditingHairPreset] = useState(false)
  const [hairPresetMessage, setHairPresetMessage] = useState('')
  const [preparingHair, setPreparingHair] = useState(false)
  const [startingExport, setStartingExport] = useState(false)
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [audioPickerOpen, setAudioPickerOpen] = useState(false)
  const [error, setError] = useState('')
  const active = Boolean(job && !isEditorV6ExportFinished(job))

  useEffect(() => {
    if (!open) return
    try {
      setHairPresets(parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY)))
      setPresetDraft(null)
      setEditingHairPreset(false)
      setHairPresetMessage('')
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Os presets de cabelo salvos estão inválidos.') }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.desktop.editorV6.getEditorV6ExportFolder().then((folder) => { if (!cancelled) setExportFolder(folder) }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => { onActivity?.(active || busy); return () => onActivity?.(false) }, [active, busy, onActivity])

  const setStatus = (value: EditorV6ExportStatus) => { rememberedJob = value; setJob(value) }
  useEffect(() => {
    if (!job || isEditorV6ExportFinished(job)) return
    return startEditorV6ExportStatusPolling(job.id, {
      getStatus: (jobId) => window.desktop.editorV6.getEditorV6ExportStatus(jobId),
      onStatus: setStatus,
      onError: (reason) => setError(reason instanceof Error ? reason.message : String(reason)),
      scheduler: {
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (timerId) => window.clearTimeout(timerId)
      }
    })
  }, [job?.id, active])

  const updateAudio = (id: string, values: Partial<EditorV6ExportAudio>) => onChange((document) => ({ ...document, exportAudio: document.exportAudio?.map((clip) => clip.id === id ? { ...clip, ...values } : clip), updatedAt: new Date().toISOString() }))

  const linkAudio = async (item: EditorV6LibraryMediaItem) => {
    setBusy(true); setError('')
    try { await trackOperation(async () => { const clip = await window.desktop.editorV6.linkEditorV6LibraryExportAudio(project.id, item.id); onChange((document) => ({ ...document, exportAudio: [...(document.exportAudio ?? []), clip], updatedAt: new Date().toISOString() })) }); setAudioPickerOpen(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const chooseExportFolder = async () => {
    setBusy(true); setError('')
    try { const folder = await window.desktop.editorV6.chooseEditorV6ExportFolder(); if (folder) setExportFolder(folder) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const clearExportFolder = async () => {
    setBusy(true); setError('')
    try { await window.desktop.editorV6.clearEditorV6ExportFolder(); setExportFolder(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const selectedHairPreset = presetDraft?.slot === hairPresetSlot ? presetDraft.value : hairPresets[hairPresetSlot - 1]
  const beginEditingHairPreset = () => {
    setPresetDraft({ slot: hairPresetSlot, value: structuredClone(selectedHairPreset ?? FIRST_HAIR_MOTION_PRESET) })
    setEditingHairPreset(true)
    setHairPresetMessage('')
  }

  const saveHairPreset = () => {
    const value = presetDraft?.slot === hairPresetSlot ? presetDraft.value : null
    if (!value) return
    try {
      setHairPresets(saveEditorV6HairPresetSlot(window.localStorage, hairPresetSlot, value))
      setHairPresetMessage(`Preset ${hairPresetSlot} salvo para Editor V6 e Fabricador DEV.`)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o preset.')
    }
  }

  const start = async (animateHair = true) => {
    if (characterSourceRefreshRequired) { setError('Aguarde a sincronização da aparência do personagem com o Customizador antes de exportar.'); return }
    if (animateHair && !selectedHairPreset) { setError(`O Preset ${hairPresetSlot} está vazio. Escolha ou configure um preset de cabelo antes de exportar.`); return }
    const preparedHairPreset = animateHair && selectedHairPreset ? hairMotionPosteriorOnlyPreset(selectedHairPreset) : null
    setExportStartedAt(Date.now()); setStartingExport(true)
    setBusy(true); setError('')
    try {
      const startedJob = await trackOperation(() => runEditorV6ExportCommand({
        project,
        options: { ...options, ...DEFAULT_EXPORT_SETTINGS, ...(animateHair ? {} : { hairPoseReactionOnly: false, hairPosteriorOnly: false }), mouthLoopCycleFrames: options.mouthLoopCycleFrames },
        hairPresetSlot,
        hairPreset: preparedHairPreset,
        prepareHair,
        startExport: (document, exportOptions, hairMotion) => window.desktop.editorV6.startEditorV6Export(document, exportOptions, hairMotion),
        onPreparingHair: setPreparingHair,
        onStatus: setStatus
      }))
      if (!startedJob) setExportStartedAt(null)
    } catch (reason) { setExportStartedAt(null); setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false); setPreparingHair(false); setStartingExport(false) }
  }

  const cancel = async () => {
    if (!job) return
    setBusy(true)
    try { await trackOperation(() => cancelEditorV6ExportCommand({
      job,
      cancel: (jobId) => window.desktop.editorV6.cancelEditorV6Export(jobId),
      getStatus: (jobId) => window.desktop.editorV6.getEditorV6ExportStatus(jobId),
      onStatus: setStatus
    })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return {
    job, exportFolder, options, setOptions, hairPresetSlot, setHairPresetSlot, hairPresets, presetDraft, setPresetDraft,
    editingHairPreset, setEditingHairPreset, hairPresetMessage, setHairPresetMessage, preparingHair, startingExport,
    exportStartedAt, busy, audioPickerOpen, setAudioPickerOpen, error, setError, active, updateAudio, linkAudio,
    chooseExportFolder, clearExportFolder, selectedHairPreset, beginEditingHairPreset, saveHairPreset, start, cancel
  }
}
