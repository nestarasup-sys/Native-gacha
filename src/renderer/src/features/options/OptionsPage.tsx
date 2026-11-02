import './options.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DataBackupSummary, DataMigrationProgress as MigrationProgress, DataMigrationSummary as MigrationSummary,
  DataStorageSummary as StorageSummary, LocalDiagnosticEvent, RuntimeDiagnosticsSnapshot
} from '../../../../shared/dataManagement'
import { diagnosticAlerts, domainLabels, formatBytes, formatDate, groupLabels, totalStorageBytes } from './optionsDiagnostics'
import { createOptionsBackupCommands } from './optionsBackupCommands'
import { createOptionsMigrationCommands } from './optionsMigrationCommands'

type StoredBackup = DataBackupSummary
type EventFilter = 'all' | 'error' | 'warning'

export function LogsDevPage() {
  const [summary, setSummary] = useState<StorageSummary | null>(null)
  const [storageBusy, setStorageBusy] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageScanMs, setStorageScanMs] = useState<number | null>(null)
  const [runtime, setRuntime] = useState<RuntimeDiagnosticsSnapshot | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [events, setEvents] = useState<LocalDiagnosticEvent[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [eventsBusy, setEventsBusy] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportMessage, setReportMessage] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [migration, setMigration] = useState<MigrationSummary | null>(null)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [pauseRequested, setPauseRequested] = useState(false)
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const [backups, setBackups] = useState<StoredBackup[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)

  const refreshStorage = useCallback(async () => {
    setStorageBusy(true); setStorageError(null)
    const startedAt = performance.now()
    try {
      setSummary(await window.desktop.dataManagement.getAppDataStorageSummary())
      setStorageScanMs(Math.round(performance.now() - startedAt))
    } catch (reason) { setStorageError(reason instanceof Error ? reason.message : 'Não foi possível medir o armazenamento local.') }
    finally { setStorageBusy(false) }
  }, [])
  const refreshRuntime = useCallback(async () => {
    setRuntimeBusy(true); setRuntimeError(null)
    try { setRuntime(await window.desktop.dataManagement.getRuntimeDiagnostics()) }
    catch (reason) { setRuntimeError(reason instanceof Error ? reason.message : 'Não foi possível medir a memória dos processos.') }
    finally { setRuntimeBusy(false) }
  }, [])
  const refreshEvents = useCallback(async () => {
    setEventsBusy(true); setEventsError(null)
    try { setEvents(await window.desktop.dataManagement.listLocalDiagnosticEvents()); setEventsLoaded(true) }
    catch (reason) { setEventsError(reason instanceof Error ? reason.message : 'Não foi possível ler os registros locais.') }
    finally { setEventsBusy(false) }
  }, [])
  const refreshBackups = useCallback(async () => {
    try { setBackups(await window.desktop.dataManagement.listDataBackups()); setBackupError(null) }
    catch (reason) { setBackupError(reason instanceof Error ? reason.message : 'Não foi possível listar os backups.') }
  }, [])
  const refreshMigration = useCallback(async () => {
    setMigrationBusy(true); setMigrationError(null)
    try { setMigration(await window.desktop.dataManagement.getDataMigrationSummary()) }
    catch (reason) { setMigrationError(reason instanceof Error ? reason.message : 'Não foi possível inventariar os domínios.') }
    finally { setMigrationBusy(false) }
  }, [])
  const backupCommands = useMemo(() => createOptionsBackupCommands({
    createBackup: () => window.desktop.dataManagement.createDataBackup(),
    verifyBackup: (id) => window.desktop.dataManagement.verifyDataBackup(id),
    restoreBackup: (id) => window.desktop.dataManagement.restoreDataBackup(id),
    deleteBackup: (id) => window.desktop.dataManagement.deleteDataBackup(id),
    refreshBackups,
    setBusy: setBackupBusy,
    setMessage: setBackupMessage,
    setError: setBackupError
  }), [refreshBackups])
  const migrationCommands = useMemo(() => createOptionsMigrationCommands({
    runMigration: () => window.desktop.dataManagement.runDataMigration(),
    pauseMigration: () => window.desktop.dataManagement.pauseDataMigration(),
    restartAfterMigration: () => window.desktop.dataManagement.restartAfterDataMigration(),
    refreshMigration,
    setBusy: setMigrationBusy,
    setPauseRequested,
    setProgress,
    setError: setMigrationError
  }), [refreshMigration])

  useEffect(() => {
    void refreshEvents()
    void refreshBackups()
    return window.desktop.dataManagement.onDataMigrationProgress(setProgress)
  }, [refreshBackups, refreshEvents])

  const createBackup = backupCommands.create
  const verifyBackup = backupCommands.verify
  const restoreBackup = backupCommands.restore
  const deleteBackup = backupCommands.remove
  const runMigration = migrationCommands.run
  const requestPause = migrationCommands.pause
  const restart = migrationCommands.restart
  const saveReport = useCallback(async () => {
    setReportBusy(true); setReportError(null); setReportMessage(null)
    try {
      const result = await window.desktop.dataManagement.saveDiagnosticsReport()
      setReportMessage(result.saved ? `Relatório salvo como ${result.fileName}.` : 'Exportação cancelada.')
    } catch (reason) { setReportError(reason instanceof Error ? reason.message : 'Não foi possível salvar o relatório.') }
    finally { setReportBusy(false) }
  }, [])

  const alerts = useMemo(() => diagnosticAlerts(events, summary, migration, backups), [events, summary, migration, backups])
  const errorCount = events.filter((event) => event.severity === 'error').length
  const warningCount = events.filter((event) => event.severity === 'warning').length
  const totalBytes = summary ? totalStorageBytes(summary) : 0
  const visibleEvents = [...events].reverse().filter((event) => eventFilter === 'all' || event.severity === eventFilter).slice(0, 50)
  const allMigrated = !!migration?.domains.length && migration.domains.every((domain) => domain.state === 'active' || domain.state === 'verified')
  const pendingDomains = migration?.domains.filter((domain) => domain.state !== 'active' && domain.state !== 'verified').length ?? 0
  const healthState = alerts.some((alert) => alert.level === 'error') ? 'error' : alerts.some((alert) => alert.level === 'warning') ? 'warning' : 'ok'

  return <main className="options-page" aria-label="Logs Dev">
    <div className="options-page-content">
      <header className="options-page-header">
        <div><span className="options-eyebrow">FERRAMENTAS DO APLICATIVO</span><h1>Logs Dev</h1><p>Diagnóstico, registros, desempenho, armazenamento e recuperação do aplicativo.</p></div>
        <div className="options-header-actions">
          <button className="options-button primary" type="button" onClick={() => void saveReport()} disabled={reportBusy}>{reportBusy ? 'Preparando…' : 'Salvar relatório'}</button>
        </div>
      </header>

      <section className={`options-health options-health-${healthState}`} aria-label="Estado geral">
        <div className="options-health-icon" aria-hidden="true">{healthState === 'error' ? '!' : healthState === 'warning' ? '△' : '✓'}</div>
        <div className="options-health-copy"><strong>{healthState === 'error' ? 'Há problemas registrados' : healthState === 'warning' ? 'Há itens para conferir' : summary ? 'Verificações locais concluídas' : 'Registros locais carregados'}</strong><span>{eventsLoaded ? `${errorCount} erros · ${warningCount} avisos registrados` : 'Carregando os registros recentes…'}{summary ? ` · armazenamento medido ${formatDate(summary.disk.measuredAt)}` : ''}</span></div>
        <span className="options-live-badge"><i /> Sem varreduras em segundo plano</span>
      </section>

      {(reportMessage || reportError) && <p className={`options-inline-message${reportError ? ' error' : ''}`} role={reportError ? 'alert' : 'status'}>{reportError ?? reportMessage}</p>}

      <section className="options-overview-grid" aria-label="Resumo">
        <article className="options-overview-card"><span>Armazenamento local</span><strong>{summary ? formatBytes(totalBytes) : 'Não medido'}</strong><small>{summary ? `${Object.values(summary.disk.groups).reduce((n, group) => n + group.files, 0).toLocaleString('pt-BR')} arquivos · ${storageScanMs ?? 0} ms nesta leitura` : 'Faça uma leitura sob demanda'}</small></article>
        <article className="options-overview-card"><span>Processo principal · RSS</span><strong>{runtime ? formatBytes(runtime.memory.mainRssBytes) : 'Não medido'}</strong><small>{runtime ? `Amostra instantânea · ${formatDate(runtime.measuredAt)}` : 'Uma amostra instantânea, sem histórico contínuo'}</small></article>
        <article className="options-overview-card"><span>Problemas recentes</span><strong>{errorCount.toLocaleString('pt-BR')} erros</strong><small>{warningCount.toLocaleString('pt-BR')} avisos · até 500 eventos locais</small></article>
        <article className="options-overview-card"><span>Backups manuais</span><strong>{backups.length.toLocaleString('pt-BR')}</strong><small>{backups.filter((backup) => backup.verifiedAt !== null).length.toLocaleString('pt-BR')} verificados · nunca removidos automaticamente</small></article>
      </section>

      <section className="options-panel" aria-label="Alertas e problemas">
        <header className="options-panel-header"><div><span className="options-eyebrow">RESUMO DE SAÚDE</span><h2>O que precisa de atenção</h2></div><span className="options-count-pill">{alerts.length} itens</span></header>
        <div className="options-alert-list">
          {alerts.map((alert, index) => <article className={`options-alert options-alert-${alert.level}`} key={`${alert.title}-${index}`}><span className="options-alert-mark">{alert.level === 'error' ? '!' : alert.level === 'warning' ? '△' : 'i'}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div></article>)}
        </div>
      </section>

      <section className="options-panel" aria-label="Armazenamento local">
        <header className="options-panel-header"><div><span className="options-eyebrow">PESO DOS DADOS</span><h2>Armazenamento por categoria</h2><p>A medição percorre os arquivos uma vez quando você pedir. Nenhum arquivo é movido ou excluído.</p></div><button className="options-button secondary" type="button" onClick={() => void refreshStorage()} disabled={storageBusy}>{storageBusy ? 'Medindo arquivos…' : summary ? 'Atualizar medição' : 'Medir armazenamento'}</button></header>
        {storageError && <p className="options-inline-message error" role="alert">{storageError}</p>}
        {!summary && !storageBusy && <div className="options-empty"><strong>Armazenamento ainda não medido</strong><span>Inicie a leitura quando quiser. Ela não roda em segundo plano.</span></div>}
        {storageBusy && <div className="options-progress" role="status">Lendo o tamanho dos dados locais…</div>}
        {summary && <>
          <div className="options-storage-total"><strong>{formatBytes(totalBytes)}</strong><span>{Object.values(summary.disk.groups).reduce((n, group) => n + group.files, 0).toLocaleString('pt-BR')} arquivos · leitura concluída em {storageScanMs ?? 0} ms</span></div>
          <div className="options-storage-list">
            {Object.entries(summary.disk.groups).sort((a, b) => b[1].bytes - a[1].bytes).map(([id, group]) => <article className="options-storage-row" key={id}>
              <div className="options-storage-row-heading"><strong>{groupLabels[id] ?? id}</strong><span>{formatBytes(group.bytes)}</span></div>
              <div className="options-storage-track"><i style={{ width: `${totalBytes ? Math.max(group.bytes ? 1 : 0, Math.min(100, group.bytes / totalBytes * 100)) : 0}%` }} /></div>
              <small>{group.files.toLocaleString('pt-BR')} arquivos{group.unreadable ? ` · ${group.unreadable} indisponíveis` : ''}</small>
            </article>)}
          </div>
        </>}
      </section>

      <section className="options-panel" aria-label="Leituras de desempenho">
        <header className="options-panel-header"><div><span className="options-eyebrow">LEITURA INSTANTÂNEA</span><h2>Memória e versão do aplicativo</h2><p>Os valores são uma amostra do momento em que você clicar; não representam pico nem ficam sendo coletados.</p></div><button className="options-button secondary" type="button" onClick={() => void refreshRuntime()} disabled={runtimeBusy}>{runtimeBusy ? 'Medindo…' : runtime ? 'Atualizar leitura' : 'Medir agora'}</button></header>
        {runtimeError && <p className="options-inline-message error" role="alert">{runtimeError}</p>}
        {runtime && <>
          <div className="options-metric-grid">
            <article><span>Processo principal · RSS</span><strong>{formatBytes(runtime.memory.mainRssBytes)}</strong><small>Memória residente do Electron</small></article>
            <article><span>Interface · working set</span><strong>{runtime.memory.rendererWorkingSetBytes === null ? 'Indisponível' : formatBytes(runtime.memory.rendererWorkingSetBytes)}</strong><small>{runtime.memory.rendererPrivateBytes === null ? 'A amostra do sistema não informou memória privada.' : `Privada: ${formatBytes(runtime.memory.rendererPrivateBytes)}`}</small></article>
            <article><span>Heap JavaScript principal</span><strong>{formatBytes(runtime.memory.mainHeapUsedBytes)}</strong><small>Memória usada pelo JavaScript do processo principal</small></article>
            <article><span>Memória externa principal</span><strong>{formatBytes(runtime.memory.mainExternalBytes)}</strong><small>Buffers e recursos externos reportados pelo Node</small></article>
          </div>
          <details className="options-runtime-details"><summary>Versões e campos adicionais</summary><div className="options-version-grid"><span>Aplicativo <b>{runtime.appVersion}</b></span><span>Electron <b>{runtime.electronVersion}</b></span><span>Chromium <b>{runtime.chromiumVersion}</b></span><span>Node <b>{runtime.nodeVersion}</b></span><span>Sistema <b>{runtime.platform} · {runtime.architecture}</b></span><span>Tempo aberto <b>{Math.floor(runtime.uptimeSeconds / 3600)} h {Math.floor(runtime.uptimeSeconds % 3600 / 60)} min</b></span><span>Pico da interface <b>{runtime.memory.rendererPeakWorkingSetBytes === null ? 'Indisponível' : formatBytes(runtime.memory.rendererPeakWorkingSetBytes)}</b></span><span>Compartilhada <b>{runtime.memory.rendererSharedBytes === null ? 'Indisponível' : formatBytes(runtime.memory.rendererSharedBytes)}</b></span></div></details>
          <small className="options-measure-time">Medição: {formatDate(runtime.measuredAt)}</small>
        </>}
      </section>

      <section className="options-panel" aria-label="Logs locais">
        <header className="options-panel-header"><div><span className="options-eyebrow">REGISTROS LOCAIS</span><h2>Erros e avisos recentes</h2><p>Captura eventos de erro da interface e avisos do processo. Mantém no máximo 500 registros curtos e remove caminhos locais. Mensagens técnicas podem conter detalhes específicos; revise antes de compartilhar um relatório.</p></div><div className="options-event-actions"><select aria-label="Filtrar registros" value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)}><option value="all">Todos</option><option value="error">Erros</option><option value="warning">Avisos</option></select><button className="options-button secondary" type="button" onClick={() => void refreshEvents()} disabled={eventsBusy}>{eventsBusy ? 'Lendo…' : 'Atualizar'}</button></div></header>
        {eventsError && <p className="options-inline-message error" role="alert">{eventsError}</p>}
        {!eventsBusy && eventsLoaded && visibleEvents.length === 0 && <div className="options-empty"><strong>{events.length ? 'Nenhum evento neste filtro' : 'Nenhum erro ou aviso registrado'}</strong><span>Novas falhas capturadas aparecerão aqui automaticamente.</span></div>}
        <div className="options-event-list" aria-busy={eventsBusy}>
          {visibleEvents.map((event) => <article className={`options-event options-event-${event.severity}`} key={event.id}><span className="options-event-severity">{event.severity === 'error' ? 'Erro' : event.severity === 'warning' ? 'Aviso' : 'Info'}</span><div className="options-event-copy"><strong>{event.code}</strong><p>{event.message}</p><small>{formatDate(event.at)}{event.route ? ` · ${event.route}` : ''} · {event.source === 'main' ? 'Processo principal' : 'Interface'}</small></div></article>)}
        </div>
      </section>

      <section className="options-panel" aria-label="Backups e recuperação">
        <header className="options-panel-header"><div><span className="options-eyebrow">RECUPERAÇÃO</span><h2>Backups manuais</h2><p>Criar, verificar ou restaurar uma cópia. O app nunca limpa backups automaticamente.</p></div><button className="options-button primary" type="button" onClick={() => void createBackup()} disabled={backupBusy}>{backupBusy ? 'Processando…' : 'Criar backup agora'}</button></header>
        {backupMessage && <p className="options-inline-message" role="status">{backupMessage}</p>}
        {backupError && <p className="options-inline-message error" role="alert">{backupError}</p>}
        {!backups.length && <div className="options-empty"><strong>Nenhum backup manual disponível</strong><span>Crie uma cópia antes de operações importantes.</span></div>}
        <div className="options-backup-list">
          {backups.map((backup) => <article className="options-backup-row" key={backup.id}><div><strong>{formatDate(backup.createdAt)}</strong><span>{backup.fileCount.toLocaleString('pt-BR')} arquivos · {formatBytes(backup.byteLength)} · {backup.verifiedAt ? 'verificado' : 'ainda não verificado'}</span></div><div><button className="options-button secondary compact" type="button" onClick={() => void verifyBackup(backup)} disabled={backupBusy}>Verificar</button><button className="options-button secondary compact" type="button" onClick={() => void restoreBackup(backup)} disabled={backupBusy}>Restaurar</button><button className="options-button danger compact" type="button" onClick={() => void deleteBackup(backup)} disabled={backupBusy}>Excluir</button></div></article>)}
        </div>
      </section>

      <details className="options-advanced" onToggle={(event) => { if (event.currentTarget.open && !migration) void refreshMigration() }}>
        <summary><span><b>Ferramentas antigas e dados avançados</b><small>Migração legada, estado dos domínios e catálogo interno</small></span><i>+</i></summary>
        <div className="options-advanced-content">
          <section className="options-panel options-panel-legacy" aria-label="Migração de dados antigos">
            <header className="options-panel-header"><div><span className="options-eyebrow">MIGRAÇÃO LEGADA</span><h2>Organizar os dados existentes</h2><p>Ferramenta preservada para instalações que ainda não concluíram a migração. Só inventaria os dados quando esta seção é aberta.</p></div><div className="options-header-actions">{migrationBusy ? <button className="options-button secondary" type="button" onClick={() => void requestPause()} disabled={pauseRequested}>{pauseRequested ? 'Pausando…' : 'Pausar após domínio'}</button> : <button className="options-button secondary" type="button" onClick={() => void runMigration()} disabled={!migration || !migration.hasEnoughSpace || pendingDomains === 0}>Migrar {pendingDomains ? `${pendingDomains} domínio(s)` : 'dados'}</button>}{allMigrated && !migrationBusy && <button className="options-button secondary" type="button" onClick={() => void restart()}>Reiniciar e validar</button>}</div></header>
            {migrationBusy && <p className="options-inline-message" role="status">A migração está em andamento. A pausa será aplicada depois do domínio atual.</p>}
            {migration && !migration.hasEnoughSpace && <p className="options-inline-message error" role="alert">Espaço livre insuficiente para copiar e verificar os dados com segurança. Nada foi migrado.</p>}
            {migrationError && <p className="options-inline-message error" role="alert">{migrationError}</p>}
            {progress && <p className="options-progress" role="status">Copiando {domainLabels[progress.domainId] ?? progress.domainId}: {progress.completedFiles.toLocaleString('pt-BR')} / {progress.totalFiles.toLocaleString('pt-BR')} arquivos · {formatBytes(progress.completedBytes)} / {formatBytes(progress.totalBytes)}</p>}
            {migrationBusy && progress && <div className="options-migration-progress"><i style={{ width: `${progress.totalFiles ? Math.min(100, progress.completedFiles / progress.totalFiles * 100) : 0}%` }} /></div>}
            {migrationBusy && !progress && <p className="options-progress">Conferindo espaço e integridade antes de iniciar…</p>}
            {migration && <div className="options-migration-grid">{migration.domains.map((domain) => <article key={domain.domainId}><strong>{domainLabels[domain.domainId] ?? domain.domainId}</strong><span>{domain.fileCount.toLocaleString('pt-BR')} arquivos · {formatBytes(domain.byteLength)}</span><small>{domain.state === 'verified' ? 'Concluído e validado' : domain.state === 'active' ? 'Migrado; aguardando reinício' : domain.state === 'migrating' ? 'Retomável' : 'Pendente'}</small></article>)}</div>}
          </section>
          {summary && <section className="options-panel options-catalog-summary"><header><span className="options-eyebrow">ÍNDICE INTERNO</span><h2>Catálogo de arquivos</h2></header><p>{summary.catalog.assets.toLocaleString('pt-BR')} assets indexados · {summary.catalog.uniqueObjects.toLocaleString('pt-BR')} objetos únicos · {formatBytes(summary.catalog.objectBytes)} em binários catalogados.</p><small>Objetos sem referência são apenas sinalizados; esta tela nunca os remove automaticamente.</small></section>}
        </div>
      </details>

      <footer className="options-privacy-note">O relatório inclui versões, tamanhos agregados e mensagens técnicas recentes. Caminhos locais e URLs são removidos; como as mensagens são texto livre e podem conter detalhes específicos, revise o JSON antes de compartilhar.</footer>
    </div>
  </main>
}

/** Compatibility export for feature-level consumers during the gradual rename. */
export const OptionsPage = LogsDevPage
