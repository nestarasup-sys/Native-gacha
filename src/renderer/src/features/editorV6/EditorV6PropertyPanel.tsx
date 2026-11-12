import { EditorV6BackgroundPropertyPanel } from './EditorV6BackgroundPropertyPanel'
import { EditorV6ObjectsPropertyPanel } from './EditorV6ObjectsPropertyPanel'
import { EditorV6SelectedElementPropertyPanel } from './EditorV6SelectedElementPropertyPanel'
import { EditorV6VideoPropertyPanel } from './EditorV6VideoPropertyPanel'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'

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
  onUpdateVideoBlock,
  onRecordHistory,
  onDeleteSelected
}: EditorV6PropertyPanelProps) {
  if (!project) return null

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
    onRecordHistory={onRecordHistory}
    onDeleteSelected={onDeleteSelected}
  />

  if (selectedElement) return <EditorV6SelectedElementPropertyPanel
    selectedElement={selectedElement} characterNameColor={characterNameColor}
    balloonScalePercent={balloonScalePercent} balloonOffsetY={balloonOffsetY} control={control}
    onUpdateElement={onUpdateElement} onUpdateCharacterNameColor={onUpdateCharacterNameColor}
    onUpdateBalloonScale={onUpdateBalloonScale} onUpdateBalloonOffsetY={onUpdateBalloonOffsetY}
    onRecordHistory={onRecordHistory} onDeleteSelected={onDeleteSelected}
  />

  if (selectedElementId === 'background' && selectedBackgroundAsset) return <EditorV6BackgroundPropertyPanel
    mode="selected" background={background} selectedBackgroundAsset={selectedBackgroundAsset} control={control}
    onBackgroundChange={onBackgroundChange} onDeleteSelected={onDeleteSelected}
  />

  return <div className="studio-side-content"><h2>Cena</h2><p>Escolha uma ferramenta à esquerda ou selecione um elemento na cena.</p><small>{project.elements.length} elemento(s)</small></div>
}
