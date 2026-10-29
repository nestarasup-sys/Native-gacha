import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'

/** The application shell is loaded only by interactive windows, never by bakers. */
export function mountApp() {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <StrictMode>
      <HashRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </HashRouter>
    </StrictMode>
  )
}
