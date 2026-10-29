import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { createEditorV6Timeline } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() }
}))
vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 1024 }))
}))
vi.mock('../../electron/domains/editorV6/exportWorkers', () => ({
  createEditorV6WorkerFactory: vi.fn(() => ({ create: vi.fn() }))
}))
vi.mock('../../electron/domains/editorV6/exportRunner', () => ({
  probeExportMedia: vi.fn(),
  runEditorV6Export: vi.fn()
}))

import { dialog } from 'electron'
import { copyFile } from 'node:fs/promises'
import { probeExportMedia, runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { registerEditorV6ExportHandlers } from '../../electron/domains/editorV6/exportIpc'

const sourceId = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const event = { sender: { id: 12, once: vi.fn(), removeListener: vi.fn(), isDestroyed: () => false } }
const tick = () => new Promise((resolve) => setImmediate(resolve))

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

function createHarness() {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const lifecycle = registerEditorV6ExportHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler as (...args: any[]) => Promise<unknown>) } as unknown as IpcMain,
    assertTrustedSender: () => {},
    projectPath: (id) => `C:/synthetic/editorV6-${id}`,
    toolsDirectory: 'C:/synthetic/tools',
    workerHtml: 'worker.html',
    workerPreload: 'worker-preload.cjs',
    tempRoot: 'C:/synthetic/temp',
    getCharacters: async () => [],
    bakeMotion: async () => ({}) as EditorV6MotionBakeResult,
    resolveLibraryVideo: async () => ({ path: 'C:/synthetic/library.mp4', name: 'Video', mimeType: 'video/mp4', extension: 'mp4', size: 1024, durationFrames: 30 })
  })
  return { handlers, lifecycle }
}

const audioClip = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Áudio sintético',
  fileName: '33333333-3333-4333-8333-333333333333.mp3',
  sourceFrames: 30,
  startFrame: 0,
  sourceInFrame: 0,
  durationFrames: 30,
  gain: 1,
  muted: false
}
const mediaAsset = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Vídeo sintético',
  fileName: '44444444-4444-4444-8444-444444444444.mp4',
  kind: 'video',
  mimeType: 'video/mp4',
  sourceFrames: 30,
  hasAudio: false,
  width: 320,
  height: 180,
  sizeBytes: 1024
}
const exportProject = {
  schemaVersion: 1 as const,
  id: sourceId,
  title: 'Projeto sintético',
  color: '#ffffff',
  createdAt: '2026-10-29T12:00:00.000Z',
  updatedAt: '2026-10-29T12:00:00.000Z',
  backgroundColor: '#ffffff',
  backgroundAssetId: null,
  backgroundX: 0,
  backgroundY: 0,
  backgroundWidth: 100,
  backgroundHeight: 100,
  backgroundRotation: 0,
  assets: [],
  elements: [],
  timeline: { ...createEditorV6Timeline(), durationFrames: 30 }
}
const exportOptions = { startFrame: 0, endFrame: 30, width: 320, height: 180, turbo: false, encoder: 'cpu' as const }

type CopyScenario = {
  name: string
  configure?: () => void
  start: (handlers: Map<string, (...args: any[]) => Promise<unknown>>) => Promise<unknown>
}

const copyScenarios: CopyScenario[] = [
  {
    name: 'import de áudio',
    configure: () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['C:/synthetic/input.mp3'] })
      vi.mocked(probeExportMedia).mockResolvedValue({ streams: [{ codec_type: 'audio' }], format: { duration: '1' } } as never)
    },
    start: (handlers) => handlers.get(editorV6IpcChannels.importEditorV6ExportAudio)!(event, targetId)
  },
  {
    name: 'cópia de áudio ao duplicar',
    start: (handlers) => handlers.get(editorV6IpcChannels.cloneEditorV6ExportAudio)!(event, sourceId, targetId, [audioClip])
  },
  {
    name: 'import de mídia da timeline',
    start: (handlers) => handlers.get(editorV6IpcChannels.importEditorV6Media)!(event, targetId, 'video')
  },
  {
    name: 'cópia de mídia ao duplicar',
    start: (handlers) => handlers.get(editorV6IpcChannels.cloneEditorV6Media)!(event, sourceId, targetId, [mediaAsset])
  }
]

describe('lifecycle de cópias de mídia do Editor V6', () => {
  beforeEach(() => {
    vi.mocked(copyFile).mockReset()
    vi.mocked(dialog.showOpenDialog).mockReset()
    vi.mocked(probeExportMedia).mockReset()
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['C:/synthetic/input.mp4'] })
    vi.mocked(probeExportMedia).mockResolvedValue({
      streams: [{ codec_type: 'video', width: 320, height: 180 }],
      format: { duration: '1' }
    } as never)
  })

  it.each(copyScenarios)('$name entra no inventário e o shutdown aguarda a cópia', async ({ configure, start }) => {
    configure?.()
    const started = deferred()
    const copyGate = deferred()
    vi.mocked(copyFile).mockImplementation(async () => {
      started.resolve()
      await copyGate.promise
    })

    const { handlers, lifecycle } = createHarness()
    const operation = start(handlers)
    await started.promise
    expect(lifecycle.getPendingWrites()).toHaveLength(1)

    const draining = lifecycle.drain()
    await expect(start(handlers)).rejects.toThrow(/encerrando/)
    copyGate.resolve()
    await operation
    await draining
    expect(lifecycle.getPendingWrites()).toEqual([])
  })

  it('mantém a exportação MP4 ativa no inventário até concluir os arquivos de saída e relatório', async () => {
    const exportGate = deferred<Awaited<ReturnType<typeof runEditorV6Export>>>()
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: 'C:/synthetic/output.mp4' })
    vi.mocked(runEditorV6Export).mockImplementation(() => exportGate.promise)

    const { handlers, lifecycle } = createHarness()
    const status = await handlers.get(editorV6IpcChannels.startEditorV6Export)!(event, exportProject, exportOptions)
    expect(status).toMatchObject({ state: 'preparing' })

    const pending = lifecycle.getPendingWrites()
    expect(pending).toHaveLength(1)
    let settled = false
    void pending[0].then(() => { settled = true })
    const draining = lifecycle.drain()
    await tick()
    expect(settled).toBe(false)

    exportGate.resolve({ outputPath: 'C:/synthetic/output.mp4', fallback: false } as Awaited<ReturnType<typeof runEditorV6Export>>)
    await draining
    expect(settled).toBe(true)
    expect(lifecycle.getPendingWrites()).toEqual([])
  })

  it('retoma novos imports depois de uma cópia falhar durante o shutdown', async () => {
    const started = deferred()
    const copyGate = deferred()
    let copyFails = true
    vi.mocked(copyFile).mockImplementation(async () => {
      if (!copyFails) return
      started.resolve()
      await copyGate.promise
      throw new Error('falha sintética na cópia')
    })
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['C:/synthetic/input.mp3'] })
    vi.mocked(probeExportMedia).mockResolvedValue({
      streams: [{ codec_type: 'audio' }],
      format: { duration: '1' }
    } as never)

    const { handlers, lifecycle } = createHarness()
    const operation = handlers.get(editorV6IpcChannels.importEditorV6ExportAudio)!(event, targetId)
    await started.promise
    const draining = lifecycle.drain()
    copyGate.resolve()
    await expect(operation).rejects.toThrow('falha sintética na cópia')
    await expect(draining).rejects.toThrow('falha sintética na cópia')

    lifecycle.resumeAfterFailedShutdown()
    copyFails = false
    await expect(handlers.get(editorV6IpcChannels.importEditorV6ExportAudio)!(event, targetId)).resolves.toMatchObject({ name: 'input.mp3' })
  })
})
