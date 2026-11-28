import type { ReactNode } from 'react'
import type { EditorV6Document, EditorV6Element, EditorV6Asset, EditorV6LibraryMediaItem, EditorV6MediaAsset, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import type { EditorV6BackgroundState } from '../../../../shared/editorV6'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
import type { TimelineClip } from '../../../../shared/editorV6TimelineCore'
import type { EditorV6IntroPortraitUpdate } from '../../../../shared/editorV6Intro'

export type EditorV6BackgroundValues = Partial<Pick<EditorV6Document,
  'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>
export type EditorV6VideoValues = Partial<Pick<EditorV6TimelineBlock, 'mediaLayout' | 'audioEnabled' | 'gain' | 'mediaInFrame'>>
export type EditorV6VideoCardValues = Partial<Pick<EditorV6TimelineBlock, 'videoCard' | 'startFrame' | 'durationFrames'>>

export type EditorV6NumericControl = (
  label: string,
  value: number,
  onChange: (value: number, record?: boolean) => void,
  min: number,
  max: number,
  suffix?: string,
  onFinish?: () => void,
  disabled?: boolean,
  precision?: number
) => ReactNode

export type EditorV6PropertyPanelProps = {
  project: EditorV6Document | null
  activeTool: 'background' | 'objects' | null
  background: EditorV6BackgroundState
  selectedElementId: string | null
  selectedElement: EditorV6Element | null
  characterNameColor: string | null
  balloonScalePercent: number
  balloonOffsetY: number
  selectedBackgroundAsset: EditorV6Asset | null
  sharedBackgrounds: VideoBackgroundLibraryItem[]
  sharedObjects: EditorV6LibraryMediaItem[]
  selectedVideoBlock: EditorV6TimelineBlock | null
  selectedVideoCardClip?: TimelineClip
  videoCardOwnerStartFrame?: number
  selectedVideoCardOwner?: EditorV6TimelineBlock | null
  selectedIntroClip?: TimelineClip
  selectedVideo: EditorV6MediaAsset | null
  control: EditorV6NumericControl
  onBackgroundChange: (values: EditorV6BackgroundValues, record?: boolean) => void
  onImportImage: (category: 'background' | 'object') => void
  onSelectBackground: (asset: EditorV6Asset) => void
  onLinkSharedBackground: (item: VideoBackgroundLibraryItem) => void
  onLinkSharedObject: (item: EditorV6LibraryMediaItem) => void
  onAddObject: (asset: EditorV6Asset) => void
  onUpdateElement: (id: string, values: Partial<EditorV6Element>, record?: boolean) => void
  onUpdateCharacterNameColor: (characterId: string, color: string) => void
  onUpdateBalloonScale: (scalePercent: number) => void
  onUpdateBalloonOffsetY: (offsetY: number) => void
  onResetBalloonPosition: (id: string) => void
  onUpdateVideoBlock: (id: string, values: EditorV6VideoValues, record?: boolean) => void
  onUpdateVideoCard?: (id: string, values: EditorV6VideoCardValues, record?: boolean) => void
  onApplyVideoWidthToAll: (id: string) => void
  onUpdateIntroText?: (id: string, field: 'text' | 'englishText', value: string) => void
  onUpdateIntroPortrait?: (id: string, values: EditorV6IntroPortraitUpdate, record?: boolean) => void
  onReplicateIntroPortrait?: (id: string, property: 'characterScale' | 'characterWidthScale' | 'characterHeightScale' | 'position' | 'rotation' | 'flipX') => void
  onRecordHistory: () => void
  onDeleteSelected: () => void
}
