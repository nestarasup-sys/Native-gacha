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

export function createModelSourceComposeWorkerRequest(
  request: ModelSourceComposeRequest
): ModelSourceComposeWorkerRequest {
  const { project } = request
  return {
    id: request.id,
    project: { width: project.width, height: project.height, tolerance: project.tolerance, parts: project.parts },
    edits: request.edits,
    tolerance: request.tolerance
  }
}

export function materializeModelSourceResult(
  project: FabricatorProject,
  output: ModelSourceComposeOutput
): ModelSourceResult {
  const updates = new Map(output.partUpdates.map(({ id, patch }) => [id, patch]))
  return {
    sourceDataUrl: output.sourceDataUrl,
    previewDataUrl: output.previewDataUrl,
    parts: project.parts.map(part => {
      const patch = updates.get(part.id)
      return patch ? { ...part, ...patch } : part
    }),
    tolerance: output.tolerance,
    modelSkinTone: project.modelSkinTone,
    modelOutlineColor: project.modelOutlineColor,
    joints: project.joints,
    layerOrder: project.layerOrder,
    hiddenPartIds: project.hiddenPartIds
  }
}
