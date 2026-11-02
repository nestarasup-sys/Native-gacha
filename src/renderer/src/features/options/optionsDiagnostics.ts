import type {
  DataBackupSummary, DataMigrationSummary, DataStorageSummary, LocalDiagnosticEvent
} from '../../../../shared/dataManagement'

export const groupLabels: Record<string, string> = {
  characters: 'Personagens', libraries: 'Bibliotecas do Fabricador', projects: 'Projetos dos Studios',
  media: 'Mídia compartilhada', database: 'Catálogo e índices', backups: 'Backups', cache: 'Caches recriáveis',
  temporary: 'Temporários', operations: 'Logs e relatórios', profile: 'Perfil Electron', other: 'Outros dados locais'
}

export const domainLabels: Record<string, string> = {
  'fabricator.models': 'Modelos e folhas', 'fabricator.poses': 'Poses', 'fabricator.animations': 'Animações',
  'fabricator.wardrobe': 'Roupas', 'fabricator.face-sets': 'Rosto', 'fabricator.face-catalog': 'Catálogo do rosto',
  'fabricator.face-components': 'Peças do rosto', 'fabricator.expression-presets': 'Expressões', 'fabricator.hair': 'Cabelos',
  'customizer.characters': 'Personagens e ajustes', 'studio.projects': 'Studio normal',
  'video-studio.media': 'Biblioteca de vídeos', 'video-studio.backgrounds': 'Biblioteca de fundos'
}

export type OptionsDiagnosticAlert = { level: 'error' | 'warning' | 'info'; title: string; detail: string }

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024; let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[unit]}`
}

export function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data desconhecida' : date.toLocaleString('pt-BR')
}

export function totalStorageBytes(summary: DataStorageSummary): number {
  return Object.values(summary.disk.groups).reduce((total, group) => total + group.bytes, 0)
}

export function diagnosticAlerts(
  events: LocalDiagnosticEvent[],
  summary: DataStorageSummary | null,
  migration: DataMigrationSummary | null,
  backups: DataBackupSummary[]
): OptionsDiagnosticAlert[] {
  const alerts: OptionsDiagnosticAlert[] = []
  const errors = events.filter((event) => event.severity === 'error').length
  const warnings = events.filter((event) => event.severity === 'warning').length
  if (errors) alerts.push({ level: 'error', title: `${errors} erro(s) registrado(s)`, detail: 'Abra os eventos recentes para ver a rota e a mensagem curta de cada ocorrência.' })
  if (warnings) alerts.push({ level: 'warning', title: `${warnings} aviso(s) registrado(s)`, detail: 'Avisos do processo principal ou da interface foram salvos localmente.' })
  if (summary) {
    const unreadable = Object.values(summary.disk.groups).reduce((total, group) => total + group.unreadable, 0)
    if (unreadable) alerts.push({ level: 'warning', title: `${unreadable} item(ns) não puderam ser medidos`, detail: 'Algumas pastas estavam indisponíveis durante a medição. Nenhum arquivo foi alterado.' })
    if (summary.catalog.unreferencedObjects) alerts.push({ level: 'warning', title: `${summary.catalog.unreferencedObjects} objeto(s) sem referência no catálogo`, detail: 'Os objetos foram mantidos; esta tela não remove dados automaticamente.' })
  } else alerts.push({ level: 'info', title: 'Armazenamento ainda não medido', detail: 'A leitura é manual e pode ser iniciada no painel de armazenamento.' })
  if (migration) {
    const pending = migration.domains.filter((domain) => domain.state !== 'active' && domain.state !== 'verified').length
    if (pending) alerts.push({ level: 'warning', title: `${pending} domínio(s) de migração ainda pendente(s)`, detail: 'Isso só afeta a estrutura antiga de dados. Confira a seção avançada antes de executar qualquer ação.' })
  }
  if (!backups.length) alerts.push({ level: 'info', title: 'Nenhum backup manual disponível', detail: 'Você pode criar um backup nesta tela antes de mudanças importantes.' })
  else {
    const unverified = backups.filter((backup) => backup.verifiedAt === null).length
    if (unverified) alerts.push({ level: 'warning', title: `${unverified} backup(s) ainda não verificado(s)`, detail: 'Use “Verificar” na lista de backups para conferir a integridade antes de restaurar.' })
  }
  if (!alerts.length && summary) alerts.push({ level: 'info', title: 'As verificações concluídas não apontaram problemas', detail: 'A leitura foi feita sob demanda; o aplicativo não fica varrendo arquivos em segundo plano.' })
  return alerts
}
