import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { parseEditorV6MotionRequest } from '../../src/shared/editorV6Schema'
import { prepareExportMouthLoops } from '../../electron/domains/editorV6/prepareMouthLoops'

describe('preparação dos loops de boca do Editor V6', () => {
  it('falha explicitamente quando um atlas segue acima do orçamento após as tentativas de redução', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', assetId: randomUUID(), text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const project = {
      id: randomUUID(), elements: [actor], assets: [],
      timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] }
    } as unknown as EditorV6Document
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    let attempts = 0
    await expect(prepareExportMouthLoops(project, 0, 60, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        attempts++
        const assetId = randomUUID()
        return {
          asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames: request.plan.samples.map((sample) => ({ offset: sample.offset, sprite: { x: 0, y: 0, width: 1, height: 1, atlasWidth: 1, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 40, rotation: 0, flipX: false })) },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: request.plan.samples.length, atlasPixels: 9_000_000 }
        }
      }
    })).rejects.toThrow('excedem a memória segura')
    expect(attempts).toBe(3)
  })

  it('prepara todos os estados de um projeto longo sem um limite artificial de 12', async () => {
    const elementId = randomUUID()
    const actor: EditorV6Element = { id: elementId, kind: 'character', characterId: 'character', assetId: randomUUID(), text: 'Personagem', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
    const blocks = Array.from({ length: 135 }, (_, index) => ({
      id: randomUUID(), elementId, label: `Estado ${index + 1}`, startFrame: index * 40, durationFrames: 40,
      state: { ...actor, x: index }
    }))
    const project = {
      id: randomUUID(), elements: [actor], assets: [],
      timeline: {
        durationFrames: 5400, knownElementIds: [elementId],
        tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks }]
      }
    } as unknown as EditorV6Document
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    const requests: EditorV6MotionBakeRequest[] = []
    const prepared = await prepareExportMouthLoops(project, 0, 5400, 30, {
      signal: new AbortController().signal,
      characters: [character],
      progress: () => {},
      bake: async (request) => {
        requests.push(request)
        const frames = request.plan.samples.map((sample, index) => ({
          offset: sample.offset,
          sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 3, atlasHeight: 1 },
          x: 0, y: 0, width: 20, height: 40, rotation: 0, flipX: false
        }))
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
    const project = {
      id: randomUUID(), elements: [actor], assets: [],
      timeline: { durationFrames: 60, knownElementIds: [elementId], tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId, label: 'Estado', startFrame: 0, durationFrames: 60, state: actor }] }] }
    } as unknown as EditorV6Document
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    const prepared = await prepareExportMouthLoops(project, 20, 40, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        const assetId = randomUUID()
        return {
          asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
          motion: { version: 1, key: request.plan.key, assetId, frames: request.plan.samples.map((sample) => ({ offset: sample.offset, sprite: { x: 0, y: 0, width: 1, height: 1, atlasWidth: 1, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 40, rotation: 0, flipX: false })) },
          metrics: { milliseconds: 1, preparedRigs: 1, samples: 3, atlasPixels: 1 }
        } satisfies EditorV6MotionBakeResult
      }
    }, 7)
    expect(prepared.mouthLoops.startFrame).toBe(7)
    expect(prepared.mouthLoops.states[0].blockIds).toHaveLength(1)
  })

  it('divide o orçamento de pixels pelo número de trechos simultâneos', async () => {
    const actors: EditorV6Element[] = Array.from({ length: 5 }, (_, index) => ({ id: randomUUID(), kind: 'character', characterId: 'character', text: `Personagem ${index}`, x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: index }))
    const project = { id: randomUUID(), elements: actors, assets: [], timeline: { durationFrames: 60, knownElementIds: actors.map((actor) => actor.id), tracks: [{ id: randomUUID(), kind: 'character', name: 'Personagens', muted: false, locked: false, blocks: actors.map((actor) => ({ id: randomUUID(), elementId: actor.id, label: actor.text, startFrame: 0, durationFrames: 60, state: actor })) }] } } as unknown as EditorV6Document
    const character = { id: 'character', updatedAt: '2026-10-30T00:00:00.000Z', customization: { modelSlot: 1 } } as CustomizerCharacter
    let requestedPixels = 0
    await prepareExportMouthLoops(project, 0, 60, 30, {
      signal: new AbortController().signal, characters: [character], progress: () => {},
      bake: async (request) => {
        requestedPixels = request.maxAtlasPixels ?? 0
        const assetId = randomUUID()
        return { asset: { id: assetId, category: 'character', name: 'Loop', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }, motion: { version: 1, key: request.plan.key, assetId, frames: request.plan.samples.map((sample) => ({ offset: sample.offset, sprite: { x: 0, y: 0, width: 1, height: 1, atlasWidth: 1, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 40, rotation: 0, flipX: false })) }, metrics: { milliseconds: 1, preparedRigs: 1, samples: request.plan.samples.length, atlasPixels: 1 } } satisfies EditorV6MotionBakeResult
      }
    }, 0, 2)
    expect(requestedPixels).toBeLessThanOrEqual(4_000_000)
  })
})
