import { EditorV6VideoCardPropertyPanel } from './EditorV6VideoCardPropertyPanel'
import { EditorV6BackgroundPropertyPanel } from './EditorV6BackgroundPropertyPanel'
import { EditorV6ObjectsPropertyPanel } from './EditorV6ObjectsPropertyPanel'
import { EditorV6SelectedElementPropertyPanel } from './EditorV6SelectedElementPropertyPanel'
import { EditorV6VideoPropertyPanel } from './EditorV6VideoPropertyPanel'
import { EditorV6IntroPropertyPanel } from './EditorV6IntroPropertyPanel'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'
import { EDITOR_V6_INTRO_PORTRAIT_DEFAULTS } from '../../../../shared/editorV6Intro'

export type { EditorV6NumericControl } from './editorV6PropertyPanelTypes'

/** Scene inspector panels; document mutations remain owned by EditorV6Page. */
export function EditorV6PropertyPanel({
  project,
  activeTool,
  background,
  selectedElementId,
  selectedElement,
  characterNameColor,
  balloonScalePercent,
  balloonOffsetY,
  selectedBackgroundAsset,
  sharedBackgrounds,
  sharedObjects,
  selectedVideoBlock,
  selectedVideoCardClip,
  videoCardOwnerStartFrame,
  selectedIntroClip,
  selectedVideo,
  control,
  onBackgroundChange,
  onImportImage,
  onSelectBackground,
  onLinkSharedBackground,
  onLinkSharedObject,
  onAddObject,
  onUpdateElement,
  onUpdateCharacterNameColor,
  onUpdateBalloonScale,
  onUpdateBalloonOffsetY,
  onResetBalloonPosition,
  onUpdateVideoBlock,
  onUpdateVideoCard,
  onApplyVideoWidthToAll,
  onUpdateIntroText,
  onUpdateIntroPortrait,
  onReplicateIntroPortrait,
  onRecordHistory,
  onDeleteSelected
}: EditorV6PropertyPanelProps) {
  if (!project) return null

  const introPanel = selectedIntroClip && onUpdateIntroText && onUpdateIntroPortrait && onReplicateIntroPortrait
    ? <EditorV6IntroPropertyPanel key={selectedIntroClip.block.id} clip={selectedIntroClip} onUpdate={onUpdateIntroText}
      onUpdatePortrait={onUpdateIntroPortrait} onReplicate={onReplicateIntroPortrait} /> : undefined
  if (selectedIntroClip?.block.intro?.kind === 'black') return introPanel

  if (activeTool === 'background') return <EditorV6BackgroundPropertyPanel
    project={project} mode="library" background={background} selectedElementId={selectedElementId}
    selectedBackgroundAsset={selectedBackgroundAsset} sharedBackgrounds={sharedBackgrounds} control={control}
    onBackgroundChange={onBackgroundChange} onImportImage={onImportImage} onSelectBackground={onSelectBackground}
    onLinkSharedBackground={onLinkSharedBackground} onDeleteSelected={onDeleteSelected}
  />

  if (activeTool === 'objects') return <EditorV6ObjectsPropertyPanel
    project={project} selectedElementId={selectedElementId} selectedElement={selectedElement}
    sharedObjects={sharedObjects} control={control} onImportImage={onImportImage} onLinkSharedObject={onLinkSharedObject}
    onAddObject={onAddObject} onUpdateElement={onUpdateElement} onDeleteSelected={onDeleteSelected}
  />

  if (selectedVideoBlock && selectedVideo) return <EditorV6VideoPropertyPanel
    selectedVideoBlock={selectedVideoBlock}
    selectedVideo={selectedVideo}
    control={control}
    onUpdateVideoBlock={onUpdateVideoBlock}
    onApplyVideoWidthToAll={onApplyVideoWidthToAll}
    onRecordHistory={onRecordHistory}
    onDeleteSelected={onDeleteSelected}
  />

  if (selectedVideoCardClip) return <EditorV6VideoCardPropertyPanel block={selectedVideoCardClip.block}
    videoStartFrame={videoCardOwnerStartFrame} locked={selectedVideoCardClip.track.locked}
    control={control} onUpdate={onUpdateVideoCard} onDelete={onDeleteSelected} />

  if (selectedElement) return <EditorV6SelectedElementPropertyPanel
    selectedElement={selectedElement} characterNameColor={characterNameColor}
    balloonScalePercent={balloonScalePercent} balloonOffsetY={balloonOffsetY} control={control}
    onUpdateElement={selectedIntroClip && onUpdateIntroPortrait ? onUpdateIntroPortrait : onUpdateElement} onUpdateCharacterNameColor={onUpdateCharacterNameColor}
    onUpdateBalloonScale={onUpdateBalloonScale} onUpdateBalloonOffsetY={onUpdateBalloonOffsetY}
    onResetBalloonPosition={onResetBalloonPosition}
    onRecordHistory={onRecordHistory} onDeleteSelected={onDeleteSelected}
    extra={introPanel}
    characterControls={selectedIntroClip ? { characterReset: { ...EDITOR_V6_INTRO_PORTRAIT_DEFAULTS, flipX: false },
      characterLayerMax: 1, positionNote: 'O enquadramento vale para as partes deste personagem na Intro.' } : undefined}
  />

  if (selectedElementId === 'background' && selectedBackgroundAsset) return <EditorV6BackgroundPropertyPanel
    mode="selected" background={background} selectedBackgroundAsset={selectedBackgroundAsset} control={control}
    onBackgroundChange={onBackgroundChange} onDeleteSelected={onDeleteSelected}
  />

  return <div className="studio-side-content"><h2>Cena</h2><p>Escolha uma ferramenta à esquerda ou selecione um elemento na cena.</p><small>{project.elements.length} elemento(s)</small></div>
}
