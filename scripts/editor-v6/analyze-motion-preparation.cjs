const fs = require('node:fs')
const path = require('node:path')

const input = process.argv[2] || path.resolve('out/editor-v6-motion-service/result.json')
const report = JSON.parse(fs.readFileSync(input, 'utf8'))
const benchmark = report.motionPreparationBenchmark
if (!benchmark || !Array.isArray(benchmark.runs) || !Array.isArray(benchmark.summary)) {
  throw new Error(`O relatório ${input} não contém motionPreparationBenchmark.runs e .summary.`)
}
const byteMiB = (bytes) => Number((bytes / 1024 / 1024).toFixed(1))
const rows = benchmark.summary.map((item) => ({
  cenário: item.scenario,
  personagens: item.characters,
  concorrênciaSolicitada: item.concurrency,
  concorrênciaEfetiva: item.optimizedMedianMs === null ? 'sem medição' : item.effectiveConcurrencyOptimized,
  baselineMs: item.baselineMedianMs,
  otimizadoMs: item.optimizedMedianMs,
  variaçãoPercentual: item.changePercent,
  rigsBaseline: item.baselineRigBuilds,
  rigsOtimizado: item.optimizedRigBuilds,
  rssBaselineMiB: item.baselinePeakRssBytes == null ? null : byteMiB(item.baselinePeakRssBytes),
  rssOtimizadoMiB: byteMiB(item.optimizedPeakRssBytes),
  workingSetElectronBaselineMiB: item.baselinePeakElectronWorkingSetBytes == null ? null : byteMiB(item.baselinePeakElectronWorkingSetBytes),
  workingSetElectronOtimizadoMiB: byteMiB(item.optimizedPeakElectronWorkingSetBytes),
  workingSetGpuProcessBaselineMiB: item.baselinePeakGpuProcessWorkingSetBytes == null ? null : byteMiB(item.baselinePeakGpuProcessWorkingSetBytes),
  workingSetGpuProcessOtimizadoMiB: byteMiB(item.optimizedPeakGpuProcessWorkingSetBytes)
}))
console.log(JSON.stringify({
  arquivo: path.resolve(input),
  fixture: report.fixture,
  observacaoDeMemoria: 'RSS e working set do processo GPU são memória residente do host; não representam VRAM.',
  observacaoDeTempo: 'Tempos por etapa são acumulados por transição e podem se sobrepor entre workers; não devem ser somados como tempo exclusivo de parede.',
  visualParity: benchmark.visualParity,
  rows
}, null, 2))
