import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { IndexHtmlTransformContext } from 'vite'
import {
  createRendererContentSecurityPolicy,
  injectRendererContentSecurityPolicy,
  rendererContentSecurityPolicyPlugin
} from '../../electron/application/rendererContentSecurityPolicy'
import { canVisibleRendererRequestFullscreen, createRendererTrustPolicy, isTrustedRendererFrame, isTrustedRendererUrl } from '../../electron/application/rendererTrust'

describe('renderer security policy', () => {
  it('trusts only local development origins and the exact packaged entry file', () => {
    const htmlPath = join('C:\\native-gacha\\out\\renderer', 'index.html')
    const development = createRendererTrustPolicy('http://127.0.0.1:5188/', htmlPath)
    expect(development.kind).toBe('dev')
    expect(isTrustedRendererUrl('http://127.0.0.1:5188/#/customizer', development)).toBe(true)
    expect(isTrustedRendererFrame('http://127.0.0.1:5188/#/customizer', true, development)).toBe(true)
    expect(isTrustedRendererFrame('http://127.0.0.1:5188/#/customizer', false, development)).toBe(false)
    expect(isTrustedRendererUrl('http://127.0.0.1:5189/', development)).toBe(false)
    expect(isTrustedRendererUrl('https://127.0.0.1:5188/', development)).toBe(false)
    expect(() => createRendererTrustPolicy('https://attacker.example/', htmlPath)).toThrow(/localhost ou loopback/)
    expect(() => createRendererTrustPolicy('file:///tmp/index.html', htmlPath)).toThrow(/localhost ou loopback/)
    expect(() => createRendererTrustPolicy('http://user:pass@localhost:5188/', htmlPath)).toThrow(/credenciais/)

    const packaged = createRendererTrustPolicy(undefined, htmlPath)
    expect(isTrustedRendererUrl(pathToFileURL(htmlPath).href, packaged)).toBe(true)
    expect(isTrustedRendererUrl(pathToFileURL(join('C:\\native-gacha\\out\\renderer-evil', 'index.html')).href, packaged)).toBe(false)
    expect(isTrustedRendererUrl('http://127.0.0.1:5188/', packaged)).toBe(false)
  })

  it('allows fullscreen only for a visible trusted main frame', () => {
    const policy = createRendererTrustPolicy('http://127.0.0.1:5188/', 'unused.html')
    const request = (isMainFrame: boolean, visible: boolean, url = 'http://127.0.0.1:5188/#/customizer') =>
      canVisibleRendererRequestFullscreen(isMainFrame, visible, url, url, policy)

    expect(request(true, true)).toBe(true)
    expect(request(false, true)).toBe(false)
    expect(request(true, false)).toBe(false)
    expect(request(true, true, 'https://attacker.example/')).toBe(false)
  })

  it('uses strict production sources and permits only the validated local HMR socket in development', () => {
    const production = createRendererContentSecurityPolicy()
    expect(production).toContain("script-src 'self'")
    expect(production).toContain("object-src 'none'")
    expect(production).toContain('gacha-video: gacha-editor-media:')
    expect(production).not.toContain('unsafe-eval')
    expect(production).not.toContain('ws:')

    const development = createRendererContentSecurityPolicy('ws://127.0.0.1:5188')
    expect(development).toContain("connect-src 'self' data: ws://127.0.0.1:5188")
    expect(() => createRendererContentSecurityPolicy('wss://attacker.example/socket')).toThrow(/origem WebSocket local/)
  })

  it('injects one CSP into both renderer entry HTML documents before their scripts', () => {
    const policy = createRendererContentSecurityPolicy()
    const source = '<html><head><title>App</title></head><body><script type="module" src="/src/main.tsx"></script></body></html>'
    const transformed = injectRendererContentSecurityPolicy(source, policy)

    expect(transformed.indexOf('Content-Security-Policy')).toBeLessThan(transformed.indexOf('<script'))
    expect(transformed).toContain("script-src 'self'")
    expect(injectRendererContentSecurityPolicy(transformed, policy)).toBe(transformed)
  })

  it('limits the development HMR source to the resolved loopback socket', async () => {
    const transform = rendererContentSecurityPolicyPlugin().transformIndexHtml
    if (!transform || typeof transform === 'function') throw new Error('O hook CSP deve ser transformIndexHtml ordenado.')
    const server = {
      resolvedUrls: { local: ['http://127.0.0.1:5188/'], network: [] },
      config: { server: { hmr: { host: '127.0.0.1', clientPort: 5190, protocol: 'ws' } } }
    }
    const html = await transform.handler('<html><head></head><body></body></html>', {
      server: server as unknown as NonNullable<IndexHtmlTransformContext['server']>
    } as IndexHtmlTransformContext)

    expect(html).toContain('ws://127.0.0.1:5190')
    expect(html).not.toContain('ws://127.0.0.1:5188')
  })
})
