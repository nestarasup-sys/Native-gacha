import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6ExportOptions, EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import type { EditorV6HairPreparationProfile } from '../../../src/shared/editorV6HairMotion'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { addEditorV6PhaseTime } from './exportMetrics'
import { prepareEditorV6ExportMotions, type EditorV6PreparedExportMotions } from './exportMotionPreparation'
import type { EditorV6MotionCacheStats } from './motionCache'
import type { EditorV6ExportReport } from './exportReport'

export type EditorV6ExportMotionPreparation = typeof prepareEditorV6ExportMotions

type Dependencies = {
  project: EditorV6Document
  options: EditorV6ExportOptions
  testSettings: EditorV6ExportTestSettings
  hairPreparation?: EditorV6HairPreparationProfile
  motionPreparationConcurrency?: 1 | 2 | 3
  motionCacheScope: string
  signal: AbortSignal
  getCharacters: () => Promise<CustomizerCharacter[]>
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  report: Pick<EditorV6ExportReport, 'hairPreparation' | 'motionTransitionsRequired' | 'motionTransitionsPrepared' | 'motionPreparation' | 'motionCache' | 'phaseMilliseconds'>
  progress: (patch: Partial<EditorV6ExportStatus>) => void
  saveReport: () => Promise<void>
  prepareMotions?: EditorV6ExportMotionPreparation
}

/** Loads character snapshots, prepares motion assets, and verifies the export scene is ready. */
export async function prepareEditorV6ExportReadiness(dependencies: Dependencies): Promise<{ project: EditorV6Document; characters: CustomizerCharacter[] }> {
  const {
    project, options, testSettings, hairPreparation, motionPreparationConcurrency, motionCacheScope,
    signal, getCharacters, getMotionCacheStats, bakeMotion, report, progress, saveReport
  } = dependencies
  signal.throwIfAborted()
  report.hairPreparation = hairPreparation

  const characterLoadStarted = performance.now()
  let characters: CustomizerCharacter[]
  try { characters = await getCharacters() }
  finally { addEditorV6PhaseTime(report, 'characterLoading', characterLoadStarted) }

  const motionPreparationStarted = performance.now()
  const cacheBefore = getMotionCacheStats?.()
  let prepared: EditorV6PreparedExportMotions
  try {
    prepared = await (dependencies.prepareMotions ?? prepareEditorV6ExportMotions)({
      project,
      options,
      testSettings,
      characters,
      signal,
      motionPreparationConcurrency,
      motionCacheScope,
      cacheBefore,
      getMotionCacheStats,
      bakeMotion,
      onProgress: (completed, total, name) => {
        report.motionTransitionsRequired = total
        report.motionTransitionsPrepared = completed
        progress({ state: 'preparing', frames: 0, motionProgress: { completed, total }, message: completed === total ? 'Transições prontas.' : `Preparando transição ${completed + 1}/${total} · ${name}…` })
      }
    })
  } finally { addEditorV6PhaseTime(report, 'motionPreparation', motionPreparationStarted) }

  report.motionTransitionsRequired = prepared.stats.total
  report.motionTransitionsPrepared = prepared.stats.total
  report.motionPreparation = prepared.stats
  if (prepared.motionCache) report.motionCache = prepared.motionCache
  if (missingEditorV6Motions(prepared.project, options.startFrame, options.endFrame).length) throw Error('Não foi possível preparar todas as transições deste intervalo.')
  await saveReport()
  return { project: prepared.project, characters }
}
