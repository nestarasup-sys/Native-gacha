import { VideoStudioEditor } from './VideoStudioEditor'

/** Legacy reference only: the main App route now mounts VideoStudioRebuildPage. */
export function VideoStudioPage({ onEditorActiveChange }: { onEditorActiveChange?: (active: boolean) => void }) {
  return <VideoStudioEditor onEditorActiveChange={onEditorActiveChange} />
}
