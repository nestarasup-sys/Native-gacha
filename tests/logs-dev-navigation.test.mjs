import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  APPLICATION_ROUTES,
  LEGACY_ROUTE_REDIRECTS,
  sanitizeDiagnosticRoute,
  UI_PERFORMANCE_ROUTES
} from '../src/shared/applicationRoutes.ts'

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
