import { describe, expect, it } from 'vitest'
import { publishEditorV6Output } from '../../electron/domains/editorV6/exportRunner'

describe('publicação do MP4 do Editor V6', () => {
  it('guarda o MP4 validado com nome alternativo se o destino estiver bloqueado', async () => {
    const moves: string[] = []
    const result = await publishEditorV6Output('candidate.mp4', 'C:/Downloads/Editor V6.mp4', '38b07f13-d52a-45a8-8a9a-b5b15f9d30c4', async (from, to) => {
      moves.push(`${from} -> ${to}`)
      if (to === 'C:/Downloads/Editor V6.mp4') throw Object.assign(new Error('file is busy'), { code: 'EPERM' })
    })
    expect(result.outputPath.replaceAll('\\', '/')).toBe('C:/Downloads/Editor V6 (recuperado-38b07f13).mp4')
    expect(result.warning).toContain('destino escolhido estava ocupado')
    expect(moves).toHaveLength(2)
  })

  it('não mascara erros de destino que não indicam bloqueio temporário', async () => {
    await expect(publishEditorV6Output('candidate.mp4', 'output.mp4', '12345678-0000-4000-8000-000000000000', async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    })).rejects.toThrow('disk full')
  })
})
