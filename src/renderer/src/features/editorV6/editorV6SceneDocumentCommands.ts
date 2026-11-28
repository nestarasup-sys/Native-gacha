import { editorV6IntroPortraitAssetIds } from '../../../../shared/editorV6Intro'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { findEditorV6TimelineClip, normalizeEditorV6Timeline, resolveEditorV6StaticElementsAtFrame } from '../../../../shared/editorV6TimelineCore'
import { editorV6DefaultBalloonPlacement } from '../../../../shared/editorV6BalloonPlacement'
import { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineSceneEdits'
import { setEditorV6CharacterTransform } from '../../../../shared/editorV6TimelineEdits'

type DocumentTransform = (project: EditorV6Document) => EditorV6Document
type Dependencies = {
  selectedElementId: string | null
  setSelectedElementId: (elementId: string | null) => void
  now: () => string
  getFrame: () => number
  patchDocument: (transform: DocumentTransform, editSelection?: boolean) => void
  changeScene: (transform: DocumentTransform) => void
  changeVideoLayouts: (transform: DocumentTransform) => void
}

/** Owns scene property updates and routes authored edits through history. */
export function createEditorV6SceneDocumentCommands(dependencies: Dependencies) {
  const removeStageCharacter = (element: EditorV6Element) => {
    dependencies.changeScene((document) => {
      const elements = document.elements.filter((item) => item.id !== element.id)
      const stillUsed = new Set(elements.map((item) => item.assetId).filter(Boolean))
      for (const track of document.timeline.tracks) for (const block of track.blocks) {
        for (const id of editorV6IntroPortraitAssetIds(block.intro)) stillUsed.add(id)
      }
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
    const update = (document: EditorV6Document) => {
      const updated = { ...document,
        elements: document.elements.map((element) => element.id === id ? { ...element, ...values } : element),
        updatedAt: dependencies.now()
      }
      const transform: Partial<Pick<EditorV6Element, 'characterScale' | 'characterWidthScale' | 'characterHeightScale' | 'rotation' | 'flipX' | 'zIndex'>> = {}
      for (const key of ['characterScale', 'characterWidthScale', 'characterHeightScale', 'rotation', 'flipX', 'zIndex'] as const) {
        if (key in values) Object.assign(transform, { [key]: values[key] })
      }
      return Object.keys(transform).length ? setEditorV6CharacterTransform(updated, id, transform) : updated
    }
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

  const resetBalloonPosition = (id: string) => {
    const frame = dependencies.getFrame()
    dependencies.changeScene((document) => {
      const balloon = document.elements.find((element) => element.id === id)
      if (!balloon || (balloon.kind !== 'speech' && balloon.kind !== 'thought')) return document
      const characters = resolveEditorV6StaticElementsAtFrame(document, frame).filter((element) => element.kind === 'character')
      const exact = characters.find((character) => character.id === balloon.attachedCharacterElementId && (!balloon.characterId || character.characterId === balloon.characterId))
      const matches = characters.filter((character) => character.characterId && character.characterId === balloon.characterId)
      const actor = exact ?? (matches.length === 1 ? matches[0] : undefined)
      if (!actor?.characterId) return document
      return {
        ...document,
        elements: document.elements.map((element) => element.id === id ? {
          ...element, ...editorV6DefaultBalloonPlacement(actor, element.height),
          characterId: actor.characterId, attachedCharacterElementId: actor.id,
          attachmentOriginX: actor.x, attachmentOriginY: actor.y
        } : element),
        updatedAt: dependencies.now()
      }
    })
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

  const applyVideoWidthToAll = (sourceBlockId: string) => {
    dependencies.changeVideoLayouts(document => {
      const source = findEditorV6TimelineClip(document.timeline, sourceBlockId)
      if (source?.track.kind !== 'video' || !source.block.mediaId) return document
      const videos = new Map(document.media?.filter(media => media.kind === 'video').map(media => [media.id, media]))
      const getLayout = (block: EditorV6TimelineBlock) => {
        // Keep applying width to offline/missing-media clips when they already
        // have a saved layout. Their other layout values remain untouched.
        if (block.mediaLayout) return block.mediaLayout
        const media = block.mediaId ? videos.get(block.mediaId) : undefined
        return media ? editorV6DefaultVideoLayout(media.width, media.height) : undefined
      }
      const width = getLayout(source.block)?.width
      if (width === undefined) return document
      let changed = false
      const tracks = document.timeline.tracks.map(track => {
        if (track.kind !== 'video') return track
        const blocks = track.blocks.map(block => {
          if (block.id === sourceBlockId) return block
          const layout = getLayout(block)
          if (!layout || layout.width === width) return block
          changed = true
          return { ...block, mediaLayout: { ...layout, width } }
        })
        return blocks.some((block, index) => block !== track.blocks[index]) ? { ...track, blocks } : track
      })
      return changed ? { ...document, updatedAt: dependencies.now(), timeline: { ...document.timeline, tracks } } : document
    })
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
    resetBalloonPosition,
    updateVideoBlock,
    applyVideoWidthToAll,
    updateBackground
  }
}
