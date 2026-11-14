import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6Timeline, type EditorV6Document } from '../../src/shared/editorV6'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'

const dialogs = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }))
vi.mock('electron', () => ({ dialog: { showSaveDialog: dialogs.save, showOpenDialog: dialogs.open } }))
import { registerEditorV6ProjectJsonHandlers } from '../../electron/domains/editorV6/projectJsonIpc'

const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); vi.resetAllMocks() })

it('exports and imports a new project with its local media and timeline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'v6-json-test-')); folders.push(root)
  const id = randomUUID(), mediaId = randomUUID(), name = `${mediaId}.mp4`, archivePath = join(root, 'project.json')
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id, title: 'Projeto', color: '#d7b5cd', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements: [], timeline: createEditorV6Timeline(), media: [{ id: mediaId, name: 'Vídeo', fileName: name, kind: 'video', mimeType: 'video/mp4', sourceFrames: 30, hasAudio: false, sizeBytes: 3 }] }
  await mkdir(join(root, id, 'media'), { recursive: true }); await writeFile(join(root, id, 'media', name), Buffer.from('abc'))
  const handlers = new Map<string, (...args: any[]) => any>()
  let saved: EditorV6Document | undefined
  registerEditorV6ProjectJsonHandlers({ ipcMain: { handle: ((channel: string, callback: (...args: any[]) => any) => handlers.set(channel, callback)) as never },
    assertTrustedSender: () => undefined, read: async () => project, write: async document => { saved = document }, assertPoseReferencesAvailable: async () => undefined, coordinatePoseReferenceChange: task => task(),
    projectPath: projectId => join(root, projectId), files: { readFile, mkdir, writeFile } })
  dialogs.save.mockResolvedValue({ canceled: false, filePath: archivePath })
  dialogs.open.mockResolvedValue({ canceled: false, filePaths: [archivePath] })
  await handlers.get(editorV6IpcChannels.exportEditorV6ProjectJson)!({}, id)
  const archive = JSON.parse(await readFile(archivePath, 'utf8')) as { project: EditorV6Document; files: unknown[] }
  archive.project.timeline.durationFrames = 900
  const imported = await handlers.get(editorV6IpcChannels.importEditorV6ProjectJson)!({}, archive) as EditorV6Document
  expect(imported.id).not.toBe(id)
  expect(imported.timeline.durationFrames).toBe(900)
  expect(saved?.id).toBe(imported.id)
  expect(await readFile(join(root, imported.id, 'media', name), 'utf8')).toBe('abc')
  await expect(handlers.get(editorV6IpcChannels.importEditorV6ProjectJson)!({}, { ...archive, files: [] })).rejects.toThrow('mídias locais esperadas')
})
