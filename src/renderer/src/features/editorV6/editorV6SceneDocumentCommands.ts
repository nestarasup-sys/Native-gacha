import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineScene'

type DocumentTransform = (project: EditorV6Document) => EditorV6Document
type Dependencies = {
  selectedElementId: string | null
  setSelectedElementId: (elementId: string | null) => void
  now: () => string
  getFrame: () => number
  patchDocument: (transform: DocumentTransform, editSelection?: boolean) => void
  changeScene: (transform: DocumentTransform) => void
}

/** Owns scene property updates and routes authored edits through history. */
export function createEditorV6SceneDocumentCommands(dependencies: Dependencies) {
  const removeStageCharacter = (element: EditorV6Element) => {
    dependencies.changeScene((document) => {
      const elements = document.elements.filter((item) => item.id !== element.id)
      const stillUsed = new Set(elements.map((item) => item.assetId).filter(Boolean))
      return {
        ...document,
        elements,
        assets: document.assets.filter((asset) => asset.id !== element.assetId || stillUsed.has(asset.id)),
        updatedAt: dependencies.now()
      }
    })
    if (dependencies.selectedElementId === element.id) dependencies.setSelectedElementId(null)
  }

  const updateElement = (id: string, values: Partial<EditorV6Element>, record = true) => {
    const update = (document: EditorV6Document) => ({
      ...document,
      elements: document.elements.map((element) => element.id === id ? { ...element, ...values } : element),
      updatedAt: dependencies.now()
    })
    if (record) dependencies.changeScene(update)
    else dependencies.patchDocument(update)
  }

  const updateCharacterNameColor = (characterId: string, color: string) => {
    dependencies.patchDocument((document) => ({
      ...document,
      characterNameColors: { ...document.characterNameColors, [characterId]: color },
      updatedAt: dependencies.now()
    }), false)
  }

  const updateBalloonScale = (scalePercent: number) => {
    dependencies.patchDocument((document) => ({ ...document, balloonScalePercent: scalePercent, updatedAt: dependencies.now() }), false)
  }

  const updateBalloonOffsetY = (offsetY: number) => {
    dependencies.patchDocument((document) => ({ ...document, balloonOffsetY: offsetY, updatedAt: dependencies.now() }), false)
  }

  const updateVideoBlock = (
    blockId: string,
    values: Partial<Pick<EditorV6TimelineBlock, 'mediaLayout' | 'audioEnabled' | 'gain' | 'mediaInFrame'>>,
    record = true
  ) => {
    const update = (document: EditorV6Document) => ({
      ...document,
      timeline: normalizeEditorV6Timeline({
        ...document.timeline,
        tracks: document.timeline.tracks.map((track) => ({
          ...track,
          blocks: track.blocks.map((block) => block.id === blockId ? { ...block, ...values } : block)
        }))
      }),
      updatedAt: dependencies.now()
    })
    if (record) dependencies.changeScene(update)
    else dependencies.patchDocument(update)
  }

  const updateBackground = (
    values: Partial<Pick<EditorV6Document, 'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>,
    record = true
  ) => {
    const frame = dependencies.getFrame()
    const update = (document: EditorV6Document) => ({
      ...editEditorV6BackgroundAtFrame(document, frame, values),
      updatedAt: dependencies.now()
    })
    if (record) dependencies.changeScene(update)
    else dependencies.patchDocument(update)
  }

  return {
    removeStageCharacter,
    updateElement,
    updateCharacterNameColor,
    updateBalloonScale,
    updateBalloonOffsetY,
    updateVideoBlock,
    updateBackground
  }
}
