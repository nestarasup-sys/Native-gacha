import type { FabricatorProject } from '../../../../../shared/fabricator'
import type { ModelPart } from '../../../../../shared/fabricator'
import type { ModelSourceDimensions } from './modelSourceGeometry'
import type { ModelSourceResult } from './modelSource'

export type ModelSourceComposeRequest = {
  id: number
  project: FabricatorProject
  edits: ModelSourceDimensions
  tolerance: number
}

/** The worker only receives fields used by composition; source sheet and other project metadata stay in the renderer. */
export type ModelSourceComposeWorkerRequest = Omit<ModelSourceComposeRequest, 'project'> & {
  project: Pick<FabricatorProject, 'width' | 'height' | 'tolerance' | 'parts'>
}

export type ModelSourceComposeOutput = Pick<ModelSourceResult, 'sourceDataUrl' | 'previewDataUrl' | 'tolerance'> & {
  partUpdates: Array<{ id: string; patch: Partial<ModelPart> }>
}

export type ModelSourceComposeMessage =
  | { type: 'complete'; id: number; output: ModelSourceComposeOutput }
  | { type: 'error'; id: number; message: string }
