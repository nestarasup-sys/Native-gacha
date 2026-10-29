import { vi, describe, expect, it, beforeEach } from 'vitest'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { createEditorV6Timeline } from '../../src/shared/editorV6'
import { editorV6MotionPlans, type EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'

const state = vi.hoisted(() => ({ windows: [] as any[] }))
vi.mock('electron', () => ({ BrowserWindow: class {
  destroyed = false
  handlers = new Map<string, Array<() => void>>()
  webContents = {
    id: state.windows.length + 1,
    mainFrame: {},
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    session: {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() }
    }
  }
  constructor(readonly options: any) { state.windows.push(this) }
  loadFile = vi.fn(() => Promise.resolve())
  loadURL = vi.fn(() => Promise.resolve())
  once(event: string, handler: () => void) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); return this }
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; for (const handler of this.handlers.get('closed') ?? []) handler() }
} }))

import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'

function fixture() {
  const stamp = '2026-10-26T12:00:00.000Z'
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: crypto.randomUUID(), text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1 }
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Test', color: '#ffffff', createdAt: stamp, updatedAt: stamp, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: actor.assetId!, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
  project.timeline.tracks.find((track) => track.kind === 'character')!.blocks = [1, 2].map((poseSlot, index) => ({ id: crypto.randomUUID(), elementId: actor.id, label: 'Pose', startFrame: index * 60, durationFrames: 60, state: { ...actor, poseSlot } }))
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', createdAt: stamp, updatedAt: stamp, hair: '#000000', outfit: '#000000', skin: '#000000', customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const request: EditorV6MotionBakeRequest = { id: crypto.randomUUID(), plan: editorV6MotionPlans(project)[0], character }
  return request
}

describe('motion worker renderer security', () => {
  beforeEach(() => { state.windows = [] })

  it('uses a per-lane ephemeral session with restricted permissions and resources', async () => {
    const service = createEditorV6MotionService({ ipcMain: { handle: vi.fn() }, assertTrustedSender: () => {}, html: 'C:\\app\\out\\renderer\\index.html', preload: 'preload.cjs' })
    const controller = new AbortController()
    const pending = service.bakeForExport(fixture(), controller.signal)
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(state.windows).toHaveLength(1))

    const window = state.windows[0]
    const partition = window.options.webPreferences.partition as string
    expect(partition).toMatch(/^editor-v6-motion-[0-9a-f-]{36}$/i)
    expect(window.webContents.session.setPermissionCheckHandler).toHaveBeenCalledTimes(1)
    expect(window.webContents.session.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
    expect(window.webContents.session.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1)

    service.cancelAll()
    await rejected
    await service.drain()
  })
})
