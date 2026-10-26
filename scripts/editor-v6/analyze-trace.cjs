const fs = require('node:fs')
const path = require('node:path')

function traceMarkName(event) {
  if (typeof event?.name === 'string' && event.cat?.split(',').includes('blink.user_timing') && !/^UserTiming::/.test(event.name)) return event.name
  const data = event?.args?.data ?? event?.args?.beginData ?? {}
  const detail = data.detail ?? data
  return typeof data.name === 'string' ? data.name : typeof detail.name === 'string' ? detail.name : ''
}

function normalizeEvents(rawEvents = []) {
  const complete = []
  const open = new Map()
  for (const event of rawEvents) {
    if (!event || (!Number.isFinite(event.ts) && event.ph !== 'M') || typeof event.name !== 'string') continue
    if (event.ph === 'X' && Number.isFinite(event.dur) && event.dur >= 0) {
      complete.push({ ...event, start: event.ts, end: event.ts + event.dur, duration: event.dur, marker: traceMarkName(event) })
    } else if (event.ph === 'B') {
      const key = `${event.pid}:${event.tid}:${event.cat}:${event.name}`
      const list = open.get(key) ?? []
      list.push(event)
      open.set(key, list)
    } else if (event.ph === 'E') {
      const key = `${event.pid}:${event.tid}:${event.cat}:${event.name}`
      const list = open.get(key)
      const begin = list?.pop()
      if (begin && event.ts >= begin.ts) complete.push({ ...begin, end: event.ts, start: begin.ts, duration: event.ts - begin.ts, marker: traceMarkName(begin) })
    } else if (['I', 'i', 'R', 's', 't', 'f', 'M'].includes(event.ph)) {
      const timestamp = Number.isFinite(event.ts) ? event.ts : 0
      complete.push({ ...event, ts:timestamp, start:timestamp, end:timestamp, duration: 0, marker: traceMarkName(event) })
    }
  }
  return complete
}

function metadataMaps(events) {
  const processes = new Map(), threads = new Map()
  for (const event of events) {
    if (event.ph !== 'M') continue
    if (event.name === 'process_name') processes.set(event.pid, event.args?.name ?? event.args?.processName ?? `process-${event.pid}`)
    if (event.name === 'thread_name') threads.set(`${event.pid}:${event.tid}`, event.args?.name ?? event.args?.threadName ?? `thread-${event.tid}`)
  }
  return { processes, threads }
}

function findClockAlignment(events, clockPairs = [], calibration = null) {
  const tracedMarks = new Map()
  for (const event of events) {
    const name = event.marker || traceMarkName(event)
    if (name) tracedMarks.set(name, event.start)
  }
  const pairs = clockPairs.map((pair) => {
    const traceTs = tracedMarks.get(pair.name)
    if (!Number.isFinite(pair.performanceNowMs) || !Number.isFinite(traceTs)) return null
    return { performanceNowMs: pair.performanceNowMs, traceTsUs: traceTs, offsetUs: traceTs - pair.performanceNowMs * 1000, name: pair.name }
  }).filter(Boolean)
  if (!pairs.length) return { aligned: false, method: 'no-correlated-user-timing-markers', pairs: [], maxErrorMs: null }
  const offsetUs = pairs.reduce((sum, pair) => sum + pair.offsetUs, 0) / pairs.length
  const residuals = pairs.map((pair) => Math.abs(pair.offsetUs - offsetUs) / 1000)
  const calibrationStart = calibration?.startName ? tracedMarks.get(calibration.startName) : null
  const calibrationEnd = calibration?.endName ? tracedMarks.get(calibration.endName) : null
  const calibrationErrorMs = Number.isFinite(calibrationStart) && Number.isFinite(calibrationEnd) && Number.isFinite(calibration.measuredDurationMs)
    ? +Math.abs((calibrationEnd - calibrationStart) / 1000 - calibration.measuredDurationMs).toFixed(4)
    : null
  return {
    aligned: true,
    method: 'paired performance.mark UserTiming trace timestamps; performance.timeOrigin is recorded for reference but not mixed with trace monotonic timestamps',
    offsetUs: +offsetUs.toFixed(2), pairs,
    maxErrorMs: +Math.max(0, ...residuals).toFixed(4), calibrationErrorMs,
    errorDefinition: 'maximum residual around the common offset across paired markers; this validates clock mapping, not causal attribution'
  }
}

function makeHierarchy(events) {
  const byThread = new Map()
  for (const event of events) {
    if (event.duration <= 0 || !Number.isFinite(event.pid) || !Number.isFinite(event.tid)) continue
    const key = `${event.pid}:${event.tid}`
    const list = byThread.get(key) ?? []
    list.push({ ...event, children: [] })
    byThread.set(key, list)
  }
  const all = []
  for (const list of byThread.values()) {
    list.sort((a, b) => a.start - b.start || b.end - a.end)
    const stack = []
    for (const event of list) {
      while (stack.length && (event.start >= stack.at(-1).end || event.end > stack.at(-1).end + 0.5)) stack.pop()
      const parent = stack.at(-1)
      if (parent) parent.children.push(event)
      else all.push(event)
      stack.push(event)
    }
  }
  const visit = (event) => {
    const children = event.children.slice().sort((a, b) => a.start - b.start || b.end - a.end)
    let coveredEnd = event.start, childUnionUs = 0
    for (const child of children) {
      const left = Math.max(event.start, child.start), right = Math.min(event.end, child.end)
      if (right <= left || right <= coveredEnd) continue
      childUnionUs += right - Math.max(left, coveredEnd)
      coveredEnd = right
    }
    event.exclusive = Math.max(0, event.duration - childUnionUs)
    for (const child of event.children) visit(child)
  }
  for (const event of all) visit(event)
  return { roots: all, byThread }
}

function exclusiveInWindow(event, start, end) {
  const left = Math.max(event.start, start), right = Math.min(event.end, end)
  if (right <= left) return 0
  const children = event.children.slice().sort((a, b) => a.start - b.start || b.end - a.end)
  let coveredEnd = left, childUs = 0
  for (const child of children) {
    const childLeft = Math.max(left, child.start), childRight = Math.min(right, child.end)
    if (childRight <= childLeft || childRight <= coveredEnd) continue
    childUs += childRight - Math.max(childLeft, coveredEnd)
    coveredEnd = childRight
  }
  return Math.max(0, right - left - childUs)
}

function classify(event) {
  const name = event.name || ''
  if (/\bGC\b|V8\.GC|GarbageCollect|Scavenge|MarkCompact/i.test(name)) return 'gc'
  if (/RecalculateStyles|UpdateLayoutTree|StyleRecalc/i.test(name)) return 'style'
  if (/Layout|LayoutTree/i.test(name)) return 'layout'
  if (/Paint|PrePaint|Raster|Layerize|Composite|CommitCompositor/i.test(name)) return 'paint-composite'
  if (/WaitForCommitCompletion|WaitFor.*Compositor/i.test(name)) return 'compositor-wait'
  if (/FunctionCall|EvaluateScript|RunMicrotasks|RunPendingMicrotask|RunTask|V8\.Execute|v8\.callFunction|EventDispatch/i.test(name)) return 'javascript'
  if (/AnimationFrame|BeginFrame|Frame|ProxyMain::BeginMainFrame|ThreadControllerImpl::RunTask/i.test(name)) return 'frame-scheduling'
  return 'other'
}

function getReactCommits(diagnostics) {
  const routes = diagnostics?.react ?? []
  return routes.flatMap((route) => (route.commitSamples ?? []).map((commit) => ({
    route: route.route, phase: commit.phase, startTime: commit.startTime, commitTime: commit.commitTime,
    actualDuration: commit.actualDuration, baseDuration: commit.baseDuration
  })))
}

/** Merge diagnostics that overlap in wall time without losing either original endpoint. */
function mergeOverlappingIntervals(intervals = []) {
  const merged = []
  for (const interval of [...intervals].filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.durationMs) && item.durationMs > 0).sort((a, b) => a.startMs - b.startMs || a.durationMs - b.durationMs)) {
    const previous = merged.at(-1)
    const intervalEnd = interval.startMs + interval.durationMs
    if (previous && interval.startMs < previous.endMs) {
      previous.startMs = Math.min(previous.startMs, interval.startMs)
      previous.endMs = Math.max(previous.endMs, intervalEnd)
      previous.durationMs = previous.endMs - previous.startMs
      previous.sources = [...new Set([...previous.sources, interval.type])]
      previous.labels.push(interval.label)
      previous.type = previous.sources.length > 1 ? 'mixed-spike' : previous.sources[0]
    } else merged.push({ startMs: interval.startMs, endMs: intervalEnd, durationMs: interval.durationMs, type: interval.type, sources: [interval.type], labels: [interval.label] })
  }
  return merged
}

function analyzeTrace(trace) {
  if (!trace || typeof trace !== 'object' || !Array.isArray(trace.traceEvents)) throw new Error('Trace inválida: esperado objeto JSON com traceEvents[].')
  const events = normalizeEvents(trace.traceEvents)
  const { processes, threads } = metadataMaps(events)
  const alignment = findClockAlignment(events, trace.diagnostics?.clockPairs ?? trace.clockPairs ?? [], trace.diagnostics?.calibration)
  const hierarchy = makeHierarchy(events)
  const hierarchicalEvents = [...hierarchy.byThread.values()].flat()
  const callEvents = events.filter((event) => /FunctionCall|EvaluateScript|RunTask|RunMicrotasks/.test(event.name) && event.duration > 0)
  const rendererPids = new Set(events.filter((event) => /FunctionCall/.test(event.name) && /editorV6|EditorV6|SceneSurface/i.test(JSON.stringify(event.args?.data ?? {}))).map((event) => event.pid))
  const rendererPid = [...rendererPids][0] ?? [...processes].find(([, name]) => /renderer/i.test(name))?.[0] ?? null
  const threadCounts = new Map()
  for (const event of callEvents) if (rendererPid === null || event.pid === rendererPid) threadCounts.set(`${event.pid}:${event.tid}`, (threadCounts.get(`${event.pid}:${event.tid}`) ?? 0) + 1)
  const threadScore = ([key, count]) => {
    const name = threads.get(key) ?? ''
    return (/CrRendererMain|RendererMain|Main Thread/i.test(name) ? 1e9 : 0) + (rendererPid !== null && key.startsWith(`${rendererPid}:`) ? 1e8 : 0) + count
  }
  const rendererMainThread = [...threadCounts].sort((a, b) => threadScore(b) - threadScore(a))[0]?.[0] ?? null
  const [mainPid, mainTid] = rendererMainThread?.split(':').map(Number) ?? [null, null]
  const diagnostics = trace.diagnostics ?? {}
  const offsetUs = alignment.aligned ? alignment.offsetUs : null
  const toTrace = (ms) => offsetUs === null || !Number.isFinite(ms) ? null : ms * 1000 + offsetUs
  const routeDiagnostics = diagnostics.react ?? []
  const longTasks = routeDiagnostics.flatMap((route) => (route.longTaskSamples ?? []).map((task) => ({ ...task, route: route.route, source: 'PerformanceObserver longtask' })))
  const roots = hierarchy.roots.filter((event) => event.pid === mainPid && event.tid === mainTid)
  const metrics = diagnostics.rafSamples ?? []
  const rafIntervals = diagnostics.rafIntervals ?? []
  const commits = getReactCommits(diagnostics)
  const ordinaryRafIntervals = rafIntervals.filter((item) => Number.isFinite(item.durationMs) && item.durationMs > 0 && item.durationMs <= 33.34)
  const rafBaselineMs = ordinaryRafIntervals.length >= 3
    ? [...ordinaryRafIntervals].sort((a, b) => a.durationMs - b.durationMs)[Math.floor((ordinaryRafIntervals.length - 1) * .5)].durationMs
    : 16.67
  const rafGapThresholdMs = Math.max(rafBaselineMs * 1.8, 20)
  const rawPoints = [
    ...longTasks.map((task) => ({ startMs: task.startTime, durationMs: task.duration, type: 'long-task', label: task.route })),
    ...rafIntervals.filter((item) => item.durationMs > rafGapThresholdMs).map((item) => ({ startMs: item.startTimeMs, durationMs: item.durationMs, type: 'raf-gap', label: `${item.durationMs.toFixed(2)} ms RAF gap (limiar ${rafGapThresholdMs.toFixed(2)} ms)` }))
  ].filter((point) => Number.isFinite(point.startMs) && point.durationMs > 0).sort((a,b)=>a.startMs-b.startMs)
  const points = mergeOverlappingIntervals(rawPoints)
  const peakRows = points.map((point) => {
    const start = toTrace(point.startMs), end = start === null ? null : start + point.durationMs * 1000
    const overlap = start === null ? [] : hierarchicalEvents.filter((event) => event.pid === mainPid && event.tid === mainTid && event.duration > 0 && event.start < end && event.end > start)
    const tally = new Map()
    for (const event of overlap) {
      const cost = exclusiveInWindow(event, start, end)
      const category = classify(event)
      tally.set(category, (tally.get(category) ?? 0) + cost)
    }
    const categories = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category, microseconds]) => ({ category, exclusiveMs: +(microseconds / 1000).toFixed(3) }))
    const overlapDuration = (event) => Math.max(0, Math.min(event.end, end) - Math.max(event.start, start))
    const targetDurationUs=point.durationMs*1000
    const schedulingTask = overlap.filter((event) => /^(RunTask|ThreadControllerImpl::RunTask|ProxyMain::BeginMainFrame)$/.test(event.name)
      && overlapDuration(event)>=targetDurationUs*.6 && event.duration<=targetDurationUs*2.2)
      .sort((a,b)=>Math.abs(a.duration-targetDurationUs)-Math.abs(b.duration-targetDurationUs))[0]
    const containing = overlap.filter((event) => event.start <= start + 1000 && event.end >= end - 1000 && event.duration<=targetDurationUs*2.2)
    const overlappingWork = overlap.filter((event)=>event.duration<=targetDurationUs*2.2).sort((a,b)=>overlapDuration(b)-overlapDuration(a))[0]
    const top = schedulingTask ?? containing.sort((a, b) => (a.duration - b.duration) || (a.exclusive - b.exclusive))[0] ?? overlappingWork
    const functionCall = overlap.filter((event) => /FunctionCall/.test(event.name) && event.duration > 0).sort((a, b) => b.duration - a.duration)[0]
    const react = commits.filter((commit) => commit.startTime < point.startMs + point.durationMs && commit.commitTime >= point.startMs)
    const rafOverlapMs = (item) => Math.max(0,Math.min(item.startTimeMs+item.durationMs,point.startMs+point.durationMs)-Math.max(item.startTimeMs,point.startMs))
    const associatedRaf = rafIntervals.filter((item) => rafOverlapMs(item)>0).sort((a,b)=>rafOverlapMs(b)-rafOverlapMs(a))[0]
    const functionName = functionCall?.args?.data?.functionName || functionCall?.args?.location?.function_name || top?.args?.data?.functionName || top?.args?.beginData?.functionName || null
    const functionUrl = functionCall?.args?.data?.url || functionCall?.args?.location?.file_name || null
    const sourceFile = typeof functionUrl === 'string' ? functionUrl.split(/[\\/]/).at(-1)?.split('?')[0] : null
    const candidate = functionName || (functionCall ? `anonymous FunctionCall${sourceFile ? ` in ${sourceFile}` : ''}${Number.isFinite(functionCall.args?.data?.lineNumber) ? `:${functionCall.args.data.lineNumber}` : ''}` : null)
    const categoriesOnThread = categories.filter((item) => item.category !== 'other')
    const reactDuration = Math.max(0, ...react.map((commit) => commit.actualDuration))
    const confidence = trace.metadata?.dataLossOccurred === true
      ? 'insuficiente: Chromium sinalizou perda de eventos; esta atribuição não é completa'
      : trace.metadata?.dataLossOccurred !== false
        ? 'insuficiente: integridade completa do trace não confirmada pelos metadados; associação temporal apenas'
      : functionCall && overlapDuration(functionCall) >= point.durationMs * 600 && reactDuration >= point.durationMs * 0.3
        ? 'moderada: FunctionCall e React Profiler cobrem parte substancial do intervalo; associação temporal, não causalidade provada'
        : categoriesOnThread.length ? 'baixa: eventos coincidem no tempo, causalidade não demonstrada' : 'insuficiente: trace sem evento atribuível para o intervalo'
    return {
      scenario: trace.scenario ?? diagnostics.scenario ?? null,
      source: point.sources.join(' + '),
      relativeTimestampMs: +(point.startMs - (diagnostics.windowStartMs ?? 0)).toFixed(3),
      durationMs: +point.durationMs.toFixed(3),
      thread: { pid: mainPid, tid: mainTid, name: threads.get(`${mainPid}:${mainTid}`) ?? null },
      topEvent: top ? { name: top.name, inclusiveMs: +(top.duration / 1000).toFixed(3), exclusiveMs: +((top.exclusive ?? 0) / 1000).toFixed(3) } : null,
      predominantExclusiveCategories: categories,
      candidateFunction: candidate ? { name: candidate, line: functionCall?.args?.data?.lineNumber ?? null } : null,
      reactCommits: react.slice(0, 8).map((commit) => ({ route: commit.route, phase: commit.phase, actualDurationMs: commit.actualDuration, intervalMs: +(commit.commitTime - commit.startTime).toFixed(3) })),
      associatedRafIntervalMs: associatedRaf ? +associatedRaf.durationMs.toFixed(3) : null,
      confidence,
      evidence: [
        `${point.sources.map((source) => source === 'long-task' ? 'long-task do PerformanceObserver' : 'intervalo de requestAnimationFrame').join(' e ')} no mesmo processo renderer.`,
        alignment.aligned ? `Clock alignment residual máximo ${alignment.maxErrorMs} ms.` : 'Sem clock alignment válido; timestamps não correlacionados.',
        trace.metadata?.dataLossOccurred === true ? 'CDP marcou dataLossOccurred=true; eventos ausentes podem explicar intervalos sem atribuição.' : trace.metadata?.dataLossOccurred === false ? 'CDP confirmou dataLossOccurred=false.' : 'Os metadados CDP não informaram dataLossOccurred; integridade não confirmada por esse sinal.',
        overlap.some((event) => /Layout|Paint|Style|GC/i.test(event.name)) ? 'Há eventos de render/layout/GC sobrepostos; sobreposição não demonstra causalidade.' : 'Não foram encontrados eventos de layout/paint/GC sobrepostos nesta thread.'
      ]
    }
  }).sort((a, b) => b.durationMs - a.durationMs).slice(0, 20)
  const processSummary = [...processes].map(([pid, name]) => ({ pid, name, threads: [...threads].filter(([key]) => key.startsWith(`${pid}:`)).map(([key, threadName]) => ({ tid: Number(key.split(':')[1]), name: threadName })) }))
  const eventCounts = { events: events.length, rendererMain: events.filter((event) => event.pid === mainPid && event.tid === mainTid).length, gc: events.filter((event) => event.pid === mainPid && /\bGC\b|V8\.GC/i.test(event.name)).length, style: events.filter((event) => event.pid === mainPid && /UpdateLayoutTree|RecalculateStyles/i.test(event.name)).length, layout: events.filter((event) => event.pid === mainPid && /Layout/.test(event.name)).length, paint: events.filter((event) => event.pid === mainPid && /Paint|PrePaint|Layerize/.test(event.name)).length, imageDecode: events.filter((event) => /DecodeImage|ImageDecodeTask/i.test(event.name)).length, imageUpload: events.filter((event) => /UploadImage|ImageUploadTask/i.test(event.name)).length, raster: events.filter((event) => /RasterTask|RasterizerTask/i.test(event.name)).length, compositorWait: events.filter((event) => /WaitForCommitCompletion/.test(event.name)).length }
  return {
    schemaVersion: 1,
    scenario: trace.scenario ?? diagnostics.scenario ?? null,
    alignment,
    traceIntegrity:{dataLossOccurred:trace.metadata?.dataLossOccurred??null,normalizedEventCount:events.length,traceEventCount:trace.traceEvents.length,rafGapThresholdMs:+rafGapThresholdMs.toFixed(3),rafBaselineMs:+rafBaselineMs.toFixed(3)},
    renderer: { pid: mainPid, tid: mainTid, threadName: mainPid === null ? null : threads.get(`${mainPid}:${mainTid}`) ?? null },
    processes: processSummary,
    eventCounts,
    limits: ['Inclusive durations are reported for parent events. Exclusive time subtracts the union of direct child intervals on the same thread.', 'Categories and React/RAF matches are temporal associations. They do not by themselves establish causality.', 'Missing trace events, stacks, renderer metadata or clock pairs are reported as unavailable; no function is inferred from absence.'],
    peaks: peakRows
  }
}

if (require.main === module) {
  const input = process.argv[2]
  if (!input) throw new Error('Uso: node scripts/editor-v6/analyze-trace.cjs <trace.json> [saida.json]')
  const trace = JSON.parse(fs.readFileSync(input, 'utf8'))
  const result = analyzeTrace(trace)
  const output = process.argv[3] ?? path.join(path.dirname(input), `${path.basename(input, path.extname(input))}-analysis.json`)
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8')
  console.log(`Trace: ${result.eventCounts.events} eventos; renderer ${result.renderer.pid ?? 'n/d'}:${result.renderer.tid ?? 'n/d'}; alinhado=${result.alignment.aligned}; picos=${result.peaks.length}; saída=${output}`)
}

module.exports = { analyzeTrace, normalizeEvents, findClockAlignment, makeHierarchy, classify, mergeOverlappingIntervals }
