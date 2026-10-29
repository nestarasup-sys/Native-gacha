import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router'
import { App } from './ui/App'
import { AppErrorBoundary } from './ui/components/AppErrorBoundary'
import { flushPendingRendererWrites } from './ui/pendingPersistence'
import './ui/styles.css'

window.__flushPendingRendererWrites = flushPendingRendererWrites

if (window.location.hash === '#/editor-v6-stress-harness' && new URLSearchParams(window.location.search).get('editorV6StressCapture') === '1') {
  void import('./features/editorV6/stress/offscreenCharacterCapture').then((harness) => harness.publishEditorV6StressCharacters())
} else if (window.location.hash === '#/editor-v6-transition-baker') {
  void import('./features/editorV6/motion/bakeWorker').then((worker) => worker.runEditorV6MotionWorker())
} else {
const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <HashRouter>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </HashRouter>
  </React.StrictMode>
)
}
