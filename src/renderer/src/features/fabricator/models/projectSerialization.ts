import type { FabricatorProject, FabricatorProjectSave } from '../../../../../shared/fabricator'

/** Removes embedded source and image bytes at the IPC save boundary. */
export function serializeFabricatorProject(project: FabricatorProject): FabricatorProjectSave {
  const { sourceDataUrl: _sourceDataUrl, parts, ...metadata } = project
  return {
    ...metadata,
    parts: parts.map(({ dataUrl: _dataUrl, chromaBaseDataUrl: _baseDataUrl, ...part }) => part)
  }
}
