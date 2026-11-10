import { createHash } from 'node:crypto'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6ExportOptions } from '../../../src/shared/editorV6Export'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { prepareExportMotions } from './prepareMotions'
import { motionCacheKey, type EditorV6MotionCacheStats } from './motionCache'

export type EditorV6MotionCacheSample = { cacheKey: string; planKeyHash: string; characterId: string; characterFingerprint: string }
export type EditorV6MotionCacheReport = EditorV6MotionCacheStats & { inputSamples: EditorV6MotionCacheSample[] }
export type EditorV6PreparedExportMotions = Awaited<ReturnType<typeof prepareExportMotions>> & { motionCache?: EditorV6MotionCacheReport }

type Dependencies = {
  project: EditorV6Document
  options: Pick<EditorV6ExportOptions, 'startFrame' | 'endFrame' | 'mouthLoopCycleFrames' | 'testMode'>
  testSettings: EditorV6ExportTestSettings
  characters: CustomizerCharacter[]
  signal: AbortSignal
  motionPreparationConcurrency?: 1 | 2 | 3
  motionCacheScope: string
  cacheBefore?: EditorV6MotionCacheStats
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  onProgress: (completed: number, total: number, name: string) => void
}

/** Prepares missing motion atlases and records export-local cache diagnostics. */
export async function prepareEditorV6ExportMotions(dependencies: Dependencies): Promise<EditorV6PreparedExportMotions> {
  const {
    project, options, testSettings, characters, signal, motionPreparationConcurrency,
    motionCacheScope, cacheBefore, getMotionCacheStats, bakeMotion, onProgress
  } = dependencies
  const inputSamples: EditorV6MotionCacheSample[] = []
  const prepared = await prepareExportMotions(project, options.startFrame, options.endFrame, {
    signal,
    characters,
    concurrency: options.testMode && options.testMode !== 'controle'
      ? testSettings.motionConcurrency
      : motionPreparationConcurrency ?? 2,
    mouthLoop: { startFrame: options.startFrame, cycleFrames: options.mouthLoopCycleFrames ?? 30 },
    bake: (request, bakeSignal) => {
      if (inputSamples.length < 3 && !inputSamples.some((sample) => sample.characterId === request.character.id)) {
        inputSamples.push({
          cacheKey: motionCacheKey(request),
          planKeyHash: createHash('sha256').update(request.plan.key).digest('hex'),
          characterId: request.character.id,
          characterFingerprint: createHash('sha256').update(JSON.stringify(request.character)).digest('hex')
        })
      }
      return bakeMotion({ ...request, cacheScope: motionCacheScope }, bakeSignal)
    },
    progress: onProgress
  })
  const cacheAfter = getMotionCacheStats?.()
  let motionCache: EditorV6MotionCacheReport | undefined
  if (cacheBefore && cacheAfter) {
    const counters = Object.fromEntries(Object.entries(cacheAfter)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([key, value]) => [key, value - (cacheBefore[key as keyof EditorV6MotionCacheStats] as number)]))
    motionCache = { ...counters, inputSamples } as EditorV6MotionCacheReport
  }
  return { ...prepared, ...(motionCache ? { motionCache } : {}) }
}
