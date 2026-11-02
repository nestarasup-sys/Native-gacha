import type { DiagnosticDomain, LocalDiagnosticEvent } from '../../../../shared/dataManagement'

export type DiagnosticEventFilters = {
  search: string
  severity: 'all' | LocalDiagnosticEvent['severity']
  domain: 'all' | 'unclassified' | DiagnosticDomain
  source: 'all' | LocalDiagnosticEvent['source']
  from: string
  to: string
  order: 'newest' | 'oldest'
}

export const DEFAULT_DIAGNOSTIC_EVENT_FILTERS: DiagnosticEventFilters = {
  search: '', severity: 'all', domain: 'all', source: 'all', from: '', to: '', order: 'newest'
}

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lowerBound(value: string): number | null {
  return value ? timestamp(value) : null
}

function upperBoundInclusive(value: string): number | null {
  const parsed = lowerBound(value)
  if (parsed === null) return null
  return value.length === 16 ? parsed + 60_000 - 1 : parsed
}

function searchableText(event: LocalDiagnosticEvent): string {
  return normalizedText([
    event.code, event.message, event.route ?? '', event.domain ?? '', event.operation ?? '', event.stage ?? '',
    event.result ?? '', event.source
  ].join(' '))
}

export function filterDiagnosticEvents(
  events: readonly LocalDiagnosticEvent[],
  filters: DiagnosticEventFilters
): LocalDiagnosticEvent[] {
  const query = normalizedText(filters.search.trim().slice(0, 120))
  const from = lowerBound(filters.from)
  const to = upperBoundInclusive(filters.to)
  return events.map((event, index) => ({ event, index, at: timestamp(event.at) }))
    .filter(({ event, at }) => {
      if (filters.severity !== 'all' && event.severity !== filters.severity) return false
      if (filters.domain === 'unclassified' && event.domain) return false
      if (filters.domain !== 'all' && filters.domain !== 'unclassified' && event.domain !== filters.domain) return false
      if (filters.source !== 'all' && event.source !== filters.source) return false
      if (query && !searchableText(event).includes(query)) return false
      if ((from !== null || to !== null) && at === null) return false
      if (at !== null && from !== null && at < from) return false
      if (at !== null && to !== null && at > to) return false
      return true
    })
    .sort((left, right) => {
      const direction = filters.order === 'oldest' ? 1 : -1
      const leftAt = left.at ?? Number.NEGATIVE_INFINITY
      const rightAt = right.at ?? Number.NEGATIVE_INFINITY
      return direction * (leftAt - rightAt) || direction * (left.index - right.index)
    })
    .map(({ event }) => event)
}
