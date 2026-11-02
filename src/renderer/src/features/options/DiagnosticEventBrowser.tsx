import { useMemo, useState } from 'react'
import type { DiagnosticDomain, LocalDiagnosticEvent } from '../../../../shared/dataManagement'
import type { DiagnosticEventExportResult } from '../../../../shared/dataManagement'
import { DIAGNOSTIC_DOMAINS } from '../../../../shared/dataManagement'
import { formatDate } from './optionsDiagnostics'
import {
  DEFAULT_DIAGNOSTIC_EVENT_FILTERS,
  filterDiagnosticEvents,
  type DiagnosticEventFilters
} from './diagnosticEventBrowserModel'

const domainLabels: Record<DiagnosticDomain, string> = {
  electron: 'Electron',
  storage: 'Armazenamento',
  fabricator: 'Fabricador',
  customizer: 'Customizador',
  studio: 'Studio',
  'editor-v6': 'Editor V6',
  roteiros: 'Roteiros',
  'base-videos': 'Base de vídeos',
  'media-library': 'Biblioteca de mídia',
  ui: 'Interface'
}

const diagnosticHints: Record<string, string> = {
  'renderer.uncaught-error': 'Uma exceção JavaScript chegou ao limite global sem tratamento pela interface.',
  'renderer.unhandled-rejection': 'Uma operação assíncrona foi rejeitada sem tratamento pela interface.',
  'diagnostics.events-aggregated': 'A fila de escrita atingiu seu limite; as ocorrências adicionais foram agregadas em um aviso com a contagem total.'
}

function severityLabel(severity: LocalDiagnosticEvent['severity']): string {
  return severity === 'error' ? 'Erro' : severity === 'warning' ? 'Aviso' : 'Info'
}

function sourceLabel(source: LocalDiagnosticEvent['source']): string {
  return source === 'main' ? 'Processo principal' : 'Interface'
}

function eventDetails(event: LocalDiagnosticEvent): string {
  return JSON.stringify(event, null, 2)
}

export function DiagnosticEventBrowser({
  events,
  busy,
  loaded,
  error,
  onRefresh,
  onExport
}: {
  events: LocalDiagnosticEvent[]
  busy: boolean
  loaded: boolean
  error: string | null
  onRefresh: () => void
  onExport: (eventIds: string[]) => Promise<DiagnosticEventExportResult>
}) {
  const [filters, setFilters] = useState<DiagnosticEventFilters>(DEFAULT_DIAGNOSTIC_EVENT_FILTERS)
  const [visibleLimit, setVisibleLimit] = useState(100)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const filteredEvents = useMemo(() => filterDiagnosticEvents(events, filters), [events, filters])
  const visibleEvents = filteredEvents.slice(0, visibleLimit)

  const updateFilter = <K extends keyof DiagnosticEventFilters>(key: K, value: DiagnosticEventFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const clearFilters = () => setFilters(DEFAULT_DIAGNOSTIC_EVENT_FILTERS)
  const copyEvent = async (event: LocalDiagnosticEvent) => {
    try {
      await navigator.clipboard.writeText(eventDetails(event))
      setCopyStatus('Evento sanitizado copiado.')
    } catch {
      setCopyStatus('Não foi possível copiar. Confira a permissão da área de transferência.')
    }
  }
  const exportFilteredEvents = async () => {
    setExportBusy(true)
    setExportStatus(null)
    try {
      const result = await onExport(filteredEvents.map((event) => event.id))
      setExportStatus(result.saved
        ? `${result.eventCount.toLocaleString('pt-BR')} evento(s) salvo(s) em ${result.fileName}. Revise antes de compartilhar.`
        : result.eventCount ? 'Exportação cancelada.' : 'Os eventos selecionados não estão mais disponíveis.')
    } catch (reason) {
      setExportStatus(reason instanceof Error ? reason.message : 'Não foi possível exportar os eventos filtrados.')
    } finally {
      setExportBusy(false)
    }
  }

  return <section className="options-panel" aria-label="Eventos e logs">
    <header className="options-panel-header">
      <div><span className="options-eyebrow">REGISTROS LOCAIS</span><h2>Eventos e logs</h2><p>Até 500 ocorrências recentes. Mensagens e metadados são sanitizados antes do armazenamento; o navegador não inventa stack traces. A exportação contém somente os eventos filtrados e permite escolher o arquivo local.</p></div>
      <div className="options-event-toolbar">
        <button className="options-button primary" type="button" onClick={() => void exportFilteredEvents()} disabled={exportBusy || filteredEvents.length === 0}>{exportBusy ? 'Preparando…' : 'Exportar filtrados'}</button>
        <button className="options-button secondary" type="button" onClick={onRefresh} disabled={busy}>{busy ? 'Lendo…' : 'Atualizar'}</button>
        <button className="options-button secondary" type="button" onClick={clearFilters}>Limpar filtros</button>
      </div>
    </header>

    <div className="options-event-filters">
      <label className="options-event-search"><span>Buscar em código, mensagem e detalhes</span><input type="search" maxLength={120} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Ex.: exportação, armazenamento, falha…" /></label>
      <label><span>Gravidade</span><select value={filters.severity} onChange={(event) => updateFilter('severity', event.target.value as DiagnosticEventFilters['severity'])}><option value="all">Todas</option><option value="error">Erros</option><option value="warning">Avisos</option><option value="info">Informações</option></select></label>
      <label><span>Domínio</span><select value={filters.domain} onChange={(event) => updateFilter('domain', event.target.value as DiagnosticEventFilters['domain'])}><option value="all">Todos</option><option value="unclassified">Sem domínio (legado)</option>{DIAGNOSTIC_DOMAINS.map((domain) => <option key={domain} value={domain}>{domainLabels[domain]}</option>)}</select></label>
      <label><span>Origem</span><select value={filters.source} onChange={(event) => updateFilter('source', event.target.value as DiagnosticEventFilters['source'])}><option value="all">Todos os processos</option><option value="main">Processo principal</option><option value="renderer">Interface</option></select></label>
      <label><span>De</span><input type="datetime-local" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label><span>Até</span><input type="datetime-local" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <label><span>Ordem</span><select value={filters.order} onChange={(event) => updateFilter('order', event.target.value as DiagnosticEventFilters['order'])}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></label>
    </div>

    <div className="options-event-result-summary" aria-live="polite">
      <span>{filteredEvents.length.toLocaleString('pt-BR')} de {events.length.toLocaleString('pt-BR')} eventos</span>
      {filteredEvents.length > visibleEvents.length && <span> · exibindo {visibleEvents.length.toLocaleString('pt-BR')}</span>}
    </div>
    {error && <p className="options-inline-message error" role="alert">{error}</p>}
    {copyStatus && <p className="options-inline-message" role="status">{copyStatus}</p>}
    {exportStatus && <p className="options-inline-message" role="status">{exportStatus}</p>}
    {!busy && loaded && events.length === 0 && <div className="options-empty"><strong>Nenhum evento local registrado</strong><span>Falhas não tratadas da interface e avisos registrados pelo aplicativo aparecerão aqui.</span></div>}
    {!busy && loaded && events.length > 0 && filteredEvents.length === 0 && <div className="options-empty"><strong>Nenhum evento corresponde aos filtros</strong><span>Limpe ou ajuste a busca, o período e os filtros selecionados.</span></div>}

    <div className="options-event-list" aria-busy={busy}>
      {visibleEvents.map((event) => <details className={`options-event options-event-${event.severity}`} key={event.id}>
        <summary><span className="options-event-severity">{severityLabel(event.severity)}</span><strong>{event.code}</strong><time dateTime={event.at}>{formatDate(event.at)}</time></summary>
        <div className="options-event-details">
          <p>{event.message}</p>
          {diagnosticHints[event.code] && <small className="options-event-hint">{diagnosticHints[event.code]}</small>}
          <dl>
            <div><dt>Processo</dt><dd>{sourceLabel(event.source)}</dd></div>
            {event.domain && <div><dt>Domínio</dt><dd>{domainLabels[event.domain]}</dd></div>}
            {event.route && <div><dt>Rota</dt><dd>{event.route}</dd></div>}
            {event.operation && <div><dt>Operação</dt><dd>{event.operation}</dd></div>}
            {event.stage && <div><dt>Etapa</dt><dd>{event.stage}</dd></div>}
            {event.result && <div><dt>Resultado</dt><dd>{event.result}</dd></div>}
            {event.durationMs !== undefined && <div><dt>Duração</dt><dd>{event.durationMs.toLocaleString('pt-BR')} ms</dd></div>}
            {event.correlationId && <div><dt>Correlação</dt><dd>{event.correlationId}</dd></div>}
          </dl>
          <button className="options-button secondary compact" type="button" onClick={() => void copyEvent(event)}>Copiar evento sanitizado</button>
        </div>
      </details>)}
    </div>
    {filteredEvents.length > visibleEvents.length && <button className="options-button secondary options-events-more" type="button" onClick={() => setVisibleLimit((current) => current + 100)}>Mostrar mais eventos</button>}
  </section>
}
