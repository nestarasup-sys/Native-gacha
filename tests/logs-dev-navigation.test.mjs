import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  APPLICATION_ROUTES,
  LEGACY_ROUTE_REDIRECTS,
  sanitizeDiagnosticRoute,
  UI_PERFORMANCE_ROUTES
} from '../src/shared/applicationRoutes.ts'
import { LOGS_DEV_SECTIONS } from '../src/renderer/src/features/options/logsDevSections.ts'

test('Logs Dev is canonical and the old Opções URL redirects to it', async () => {
  assert.equal(APPLICATION_ROUTES.logsDev, '/logs-dev')
  assert.equal(APPLICATION_ROUTES.legacyOptions, '/opcoes')
  assert.equal(LEGACY_ROUTE_REDIRECTS[APPLICATION_ROUTES.legacyOptions], APPLICATION_ROUTES.logsDev)

  const app = await readFile(new URL('../src/renderer/src/ui/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /path=\{APPLICATION_ROUTES\.logsDev\} element=\{<LazyLogsDevPage \/>\}/)
  assert.match(app, /path=\{APPLICATION_ROUTES\.legacyOptions\} element=\{<Navigate to=\{LEGACY_ROUTE_REDIRECTS\[APPLICATION_ROUTES\.legacyOptions\]\} replace \/>\}/)

  const topBar = await readFile(new URL('../src/renderer/src/ui/components/TopBar.tsx', import.meta.url), 'utf8')
  assert.match(topBar, /label: 'Logs Dev', path: APPLICATION_ROUTES\.logsDev/)
})

test('diagnostic and performance route handling recognizes both URLs without exposing unknown paths', () => {
  assert.equal(sanitizeDiagnosticRoute('/logs-dev?tab=events'), '/logs-dev')
  assert.equal(sanitizeDiagnosticRoute('/opcoes#old-link'), '/opcoes')
  assert.equal(sanitizeDiagnosticRoute('/custom/private-project'), '(outra rota)')
  assert.equal(sanitizeDiagnosticRoute(undefined), undefined)
  assert.equal(UI_PERFORMANCE_ROUTES.has('/logs-dev'), true)
  assert.equal(UI_PERFORMANCE_ROUTES.has('/opcoes'), true)
})

test('page identity uses the Logs Dev label while keeping the existing options feature path', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /export function LogsDevPage\(\)/)
  assert.match(page, /<h1>Logs Dev<\/h1>/)
  assert.match(page, /export const OptionsPage = LogsDevPage/)
})

test('Logs Dev separates overview, events, performance, storage, recovery and developer tools', async () => {
  assert.deepEqual(LOGS_DEV_SECTIONS.map(({ id }) => id), [
    'overview', 'events', 'performance', 'storage', 'backups', 'tools'
  ])

  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')
  for (const section of LOGS_DEV_SECTIONS) {
    assert.match(page, new RegExp(`activeSection === '${section.id}'`))
  }
  assert.match(page, /onToggle=\{\(event\) => \{ if \(event\.currentTarget\.open && !migration\) void refreshMigration\(\) \}\}/)

  const eventBrowser = await readFile(new URL('../src/renderer/src/features/options/DiagnosticEventBrowser.tsx', import.meta.url), 'utf8')
  assert.match(eventBrowser, /type="search"/)
  assert.match(eventBrowser, /type="datetime-local"/)
  assert.match(eventBrowser, /Copiar evento sanitizado/)
  assert.match(eventBrowser, /Exportar filtrados/)

  const processTable = await readFile(new URL('../src/renderer/src/features/options/RuntimeProcessMetricsTable.tsx', import.meta.url), 'utf8')
  assert.match(processTable, /CPU é a média do intervalo/)
  assert.match(processTable, /Não há monitoramento em segundo plano/)
  assert.match(processTable, /scope="col"/)
})

test('report export requires a privacy summary before invoking the native save flow', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')
  const preview = await readFile(new URL('../src/renderer/src/features/options/DiagnosticsReportPreviewDialog.tsx', import.meta.url), 'utf8')
  assert.match(page, /onClick=\{\(\) => setReportPreviewOpen\(true\)\}/)
  assert.match(page, /<DiagnosticsReportPreviewDialog/)
  assert.match(preview, /Até 250 eventos locais recentes/)
  assert.match(preview, /lista de processos com PID e memória/)
  assert.match(preview, /Revise o JSON gerado antes de compartilhar/)
})

test('a visão geral mostra falha recente, estado consultado e acesso aos eventos sem declarar aprovação prematura', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /Última falha registrada/)
  assert.match(page, /Processo principal/)
  assert.match(page, /Sem problemas nos eventos consultados/)
  assert.match(page, /Investigar eventos/)
})
