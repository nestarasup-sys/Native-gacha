import type { Plugin, ViteDevServer } from 'vite'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function resolveLocalHmrUrl(server: ViteDevServer): string | undefined {
  const localUrl = server.resolvedUrls?.local?.[0]
  if (!localUrl) return undefined

  const pageUrl = new URL(localUrl)
  const hmr = typeof server.config.server.hmr === 'object' ? server.config.server.hmr : undefined
  const requestedHost = hmr?.host?.toLowerCase()
  const host = requestedHost && requestedHost !== '0.0.0.0' && requestedHost !== '::'
    ? hmr!.host!
    : pageUrl.hostname
  const port = hmr?.clientPort ?? hmr?.port ?? (pageUrl.port ? Number(pageUrl.port) : undefined)
  const protocol = hmr?.protocol ?? (pageUrl.protocol === 'https:' ? 'wss' : 'ws')
  const authority = `${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}${port ? `:${port}` : ''}`
  return `${protocol}://${authority}`
}

function validatedLocalWebSocketOrigin(devWebSocketUrl?: string): string | undefined {
  if (!devWebSocketUrl) return undefined
  const url = new URL(devWebSocketUrl)
  const hostname = url.hostname.toLowerCase()
  if (!['ws:', 'wss:'].includes(url.protocol) || !loopbackHosts.has(hostname) || url.username || url.password) {
    throw new Error('O HMR do renderer precisa usar uma origem WebSocket local.')
  }
  return url.origin
}

export function createRendererContentSecurityPolicy(devWebSocketUrl?: string): string {
  const hmrOrigin = validatedLocalWebSocketOrigin(devWebSocketUrl)
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: gacha-background: gacha-gif:",
    "media-src 'self' data: blob: gacha-video: gacha-editor-media:",
    "font-src 'self' data:",
    `connect-src 'self' data:${hmrOrigin ? ` ${hmrOrigin}` : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

export function injectRendererContentSecurityPolicy(html: string, policy: string): string {
  if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) return html
  const head = /<head\b[^>]*>/i
  if (!head.test(html)) throw new Error('Documento renderer sem elemento <head> para instalar CSP.')
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`
  return html.replace(head, (openingHead) => `${openingHead}\n    ${meta}`)
}

/** Emits a strict production policy and adds only Vite's loopback HMR socket in development. */
export function rendererContentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'native-gacha-renderer-content-security-policy',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const hmrUrl = context.server ? resolveLocalHmrUrl(context.server) : undefined
        return injectRendererContentSecurityPolicy(html, createRendererContentSecurityPolicy(hmrUrl))
      }
    }
  }
}
