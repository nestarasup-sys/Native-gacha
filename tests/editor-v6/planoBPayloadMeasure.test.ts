import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { it } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { createEditorV6ExportWorkerData } from '../../electron/domains/editorV6/exportWorkerPayload'

it('measures the clipped project image payload without decoding image content', async () => {
  const projectFolder = join(process.cwd(), 'app-data/runtime/profile/studios/Editor V6/editorV6-408a77d1-d964-4c04-a66b-f4e9fcfeee46')
  const project = JSON.parse(await readFile(join(projectFolder, 'editorV6.json'), 'utf8')) as EditorV6Document
  const assets = await Promise.all(project.assets.map(async asset => {
    if (asset.libraryAssetId) return { ...asset, dataUrl: `gacha-editor-media://asset/${project.id}/${asset.libraryAssetId}` }
    const category = asset.category === 'background' ? 'backgrounds' : asset.category === 'character' ? 'characters' : 'objects'
    const extension = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.slice('image/'.length)
    const bytes = await readFile(join(projectFolder, 'assets', category, `${asset.id}.${extension}`))
    return { ...asset, dataUrl: `data:${asset.mimeType};base64,${bytes.toString('base64')}` }
  }))
  project.assets = assets

  const ranges = [{ index: 0, startFrame: 0, endFrame: 5400 }, { index: 1, startFrame: 5400, endFrame: 10800 }]
  const results = ranges.map(range => {
    const data = createEditorV6ExportWorkerData(project, range)
    const workerJson = JSON.stringify({ project: data.project, includeSpeechMouth: data.includeSpeechMouth })
    const inlineImageBytes = [...data.assetSources].reduce((bytes, [token, source]) => {
      const route = `gacha-editor-media://snapshot/${project.id}/${token}`
      return bytes + Buffer.byteLength(source.dataUrl) - Buffer.byteLength(route)
    }, 0)
    const ipcBytes = Buffer.byteLength(workerJson)
    return {
      index: range.index,
      images: data.assetSources.size,
      imageBytesBase64: [...data.assetSources.values()].reduce((sum, source) => sum + Buffer.byteLength(source.dataUrl), 0),
      workerIpcBytesBefore: ipcBytes + inlineImageBytes,
      workerIpcBytesAfter: ipcBytes
    }
  })
  console.log('PLANO_B_PAYLOAD_MEASURE', JSON.stringify(results))
})
