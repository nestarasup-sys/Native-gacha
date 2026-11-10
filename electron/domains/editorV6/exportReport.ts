import { release as osRelease } from 'node:os'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6HairPreparationProfile } from '../../../src/shared/editorV6HairMotion'
import type { EditorV6ExportOptions } from '../../../src/shared/editorV6Export'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import type { EditorV6MotionCacheReport, EditorV6PreparedExportMotions } from './exportMotionPreparation'
import type { EditorV6ExportPartReport } from './exportPartRenderer'
import type { EditorV6ExportPhaseTimings } from './exportMetrics'
import { planEditorV6VideoOverlays } from '../../../src/shared/editorV6VideoComposition'

declare const __NATIVE_GACHA_BUILD_SHA__: string
declare const __NATIVE_GACHA_BUILD_DIRTY__: boolean

export type EditorV6ExportAttemptReport = {
  parts: EditorV6ExportPartReport[]
  encoder: string
  parallelism: number
  milliseconds?: number
  error?: string
}

export type EditorV6ExportReport = {
  schemaVersion: 1
  id: string
  state: string
  projectId: string
  options: EditorV6ExportOptions
  fps: 30
  totalFrames: number
  fallback: boolean
  attempts: EditorV6ExportAttemptReport[]
  encoderTests: Array<{ encoder: string; error?: string }>
  audioClips: number
  videoInputs: number
  proxies: 0
  motionTransitionsRequired: number
  motionTransitionsPrepared: number
  motionPreparation?: EditorV6PreparedExportMotions['stats']
  hairPreparation?: EditorV6HairPreparationProfile
  exportTestSettings?: EditorV6ExportTestSettings
  runtime?: { platform: string; arch: string; osRelease: string; node: string; electron?: string; buildSha?: string; workingTreeDirty?: boolean }
  motionCache?: EditorV6MotionCacheReport
  mouthAnimation?: { stateAtlases: number; characters: number; isolatedStates: number; legacyPatchStates: number; skippedStates: number; staleStates: number; cycleFrames: number; atlasBytes: number; atlasPixels: number; preparationMilliseconds: number; details: string[] }
  mainProcessMemory?: { startRssBytes: number; peakRssBytes: number; sampleIntervalMs: number }
  phaseMilliseconds: EditorV6ExportPhaseTimings
  startedAt: string
  endedAt?: string
  milliseconds?: number
  outputPath: string
  deliveryWarning?: string
  validation?: unknown
  error?: string
}

export type EditorV6ExportReportContext = {
  report: EditorV6ExportReport
  layeredVideo: boolean
  started: number
  totalFrames: number
}

type ContextDependencies = {
  project: EditorV6Document
  options: EditorV6ExportOptions
  testSettings: EditorV6ExportTestSettings
  id: string
  outputPath: string
}

/** Creates the stable export report and the video-layer context used by render workers. */
export function createEditorV6ExportReportContext({ project, options, testSettings, id, outputPath }: ContextDependencies): EditorV6ExportReportContext {
  const started = performance.now()
  const totalFrames = options.endFrame - options.startFrame
  const videoOverlays = planEditorV6VideoOverlays(project, options.startFrame, options.endFrame)
  const compiledSha = typeof __NATIVE_GACHA_BUILD_SHA__ === 'string' ? __NATIVE_GACHA_BUILD_SHA__ : ''
  const revision = process.env.NATIVE_GACHA_BUILD_SHA || compiledSha
  const runtime = {
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease(),
    node: process.versions.node,
    ...(process.versions.electron ? { electron: process.versions.electron } : {}),
    ...(revision && /^[0-9a-f]{7,40}$/i.test(revision) ? { buildSha: revision } : {}),
    ...(typeof __NATIVE_GACHA_BUILD_DIRTY__ === 'boolean' ? { workingTreeDirty: __NATIVE_GACHA_BUILD_DIRTY__ } : {})
  }
  const report: EditorV6ExportReport = {
    schemaVersion: 1,
    id,
    projectId: project.id,
    options,
    fps: 30,
    totalFrames,
    state: 'preparing',
    fallback: false,
    attempts: [],
    encoderTests: [],
    audioClips: 0,
    runtime,
    exportTestSettings: testSettings,
    videoInputs: new Set(videoOverlays.map((clip) => clip.fileName)).size,
    proxies: 0,
    motionTransitionsRequired: 0,
    motionTransitionsPrepared: 0,
    phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 },
    startedAt: new Date().toISOString(),
    outputPath
  }
  const startRssBytes = process.memoryUsage().rss
  report.mainProcessMemory = { startRssBytes, peakRssBytes: startRssBytes, sampleIntervalMs: 500 }
  return { report, layeredVideo: videoOverlays.length > 0, started, totalFrames }
}
