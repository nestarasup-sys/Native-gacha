import { flushPendingRendererWrites } from './ui/pendingPersistence'

window.__flushPendingRendererWrites = flushPendingRendererWrites

if (window.location.hash === '#/editor-v6-stress-harness' && new URLSearchParams(window.location.search).get('editorV6StressCapture') === '1') {
  void import('./features/editorV6/stress/offscreenCharacterCapture').then((harness) => harness.publishEditorV6StressCharacters())
} else if (window.location.hash === '#/editor-v6-transition-baker') {
  void import('./features/editorV6/motion/bakeWorker').then((worker) => worker.runEditorV6MotionWorker())
} else {
  void import('./ui/mountApp').then(({ mountApp }) => mountApp())
}
