export const LOGS_DEV_SECTIONS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'events', label: 'Eventos e logs' },
  { id: 'performance', label: 'Desempenho' },
  { id: 'storage', label: 'Armazenamento' },
  { id: 'backups', label: 'Backups e recuperação' },
  { id: 'tools', label: 'Ferramentas Dev' }
] as const

export type LogsDevSectionId = typeof LOGS_DEV_SECTIONS[number]['id']
