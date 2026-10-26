/** Opt-in aggregate diagnostics: no user/project names, asset paths or content. */
type RouteStats = { commits:number; commitMs:number; worstCommitMs:number; longTasks:number; longTaskMs:number; commitSamples:Array<{phase:string;actualDuration:number;baseDuration:number;startTime:number;commitTime:number}>; longTaskSamples:Array<{startTime:number;duration:number}>; sceneResolveSamples:Array<{at:number;durationMs:number;elementCount:number}> }
const routes = new Set(['/', '/customizar', '/estudio', '/editor-v6', '/editor-v6/scene', '/editor-v6/surface', '/editor-v6/timeline', '/roteiros', '/base-videos', '/opcoes', '/fabricador-dev'])
const stats = new Map<string, RouteStats>()
const enabled = (() => { try { return typeof window !== 'undefined' && sessionStorage.getItem('gv5:perf') === '1' } catch { return false } })()
let logicalFrameSamples: Array<{ frame: number; at: number; publishMs: number }> = []
function traceCaptureEnabled():boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __editorV6TraceCapture?: boolean }).__editorV6TraceCapture)
}
function currentRoute(): string {
  const hashRoute = window.location.hash.startsWith('#/') ? window.location.hash.slice(1).split('?')[0] : ''
  return hashRoute || window.location.pathname
}
function entryFor(route: string): RouteStats {
  const key = routes.has(route) ? route : '(outra rota)'
  const existing = stats.get(key)
  if (existing) return existing
  const created = { commits:0, commitMs:0, worstCommitMs:0, longTasks:0, longTaskMs:0, commitSamples:[], longTaskSamples:[], sceneResolveSamples:[] }
  stats.set(key, created)
  return created
}
export function snapshotUiPerformance() {
  return [...stats].map(([route,s]) => ({
    route, commits:s.commits,
    meanCommitMs:s.commits ? +(s.commitMs / s.commits).toFixed(2) : 0,
    worstCommitMs:+s.worstCommitMs.toFixed(2),
    p95CommitMs:+percentile(s.commitSamples.map(sample=>sample.actualDuration),.95).toFixed(2),
    longTasks:s.longTasks, longTaskMs:+s.longTaskMs.toFixed(2),
    commitSamples:s.commitSamples,
    longTaskSamples:s.longTaskSamples,
    ...(route === '/editor-v6/scene' ? { sceneResolution: { ...summarizeSceneResolution(s.sceneResolveSamples), samples:s.sceneResolveSamples } } : {}),
    ...(route === '/editor-v6' ? { playback: snapshotPlaybackPerformance() } : {})
  }))
}
function percentile(values:number[], p:number):number {
  const sorted = [...values].sort((left,right)=>left-right)
  return sorted.length ? sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))] : 0
}
function summarizeSceneResolution(samples:RouteStats['sceneResolveSamples']) {
  const durations = samples.map(sample=>sample.durationMs)
  return { samples:samples.length, meanMs:samples.length ? +(durations.reduce((sum,value)=>sum+value,0)/samples.length).toFixed(3) : 0,
    p50Ms:+percentile(durations,.5).toFixed(3),p95Ms:+percentile(durations,.95).toFixed(3),p99Ms:+percentile(durations,.99).toFixed(3),
    worstMs:+Math.max(0,...durations).toFixed(3),maxElements:Math.max(0,...samples.map(sample=>sample.elementCount)) }
}
function snapshotPlaybackPerformance() {
  const frames = logicalFrameSamples
  const gaps = frames.slice(1).flatMap((sample, index) => {
    const prior = frames[index]
    return sample.frame > prior.frame + 1 ? [{ from: prior.frame, to: sample.frame, skipped: sample.frame - prior.frame - 1 }] : []
  })
  return {
    logicalFrameUpdates: frames.length,
    firstLogicalFrame: frames[0]?.frame ?? null,
    lastLogicalFrame: frames.at(-1)?.frame ?? null,
    logicalFrameGaps: gaps,
    publishTotalMs: +frames.reduce((sum, sample) => sum + sample.publishMs, 0).toFixed(2),
    publishWorstMs: +Math.max(0, ...frames.map(sample => sample.publishMs)).toFixed(2),
    samples: frames
  }
}
export function resetUiPerformance(): void {
  stats.clear()
  logicalFrameSamples = []
}
/** Captures the playback clock's requested logical frame and synchronous publication cost. */
export function recordEditorV6PlaybackFrame(frame:number, at:number, publishMs:number):void {
  if (!enabled || !Number.isFinite(frame) || !Number.isFinite(at) || !Number.isFinite(publishMs)) return
  logicalFrameSamples.push({ frame, at:+at.toFixed(2), publishMs:+publishMs.toFixed(3) })
  if (traceCaptureEnabled()) performance.mark('editor-v6:playback-publish', { detail:{ frame, publishMs:+publishMs.toFixed(3), rafAt:+at.toFixed(3) } })
}
/** Measures deterministic timeline-to-scene composition independently from React/Chromium drawing. */
export function measureEditorV6SceneResolution<T extends { elements: readonly unknown[] }>(resolve:()=>T):T {
  if (!enabled) return resolve()
  const started = performance.now()
  if (traceCaptureEnabled()) performance.mark('editor-v6:scene-resolve:start')
  const scene = resolve()
  const ended = performance.now()
  if (traceCaptureEnabled()) {
    performance.mark('editor-v6:scene-resolve:end')
    performance.measure('editor-v6:scene-resolve', 'editor-v6:scene-resolve:start', 'editor-v6:scene-resolve:end')
  }
  const samples = entryFor('/editor-v6/scene').sceneResolveSamples
  if (samples.length < 5000) samples.push({ at:+ended.toFixed(3), durationMs:+(ended-started).toFixed(3), elementCount:scene.elements.length })
  if (traceCaptureEnabled()) {
    performance.clearMarks('editor-v6:scene-resolve:start')
    performance.clearMarks('editor-v6:scene-resolve:end')
    performance.clearMeasures('editor-v6:scene-resolve')
  }
  return scene
}
export function recordUiCommit(route:string, phase:string, duration:number, baseDuration:number, startTime:number, commitTime:number):void {
  if (!enabled || !Number.isFinite(duration) || duration < 0) return
  const s = entryFor(route)
  s.commits++
  s.commitMs += duration
  s.worstCommitMs = Math.max(s.worstCommitMs, duration)
  if (s.commitSamples.length < 5000) s.commitSamples.push({ phase, actualDuration:+duration.toFixed(3), baseDuration:+baseDuration.toFixed(3), startTime:+startTime.toFixed(2), commitTime:+commitTime.toFixed(2) })
  if (traceCaptureEnabled()) performance.mark('editor-v6:react-commit', { detail:{ route, phase, actualDuration:+duration.toFixed(3), baseDuration:+baseDuration.toFixed(3), startTime:+startTime.toFixed(3), commitTime:+commitTime.toFixed(3) } })
}
/** React Profiler measures commit/render work; Chromium longtasks approximate main-thread blocking. */
export function installUiPerformanceDiagnostics(): () => void {
  if (!enabled || typeof window === 'undefined') return () => undefined
  let observer: PerformanceObserver | undefined
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver(list => {
      for (const task of list.getEntries()) {
        const s = entryFor(currentRoute())
        s.longTasks++
        s.longTaskMs += task.duration
        if (s.longTaskSamples.length < 2000) s.longTaskSamples.push({ startTime:+task.startTime.toFixed(2), duration:+task.duration.toFixed(2) })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  }
  const diagnosticWindow = window as Window & {
    __gv5PerformanceReport?: () => ReturnType<typeof snapshotUiPerformance>
    __gv5PerformanceReset?: () => void
  }
  diagnosticWindow.__gv5PerformanceReport = snapshotUiPerformance
  diagnosticWindow.__gv5PerformanceReset = resetUiPerformance
  const print = () => console.table(snapshotUiPerformance())
  window.addEventListener('pagehide', print)
  return () => {
    observer?.disconnect()
    window.removeEventListener('pagehide', print)
    delete diagnosticWindow.__gv5PerformanceReport
    delete diagnosticWindow.__gv5PerformanceReset
  }
}
