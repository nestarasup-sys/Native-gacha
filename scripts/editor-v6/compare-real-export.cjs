'use strict'
/** Offline, read-only comparison with the sanitized November 5 reference.
 * Never prints paths, project/character IDs, faces, assets or raw reports.
 */
const { readFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const { createHash } = require('node:crypto')
const DEFAULT_BASELINE = resolve(__dirname, '../../docs/editor-v6/baselines/native_gacha_nova_baseline_2026-11-05.json')
const sha256 = text => createHash('sha256').update(String(text)).digest('hex')
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] === undefined ? null
    : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
const TEST_MODES = ['controle','movimentos-1','boca-1','captura-8','rosto-legado','combinado']
function compareExportReport(baseline, report) {
  const errors = []
  const c = baseline.configuration, o = report.options || {}
  const eq = (label, actual, expected) => { if (actual !== expected) errors.push(label + ': configuração diferente') }
  if (!/^[0-9a-f]{64}$/i.test(baseline.project_id_sha256 ?? '')) errors.push('referência local ausente: informe --reference-report para confirmar o mesmo projeto')
  else eq('projeto (hash do ID)', typeof report.projectId === 'string' ? sha256(report.projectId) : null, baseline.project_id_sha256)
  const mode = o.testMode ?? 'controle'
  if (!TEST_MODES.includes(mode)) errors.push('modo de exportação desconhecido')
  for (const [a, b] of [['startFrame','start_frame'],['endFrame','end_frame'],['width',null],['height',null],['turbo','turbo'],['mouthLoopCycleFrames','mouth_cycle_frames'],['hairPoseReactionOnly','hair_reaction_only'],['hairPosteriorOnly','hair_posterior_only'],['hairAnimationPresetSlot','hair_preset_slot']]) {
    const expected = b === null ? (a === 'width' ? c.resolution[0] : c.resolution[1]) : c[b]
    eq(a, o[a], expected)
  }
  eq('encoder solicitado', o.encoder, c.encoder_requested)
  eq('fps', report.fps, c.fps)
  eq('quadros', report.totalFrames, c.total_frames)
  eq('clipes de áudio', report.audioClips, c.audio_clips)
  eq('entradas de vídeo', report.videoInputs, c.video_inputs)
  eq('status', report.state, 'completed')
  eq('fallback', report.fallback, false)
  const attempts = report.attempts || []
  eq('tentativa única', attempts.length, 1)
  if (attempts.length) {
    eq('encoder usado', attempts[0].encoder, c.encoder_actual)
    eq('paralelismo', attempts[0].parallelism, c.workers)
    eq('partes Turbo', attempts[0].parts?.length, c.workers)
  }
  const video = report.validation?.streams?.find(stream => stream.codec_type === 'video')
  eq('quadros MP4 verificados', Number(video?.nb_read_frames ?? -1), c.total_frames)
  eq('largura MP4', video?.width, c.resolution[0])
  eq('altura MP4', video?.height, c.resolution[1])
  eq('codec MP4', video?.codec_name, 'h264')
  eq('emenda validada', report.validation?.seams?.join(','), baseline.seams.join(','))
  if (!report.motionCache) errors.push('cache de movimento: ausente')
  else {
    eq('cache frio (memória)', report.motionCache.memoryHits, 0)
    eq('cache frio (disco)', report.motionCache.diskHits, 0)
  }
  if (!report.hairPreparation) errors.push('preparação do cabelo: ausente')
  const mainSeconds = report.milliseconds / 1000, hairSeconds = report.hairPreparation?.totalMilliseconds / 1000
  if (!Number.isFinite(mainSeconds) || mainSeconds <= 0 || !Number.isFinite(hairSeconds) || hairSeconds < 0) errors.push('durações de exportação/preparação: inválidas')
  if (errors.length) return { compatible: false, reasons: errors }
  const totalSeconds = mainSeconds + hairSeconds
  const reference = baseline.times_seconds.estimated_total_preparation_to_output
  const phases = report.phaseMilliseconds || {}
  const details = {
    motionSeconds: (phases.motionPreparation ?? 0) / 1000,
    hairSeconds, renderingSeconds: (phases.rendering ?? 0) / 1000,
    preparedRigs: report.motionPreparation?.preparedRigs ?? null,
    reusedRigs: report.motionPreparation?.reusedRigs ?? null,
    rigBuildSeconds: Number.isFinite(report.motionPreparation?.rigBuildMilliseconds) ? report.motionPreparation.rigBuildMilliseconds / 1000 : null,
    rigKeyLookups: report.motionPreparation?.rigKeyLookups ?? null,
    rigRebuilds: report.motionPreparation?.rigRebuilds ?? null,
    captureReadbacks: attempts[0].parts.reduce((total, part) => total + (part.frameMetrics?.captureReadbacks ?? 0), 0),
    captureStaleReadbacks: attempts[0].parts.reduce((total, part) => total + (part.frameMetrics?.captureStaleReadbacks ?? 0), 0)
  }
  return {
    compatible: true, mode, referenceSeconds: Number(reference.toFixed(3)),
    mainSeconds: Number(mainSeconds.toFixed(3)), hairSeconds: Number(hairSeconds.toFixed(3)),
    totalSeconds: Number(totalSeconds.toFixed(3)),
    deltaSeconds: Number((totalSeconds - reference).toFixed(3)),
    percentChange: Number(((totalSeconds / reference - 1) * 100).toFixed(2)),
    details,
    buildSha: report.runtime?.buildSha ?? null,
    note: 'Sem SHA de build não é possível atribuir ganho a um commit específico. A comparação é do mesmo projeto e configuração, não da aparência visual.'
  }
}
function summarizeByMode(results) {
  const modes = []
  for (const mode of TEST_MODES) {
    const values = results.filter(result => result.compatible && result.mode === mode).map(result => result.totalSeconds)
    if (values.length) modes.push({ mode, samples: values.length, medianSeconds: Number(median(values).toFixed(3)), minimumThreeSamples: values.length >= 3 })
  }
  const qualified = modes.filter(mode => mode.minimumThreeSamples)
  return { modes, winner: qualified.length >= 2 && modes.every(mode => mode.minimumThreeSamples) && results.every(result => result.compatible)
    ? [...qualified].sort((a,b) => a.medianSeconds - b.medianSeconds)[0].mode : null }
}
function parseCli(args) {
  const candidates = [], options = { baseline: DEFAULT_BASELINE, referenceReport: null, json: false }
  for (const arg of args) {
    if (arg.startsWith('--candidate=')) candidates.push(resolve(arg.slice('--candidate='.length)))
    else if (arg.startsWith('--baseline=')) options.baseline = resolve(arg.slice('--baseline='.length))
    else if (arg.startsWith('--reference-report=')) options.referenceReport = resolve(arg.slice('--reference-report='.length))
    else if (arg === '--json') options.json = true
    else throw Error('Opção desconhecida. Uso: npm run bench:editor-v6:compare -- --reference-report=<baseline-original.report.json> --candidate=<relatorio.json> [--candidate=...] [--json]')
  }
  if (!candidates.length) throw Error('Informe pelo menos um --candidate=<relatorio.json> (pode repetir três vezes).')
  return { ...options, candidates }
}
async function main(args = process.argv.slice(2)) {
  const options = parseCli(args)
  let baseline = JSON.parse(await readFile(options.baseline, 'utf8'))
  if (options.referenceReport) {
    // Original report stays on the user's computer. Do not print/commit its ID.
    const original = JSON.parse(await readFile(options.referenceReport, 'utf8'))
    const expected = baseline.times_seconds
    const mainSeconds = original.milliseconds / 1000
    const hairSeconds = original.hairPreparation?.totalMilliseconds / 1000
    if (typeof original.projectId !== 'string' || !original.projectId ||
      original.state !== 'completed' || original.totalFrames !== baseline.configuration.total_frames || original.fallback !== false ||
      !Number.isFinite(mainSeconds) || !Number.isFinite(hairSeconds) ||
      Math.abs(mainSeconds - expected.export_main) > .15 || Math.abs(hairSeconds - expected.pre_job_hair_preparation) > .15)
      throw Error('O relatório original informado não corresponde à nova baseline sanitizada.')
    baseline = { ...baseline, project_id_sha256: sha256(original.projectId) }
  }
  const results = []
  for (const candidate of options.candidates) {
    const report = JSON.parse(await readFile(candidate, 'utf8'))
    results.push(compareExportReport(baseline, report))
  }
  const valid = results.filter(result => result.compatible)
  const byMode = summarizeByMode(results)
  const summary = { comparable: results.every(result => result.compatible), samples: results.length,
    minimumThreeSamples: byMode.modes.every(group => group.minimumThreeSamples), byMode: byMode.modes,
    winner: byMode.winner, results }
  if (options.json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log('Nova baseline (projeto novo): ' + baseline.times_seconds.estimated_total_preparation_to_output.toFixed(3) + ' s')
    for (const [index, result] of results.entries()) {
      if (!result.compatible) console.log('Rodada ' + (index + 1) + ': NÃO COMPARÁVEL — ' + result.reasons.join('; '))
      else console.log('Rodada ' + (index + 1) + ' [' + result.mode + ']: ' + result.totalSeconds + ' s (diferença ' + result.deltaSeconds + ' s; ' + result.percentChange + '%)')
    }
    for (const group of summary.byMode) console.log('Modo ' + group.mode + ': ' + group.samples + ' rodada(s), mediana ' + group.medianSeconds + ' s' + (group.minimumThreeSamples ? '' : ' (faltam rodadas)'))
    if (summary.winner) console.log('Menor mediana entre modos comparáveis: ' + summary.winner + ' (verifique também a qualidade visual).')
    else console.log('Vencedor ainda indefinido: mínimo de três rodadas por modo, projeto verificado e inspeção visual.')
  }
  if (!summary.comparable) process.exitCode = 2
  return summary
}
if (require.main === module) main().catch(() => {
  // Do not echo exception details: file paths may include personal information.
  console.error('Não foi possível ler ou interpretar os relatórios. Verifique os arquivos e argumentos.')
  process.exitCode = 1
})
module.exports = { compareExportReport, summarizeByMode, median, parseCli, main }
