import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { parseEditorV6MotionRequest } from '../../src/shared/editorV6Schema'
import { prepareExportMouthLoops } from '../../electron/domains/editorV6/prepareMouthLoops'

function linkSpeech(project: EditorV6Document, characterId = 'character') {
  const durationFrames = project.timeline.durationFrames
  return { ...project, timeline: { ...project.timeline, tracks: [...project.timeline.tracks, { id: randomUUID(), kind: 'speech' as const, name: 'Fala', muted: false, locked: false, blocks: [{ id: randomUUID(), label: 'Fala vinculada', characterId, startFrame: 0, durationFrames }] }] } }
}

function fakePatchFrames(request: EditorV6MotionBakeRequest) {
  return request.plan.samples.map((sample, index) => ({ offset: sample.offset, sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 3, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 40, rotation: 0, flipX: false, facePatch: { sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 3, atlasHeight: 1 }, x: 0.4, y: 0.4, width: 0.2, height: 0.2 } }))
}

describe('preparação dos loops de boca do Editor V6', () => {
  it('falha explicitamente quando a camada facial excede o orçamento sem reduzir a resolução', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', assetId: randomUUID(), text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const project = linkSpeech({
      id: randomUUID(), elements: [actor], assets: [],
      timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] }
    } as unknown as EditorV6Document)
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    let attempts = 0
    await expect(prepareExportMouthLoops(project, 0, 60, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        attempts++
        const assetId = randomUUID()
        return {
          asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames: fakePatchFrames(request) },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: request.plan.samples.length, atlasPixels: 9_000_000 }
        }
      }
    })).rejects.toThrow('orçamento seguro em resolução nativa')
    expect(attempts).toBe(1)
  })

  it('prepara todos os estados de um projeto longo sem um limite artificial de 12', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', assetId: randomUUID(), text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const blocks = Array.from({ length: 135 }, (_, index) => ({
      id: randomUUID(), elementId, label: `Estado ${index + 1}`, startFrame: index * 40, durationFrames: 40,
      state: { ...actor, x: index }
    }))
    const project = linkSpeech({
      id: randomUUID(), elements: [actor], assets: [],
      timeline: {
        durationFrames: 5400, knownElementIds: [elementId],
        tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks }]
      }
    } as unknown as EditorV6Document)
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    const requests: EditorV6MotionBakeRequest[] = []
    const prepared = await prepareExportMouthLoops(project, 0, 5400, 30, {
      signal: new AbortController().signal,
      characters: [character],
      progress: () => {},
      bake: async (request) => {
        requests.push(request)
        const frames = fakePatchFrames(request)
        const assetId = randomUUID()
        return {
          asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: frames.length, atlasPixels: 100 }
        } satisfies EditorV6MotionBakeResult
      }
    })

    expect(prepared.stats.states).toBe(135)
    expect(prepared.mouthLoops.states).toHaveLength(135)
    expect(prepared.project.assets).toHaveLength(135)
    expect(requests).toHaveLength(135)
    expect(requests[0].maxAtlasPixels).toBeLessThan(1_000_000)
    expect(() => parseEditorV6MotionRequest(requests[0])).not.toThrow()
  })

  it('mantém a fase global do loop ao preparar apenas um trecho', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const project = linkSpeech({
      id: randomUUID(), elements: [actor], assets: [],
      timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] }
    } as unknown as EditorV6Document)
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    const prepared = await prepareExportMouthLoops(project, 20, 40, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
          bake: async (request) => {
        const assetId = randomUUID()
        return {
          asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames: fakePatchFrames(request) },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: 3, atlasPixels: 1 }
        } satisfies EditorV6MotionBakeResult
      }
    }, 7)
    expect(prepared.mouthLoops.startFrame).toBe(7)
    expect(prepared.mouthLoops.states[0].blockIds).toHaveLength(1)
  })

  it('divide o orçamento de pixels pelo número de trechos simultâneos', async () => {
    const actors: EditorV6Element[] = Array.from({ length: 5 }, (_, index) => ({ id: randomUUID(), kind: 'character', characterId: 'character', text: `Personagem ${index}`, x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: index }))
    const project = linkSpeech({ id: randomUUID(), elements: actors, assets: [], timeline: { durationFrames: 60, knownElementIds: actors.map((actor) => actor.id), tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagens', muted: false, locked: false, blocks: actors.map((actor) => ({ id: randomUUID(), elementId: actor.id, label: actor.text, startFrame: 0, durationFrames: 60, state: actor })) }] } } as unknown as EditorV6Document)
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    let requestedPixels = 0
    await prepareExportMouthLoops(project, 0, 60, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        requestedPixels = request.maxAtlasPixels ?? 0
        const assetId = randomUUID()
        return { asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }, motion: { version: 1, key: request.plan.key, assetId, frames: fakePatchFrames(request) }, metrics: { milliseconds: 1, preparedRigs: 1, samples: request.plan.samples.length, atlasPixels: 1 } } satisfies EditorV6MotionBakeResult
      }
    }, 0, 2)
    expect(requestedPixels).toBeLessThanOrEqual(4_000_000)
  })

  it('prepara mais de 500 estados sem um limite artificial de quantidade', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const blocks = Array.from({ length: 501 }, (_, index) => ({ id: randomUUID(), elementId, label: `Estado ${index}`, startFrame: index, durationFrames: 1, state: { ...actor, x: index } }))
    const project = linkSpeech({ id: randomUUID(), elements: [actor], assets: [], timeline: { durationFrames: 501, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks }] } } as unknown as EditorV6Document)
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    let bakeCalls = 0, firstRequest: EditorV6MotionBakeRequest | undefined
    const prepared = await prepareExportMouthLoops(project, 0, 501, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        bakeCalls++
        firstRequest ??= request
        const assetId = randomUUID()
        const frames = fakePatchFrames(request)
        return { asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: 1, preparedRigs: 1, samples: frames.length, atlasPixels: 100 } } satisfies EditorV6MotionBakeResult
      }
    }, 0, 2)
    expect(prepared.stats.states).toBe(501)
    expect(prepared.project.assets).toHaveLength(501)
    expect(project.assets).toHaveLength(0)
    expect(prepared.project.assets.map(asset => asset.id)).toEqual(prepared.mouthLoops.states.map(state => state.assetId))
    expect(bakeCalls).toBe(501)
    expect(firstRequest?.maxAtlasPixels).toBeLessThan(64_000)
    expect(() => parseEditorV6MotionRequest(firstRequest)).not.toThrow()
  })

  it('não prepara bocas em cenas sem personagem falando', async () => {
    const elementId = randomUUID(), actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const project = { id: randomUUID(), elements: [actor], assets: [], timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] } } as unknown as EditorV6Document
    const prepared = await prepareExportMouthLoops(project, 0, 60, 30, { signal: new AbortController().signal, characters: [], progress: () => {}, bake: async () => { throw Error('Não deveria rasterizar') } })
    expect(prepared.mouthLoops.states).toEqual([])
    expect(prepared.stats.atlasPixels).toBe(0)
  })

  it('ignora o estado de personagem oculto durante uma fala vinculada', async () => {
    const elementId = randomUUID(), actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const hidden = { ...actor, visible: false }
    const project = linkSpeech({ id: randomUUID(), elements: [actor], assets: [], timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Oculto', startFrame: 0, durationFrames: 60, state: hidden }] }] } } as unknown as EditorV6Document)
    const prepared = await prepareExportMouthLoops(project, 0, 60, 30, { signal: new AbortController().signal, characters: [], progress: () => {}, bake: async () => { throw Error('Estado oculto não deve ser rasterizado') } })
    expect(prepared.mouthLoops.states).toEqual([])
    expect(prepared.stats.atlasPixels).toBe(0)
  })

  it('interrompe o lote se uma personagem falada não puder ser preparada', async () => {
    const elementId = randomUUID(), actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const project = linkSpeech({ id: randomUUID(), elements: [actor], assets: [], timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] } } as unknown as EditorV6Document)
    await expect(prepareExportMouthLoops(project, 0, 60, 30, { signal: new AbortController().signal, characters: [{ id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter], progress: () => {}, bake: async () => { throw Error('falha sintética do preparador') } })).rejects.toThrow('falha sintética do preparador')
  })
  it('prepara no máximo duas bocas simultâneas, agrupando fonte mas preservando ordem da timeline', async () => {
    const ids = ['b', 'a', 'b', 'a']
    const actors = ids.map((characterId, index) => ({
      id: randomUUID(), kind: 'character' as const, characterId, assetId: randomUUID(),
      text: 'Estado ' + index, x: index, y: 0, width: 20, height: 40, rotation: 0, zIndex: index
    }))
    const project = {
      id: randomUUID(), elements: actors, assets: [],
      timeline: { durationFrames: 60, knownElementIds: actors.map(actor => actor.id), tracks: [
        { id: randomUUID(), kind: 'character', name: 'Estados', muted: false, locked: false, blocks: actors.map(actor =>
          ({ id: randomUUID(), elementId: actor.id, label: actor.text, startFrame: 0, durationFrames: 60, state: actor })) },
        ...['a','b'].map(characterId => ({ id: randomUUID(), kind: 'speech', name: 'Fala', muted: false, locked: false, blocks: [
          { id: randomUUID(), characterId, startFrame: 0, durationFrames: 60, label: 'Fala' }
        ] }))
      ] }
    } as unknown as EditorV6Document
    const characters = ['a','b'].map(id => ({ id, updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter))
    let active = 0, peak = 0
    const order: string[] = []
    const prepared = await prepareExportMouthLoops(project, 0, 60, 30, {
      signal: new AbortController().signal, characters, progress: () => {},
      bake: async request => {
        order.push(request.character.id)
        active++; peak = Math.max(peak, active)
        // Deterministic interleaving: finish the later request first.
        await Promise.resolve(); await Promise.resolve()
        active--
        const assetId = randomUUID()
        return { asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames: fakePatchFrames(request) },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: 3, atlasPixels: 1 } } satisfies EditorV6MotionBakeResult
      }
    })
    expect(peak).toBe(2)
    expect(order).toEqual(['a','a','b','b'])
    expect(prepared.mouthLoops.states.map(state => state.elementId)).toEqual(actors.map(actor => actor.id))
    expect(prepared.project.assets).toHaveLength(4)
  })

  it('cancela trabalho em andamento sem anexar atlas parcial ao projeto', async () => {
    const actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: 'character', assetId: randomUUID(), text: 'Teste', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 0 }
    const project = linkSpeech({ id: randomUUID(), elements: [actor], assets: [],
      timeline: { durationFrames: 60, knownElementIds: [actor.id], tracks: [
        { id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false,
          blocks: [{ id: randomUUID(), elementId: actor.id, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }
      ] } } as unknown as EditorV6Document)
    const controller = new AbortController()
    const prepared = prepareExportMouthLoops(project, 0, 60, 30, {
      signal: controller.signal, characters: [{ id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter],
      progress: () => {}, bake: async (_request, signal) => new Promise<EditorV6MotionBakeResult>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    controller.abort(Error('Cancelamento de teste'))
    await expect(prepared).rejects.toThrow('Cancelamento de teste')
    expect(project.assets).toEqual([])
  })

})
