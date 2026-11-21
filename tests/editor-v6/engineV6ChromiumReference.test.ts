import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { materializeEngineV6LegacyFrame, planEngineV6ResolvedScene } from '../../src/engine-v6/v6FrameAdapter'

const { renderOfflineFrame } = createRequire(import.meta.url)('../../scripts/editor-v6/engine-v3/offlineCompositor.cjs') as {
  renderOfflineFrame: (plan: ReturnType<typeof materializeEngineV6LegacyFrame>) => Promise<Buffer>
}
const { compareRgba } = createRequire(import.meta.url)('../../scripts/editor-v6/engine-v3/compareRgba.cjs') as {
  compareRgba: (reference: Buffer, candidate: Buffer, width: number, height: number) => {
    differingPixels: number; differingPixelPercent: number; differingChannels: number; meanAbsoluteChannelError: number
    maxAbsoluteChannelError: number; alpha: { differingPixels: number }; edge: { differingPixels: number }
    interior: { differingPixels: number }; boundingBox: { x: number; y: number; width: number; height: number } | null
    referenceSha256: string; candidateSha256: string; differenceMap: Buffer; differenceMapSha256: string
  }
}
const run = promisify(execFile)
const SIZE = { width: 640, height: 360 }

function pixel(pixels: Buffer, x: number, y: number): number[] {
  const offset = (y * SIZE.width + x) * 4
  return [...pixels.subarray(offset, offset + 4)]
}
function browserExecutable(): string {
  const paths = [
    process.env.V6_CHROMIUM_EXE,
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)']!, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ]
  const browser = paths.find((value): value is string => typeof value === 'string' && existsSync(value))
  if (!browser) throw Error('Chromium/Edge não encontrado no Windows. Golden de pixels real continua pendente.')
  return browser
}
async function solidAsset(id: string, rgba: string): Promise<EditorV6Asset> {
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 4, background: rgba } }).png().toBuffer()
  return { id, category: 'character', name: id, mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
}
async function croppedAlphaAsset(): Promise<EditorV6Asset> {
  const bytes = await sharp(Buffer.from([
    255, 220, 0, 64, 255, 0, 180, 128,
    0, 220, 255, 192, 255, 255, 255, 255
  ]), { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer()
  return { id: 'alpha-crop', category: 'character', name: 'alpha-crop', mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
}
function actor(id: string, assetId: string, x: number): EditorV6Element {
  return { id, kind: 'character', characterId: id, assetId, text: id,
    x, y: 0, width: 35, height: 50, rotation: 0, zIndex: x === 0 ? 1 : 2 }
}
function fixture(assets: EditorV6Asset[]): EditorV6Document {
  const elements = [actor('left', 'red', 0), actor('right', 'green', 25)]
  return {
    schemaVersion: 1, id: 'synthetic-chromium-golden', title: 'Frame V6 sintético atual',
    color: '#445566', createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
    backgroundColor: '#203040', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements, assets, timeline: createEditorV6Timeline(elements)
  }
}

describe('Engine V6 — baseline real Chromium de um frame, sem projeto de usuário', () => {
  it.skipIf(process.platform !== 'win32')('compara áreas opacas do SceneSurface renderizado no Edge/Chromium ao RGBA da engine', async () => {
    const assets = [await solidAsset('red', '#ff0000ff'), await solidAsset('green', '#00ff00ff'), await croppedAlphaAsset()]
    const project = fixture(assets)
    project.elements.push(actor('detail', 'alpha-crop', -40))
    project.elements[2] = { ...project.elements[2], width: 20, height: 20, rotation: 17, flipX: true, zIndex: 3 }
    project.timeline = createEditorV6Timeline(project.elements)
    const resolved = resolveEditorV6SceneAtFrame(project, 0)
    const scene = { ...resolved, elements: resolved.elements.map(element => element.id === 'detail'
      ? { ...element, motionSprite: { x: 1, y: 0, width: 1, height: 2, atlasWidth: 2, atlasHeight: 2 } }
      : element) }
    const svg = renderToStaticMarkup(createElement(SceneSurface, {
      scene, assets, outputWidth: SIZE.width, outputHeight: SIZE.height
    }))
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{padding:0;margin:0;width:100%;height:100%;overflow:hidden}
    </style></head><body>${svg}</body></html>`
    const dir = await mkdtemp(join(tmpdir(), 'native-gacha-v6-chromium-fixture-'))
    try {
      const input = join(dir, 'fixture.html'), output = join(dir, 'reference.png')
      await writeFile(input, html, { flag: 'wx' })
      await run(browserExecutable(), [
        '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
        '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--virtual-time-budget=1200', `--user-data-dir=${join(dir, 'profile')}`,
        `--window-size=${SIZE.width},${SIZE.height}`, `--screenshot=${output}`,
        pathToFileURL(input).href
      ], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })
      const chromium = await sharp(await readFile(output)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect([chromium.info.width, chromium.info.height]).toEqual([SIZE.width, SIZE.height])
      const ir = planEngineV6ResolvedScene(project, scene, SIZE)
      const engine = await renderOfflineFrame(materializeEngineV6LegacyFrame(project, ir))
      const comparison = compareRgba(chromium.data, engine, SIZE.width, SIZE.height)
      const mapPng = await sharp(comparison.differenceMap, { raw: { width: SIZE.width, height: SIZE.height, channels: 4 } }).png().toBuffer()
      await writeFile(join(dir, 'difference-map.png'), mapPng, { flag: 'wx' })
      const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
      process.stdout.write(`Engine V6 Chromium RGBA diagnostics: ${JSON.stringify({
        width: SIZE.width, height: SIZE.height, differingPixels: comparison.differingPixels,
        differingPixelPercent: comparison.differingPixelPercent, differingChannels: comparison.differingChannels,
        meanAbsoluteChannelError: comparison.meanAbsoluteChannelError, maxAbsoluteChannelError: comparison.maxAbsoluteChannelError,
        alpha: comparison.alpha, edge: comparison.edge, interior: comparison.interior,
        boundingBox: comparison.boundingBox, inputHtmlSha256: hash(html), chromiumPngSha256: hash(await readFile(output)),
        engineRgbaSha256: comparison.candidateSha256, differenceMapSha256: hash(mapPng),
        rawDifferenceMapSha256: comparison.differenceMapSha256
      })}\n`)
      for (const [x, y, expected] of [
        [10, 10, [32, 48, 64, 255]],
        [320, 180, [255, 0, 0, 255]],
        [480, 180, [0, 255, 0, 255]]
      ] as const) {
        const fromBrowser = pixel(chromium.data, x, y)
        const fromEngine = pixel(engine, x, y)
        expect(Math.max(...expected.map((v, i) => Math.abs(fromBrowser[i] - v)))).toBeLessThanOrEqual(3)
        expect(Math.max(...fromBrowser.map((v, i) => Math.abs(fromEngine[i] - v)))).toBeLessThanOrEqual(3)
      }
    } finally {
      // Directory is freshly created under os.tmpdir; never touches app-data or a user project.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }, 45000)
})
