import { describe, expect, it } from 'vitest'
import type { EditorV6SceneElement } from '../../src/shared/editorV6'
import { editorV6BalloonAutoFitHeight } from '../../src/renderer/src/features/editorV6/editorV6BalloonAutoFit'

function balloon(text: string, options: Partial<EditorV6SceneElement> = {}): EditorV6SceneElement {
  return {
    id: 'balloon', kind: 'speech', text, x: 0, y: 0, width: 30, height: 32, rotation: 0, zIndex: 1,
    speakerName: 'Scott', speakerAnchorX: 0, speakerAnchorY: 250, ...options
  }
}

describe('ajuste automático da altura dos balões do Editor V6', () => {
  const width = 576
  const maximumHeight = 345

  it('reduz a altura de fala curta sem mudar a largura', () => {
    const element = balloon('Tudo bem?')
    const height = editorV6BalloonAutoFitHeight(element, width, maximumHeight)

    expect(height).toBeLessThan(maximumHeight * 0.65)
    expect(element.width).toBe(30)
  })

  it('cresce conforme o texto ocupa mais linhas e preserva o limite em textos longos', () => {
    const short = balloon('Tudo bem?')
    const medium = balloon('Precisamos conversar sobre o que aconteceu ontem à noite, antes que alguém descubra a verdade.')
    const long = balloon('Esta mensagem foi escrita para testar uma fala bastante longa. '.repeat(60))

    const shortHeight = editorV6BalloonAutoFitHeight(short, width, maximumHeight)
    const mediumHeight = editorV6BalloonAutoFitHeight(medium, width, maximumHeight)
    const longHeight = editorV6BalloonAutoFitHeight(long, width, maximumHeight)

    expect(mediumHeight).toBeGreaterThan(shortHeight)
    expect(mediumHeight).toBeLessThan(maximumHeight)
    expect(longHeight).toBe(maximumHeight)
  })

  it('ajusta os dois balões de uma fala bilíngue ao conteúdo de cada idioma', () => {
    const paired = balloon('Paciência, Laura... talvez isso seja interessante.', { englishText: 'Patience, Laura... This might be interesting.' })
    const single = balloon(paired.text)

    const pairedHeight = editorV6BalloonAutoFitHeight(paired, width, maximumHeight)
    expect(pairedHeight).toBeLessThan(maximumHeight * 0.9)
    expect(pairedHeight).toBeGreaterThan(editorV6BalloonAutoFitHeight(single, width, maximumHeight))
  })

  it('usa uma área de texto mais estreita para balões de pensamento', () => {
    const text = 'Uma frase razoavelmente longa para manter o teste de largura do pensamento consistente.'
    const speech = balloon(text)
    const thought = balloon(text, { kind: 'thought' })

    expect(editorV6BalloonAutoFitHeight(thought, width, maximumHeight)).toBeGreaterThanOrEqual(
      editorV6BalloonAutoFitHeight(speech, width, maximumHeight)
    )
  })
})
