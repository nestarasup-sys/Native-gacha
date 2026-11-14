import { describe, expect, it } from 'vitest'
import { formatEditorV6Error } from '../../src/shared/editorV6Error'

describe('formatação de erros entre processos do Editor V6', () => {
  it('preserva mensagem, código e stderr de objetos de erro serializados', () => {
    expect(formatEditorV6Error({ name: 'EncoderError', message: 'AMF recusou o formato', code: 'E_FAIL', stderr: 'format not supported' }))
      .toBe('EncoderError: AMF recusou o formato [código E_FAIL]\nformat not supported')
  })

  it('inclui a causa encadeada de erros nativos', () => {
    expect(formatEditorV6Error(new Error('Worker falhou', { cause: new Error('WebGL indisponível') })))
      .toBe('Error: Worker falhou | causa: Error: WebGL indisponível')
  })
})
