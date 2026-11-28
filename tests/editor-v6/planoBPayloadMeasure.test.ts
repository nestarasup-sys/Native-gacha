import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { createEditorV6ExportWorkerData } from '../../electron/domains/editorV6/exportWorkerPayload'

function syntheticProject(): EditorV6Document {
  const elements: EditorV6Element[] = Array.from({ length: 12 }, (_, index) => ({
    id: `element-${index}`,
    kind: 'image',
    assetId: `asset-${index}`,
    text: `Objeto ${index}`,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    rotation: 0,
    zIndex: index
  }))
  const timeline = createEditorV6Timeline(elements)
  const objectTrack = timeline.tracks.find(track => track.kind === 'object')!
  objectTrack.blocks = objectTrack.blocks.map((block, index) => ({
    ...block,
    startFrame: index * 900,
    durationFrames: 900
  }))
  timeline.durationFrames = 10_800

  return {
    schemaVersion: 1,
    id: 'synthetic-payload-project',
    title: 'Projeto sintético de payload',
    color: '#ffffff',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    backgroundColor: '#ffffff',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    elements,
    assets: elements.map((element, index) => ({
      id: element.assetId!,
      category: 'object',
      name: element.text,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${Buffer.alloc(192 * 1024, index + 1).toString('base64')}`
    })),
    timeline
  }
}

describe('medição sintética do payload de imagens do Editor V6', () => {
  it('mede dois trechos sem abrir projetos nem arquivos do perfil local', () => {
    const project = syntheticProject()
    const ranges = [
      { index: 0, startFrame: 0, endFrame: 5_400 },
      { index: 1, startFrame: 5_400, endFrame: 10_800 }
    ]
    const results = ranges.map(range => {
      const data = createEditorV6ExportWorkerData(project, range)
      const workerJson = JSON.stringify({ project: data.project, includeSpeechMouth: data.includeSpeechMouth })
      const inlineImageBytes = [...data.assetSources].reduce((bytes, [token, source]) => {
        const route = `gacha-editor-media://snapshot/${project.id}/${token}`
        return bytes + Buffer.byteLength(source.dataUrl) - Buffer.byteLength(route)
      }, 0)
      return {
        index: range.index,
        images: data.assetSources.size,
        imageBytesBase64: [...data.assetSources.values()].reduce((sum, source) => sum + Buffer.byteLength(source.dataUrl), 0),
        workerIpcBytesBefore: Buffer.byteLength(workerJson) + inlineImageBytes,
        workerIpcBytesAfter: Buffer.byteLength(workerJson)
      }
    })

    expect(results.map(result => result.images)).toEqual([6, 6])
    expect(results.every(result => result.workerIpcBytesAfter < result.workerIpcBytesBefore * 0.05)).toBe(true)
    expect(JSON.stringify(results)).not.toContain('app-data')
  })
})
