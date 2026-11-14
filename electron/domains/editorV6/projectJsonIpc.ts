import { dialog, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { writeFile as writeExternal } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { editorV6LibraryAssetUrl, type EditorV6Document } from '../../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../../src/shared/editorV6Schema'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { exportEditorV6React } from '../../../src/shared/editorV6ReactExport'

const format = 'NYMI_EDITOR_V6_PROJECT_V1'
const fileName = /^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i
type FileEntry = { folder: 'media' | 'export-audio'; name: string; base64: string }

function localFiles(project: EditorV6Document): Array<Pick<FileEntry, 'folder' | 'name'>> {
  const files = new Map<string, Pick<FileEntry, 'folder' | 'name'>>()
  for (const media of project.media ?? []) if (!media.libraryVideoId && !media.libraryAudioId) files.set(`media/${media.fileName}`, { folder: 'media', name: media.fileName })
  for (const audio of project.exportAudio ?? []) if (!audio.libraryAudioId && !audio.libraryVideoId) {
    const folder = (project.media ?? []).some(media => media.fileName === audio.fileName && !media.libraryVideoId && !media.libraryAudioId) ? 'media' : 'export-audio'
    files.set(`${folder}/${audio.fileName}`, { folder, name: audio.fileName })
  }
  return [...files.values()]
}

export function registerEditorV6ProjectJsonHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  read: (id: string) => Promise<EditorV6Document | null>
  write: (document: EditorV6Document) => Promise<void>
  assertPoseReferencesAvailable: (document: EditorV6Document) => Promise<void>
  coordinatePoseReferenceChange: <T>(operation: () => Promise<T>) => Promise<T>
  projectPath: (id: string) => string
  files: { readFile: (path: string) => Promise<Buffer>; mkdir: (path: string, options: { recursive: true }) => Promise<unknown>; writeFile: (path: string, bytes: Buffer) => Promise<unknown> }
}) {
  deps.ipcMain.handle(editorV6IpcChannels.exportEditorV6ProjectJson, async (event, value: unknown) => {
    deps.assertTrustedSender(event)
    const id = z.string().uuid().parse(value)
    const project = await deps.read(id)
    if (!project) throw Error('Projeto não encontrado.')
    const { data, warnings } = exportEditorV6React(project)
    const choice = await dialog.showSaveDialog({ title: 'Exportar projeto do Editor V6', defaultPath: `${project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.json`, filters: [{ name: 'Projeto Editor V6', extensions: ['json'] }] })
    if (choice.canceled || !choice.filePath) return null
    await writeExternal(choice.filePath, JSON.stringify(data, null, 2), 'utf8')
    return { path: choice.filePath, warnings }
  })

  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6ProjectJson, async (event, value: unknown) => {
    deps.assertTrustedSender(event)
    const archive = z.object({ format: z.literal(format), project: editorV6DocumentSchema, files: z.array(z.object({ folder: z.enum(['media', 'export-audio']), name: z.string().regex(fileName), base64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict()).max(532) }).strict().parse(value)
    const original = archive.project as EditorV6Document
    const expected = localFiles(original)
    const files = new Map(archive.files.map(file => [`${file.folder}/${file.name}`, file]))
    if (files.size !== archive.files.length || files.size !== expected.length || expected.some(file => !files.has(`${file.folder}/${file.name}`))) throw Error('O JSON não contém exatamente as mídias locais esperadas pelo projeto.')
    const id = randomUUID(), now = new Date().toISOString()
    const project: EditorV6Document = { ...original, id, createdAt: now, updatedAt: now, assets: original.assets.map(asset => asset.libraryAssetId ? { ...asset, dataUrl: editorV6LibraryAssetUrl(id, asset.libraryAssetId) } : asset) }
    await deps.coordinatePoseReferenceChange(async () => {
      await deps.assertPoseReferencesAvailable(project)
      for (const file of expected) {
        if (basename(file.name) !== file.name || !fileName.test(file.name)) throw Error('Nome de mídia inválido.')
        const folder = join(deps.projectPath(id), file.folder)
        await deps.files.mkdir(folder, { recursive: true })
        await deps.files.writeFile(join(folder, file.name), Buffer.from(files.get(`${file.folder}/${file.name}`)!.base64, 'base64'))
      }
      await deps.write(project)
    })
    return project
  })
}
