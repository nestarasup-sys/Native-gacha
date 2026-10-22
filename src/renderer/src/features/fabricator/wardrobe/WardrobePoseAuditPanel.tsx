import type { WardrobePoseAuditResult } from '../../../../../shared/wardrobePoseAudit'

type Props = {
  disabled: boolean
  running: boolean
  results: readonly WardrobePoseAuditResult[]
  error: string
  onAudit: () => void
  onPreview: (slot: number) => void
}

/** Warn about structural outliers; do not present a computer judgment as visual approval. */
export function WardrobePoseAuditPanel({disabled,running,results,error,onAudit,onPreview}:Props) {
  return <section className="wardrobe-pose-audit" aria-label="Conferência de todas as poses">
    <button className="pose-button secondary" disabled={disabled || running} onClick={onAudit} type="button">
      {running ? 'Conferindo poses…' : 'Conferir todas as poses'}
    </button>
    {error && <small role="alert">{error}</small>}
    {!!results.length && <div className="wardrobe-pose-audit-results" role="list">
      {results.map(result => <div key={result.slot} role="listitem" className="wardrobe-pose-audit-row">
        <button className="pose-button secondary" onClick={() => onPreview(result.slot)} type="button">
          {String(result.slot).padStart(2,'0')} · {result.name}
        </button>
        <small>{result.status === 'ok' ? 'Sem alertas estruturais' : result.status === 'incompatible' ? 'Vínculo incompatível' : 'Revisão recomendada'}</small>
        {result.warnings.map((warning,i) => <small key={i}>{warning}</small>)}
      </div>)}
    </div>}
    {results.length > 0 && <small className="wardrobe-note">A conferência é geométrica e não substitui a inspeção visual de cada pose.</small>}
  </section>
}
