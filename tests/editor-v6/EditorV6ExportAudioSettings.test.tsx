import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ExportAudio } from '../../src/shared/editorV6Export'
import { EditorV6ExportAudioSettings } from '../../src/renderer/src/features/editorV6/EditorV6ExportAudioSettings'
import { editorV6ExportFramesToSeconds, editorV6ExportSecondsToFrames } from '../../src/renderer/src/features/editorV6/editorV6ExportTime'

const audioClip = (id = 'audio-1'): EditorV6ExportAudio => ({
  id,
  name: 'Trilha teste',
  fileName: 'trilha.ogg',
  sourceFrames: 300,
  startFrame: 30,
  sourceInFrame: 15,
  durationFrames: 120,
  gain: 0.75,
  muted: false
})

function renderSettings(overrides: Partial<ComponentProps<typeof EditorV6ExportAudioSettings>> = {}) {
  return renderToStaticMarkup(createElement(EditorV6ExportAudioSettings, {
    clips: [audioClip()],
    disabled: false,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onChooseFromLibrary: vi.fn(),
    ...overrides
  }))
}

describe('controles de trilha sonora da exportação do Editor V6', () => {
  it('preserva edição de tempo, volume e silenciamento por ID', () => {
    const html = renderSettings()

    expect(html).toContain('Trilha teste')
    expect(html).toContain('Começa na edição (s)')
    expect(html).toContain('Início no arquivo (s)')
    expect(html).toContain('Duração (s)')
    expect(html).toContain('Volume (%)')
    expect(html).toContain('Silenciar')
    expect(html).toContain('Remover')
    expect(html).toContain('Selecionar da biblioteca')
  })

  it('mantém o estado vazio, bloqueia enquanto exporta e limita a 32 faixas', () => {
    const empty = renderSettings({ clips: [], disabled: true })
    expect(empty).toContain('Nenhuma trilha adicionada')
    expect(empty).toContain('class="v6-export-audio-settings" disabled=""')

    const maximum = renderSettings({ clips: Array.from({ length: 32 }, (_, index) => audioClip(`audio-${index}`)) })
    expect(maximum).toContain('class="v6-export-add-audio" type="button" disabled=""')
  })
})

describe('conversão de tempo da exportação do Editor V6', () => {
  it('converte segundos e quadros usando a timeline de 30 FPS', () => {
    expect(editorV6ExportFramesToSeconds(30)).toBe(1)
    expect(editorV6ExportSecondsToFrames('1.5')).toBe(45)
  })

  it('mantém arredondamento, entradas inválidas e limites dos controles numéricos', () => {
    expect(editorV6ExportFramesToSeconds(1)).toBe(0.0333)
    expect(editorV6ExportSecondsToFrames('0.0167')).toBe(1)
    expect(editorV6ExportSecondsToFrames('inválido')).toBe(0)
    expect(editorV6ExportSecondsToFrames('-3')).toBe(0)
    expect(editorV6ExportSecondsToFrames('100', 20)).toBe(20)
  })
})
