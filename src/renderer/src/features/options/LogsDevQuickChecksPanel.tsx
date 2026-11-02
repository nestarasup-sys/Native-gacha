import type { DiagnosticsQuickCheckSnapshot } from '../../../../shared/dataManagement'

const checkLabels = {
  runtime: 'Resposta do processo principal e contrato de runtime',
  events: 'Leitura local do histórico de eventos',
  backups: 'Leitura do catálogo de backups'
} as const

export function LogsDevQuickChecksPanel({
  snapshot,
  busy,
  cancelRequested,
  onRun,
  onCancel
}: {
  snapshot: DiagnosticsQuickCheckSnapshot | null
  busy: boolean
  cancelRequested: boolean
  onRun: () => void
  onCancel: () => void
}) {
  return <section className="options-panel options-quick-checks" aria-label="Verificações rápidas">
    <header className="options-panel-header">
      <div><span className="options-eyebrow">AUTODIAGNÓSTICO · SOMENTE LEITURA</span><h2>Verificações rápidas</h2><p>Consulta o runtime, os eventos locais e a lista de backups. Não altera arquivos nem valida o conteúdo dos projetos.</p></div>
      <div className="options-event-toolbar">
        {!busy
          ? <button className="options-button primary" type="button" onClick={onRun}>Executar verificações</button>
          : <button className="options-button secondary" type="button" onClick={onCancel}>Parar próximas leituras</button>}
      </div>
    </header>
    {busy && <p className="options-quick-check-status" role="status">{cancelRequested ? 'A chamada atual terminará antes de parar.' : 'Executando leituras locais…'}</p>}
    {snapshot && <>
      <p className="options-quick-check-status" role="status">
        {snapshot.cancelled ? 'Execução cancelada entre leituras.' : `Concluída em ${new Date(snapshot.completedAt).toLocaleString('pt-BR')}.`}
        {' '}{snapshot.results.filter((result) => result.status === 'passed').length} aprovadas · {snapshot.results.filter((result) => result.status === 'failed').length} falhas.
      </p>
      <div className="options-quick-check-list">
        {snapshot.results.map((result) => <article className={`options-quick-check options-quick-check-${result.status}`} key={result.id}>
          <span aria-hidden="true">{result.status === 'passed' ? '✓' : '!'}</span>
          <div><strong>{checkLabels[result.id]}</strong><small>{result.status === 'passed' ? `${result.itemsChecked.toLocaleString('pt-BR')} item(ns) · ${result.durationMs} ms` : `A consulta falhou · ${result.durationMs} ms. Veja Eventos e logs.`}</small></div>
        </article>)}
        {!snapshot.results.length && <div className="options-empty"><strong>Nenhuma leitura foi iniciada</strong><span>A solicitação foi cancelada antes da primeira verificação.</span></div>}
      </div>
    </>}
    {!snapshot && !busy && <div className="options-empty"><strong>Nenhuma verificação executada nesta sessão</strong><span>As leituras começam somente quando você acionar o botão.</span></div>}
  </section>
}
