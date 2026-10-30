import { Icon, type IconName } from '../../ui/components/Icon'

export const fabricatorSections = [
  { id: 'Modelos', label: 'Modelos Dev', icon: 'sparkles' },
  { id: 'Poses', label: 'Poses Dev', icon: 'expand' },
  { id: 'Roupas', label: 'Roupas Dev', icon: 'shirt' },
  { id: 'Olhos', label: 'Olhos Dev', icon: 'face' },
  { id: 'Rosto', label: 'Rosto Dev', icon: 'face' },
  { id: 'Preset Expressão Dev', label: 'Preset Expressão Dev', icon: 'face' },
  { id: 'Animador Rosto Dev', label: 'Animador Rosto Dev', icon: 'face' },
  { id: 'Cabeças extra', label: 'Cabeças extra dev', icon: 'face' },
  { id: 'Cabelos Dev', label: 'Cabelos Dev', icon: 'bow' },
  { id: 'Animador Dev', label: 'Animador Dev', icon: 'body' },
  { id: 'Design Dev', label: 'Design Dev', icon: 'flower' }
] as const satisfies readonly { id: string; label: string; icon: IconName }[]

export type FabricatorSectionId = (typeof fabricatorSections)[number]['id']

export function FabricatorSectionNavigation({
  activeSection,
  recoveryRequired,
  onSelect
}: {
  activeSection: FabricatorSectionId
  recoveryRequired: boolean
  onSelect: (section: FabricatorSectionId) => void
}) {
  return (
    <nav className="fabricator-section-list" aria-label="Seções do Fabricador Dev">
      {fabricatorSections.map((section) => {
        const disabled = recoveryRequired && section.id !== 'Modelos'
        return (
          <button
            aria-pressed={activeSection === section.id}
            className={`fabricator-section-button${activeSection === section.id ? ' active' : ''}`}
            key={section.id}
            onClick={() => onSelect(section.id)}
            disabled={disabled}
            title={disabled ? 'Resolva a recuperação pendente do slot antes de abrir esta área.' : undefined}
            type="button"
          >
            <Icon name={section.icon} /><span>{section.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
