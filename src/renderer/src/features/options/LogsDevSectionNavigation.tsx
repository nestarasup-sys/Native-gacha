import type { LogsDevSectionId } from './logsDevSections'
import { LOGS_DEV_SECTIONS } from './logsDevSections'

export function LogsDevSectionNavigation({
  selected,
  onSelect
}: {
  selected: LogsDevSectionId
  onSelect: (section: LogsDevSectionId) => void
}) {
  return <nav className="options-section-nav" aria-label="Seções de Logs Dev">
    {LOGS_DEV_SECTIONS.map((section) => <button
      key={section.id}
      className={`options-section-button${selected === section.id ? ' active' : ''}`}
      type="button"
      aria-current={selected === section.id ? 'page' : undefined}
      onClick={() => onSelect(section.id)}
    >{section.label}</button>)}
  </nav>
}
