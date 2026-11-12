import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Asset, EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
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

const control: EditorV6NumericControl = (label, value) => createElement('span', { 'data-control': label, 'data-value': value }, label)
const onAction = vi.fn()
const baseProps = {
  project,
  background: { backgroundColor: '#ffffff', backgroundAssetId: backgroundAsset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 },
  selectedElementId: null,
  selectedElement: null,
  characterNameColor: null,
  balloonScalePercent: 100,
  balloonOffsetY: 0,
  selectedBackgroundAsset: null,
  selectedVideoBlock: null,
  selectedVideo: null,
  sharedBackgrounds: [],
  sharedObjects: [],
  control,
  onBackgroundChange: onAction,
  onImportImage: onAction,
  onSelectBackground: onAction,
  onLinkSharedBackground: onAction,
  onLinkSharedObject: onAction,
  onAddObject: onAction,
  onUpdateElement: onAction,
  onUpdateCharacterNameColor: onAction,
  onUpdateBalloonScale: onAction,
  onUpdateBalloonOffsetY: onAction,
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

  it('mantém os controles de áudio e os valores salvos quando o vídeo tem som', () => {
    const html = renderPanel({
      ...baseProps,
      activeTool: null,
      selectedVideoBlock: {
        id: 'video-block', mediaId: 'video-1', label: 'Clipe', startFrame: 0, durationFrames: 90,
        mediaLayout: { x: 12, y: -6, width: 48, height: 32, rotation: 15 },
        mediaInFrame: 24, gain: 0.6, audioEnabled: true
      },
      selectedVideo: { id: 'video-1', name: 'Clipe', fileName: 'clip.mp4', kind: 'video', mimeType: 'video/mp4', sourceFrames: 90, hasAudio: true, sizeBytes: 1 }
    })
    expect(html).toContain('data-control="X" data-value="12"')
    expect(html).toContain('data-control="Início da mídia" data-value="24"')
    expect(html).toContain('data-control="Volume" data-value="0.6"')
    expect(html).toContain('Áudio do vídeo')
    expect(html).toContain('type="checkbox" checked=""')
  })

  it('mantém o seletor livre de cor do nome do personagem', () => {
    const html = renderPanel({
      ...baseProps,
      activeTool: null,
      characterNameColor: '#7768c8',
      onUpdateCharacterNameColor: onAction,
      selectedElement: { id: 'actor-1', kind: 'character', characterId: 'alice', text: 'Alice', assetId: 'alice-asset', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 } as EditorV6Element
    })
    expect(html).toContain('Cor do nome nos balões')
    expect(html).toContain('type="color" value="#7768c8"')
  })

  it('mostra o controle de escala geral quando um balão é selecionado', () => {
    const html = renderPanel({
      ...baseProps,
      activeTool: null,
      balloonScalePercent: 140,
      selectedElement: { id: 'speech-1', kind: 'speech', characterId: 'alice', text: 'Uma fala', x: 0, y: 0, width: 28, height: 16, rotation: 0, zIndex: 2 } as EditorV6Element
    })
    expect(html).toContain('Escala dos balões')
    expect(html).toContain('Posição vertical')
    expect(html).toContain('Aplica a escala e a posição vertical a todas as falas e pensamentos.')
    expect(html).toContain('data-value="140"')
  })
})
