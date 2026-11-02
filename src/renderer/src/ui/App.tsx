import { lazy, Profiler, Suspense, useEffect } from 'react'
import { installUiPerformanceDiagnostics, recordUiCommit } from './performanceDiagnostics'
import { installRendererDiagnosticCapture } from './diagnosticCapture'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { TopBar } from './components/TopBar'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { APPLICATION_ROUTES, LEGACY_ROUTE_REDIRECTS } from '../../../shared/applicationRoutes'

const LazyCustomizerPage = lazy(async () => ({ default: (await import('../features/customizer/CustomizerPage')).CustomizerPage }))
const LazyStudioPage = lazy(async () => ({ default: (await import('../features/studio/StudioPage')).StudioPage }))
const LazyEditorV6Page = lazy(async () => ({ default: (await import('../features/editorV6/EditorV6Page')).EditorV6Page }))
const LazyLogsDevPage = lazy(async () => ({ default: (await import('../features/options/OptionsPage')).LogsDevPage }))
const LazyFabricatorPage = lazy(async () => ({ default: (await import('../features/fabricator/FabricatorPage')).FabricatorPage }))
const LazyBaseVideosPage = lazy(async () => ({ default: (await import('../features/baseVideos/BaseVideosPage')).BaseVideosPage }))
const LazyRoteirosPage = lazy(async () => ({ default: (await import('../features/roteiros/RoteirosPage')).RoteirosPage }))

export function App() {
  const location = useLocation()
  useEffect(() => {
    const stopPerformanceDiagnostics = installUiPerformanceDiagnostics()
    const stopErrorCapture = installRendererDiagnosticCapture()
    return () => { stopPerformanceDiagnostics(); stopErrorCapture() }
  }, [])

  return (
    <main className="app-shell">
      <TopBar />
      <div className="route-content">
        <AppErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="blank-page" aria-busy="true">Carregando área…</div>}>
            <Profiler id={location.pathname} onRender={recordUiCommit}>
            <Routes>
              <Route path={APPLICATION_ROUTES.home} element={<Navigate to={APPLICATION_ROUTES.customizer} replace />} />
              <Route path={APPLICATION_ROUTES.customizer} element={<LazyCustomizerPage />} />
              <Route path={APPLICATION_ROUTES.studio} element={<LazyStudioPage />} />
              <Route path={APPLICATION_ROUTES.editorV6} element={<LazyEditorV6Page />} />
              <Route path={APPLICATION_ROUTES.roteiro} element={<LazyRoteirosPage />} />
              <Route path={APPLICATION_ROUTES.baseVideos} element={<LazyBaseVideosPage />} />
              <Route path={APPLICATION_ROUTES.logsDev} element={<LazyLogsDevPage />} />
              <Route path={APPLICATION_ROUTES.legacyOptions} element={<Navigate to={LEGACY_ROUTE_REDIRECTS[APPLICATION_ROUTES.legacyOptions]} replace />} />
              <Route path={APPLICATION_ROUTES.fabricatorDev} element={<LazyFabricatorPage />} />
              <Route path="*" element={<Navigate to={APPLICATION_ROUTES.customizer} replace />} />
            </Routes>
            </Profiler>
          </Suspense>
        </AppErrorBoundary>
      </div>
    </main>
  )
}
