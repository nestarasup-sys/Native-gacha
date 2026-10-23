import { VideoStudioRebuildPage } from '../videoStudioRebuild/VideoStudioRebuildPage'

/** New default editor. Legacy VideoStudioEditor.tsx is no longer mounted here. */
export function VideoStudioPage({ onEditorActiveChange }: { onEditorActiveChange?: (active: boolean) => void }) {
  return <VideoStudioRebuildPage onEditorActiveChange={onEditorActiveChange} />
}
