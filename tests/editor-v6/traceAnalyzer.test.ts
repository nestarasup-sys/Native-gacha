import { describe, expect, it } from 'vitest'
import { analyzeTrace, normalizeEvents, makeHierarchy, mergeOverlappingIntervals } from '../../scripts/editor-v6/analyze-trace.cjs'

const syncName = 'editor-v6:trace-sync:test:start'
const alignedTrace = () => ({
  scenario: 'heavy',
  clockPairs: [
    { name: syncName, performanceNowMs: 100 },
    { name: 'editor-v6:trace-sync:test:end', performanceNowMs: 200 }
  ],
  diagnostics: {
    windowStartMs: 100,
    longTasks: [],
    rafIntervals: [{ startTimeMs: 115, durationMs: 45 }],
    react: [{ route: '/editor-v6', longTaskSamples: [{ startTime: 120, duration: 100 }], commitSamples: [{ phase: 'update', startTime: 130, commitTime: 150, actualDuration: 38, baseDuration: 60 }] }]
  },
  traceEvents: [
    { ph: 'M', name: 'process_name', pid: 10, tid: 1, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', pid: 10, tid: 1, args: { name: 'CrRendererMain' } },
    { ph: 'M', name: 'process_name', pid: 20, tid: 2, args: { name: 'Worker' } },
    { ph: 'M', name: 'thread_name', pid: 20, tid: 2, args: { name: 'CompositorWorker' } },
    { ph: 'I', name: 'UserTiming::Mark', cat: 'blink.user_timing', ts: 600_000, pid: 10, tid: 1, args: { data: { name: syncName } } },
    { ph: 'I', name: 'UserTiming::Mark', cat: 'blink.user_timing', ts: 700_000, pid: 10, tid: 1, args: { data: { name: 'editor-v6:trace-sync:test:end' } } },
    { ph: 'X', name: 'RunTask', cat: 'toplevel', ts: 620_000, dur: 100_000, pid: 10, tid: 1 },
    { ph: 'X', name: 'FunctionCall', cat: 'devtools.timeline', ts: 620_000, dur: 80_000, pid: 10, tid: 1, args: { data: { functionName: 'tick', url: '/src/EditorV6Page.tsx', lineNumber: 42 } } },
    { ph: 'X', name: 'Layout', cat: 'devtools.timeline', ts: 630_000, dur: 20_000, pid: 10, tid: 1 },
    { ph: 'X', name: 'Paint', cat: 'devtools.timeline', ts: 650_000, dur: 10_000, pid: 10, tid: 1 },
    { ph: 'X', name: 'V8.GC_SCAVENGER', cat: 'v8', ts: 680_000, dur: 10_000, pid: 10, tid: 1 },
    { ph: 'X', name: 'FunctionCall', cat: 'devtools.timeline', ts: 620_000, dur: 100_000, pid: 20, tid: 2, args: { data: { functionName: 'backgroundWork' } } }
  ]
})

describe('analisador de trace Chromium do Editor V6', () => {
  it('une intervalos RAF/long-task com início/fim corretos para ordenações e sobreposições diferentes', () => {
    const cases = [
      { name:'A começa antes de B', input:[{type:'raf-gap',startMs:1,durationMs:10},{type:'long-task',startMs:5,durationMs:8}], expected:[{startMs:1,endMs:13,durationMs:12}] },
      { name:'B começa antes de A', input:[{type:'long-task',startMs:5,durationMs:8},{type:'raf-gap',startMs:1,durationMs:10}], expected:[{startMs:1,endMs:13,durationMs:12}] },
      { name:'intervalos idênticos', input:[{type:'raf-gap',startMs:4,durationMs:9},{type:'long-task',startMs:4,durationMs:9}], expected:[{startMs:4,endMs:13,durationMs:9}] },
      { name:'sobreposição parcial', input:[{type:'raf-gap',startMs:0,durationMs:10},{type:'long-task',startMs:9,durationMs:10}], expected:[{startMs:0,endMs:19,durationMs:19}] },
      { name:'contenção completa', input:[{type:'raf-gap',startMs:0,durationMs:20},{type:'long-task',startMs:5,durationMs:4}], expected:[{startMs:0,endMs:20,durationMs:20}] },
      { name:'sem sobreposição', input:[{type:'raf-gap',startMs:0,durationMs:5},{type:'long-task',startMs:5,durationMs:5}], expected:[{startMs:0,endMs:5,durationMs:5},{startMs:5,endMs:10,durationMs:5}] }
    ]
    for (const sample of cases) {
      const result = mergeOverlappingIntervals(sample.input)
      expect(result.map(({startMs,endMs,durationMs})=>({startMs,endMs,durationMs})),sample.name).toEqual(sample.expected)
    }
    expect(mergeOverlappingIntervals(cases[0].input)[0].sources).toEqual(['raf-gap','long-task'])
  })

  it('alinha performance.now com ts CDP e associa tarefas, React e RAF na thread renderer', () => {
    const report = analyzeTrace(alignedTrace())
    expect(report.alignment.aligned).toBe(true)
    expect(report.alignment.maxErrorMs).toBe(0)
    expect(report.renderer).toMatchObject({ pid: 10, tid: 1, threadName: 'CrRendererMain' })
    expect(report.processes).toHaveLength(2)
    expect(report.eventCounts.gc).toBe(1)
    expect(report.eventCounts.layout).toBe(1)
    expect(report.eventCounts.paint).toBe(1)
    const task = report.peaks.find((peak) => peak.source.includes('long-task'))!
    expect(task).toMatchObject({ durationMs: 105, associatedRafIntervalMs: 45 })
    expect(task.candidateFunction?.name).toBe('tick')
    expect(task.reactCommits).toHaveLength(1)
    expect(task.topEvent?.inclusiveMs).toBe(100)
    expect(task.topEvent?.exclusiveMs).toBe(20)
    expect(task.predominantExclusiveCategories.map((item: { category: string }) => item.category)).toEqual(expect.arrayContaining(['javascript', 'layout', 'paint-composite', 'gc']))
    expect(task.confidence).toContain('associação temporal')
  })

  it('não soma duração inclusiva como custo exclusivo e preserva slices sobrepostos', () => {
    const events = normalizeEvents([
      { ph: 'X', name: 'parent', ts: 0, dur: 100, pid: 1, tid: 1 },
      { ph: 'X', name: 'child', ts: 20, dur: 60, pid: 1, tid: 1 },
      { ph: 'X', name: 'overlap', ts: 40, dur: 80, pid: 1, tid: 1 }
    ])
    const hierarchy = makeHierarchy(events)
    expect(hierarchy.roots).toHaveLength(2)
    expect(hierarchy.roots[0].name).toBe('parent')
    expect(hierarchy.roots[0].exclusive).toBe(40)
    expect(hierarchy.roots[0].children[0].exclusive).toBe(60)
    expect(hierarchy.roots[1]).toMatchObject({ name: 'overlap', start: 40, end: 120, exclusive: 80 })
  })

  it('reporta desalinhamento, ausência de long tasks e commits sem correspondência', () => {
    const trace: any = alignedTrace()
    trace.clockPairs = []
    trace.diagnostics.longTasks = []
    trace.diagnostics.react[0].longTaskSamples = []
    trace.diagnostics.react[0].commitSamples[0].startTime = 1_000
    trace.diagnostics.react[0].commitSamples[0].commitTime = 1_001
    const report = analyzeTrace(trace)
    expect(report.alignment).toMatchObject({ aligned: false, maxErrorMs: null })
    expect(report.peaks).toHaveLength(1)
    expect(report.peaks[0].source).toBe('raf-gap')
    expect(report.peaks[0].reactCommits).toHaveLength(0)
    expect(report.peaks[0].confidence).toContain('insuficiente')
  })

  it('aceita trace sem long tasks/metadata, fases B/E e eventos inválidos sem inventar renderer', () => {
    const events = normalizeEvents([
      { ph: 'B', name: 'Task', cat: 'x', ts: 10, pid: 1, tid: 2 },
      { ph: 'E', name: 'Task', cat: 'x', ts: 30, pid: 1, tid: 2 },
      { ph: 'X', name: 'broken', ts: 'bad', dur: 2 }
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ start: 10, end: 30, duration: 20 })
    const report = analyzeTrace({ traceEvents: [{ ph: 'X', name: 'Paint', ts: 1, dur: 1, pid: 1, tid: 2 }], diagnostics: {} })
    expect(report.alignment.aligned).toBe(false)
    expect(report.renderer).toMatchObject({ pid: null, tid: null })
    expect(report.peaks).toEqual([])
  })

  it('usa a cadência RAF observada para incluir gaps de dois refreshes e deixa integridade desconhecida explícita', () => {
    const trace: any = alignedTrace()
    trace.metadata = { dataLossOccurred: null }
    trace.diagnostics.rafIntervals = [
      { startTimeMs: 105, durationMs: 10 },
      { startTimeMs: 115, durationMs: 11 },
      { startTimeMs: 126, durationMs: 12 },
      { startTimeMs: 138, durationMs: 26.9 }
    ]
    trace.diagnostics.react[0].longTaskSamples = []
    const report = analyzeTrace(trace)
    expect(report.traceIntegrity.rafBaselineMs).toBe(11)
    expect(report.traceIntegrity.rafGapThresholdMs).toBe(20)
    expect(report.peaks[0].durationMs).toBe(26.9)
    expect(report.peaks[0].confidence).toContain('integridade completa do trace não confirmada')
  })

  it('rejeita arquivo trace malformado', () => {
    expect(() => analyzeTrace({ traceEvents: {} })).toThrow(/traceEvents/)
  })
})
