import { editorV6ClipAtFrame, timelineClips, type TimelineClip } from '../../../../shared/editorV6TimelineCore'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6MediaAsset } from '../../../../shared/editorV6'
import { editorV6IntroInspectorTarget } from './editorV6IntroInspectorTarget'

type EditorV6SelectionInput = {
  project: EditorV6Document | null
  visibleElements: EditorV6Element[]
  backgroundAssetId: string | null
  selectedTimelineBlockId: string | null
  selectedElementId: string | null
  playheadFrame: number
}

type EditorV6Selection = {
  selectedTimelineIntroClip: TimelineClip | undefined
  selectedTimelineVideoClip: TimelineClip | undefined
  selectedTimelineCardClip: TimelineClip | undefined
  selectedTimelineCardOwner: TimelineClip | undefined
  selectedTimelineVideo: EditorV6MediaAsset | undefined
  selectedElement: EditorV6Element | null
  selectedCharacterElement: EditorV6Element | null
  selectedBackgroundAsset: EditorV6Asset | null
}

export function resolveEditorV6InspectorSelection({ project, visibleElements, backgroundAssetId, selectedTimelineBlockId, selectedElementId, playheadFrame }: EditorV6SelectionInput): EditorV6Selection {
  const clips = project ? timelineClips(project.timeline) : []
  const selectedTimelineClip = project
    ? clips.find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElementId)
      ?? (selectedElementId ? editorV6ClipAtFrame(project.timeline, selectedElementId, playheadFrame) : undefined)
    : undefined
  const selectedTimelineVideoClip = clips.find(({ track, block }) => track.kind === 'video' && block.id === selectedTimelineBlockId && block.mediaId)
  const selectedTimelineIntroClip = clips.find(({ track, block }) => track.kind === 'intro' && block.id === selectedTimelineBlockId && block.intro)
  const selectedTimelineCardClip = clips.find(({ track, block }) => track.kind === 'card' && block.id === selectedTimelineBlockId && block.videoCard)
  const selectedTimelineCardOwner = selectedTimelineCardClip?.block.videoCard ? clips.find(({ track, block }) => track.kind === 'video' && block.id === selectedTimelineCardClip.block.videoCard!.videoBlockId) : undefined
  const selectedTimelineVideo = selectedTimelineVideoClip?.block.mediaId
    ? project?.media?.find((media) => media.id === selectedTimelineVideoClip.block.mediaId)
    : undefined
  const selectedElement = (project && selectedTimelineIntroClip ? editorV6IntroInspectorTarget(project, selectedTimelineIntroClip.block) : null)
    ?? selectedTimelineClip?.block.state
    ?? visibleElements.find((element) => element.id === selectedElementId)
    ?? project?.elements.find((element) => element.id === selectedElementId)
    ?? null
  const selectedCharacterElement = !selectedTimelineIntroClip && selectedElement?.kind === 'character'
    ? visibleElements.find((element) => element.kind === 'character' && element.characterId === selectedElement.characterId) ?? selectedElement
    : null
  const selectedBackgroundAsset = project?.assets.find((asset) => asset.id === backgroundAssetId) ?? null

  return { selectedTimelineIntroClip, selectedTimelineVideoClip, selectedTimelineCardClip, selectedTimelineCardOwner, selectedTimelineVideo, selectedElement, selectedCharacterElement, selectedBackgroundAsset }
}
