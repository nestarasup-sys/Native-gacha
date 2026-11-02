import type { IpcPerformanceDiagnosticsSnapshot } from '../../../../shared/dataManagement'

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
}

export function IpcPerformancePanel({
  snapshot,
  busy,
  error,
  onRefresh,
  onSetEnabled
}: {
  snapshot: IpcPerformanceDiagnosticsSnapshot | null
  busy: boolean
  error: string | null
  onRefresh: () => void
  onSetEnabled: (enabled: boolean) => void
}) {
  const rows = snapshot?.rows.slice(0, 10) ?? []
  return <section className="options-panel options-ipc-performance" aria-label="Estatísticas agregadas de IPC">
    <header className="options-panel-header">
      <div><span className="options-eyebrow">COLETA OPCIONAL · SEM PAYLOADS</span><h2>Latência de operações IPC</h2><p>Coleta somente os canais instrumentados de Studio, Editor V6 e Customizador. O limite é cinco minutos por sessão.</p></div>
      <div className="options-event-toolbar">
        <button className={`options-button${snapshot?.enabled ? ' danger' : ' primary'}`} type="button" onClick={() => onSetEnabled(!snapshot?.enabled)} disabled={busy}>
          {busy ? 'Atualizando…' : snapshot?.enabled ? 'Parar coleta' : 'Iniciar coleta'}
        </button>
        <button className="options-button secondary" type="button" onClick={onRefresh} disabled={busy}>{busy ? 'Lendo…' : 'Atualizar leitura'}</button>
      </div>
    </header>
    {error && <p className="options-inline-message error" role="alert">{error}</p>}
    {snapshot && <p className={`options-ipc-state${snapshot.enabled ? ' active' : ''}`} role="status">
      {snapshot.enabled
        ? `Coleta ativa · ${formatDuration(snapshot.durationMs)} de no máximo ${formatDuration(snapshot.maxDurationMs)}${snapshot.startedAt ? ` · iniciada ${new Date(snapshot.startedAt).toLocaleString('pt-BR')}` : ''}`
        : snapshot.rows.length
          ? `Coleta encerrada · ${formatDuration(snapshot.durationMs)} registrados${snapshot.startedAt ? ` · iniciada ${new Date(snapshot.startedAt).toLocaleString('pt-BR')}` : ''}`
          : 'Nenhuma operação foi coletada nesta sessão. A coleta permanece desligada por padrão.'}
    </p>}
    {rows.length > 0
      ? <div className="options-ipc-table-wrap"><table>
        <thead><tr><th scope="col">Canal IPC</th><th scope="col">Chamadas</th><th scope="col">Falhas</th><th scope="col">Média</th><th scope="col">Pior duração</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.channel}><th scope="row"><code>{row.channel}</code></th><td>{row.calls.toLocaleString('pt-BR')}</td><td>{row.failures.toLocaleString('pt-BR')}</td><td>{row.averageMs.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ms</td><td>{row.worstMs.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ms</td></tr>)}</tbody>
      </table></div>
      : snapshot && !snapshot.enabled && <div className="options-empty"><strong>Sem amostras IPC</strong><span>Inicie a coleta e use as operações instrumentadas. Nenhum dado de projeto ou conteúdo IPC é armazenado.</span></div>}
  </section>
}
