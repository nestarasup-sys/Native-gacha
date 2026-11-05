/** Canonical user-facing routes shared by navigation and route-safe diagnostics. */
export const APPLICATION_ROUTES = {
  home: '/',
  customizer: '/customizar',
  studio: '/estudio',
  editorV6: '/editor-v6',
  editorV7: '/editor-v7',
  roteiro: '/roteiros',
  baseVideos: '/base-videos',
  logsDev: '/logs-dev',
  legacyOptions: '/opcoes',
  fabricatorDev: '/fabricador-dev'
} as const

export const LEGACY_ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  [APPLICATION_ROUTES.legacyOptions]: APPLICATION_ROUTES.logsDev
}

const SAFE_DIAGNOSTIC_ROUTES = new Set<string>(Object.values(APPLICATION_ROUTES))

export function sanitizeDiagnosticRoute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const route = value.split(/[?#]/, 1)[0]
  return SAFE_DIAGNOSTIC_ROUTES.has(route) ? route : '(outra rota)'
}

export const UI_PERFORMANCE_ROUTES = new Set<string>([
  ...SAFE_DIAGNOSTIC_ROUTES,
  '/editor-v6/scene',
  '/editor-v6/surface',
  '/editor-v6/timeline'
])
