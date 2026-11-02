import type { RuntimeProcessMetric, RuntimeDiagnosticsSnapshot } from '../../../../shared/dataManagement'

function formatCpu(value: number | null): string {
  return value === null ? 'Indisponível' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function formatMemory(value: number | null): string {
  return value === null ? 'Indisponível' : `${(value / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

function kindLabel(process: RuntimeProcessMetric): string {
  if (process.kind === 'main') return 'Processo principal'
  if (process.kind === 'renderer') return 'Interface'
  if (process.kind === 'auxiliary') return `Auxiliar · ${process.type}`
  return process.type
}

export function RuntimeProcessMetricsTable({ snapshot }: { snapshot: RuntimeDiagnosticsSnapshot['processMetrics'] }) {
  const interval = snapshot.sampleIntervalMs
  return <section className="options-process-metrics" aria-label="Métricas por processo">
    <header>
      <div><h3>Processos do aplicativo</h3><p>Memória por processo; os valores não são somados para evitar contar memória compartilhada duas vezes.</p></div>
    </header>
    <p className="options-process-sampling-note" role="note">
      {interval === null
        ? 'A primeira leitura inicia a janela de CPU. Atualize a leitura para obter a média entre duas medições sob demanda.'
        : `CPU é a média do intervalo de ${(interval / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s desde a leitura anterior. Não há monitoramento em segundo plano.`}
    </p>
    {snapshot.processes.length === 0
      ? <p className="options-empty">O Electron não informou processos nesta leitura.</p>
      : <div className="options-process-table-wrap"><table>
        <thead><tr><th scope="col">Processo</th><th scope="col">PID</th><th scope="col">CPU média</th><th scope="col">Working set</th><th scope="col">Privada</th><th scope="col">Pico</th></tr></thead>
        <tbody>{snapshot.processes.map((process) => <tr key={`${process.pid}-${process.type}`}>
          <th scope="row"><strong>{process.label}</strong><small>{kindLabel(process)}</small></th>
          <td>{process.pid}</td>
          <td>{formatCpu(process.cpuPercent)}</td>
          <td>{formatMemory(process.workingSetBytes)}</td>
          <td>{formatMemory(process.privateBytes)}</td>
          <td>{formatMemory(process.peakWorkingSetBytes)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>
}
