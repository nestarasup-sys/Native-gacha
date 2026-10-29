import type { RoteiroSectionContent } from '../../../../shared/roteiros'

export const emptyRoteiroContent = (): RoteiroSectionContent => ({
  video: null,
  blocks: [],
  description: '',
  additionalContext: '',
  timeline: 'unspecified'
})
