import { describe, expect, it } from 'vitest'
import { buildEditorV6VideoComposition } from '../../electron/domains/editorV6/exportVideoComposition'

describe('composição de vídeo do export', () => {
  it('preserva o grafo CFR existente quando a entrada tem FPS implícito', () => {
    const single = buildEditorV6VideoComposition({ clips: [], mediaPaths: [], partStartFrame: 0, width: 320, height: 180, layeredVideo: false })
    const layered = buildEditorV6VideoComposition({ clips: [], mediaPaths: [], partStartFrame: 0, width: 320, height: 180, layeredVideo: true })

    expect(single.filterArgs[1]).toContain('[0:v]setsar=1[base]')
    expect(single.filterArgs[1]).not.toContain('fps=')
    expect(layered.filterArgs[1]).toContain('[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]')
    expect(layered.filterArgs[1]).toContain('[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]')
    expect(layered.filterArgs[1]).not.toContain('split=2')
  })

  it('expande o timestamp NUT antes de separar camadas e compor vídeo', () => {
    const single = buildEditorV6VideoComposition({
      clips: [], mediaPaths: [], partStartFrame: 0, width: 320, height: 180, layeredVideo: false, inputFrameRate: 30
    })
    const layered = buildEditorV6VideoComposition({
      clips: [], mediaPaths: [], partStartFrame: 0, width: 320, height: 180, layeredVideo: true, inputFrameRate: 24
    })

    expect(single.filterArgs[1]).toContain('[0:v]fps=30,setsar=1[base]')
    expect(layered.filterArgs[1]).toContain('[0:v]fps=24,split=2[rawbase][rawfg]')
    expect(layered.filterArgs[1]).toContain('[rawbase]crop=iw:ih/2:0:0')
    expect(layered.filterArgs[1]).toContain('[rawfg]crop=iw:ih/2:0:ih/2')
  })
})
