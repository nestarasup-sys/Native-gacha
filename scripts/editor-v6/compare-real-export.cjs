'use strict'
/** Offline, read-only comparison with the sanitized November 5 reference.
 * Never prints paths, project/character IDs, faces, assets or raw reports.
 */
const { readFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { createHash } = require('node:crypto')
const DEFAULT_BASELINE = resolve(__dirname, '../../docs/editor-v6/baselines/native_gacha_nova_baseline_2026-11-05.json')
const sha256 = text => createHash('sha256').update(String(text)).digest('hex')
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] === undefined ? null
    : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
function compareExportReport(baseline, report) {
  const errors = []
  const c = baseline.configuration, o = report.options || {}
  const eq = (label, actual, expected) => { if (actual !== expected) errors.push(label + ': configuração diferente') }
  eq('projeto (hash do ID)', typeof report.projectId === 'string' ? sha256(report.projectId) : null, baseline.project_id_sha256)
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
    compatible: true, referenceSeconds: Number(reference.toFixed(3)),
    mainSeconds: Number(mainSeconds.toFixed(3)), hairSeconds: Number(hairSeconds.toFixed(3)),
    totalSeconds: Number(totalSeconds.toFixed(3)),
    deltaSeconds: Number((totalSeconds - reference).toFixed(3)),
    percentChange: Number(((totalSeconds / reference - 1) * 100).toFixed(2)),
    details,
    buildSha: report.runtime?.buildSha ?? null,
    note: 'Sem SHA de build não é possível atribuir ganho a um commit específico. A comparação é do mesmo projeto e configuração, não da aparência visual.'
  }
}
function parseCli(args) {
  const candidates = [], options = { baseline: DEFAULT_BASELINE, json: false }
  for (const arg of args) {
    if (arg.startsWith('--candidate=')) candidates.push(resolve(arg.slice('--candidate='.length)))
    else if (arg.startsWith('--baseline=')) options.baseline = resolve(arg.slice('--baseline='.length))
    else if (arg === '--json') options.json = true
    else throw Error('Opção desconhecida. Uso: npm run bench:editor-v6:compare -- --candidate=<relatorio.json> [--candidate=<segunda.json> ...] [--json]')
  }
  if (!candidates.length) throw Error('Informe pelo menos um --candidate=<relatorio.json> (pode repetir três vezes).')
  return { ...options, candidates }
}
async function main(args = process.argv.slice(2)) {
  const options = parseCli(args)
  const baseline = JSON.parse(await readFile(options.baseline, 'utf8'))
  const results = []
  for (const candidate of options.candidates) {
    const report = JSON.parse(await readFile(candidate, 'utf8'))
    results.push(compareExportReport(baseline, report))
  }
  const valid = results.filter(result => result.compatible)
  const summary = { comparable: results.every(result => result.compatible), samples: results.length,
    medianSeconds: valid.length === results.length ? median(valid.map(result => result.totalSeconds)) : null,
    minimumThreeSamples: valid.length >= 3,
    results }
  if (options.json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log('Nova baseline (projeto novo): ' + baseline.times_seconds.estimated_total_preparation_to_output.toFixed(3) + ' s')
    for (const [index, result] of results.entries()) {
      if (!result.compatible) console.log('Rodada ' + (index + 1) + ': NÃO COMPARÁVEL — ' + result.reasons.join('; '))
      else console.log('Rodada ' + (index + 1) + ': ' + result.totalSeconds + ' s (diferença ' + result.deltaSeconds + ' s; ' + result.percentChange + '%)')
    }
    if (summary.minimumThreeSamples && summary.comparable) console.log('Mediana de ' + summary.samples + ' rodadas: ' + summary.medianSeconds + ' s')
    else console.log('Ganho ainda não comprovado: requer 3 rodadas comparáveis e inspeção visual.')
  }
  if (!summary.comparable) process.exitCode = 2
  return summary
}
if (require.main === module) main().catch(() => {
  // Do not echo exception details: file paths may include personal information.
  console.error('Não foi possível ler ou interpretar os relatórios. Verifique os arquivos e argumentos.')
  process.exitCode = 1
})
module.exports = { compareExportReport, median, parseCli, main }
