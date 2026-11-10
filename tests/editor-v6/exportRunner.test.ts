import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodingArgs } from '../../electron/domains/editorV6/exportRunner'
import { publishEditorV6Output } from '../../electron/domains/editorV6/exportArtifacts'

describe('codificação do Editor V6', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('usa o preset frio medido e permite comparação restrita somente no harness isolado', () => {
    expect(encodingArgs('libx264', 4).slice(encodingArgs('libx264', 4).indexOf('-preset') + 1, encodingArgs('libx264', 4).indexOf('-preset') + 2)).toEqual(['ultrafast'])
    vi.stubEnv('GACHA_VIDEO_STRESS_OFFSCREEN', '1')
    vi.stubEnv('GACHA_EDITOR_V6_STRESS_X264_PRESET', 'ultrafast')
    expect(encodingArgs('libx264', 4).slice(encodingArgs('libx264', 4).indexOf('-preset') + 1, encodingArgs('libx264', 4).indexOf('-preset') + 2)).toEqual(['ultrafast'])
    vi.stubEnv('GACHA_EDITOR_V6_STRESS_X264_PRESET', 'veryfast')
    expect(encodingArgs('libx264', 4).slice(encodingArgs('libx264', 4).indexOf('-preset') + 1, encodingArgs('libx264', 4).indexOf('-preset') + 2)).toEqual(['veryfast'])
    vi.stubEnv('GACHA_EDITOR_V6_STRESS_X264_PRESET', 'invalid-value')
    expect(encodingArgs('libx264', 4).slice(encodingArgs('libx264', 4).indexOf('-preset') + 1, encodingArgs('libx264', 4).indexOf('-preset') + 2)).toEqual(['ultrafast'])
  })

  it('configura o Media Foundation com perfil H.264 numérico e codificação de software', () => {
    const args = encodingArgs('h264_mf', 4)
    expect(args).toContain('100')
    expect(args.slice(args.indexOf('-profile:v') + 1, args.indexOf('-profile:v') + 2)).toEqual(['100'])
    expect(args.slice(args.indexOf('-hw_encoding') + 1, args.indexOf('-hw_encoding') + 2)).toEqual(['0'])
    expect(args).toContain('yuv420p')
  })
})

describe('publicação do MP4 do Editor V6', () => {
  it('publica no destino escolhido quando ele está disponível', async () => {
    const moves: string[] = []
    const result = await publishEditorV6Output('candidate.mp4', 'C:/Downloads/Editor V6.mp4', '38b07f13-d52a-45a8-a8a9-b5b15f9d30c4', async (from, to) => {
      moves.push(`${from} -> ${to}`)
    })
    expect(result).toEqual({ outputPath: 'C:/Downloads/Editor V6.mp4' })
    expect(moves).toEqual(['candidate.mp4 -> C:/Downloads/Editor V6.mp4'])
  })

  it.each(['EPERM', 'EACCES', 'EBUSY', 'EEXIST'])('usa um nome alternativo quando o destino falha com %s', async (code) => {
    const moves: string[] = []
    const result = await publishEditorV6Output('candidate.mp4', 'C:/Downloads/Editor V6.mp4', '38b07f13-d52a-45a8-8a9a-b5b15f9d30c4', async (from, to) => {
      moves.push(`${from} -> ${to}`)
      if (to === 'C:/Downloads/Editor V6.mp4') throw Object.assign(new Error('file is busy'), { code })
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
