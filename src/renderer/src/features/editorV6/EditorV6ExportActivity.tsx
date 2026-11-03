import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { EditorV6ExportStatus } from '../../../../shared/editorV6Export'
import { measureEditorV6ExportActivity, recordEditorV6ExportActivitySample, type EditorV6ExportActivitySample } from './editorV6ExportActivityMetrics'

const isFinished = (job: EditorV6ExportStatus | null) => Boolean(job && ['completed', 'cancelled', 'failed'].includes(job.state))
const stageNames = ['Preparação', 'Renderização', 'Montagem', 'Validação', 'Concluído']
const stageIndex: Record<EditorV6ExportStatus['state'], number> = { preparing: 0, rendering: 1, joining: 2, validating: 3, completed: 4, cancelled: 0, failed: 0 }
const stateNames: Record<EditorV6ExportStatus['state'], string> = {
  preparing: 'Preparando', rendering: 'Renderizando', joining: 'Montando vídeo', validating: 'Validando MP4',
  completed: 'Concluída', cancelled: 'Cancelada', failed: 'Falhou'
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '—'
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const remainder = seconds % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function ExportSpeedChart({ samples, active }: { samples: ReturnType<typeof measureEditorV6ExportActivity>['speedSamples']; active: boolean }) {
  const width = 352, chartTop = 12, chartBottom = 94, horizontalPadding = 9
  const maxSpeed = Math.max(30, ...samples.map((sample) => sample.framesPerSecond))
  const targetY = chartBottom - Math.min(1, 30 / maxSpeed) * (chartBottom - chartTop)
  const slotWidth = samples.length ? (width - horizontalPadding * 2) / samples.length : 0
  return <div className={`v6-export-chart${samples.length ? ' has-data' : ' is-empty'}`} role="img" aria-label={samples.length ? 'Gráfico da velocidade real de renderização, em quadros por segundo' : active ? 'Aguardando amostras reais de velocidade da renderização' : 'Ainda não há amostras de renderização'}>
    {samples.length ? <svg viewBox={`0 0 ${width} 108`} aria-hidden="true">
      <line className="v6-export-chart-grid" x1="0" x2={width} y1={chartTop} y2={chartTop} />
      <line className="v6-export-chart-grid" x1="0" x2={width} y1={chartBottom} y2={chartBottom} />
      <line className="v6-export-chart-target" x1="0" x2={width} y1={targetY} y2={targetY} />
      {samples.map((sample, index) => {
        const barHeight = Math.max(3, sample.framesPerSecond / maxSpeed * (chartBottom - chartTop))
        const barWidth = Math.max(2, Math.min(9, slotWidth * .62))
        const x = horizontalPadding + index * slotWidth + (slotWidth - barWidth) / 2
        return <rect key={`${index}-${sample.milliseconds}-${sample.frames}`} className={`v6-export-chart-bar${index === samples.length - 1 ? ' latest' : ''}`} x={x} y={chartBottom - barHeight} width={barWidth} height={barHeight} rx="2">
          <title>{`${sample.framesPerSecond.toFixed(1)} quadros/s · ${sample.frames} quadros em ${(sample.milliseconds / 1000).toFixed(1)} s`}</title>
        </rect>
      })}
    </svg> : <div className="v6-export-chart-waiting" aria-label="Coletando amostras reais de renderização">
      <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
    </div>}
    <div className="v6-export-chart-legend"><span><i /> {samples.length ? 'Quadros renderizados por segundo' : active ? 'Aguardando os primeiros quadros…' : 'Sem amostras de renderização'}</span><small>Referência: 30 FPS</small></div>
  </div>
}

export function EditorV6ExportActivity({ job, starting, preparingHair, startedAt }: {
  job: EditorV6ExportStatus | null
  starting: boolean
  preparingHair: boolean
  startedAt: number | null
}) {
  const [samples, setSamples] = useState<EditorV6ExportActivitySample[]>([])
  const [now, setNow] = useState(() => Date.now())
  const active = starting || Boolean(job && !isFinished(job))

  useEffect(() => {
    if (!job) return
    const timestamp = Date.now()
    setNow(timestamp)
    setSamples((current) => recordEditorV6ExportActivitySample(current, job, timestamp))
  }, [job?.id, job?.state, job?.frames])

  useEffect(() => {
    if (!active) return
    const updateClock = () => setNow(Date.now())
    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const metrics = useMemo(() => job ? measureEditorV6ExportActivity(samples, job, now, startedAt ?? undefined) : null, [job, now, samples, startedAt])
  const lastWorkState = [...samples].reverse().find((sample) => !['completed', 'cancelled', 'failed'].includes(sample.state))?.state
  const currentStage = starting ? 0 : job ? stageIndex[job.state] || stageIndex[lastWorkState ?? 'preparing'] : 0
  const percentage = metrics?.progress ?? 0
  const statusLabel = starting
    ? preparingHair ? 'Preparando cabelo e camadas' : 'Aguardando destino do arquivo'
    : job ? stateNames[job.state] : 'Preparando exportação'
  const detail = starting
    ? preparingHair ? 'Organizando as peças e as imagens que entram no movimento.' : 'Escolha onde o MP4 final será salvo.'
    : job?.message ?? 'A exportação está sendo preparada.'
  const fps = metrics?.framesPerSecond
  const shownFps = fps === null || fps === undefined ? '—' : `${fps.toFixed(1)}`
  const frameCount = job ? `${job.frames.toLocaleString('pt-BR')} / ${job.totalFrames.toLocaleString('pt-BR')}` : '—'
  const elapsed = metrics ? formatDuration(metrics.elapsedMs) : starting && startedAt !== null ? formatDuration(now - startedAt) : '00:00'
  const eta = metrics?.estimatedRemainingMs === null || metrics?.estimatedRemainingMs === undefined ? 'Calculando' : formatDuration(metrics.estimatedRemainingMs)
  const progressRingStyle = { '--export-progress': `${percentage}%`, '--export-progress-offset': `${100 - percentage}` } as CSSProperties
  const stageTrackStyle = { '--stage-progress': `${job?.state === 'completed' ? 82 : currentStage * 20.5}%` } as CSSProperties

  return <section className={`v6-export-activity${active ? ' is-active' : ''}${job?.state === 'failed' ? ' is-failed' : ''}${job?.state === 'completed' ? ' is-complete' : ''}`} aria-label="Acompanhamento da exportação">
    <div className="v6-export-activity-topline">
      <span className="v6-export-activity-kicker"><i /> {active ? 'EXPORTAÇÃO AO VIVO' : 'ATIVIDADE DA EXPORTAÇÃO'}</span>
      <span className={`v6-export-activity-state state-${starting ? 'preparing' : job?.state ?? 'preparing'}`}>{statusLabel}</span>
    </div>
    <div className="v6-export-activity-main">
      <div className="v6-export-ring" style={progressRingStyle} role="img" aria-label={`${Math.round(percentage)} por cento concluído`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="v6-export-ring-track" cx="60" cy="60" r="51" />
          <circle className="v6-export-ring-value" cx="60" cy="60" r="51" pathLength="100" />
        </svg>
        <span><strong>{starting ? '…' : `${Math.round(percentage)}%`}</strong><small>concluído</small></span>
      </div>
      <div className="v6-export-activity-details">
        <div className="v6-export-activity-copy"><strong>{starting ? 'Preparando sua exportação' : job?.state === 'completed' ? 'Seu vídeo está pronto' : job?.state === 'failed' ? 'A exportação precisa de atenção' : job?.state === 'cancelled' ? 'Exportação interrompida' : 'Renderizando seu projeto'}</strong><p title={detail}>{detail}</p></div>
        <div className="v6-export-metrics">
          <div><span>VELOCIDADE</span><strong>{shownFps}<small> FPS</small></strong></div>
          <div><span>{startedAt === null ? 'TEMPO ACOMPANHADO' : 'TEMPO DECORRIDO'}</span><strong>{elapsed}</strong></div>
          <div><span>TEMPO RESTANTE</span><strong>{eta}</strong></div>
        </div>
        {job?.motionProgress && <div className="v6-export-motion-progress"><span>Preparação das transições <b>{job.motionProgress.completed} / {job.motionProgress.total}</b></span><progress max={job.motionProgress.total || 1} value={job.motionProgress.completed} /></div>}
      </div>
      <div className="v6-export-chart-panel">
        <div className="v6-export-chart-heading"><span>Ritmo de renderização</span><strong>{frameCount}<small> quadros</small></strong></div>
        <ExportSpeedChart samples={metrics?.speedSamples ?? []} active={active} />
      </div>
    </div>
    <ol className="v6-export-stage-track" style={stageTrackStyle} aria-label={`Etapa atual: ${starting ? 'preparação' : job ? stateNames[job.state] : 'preparação'}`}>
      {stageNames.map((name, index) => {
        const done = job?.state === 'completed' || index < currentStage
        const current = index === currentStage && job?.state !== 'completed'
        return <li className={`${done ? 'is-done' : ''}${current ? ' is-current' : ''}${current && job?.state === 'failed' ? ' is-error' : ''}`} key={name}>
          <i>{done ? '✓' : index + 1}</i><span>{name}</span>
        </li>
      })}
    </ol>
    {job?.fallback && <p className="v6-export-fallback-note">O Turbo encontrou uma falha e continuou automaticamente em modo seguro.</p>}
    {job?.error && <p className="v6-export-error" role="alert">{job.error}</p>}
  </section>
}
