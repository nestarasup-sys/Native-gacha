import { lazy, Profiler, Suspense, useEffect } from 'react'
import { installUiPerformanceDiagnostics, recordUiCommit } from './performanceDiagnostics'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { TopBar } from './components/TopBar'
import { AppErrorBoundary } from './components/AppErrorBoundary'

const LazyCustomizerPage = lazy(async () => ({ default: (await import('../features/customizer/CustomizerPage')).CustomizerPage }))
const LazyStudioPage = lazy(async () => ({ default: (await import('../features/studio/StudioPage')).StudioPage }))
const LazyEditorV6Page = lazy(async () => ({ default: (await import('../features/editorV6/EditorV6Page')).EditorV6Page }))
const LazyOptionsPage = lazy(async () => ({ default: (await import('../features/options/OptionsPage')).OptionsPage }))
const LazyFabricatorPage = lazy(async () => ({ default: (await import('../features/fabricator/FabricatorPage')).FabricatorPage }))
const LazyBaseVideosPage = lazy(async () => ({ default: (await import('../features/baseVideos/BaseVideosPage')).BaseVideosPage }))
const LazyRoteirosPage = lazy(async () => ({ default: (await import('../features/roteiros/RoteirosPage')).RoteirosPage }))

export function App() {
  const location = useLocation()
  useEffect(() => installUiPerformanceDiagnostics(), [])

  return (
    <main className="app-shell">
      <TopBar />
      <div className="route-content">
        <AppErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="blank-page" aria-busy="true">Carregando área…</div>}>
            <Profiler id={location.pathname} onRender={recordUiCommit}>
            <Routes>
              <Route path="/" element={<Navigate to="/customizar" replace />} />
              <Route path="/customizar" element={<LazyCustomizerPage />} />
              <Route path="/estudio" element={<LazyStudioPage />} />
              <Route path="/editor-v6" element={<LazyEditorV6Page />} />
              <Route path="/roteiros" element={<LazyRoteirosPage />} />
              <Route path="/base-videos" element={<LazyBaseVideosPage />} />
              <Route path="/opcoes" element={<LazyOptionsPage />} />
              <Route path="/fabricador-dev" element={<LazyFabricatorPage />} />
              <Route path="*" element={<Navigate to="/customizar" replace />} />
            </Routes>
            </Profiler>
          </Suspense>
        </AppErrorBoundary>
      </div>
    </main>
  )
}
