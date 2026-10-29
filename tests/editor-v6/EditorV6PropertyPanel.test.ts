import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Asset, EditorV6Document } from '../../src/shared/editorV6'
import { EditorV6PropertyPanel, type EditorV6NumericControl } from '../../src/renderer/src/features/editorV6/EditorV6PropertyPanel'

const backgroundAsset: EditorV6Asset = {
  id: 'background-1', category: 'background', name: 'Céu', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA=='
}
const objectAsset: EditorV6Asset = {
  id: 'object-1', category: 'object', name: 'Flor', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA=='
}
const project = {
  id: 'project-1', assets: [backgroundAsset, objectAsset], elements: []
} as unknown as EditorV6Document

const control: EditorV6NumericControl = (label) => createElement('span', { 'data-control': label }, label)
const onAction = vi.fn()
const baseProps = {
  project,
  background: { backgroundColor: '#ffffff', backgroundAssetId: backgroundAsset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 },
  selectedElementId: null,
  selectedElement: null,
  selectedBackgroundAsset: null,
  selectedVideoBlock: null,
  selectedVideo: null,
  control,
  onBackgroundChange: onAction,
  onImportImage: onAction,
  onSelectBackground: onAction,
  onAddObject: onAction,
  onUpdateElement: onAction,
  onUpdateVideoBlock: onAction,
  onRecordHistory: onAction,
  onDeleteSelected: onAction
}

function renderPanel(props: Parameters<typeof EditorV6PropertyPanel>[0]): string {
  return renderToStaticMarkup(createElement(EditorV6PropertyPanel, props))
}

describe('EditorV6PropertyPanel', () => {
  it('lista fundos e mostra os mesmos controles de transformação ao editar o fundo', () => {
    const libraryHtml = renderPanel({ ...baseProps, activeTool: 'background' })
    expect(libraryHtml).toContain('Fundos')
    expect(libraryHtml).toContain('Adicionar imagem')
    expect(libraryHtml).toContain('Céu')

    const selectedAssetHtml = renderPanel({
      ...baseProps,
      activeTool: null,
      selectedElementId: 'background',
      selectedBackgroundAsset: backgroundAsset
    })
    expect(selectedAssetHtml).toContain('Imagem de fundo')
    expect(selectedAssetHtml).toContain('Céu')
    expect(selectedAssetHtml).toContain('Remover fundo')
    for (const label of ['X', 'Y', 'Largura', 'Altura', 'Rotação']) {
      expect(selectedAssetHtml).toContain(`data-control="${label}"`)
    }
  })

  it('mantém os objetos do catálogo limitados ao filtro de objetos', () => {
    const html = renderPanel({ ...baseProps, activeTool: 'objects' })
    expect(html).toContain('Objetos')
    expect(html).toContain('Flor')
    expect(html).not.toContain('Céu')
  })

  it('mantém a edição do vídeo e os controles de áudio condicionados à mídia', () => {
    const html = renderPanel({
      ...baseProps,
      activeTool: null,
      selectedVideoBlock: { id: 'video-block', mediaId: 'video-1', label: 'Clipe', startFrame: 0, durationFrames: 90 },
      selectedVideo: { id: 'video-1', name: 'Clipe', fileName: 'clip.mp4', kind: 'video', mimeType: 'video/mp4', sourceFrames: 90, hasAudio: false, sizeBytes: 1 }
    })
    expect(html).toContain('Vídeo selecionado')
    expect(html).toContain('Início da mídia')
    expect(html).not.toContain('Áudio do vídeo')
  })
})
