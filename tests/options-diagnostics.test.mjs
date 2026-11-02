import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosticAlerts, domainLabels, formatBytes, formatDate, groupLabels, latestDiagnosticFailure, totalStorageBytes } from '../src/renderer/src/features/options/optionsDiagnostics.ts'

test('formata valores e datas sem alterar o contrato pt-BR da tela', () => {
  assert.equal(formatBytes(10), '10 B')
  assert.equal(formatBytes(1024), '1 KB')
  assert.equal(formatBytes(1024 * 1024), '1 MB')
  assert.equal(formatDate('not-a-date'), 'Data desconhecida')
  assert.equal(typeof formatDate('2026-11-01T12:00:00.000Z'), 'string')
  assert.equal(groupLabels.media, 'Mídia compartilhada')
  assert.equal(domainLabels['video-studio.backgrounds'], 'Biblioteca de fundos')
})

test('soma os bytes dos grupos de armazenamento', () => {
  const summary = { disk: { groups: { models: { bytes: 120 }, media: { bytes: 880 } } } }
  assert.equal(totalStorageBytes(summary), 1000)
})

test('diagnósticos agregam eventos, leituras incompletas, referências e migração pendente', () => {
  const events = [
    { severity: 'error' },
    { severity: 'warning' },
    { severity: 'warning' }
  ]
  const summary = {
    disk: { groups: { media: { files: 3, bytes: 30, unreadable: 1 } } },
    catalog: { unreferencedObjects: 2 }
  }
  const migration = { domains: [{ state: 'pending' }, { state: 'active' }] }

  const alerts = diagnosticAlerts(events, summary, migration, [])
  assert.deepEqual(alerts.map(({ level, title }) => ({ level, title })), [
    { level: 'error', title: '1 erro(s) registrado(s)' },
    { level: 'warning', title: '2 aviso(s) registrado(s)' },
    { level: 'warning', title: '1 item(ns) não puderam ser medidos' },
    { level: 'warning', title: '2 objeto(s) sem referência no catálogo' },
    { level: 'warning', title: '1 domínio(s) de migração ainda pendente(s)' },
    { level: 'info', title: 'Nenhum backup manual disponível' }
  ])
})

test('a visão geral identifica a falha mais recente sem depender da ordem de leitura', () => {
  const events = [
    { severity: 'error', at: '2026-11-01T10:00:00.000Z', code: 'old', id: '1' },
    { severity: 'warning', at: '2026-11-01T11:00:00.000Z', code: 'warning', id: '2' },
    { severity: 'error', at: '2026-11-01T12:00:00.000Z', code: 'new', id: '3' }
  ]
  assert.equal(latestDiagnosticFailure(events)?.code, 'new')
  assert.equal(latestDiagnosticFailure([]), null)
})

test('estado saudável reconhece backups verificados e migração concluída', () => {
  const summary = {
    disk: { groups: { media: { files: 1, bytes: 100, unreadable: 0 } } },
    catalog: { unreferencedObjects: 0 }
  }
  const alerts = diagnosticAlerts([], summary, { domains: [{ state: 'verified' }] }, [
    { verifiedAt: '2026-11-01T12:00:00.000Z' }
  ])

  assert.deepEqual(alerts.map((alert) => alert.title), [
    'As verificações concluídas não apontaram problemas'
  ])
})

test('sem uma leitura, informa que armazenamento continua sem medição', () => {
  const alerts = diagnosticAlerts([], null, null, [])
  assert.deepEqual(alerts.map((alert) => alert.title), [
    'Armazenamento ainda não medido',
    'Nenhum backup manual disponível'
  ])
})
