import { app } from 'electron'
import { createAppMetricsReader } from './appMetricsReader'

/** Shared reader: every Electron app.getAppMetrics() call must pass through it. */
export const readElectronAppMetrics = createAppMetricsReader(() => app.getAppMetrics())
