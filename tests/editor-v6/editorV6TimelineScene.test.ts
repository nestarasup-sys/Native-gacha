import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import { isEditorV6BlinkFrame } from '../../src/shared/editorV6FaceSchedule'
import { createEditorV6ExportExecutionPlan } from '../../electron/domains/editorV6/exportPlanning'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'

function project(): EditorV6Document {
  const actor = {
    id: 'actor', kind: 'character', characterId: 'alice', assetId: 'idle-face', text: 'Alice',
    x: 0, y: 0, width: 30, height: 60, rotation: 0, zIndex: 1,
    faceModeAssetIds: { idle: 'idle-face', talk: 'talk-face', blink: 'blink-face', 'talk-blink': 'talk-blink-face' }
  } as EditorV6Element
  const speech = {
    id: 'speech-element', kind: 'speech', characterId: 'alice', text: 'Olá',
    x: 10, y: 10, width: 20, height: 10, rotation: 0, zIndex: 2
  } as EditorV6Element
  return {
    schemaVersion: 1, id: 'project', title: 'Cena sintética', color: '#fff',
    createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z',
    backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor, speech], assets: [],
    timeline: {
      fps: 30, durationFrames: 120,
      tracks: [
        { id: 'character-track', kind: 'character', name: 'Alice', muted: false, hidden: false, locked: false, blocks: [
          { id: 'actor-block', elementId: actor.id, label: 'Alice', startFrame: 0, durationFrames: 120, state: actor }
        ] },
        { id: 'speech-track', kind: 'speech', name: 'Fala', muted: false, hidden: false, locked: false, blocks: [
          { id: 'speech-block', elementId: speech.id, label: 'Fala', characterId: 'alice', startFrame: 0, durationFrames: 120, state: speech }
        ] }
      ]
    }
  } as EditorV6Document
}

describe('resolução de cena com ciclo da boca desligado', () => {
  it('mantém o modo Talk durante a fala e desliga somente o ciclo de três quadros', () => {
    const document = project()
    const speakingFrame = Array.from({ length: 120 }, (_, frame) => frame).find(frame => !isEditorV6BlinkFrame(document.id, 'alice', frame))!
    const blinkingFrame = Array.from({ length: 120 }, (_, frame) => frame).find(frame => isEditorV6BlinkFrame(document.id, 'alice', frame))!
    const plan = createEditorV6ExportExecutionPlan(document, {
      startFrame: 0, endFrame: 120, width: 320, height: 180, turbo: false, encoder: 'cpu', mouthLoop: false
    }, {}, 'win32')
    const talkScene = resolveEditorV6SceneAtFrame(document, speakingFrame)
    const talkBlinkScene = resolveEditorV6SceneAtFrame(document, blinkingFrame)

    expect(plan.options.mouthLoop).toBe(false)
    expect(plan.speechInRange).toBe(true)
    expect(plan.parts).toEqual(plan.requestedParts)
    expect(talkScene.elements.find(element => element.id === 'actor')?.assetId).toBe('talk-face')
    expect(talkBlinkScene.elements.find(element => element.id === 'actor')?.assetId).toBe('talk-blink-face')
    expect(talkScene.elements.some(element => element.id === 'speech-element')).toBe(true)
  })
})
