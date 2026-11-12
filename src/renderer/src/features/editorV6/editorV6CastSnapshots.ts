import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element } from '../../../../shared/editorV6'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import {
  editorV6CharacterEyeSourceRevision,
  editorV6CharacterHairSourceRevision,
  editorV6CharacterHeadExtraSourceRevision,
  editorV6CharacterWardrobeSourceRevision,
  editorV6PoseRevisionKey,
  type PoseRevisionSnapshot
} from './editorV6CharacterSourceRevisions'
import { EDITOR_V6_FACE_RENDER_VERSION, type bakeFaceModeAssets, type PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { editorV6CharacterStageReference } from './editorV6CharacterStageReference'

type StageReference = Awaited<ReturnType<typeof editorV6CharacterStageReference>>
type BakedFace = Awaited<ReturnType<typeof bakeFaceModeAssets>>

type CastSnapshotDependencies = {
  prepareRenderer: (character: CustomizerCharacter) => Promise<PreparedEditorV6FaceRenderer>
  bakeAssets: typeof bakeFaceModeAssets
  getStageReference: (character: CustomizerCharacter) => Promise<StageReference>
  fitToStage: typeof fitEditorV6CharacterToStage
  createId: () => string
}

export type PreparedEditorV6CastSnapshots = {
  assets: EditorV6Asset[]
  elements: EditorV6Element[]
}

/** Renders selected cast members into scene snapshots without editing the project. */
export async function prepareEditorV6CastSnapshots(
  input: {
    characters: CustomizerCharacter[]
    startZIndex: number
    stageWidth: number
    stageHeight: number
    sourceSnapshot: PoseRevisionSnapshot | null
  },
  dependencies: CastSnapshotDependencies
): Promise<PreparedEditorV6CastSnapshots> {
  const assets: EditorV6Asset[] = []
  const elements: EditorV6Element[] = []
  const references = new Map<number, StageReference>()
  let zIndex = input.startZIndex
  const sourceSnapshot = input.sourceSnapshot

  for (const character of input.characters) {
    const renderer = await dependencies.prepareRenderer(character)
    try {
      const rendered = await renderer.renderToCanvas(undefined, undefined, undefined, 'idle')
      const baked: BakedFace = await dependencies.bakeAssets(
        character.name,
        renderer,
        character.customization.faceAppearance,
        undefined,
        undefined,
        'idle',
        rendered
      )
      const imageWidth = baked.crop?.width ?? rendered.width
      const imageHeight = baked.crop?.height ?? rendered.height
      const modelSlot = character.customization.modelSlot ?? 1
      let reference = references.get(modelSlot)
      if (!reference) {
        reference = await dependencies.getStageReference(character)
        references.set(modelSlot, reference)
      }
      const asset: EditorV6Asset = {
        id: dependencies.createId(), category: 'character', name: character.name,
        mimeType: 'image/png', dataUrl: baked.dataUrl
      }
      const geometry = dependencies.fitToStage(
        reference.rendered,
        reference.crop,
        rendered,
        { width: imageWidth, height: imageHeight },
        input.stageWidth,
        input.stageHeight
      )
      assets.push(asset, ...baked.extraAssets)

      const poseSlot = character.customization.poseSlot
      const poseSourceRevision = typeof poseSlot === 'number'
        ? sourceSnapshot?.revisions[editorV6PoseRevisionKey(modelSlot, poseSlot)] ?? 'missing'
        : undefined
      const modelSourceRevision = sourceSnapshot?.modelRevisions[String(modelSlot)] ?? 'missing'
      const wardrobeSourceRevision = editorV6CharacterWardrobeSourceRevision(character, sourceSnapshot?.wardrobeRevisions ?? {})
      const hairSourceRevision = editorV6CharacterHairSourceRevision(character, sourceSnapshot?.hairRevisions ?? {})
      const headExtraSourceRevision = editorV6CharacterHeadExtraSourceRevision(character, sourceSnapshot?.headExtraRevisions ?? {})
      const eyeSourceRevision = editorV6CharacterEyeSourceRevision(character, sourceSnapshot?.eyeRevisions ?? {})
      elements.push({
        id: dependencies.createId(),
        kind: 'character',
        assetId: asset.id,
        faceModeAssetIds: { ...baked.assetIds, idle: asset.id },
        characterId: character.id,
        characterSourceUpdatedAt: character.updatedAt,
        modelSourceRevision,
        ...(poseSourceRevision ? { poseSourceRevision } : {}),
        ...(wardrobeSourceRevision ? { wardrobeSourceRevision } : {}),
        ...(hairSourceRevision ? { hairSourceRevision } : {}),
        ...(headExtraSourceRevision ? { headExtraSourceRevision } : {}),
        ...(eyeSourceRevision ? { eyeSourceRevision } : {}),
        faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
        activeExpressionCollectionId: 'standard',
        activeExpressionPresetId: null,
        activeFaceMode: 'idle',
        characterScale: 100,
        characterWidthScale: 100,
        characterHeightScale: 100,
        ...(character.customization.faceAppearance
          ? { expressionBase: { appearance: structuredClone(character.customization.faceAppearance), transforms: {} } }
          : {}),
        characterCanvasWidth: geometry.characterCanvasWidth,
        text: character.name,
        x: 0,
        y: 0,
        width: geometry.width,
        height: geometry.height,
        rotation: 0,
        zIndex: ++zIndex
      })
    } finally {
      renderer.dispose()
    }
  }

  return { assets, elements }
}
