import type { FabricatorProject, ModelPart } from '../../../../../shared/fabricator.ts'
import { autoConnectParts, normalizePartAnchors } from '../../../../../shared/modelRig.ts'
import type { ImageProcessorMessage } from './imageProcessorProtocol'
import { pngDataUrlFromBuffer } from './imageData.ts'

export type ImportedModelMetadata = Pick<FabricatorProject, 'slot' | 'name' | 'sourceName' | 'sourceAssetName'>
export type ImportedModelProjectResult = {
  project: FabricatorProject
  dirtyAssets: Map<string, string>
  dirtyChromaBases: Map<string, string>
}

/** Converts worker output into the editor's initial project and pending PNG writes. */
export function createImportedModelProject(
  result: Extract<ImageProcessorMessage, { type: 'complete' }>,
  sourceDataUrl: string,
  tolerance: number,
  metadata: ImportedModelMetadata
): ImportedModelProjectResult {
  const parts: ModelPart[] = result.parts.map(({ png, basePng, ...part }) => ({
    ...part,
    rotation: 0,
    chromaBaseSaved: true,
    dataUrl: pngDataUrlFromBuffer(png),
    chromaBaseDataUrl: pngDataUrlFromBuffer(basePng)
  }))
  const rig = normalizePartAnchors(parts, autoConnectParts(parts))
  const sourceParts = rig.parts.map((part) => ({
    ...part,
    sourceTransform: {
      x: part.x,
      y: part.y,
      width: part.width,
      height: part.height,
      rotation: part.rotation,
      anchorVersion: 1 as const,
      ...(part.jointAnchor ? { jointAnchor: { ...part.jointAnchor } } : {})
    }
  }))
  const dirtyAssets = new Map(sourceParts.map((part) => [part.id, part.dataUrl]))
  const dirtyChromaBases = new Map(sourceParts.flatMap((part) => part.chromaBaseDataUrl
    ? [[part.id, part.chromaBaseDataUrl] as const]
    : []))

  return {
    project: {
      schemaVersion: 1,
      chromaVersion: 2,
      chromaBaseTolerance: 0,
      ...metadata,
      sourceDataUrl,
      width: result.width,
      height: result.height,
      tolerance,
      parts: sourceParts,
      joints: rig.joints,
      layerOrder: parts.map((part) => part.id),
      hiddenPartIds: [],
      updatedAt: new Date().toISOString()
    },
    dirtyAssets,
    dirtyChromaBases
  }
}
