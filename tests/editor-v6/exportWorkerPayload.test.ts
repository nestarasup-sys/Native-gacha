import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6HairMotionBundle, EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../src/shared/editorV6HairMotion'
import type { EditorV6MotionAtlas } from '../../src/shared/editorV6Motion'
import { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { createEditorV6ExportWorkerData } from '../../electron/domains/editorV6/exportWorkerPayload'

function characterState(id: string, characterId: string, assetId: string, poseSlot: number): EditorV6Element {
  return { id, kind: 'character', characterId, assetId, poseSlot, text: characterId, x: 0, y: 0, width: 30, height: 60, rotation: 0, zIndex: 0 }
}

function rig(elementId: string, assetId: string, token: string): EditorV6HairMotionRig {
  return {
    elementId, assetId, characterId: 'character-1', poseSlot: Number(token.slice(-1)),
    baseSurfaceId: `base-${token}`, faceSurfaceId: `face-${token}`, eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null,
    artworkWidth: 100, artworkHeight: 200, outputWidth: 100, outputHeight: 200,
    shapeScaleX: 1, shapeScaleY: 1, sourceCrop: { left: 0, top: 0, width: 100, height: 200 },
    sourceHead: { width: 20, height: 20 }, targetHead: { x: 40, y: 20, width: 20, height: 20, rotation: 0 },
    layers: [{ id: `layer-${token}`, textureId: `texture-${token}`, side: 'back', width: 20, height: 20, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0 }]
  }
}

function hairTransition(elementId: string, key: string, startFrame: number, endFrame: number, token: string): EditorV6HairMotionTransition {
  return {
    elementId, key, startFrame, endFrame,
    behindFaceSurfaceId: `transition-back-${token}`, faceSurfaceId: `transition-face-${token}`,
    eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null, faceAtlasSurfaceId: null, frames: []
  }
}

function surface(id: string) { return { id, dataUrl: `data:image/png;base64,${id}` } }
function asset(id: string) { return { id, category: 'character' as const, name: id, mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${id}` } }

function fixture() {
  const first = characterState('actor', 'character-1', 'asset-a', 0)
  const second = characterState('actor', 'character-1', 'asset-b', 1)
  const third = characterState('actor', 'character-1', 'asset-c', 2)
  const future = characterState('offscreen-actor', 'character-2', 'asset-other', 0)
  const project = {
    id: 'project',
    backgroundAssetId: 'background-base',
    elements: [first, future],
    assets: [
      'background-base', 'background-old', 'background-active', 'background-future',
      'asset-a', 'asset-b', 'asset-c', 'asset-other', 'motion-b', 'motion-c', 'motion-future',
      'object-old', 'object-active', 'object-future'
    ].map(asset),
    timeline: {
      fps: 30, durationFrames: 300, knownElementIds: ['actor', 'offscreen-actor'],
      tracks: [
        { id: 'actor-track', kind: 'character', name: 'Actor', muted: false, locked: false, blocks: [
          { id: 'pose-a', elementId: 'actor', label: 'A', startFrame: 0, durationFrames: 170, state: first },
          { id: 'pose-b', elementId: 'actor', label: 'B', startFrame: 170, durationFrames: 40, state: second },
          { id: 'pose-c', elementId: 'actor', label: 'C', startFrame: 210, durationFrames: 90, state: third }
        ] },
        { id: 'future-track', kind: 'character', name: 'Future', characterId: 'character-2', muted: false, locked: false, blocks: [
          { id: 'pose-future', elementId: 'offscreen-actor', label: 'Future', startFrame: 250, durationFrames: 50, state: future }
        ] },
        { id: 'background-track', kind: 'video', name: 'Background', muted: false, locked: false, blocks: [
          { id: 'bg-old', label: 'Old', startFrame: 0, durationFrames: 300, background: { backgroundColor: '#000', backgroundAssetId: 'background-old', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } },
          { id: 'bg-active', label: 'Active', startFrame: 140, durationFrames: 160, background: { backgroundColor: '#000', backgroundAssetId: 'background-active', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } },
          { id: 'bg-future', label: 'Future', startFrame: 240, durationFrames: 60, background: { backgroundColor: '#000', backgroundAssetId: 'background-future', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } }
        ] },
        { id: 'object-track', kind: 'object', name: 'Object', muted: false, locked: false, blocks: [
          { id: 'object-old-block', elementId: 'object-old-element', label: 'Old', startFrame: 40, durationFrames: 30, state: { ...characterState('object-old-element', 'unused', 'object-old', 0), kind: 'image' as const } },
          { id: 'object-active-block', elementId: 'object-active-element', label: 'Active', startFrame: 180, durationFrames: 40, state: { ...characterState('object-active-element', 'unused', 'object-active', 0), kind: 'image' as const } },
          { id: 'object-future-block', elementId: 'object-future-element', label: 'Future', startFrame: 210, durationFrames: 30, state: { ...characterState('object-future-element', 'unused', 'object-future', 0), kind: 'image' as const } }
        ] }
      ]
    }
  } as unknown as EditorV6Document

  const plans = editorV6MotionPlans(project)
  project.timeline = {
    ...project.timeline,
    tracks: project.timeline.tracks.map(track => track.kind !== 'character' || track.id !== 'actor-track' ? track : {
      ...track,
      blocks: track.blocks.map(block => {
        const plan = plans.find(candidate => candidate.blockId === block.id)
        if (!plan) return block
        const assetId = block.id === 'pose-b' ? 'motion-b' : 'motion-c'
        return { ...block, incomingMotion: { version: 1, key: plan.key, assetId, frames: [] } as EditorV6MotionAtlas }
      })
    })
  }

  const rigs = [rig('actor', 'asset-a', 'rig-a0'), rig('actor', 'asset-b', 'rig-b1'), rig('actor', 'asset-c', 'rig-c2'), rig('offscreen-actor', 'asset-other', 'rig-other0')]
  const allSurfaceIds = rigs.flatMap(item => [item.baseSurfaceId, item.faceSurfaceId])
  const allTextureIds = rigs.flatMap(item => item.layers.map(layer => layer.textureId))
  const pastTransition = hairTransition('actor', 'past', 20, 30, 'past')
  const currentTransition = hairTransition('actor', 'current', 202, 210, 'current')
  const unusedTransition = hairTransition('offscreen-actor', 'unused', 250, 260, 'unused')
  const hairAnimation = {
    presetSlot: 2, preset: {} as EditorV6HairMotionBundle['preset'], poseReactionOnly: false,
    surfaces: [...allSurfaceIds, 'transition-back-past', 'transition-face-past', 'transition-back-current', 'transition-face-current', 'transition-back-unused', 'transition-face-unused'].map(surface),
    textures: allTextureIds.map(surface), rigs,
    motionTransitions: [pastTransition, currentTransition, unusedTransition]
  } as EditorV6HairMotionBundle

  return { project, hairAnimation }
}

describe('dados isolados por trecho para workers do Editor V6', () => {
  it('envia somente assets de cena e imagens de cabelo usados pelo trecho, mantendo geometria histórica', () => {
    const { project, hairAnimation } = fixture()
    const { project: workerProject, hairAnimation: workerHair } = createEditorV6ExportWorkerData(project, { index: 0, startFrame: 100, endFrame: 205 }, undefined, hairAnimation)

    expect(workerProject.assets.map(item => item.id)).toEqual(expect.arrayContaining([
      'background-base', 'background-old', 'background-active', 'asset-a', 'asset-b', 'asset-c', 'motion-b', 'motion-c', 'object-active'
    ]))
    expect(workerProject.assets.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'background-future', 'asset-other', 'motion-future', 'object-old', 'object-future'
    ]))
    expect(workerHair?.rigs.map(item => item.elementId)).toEqual(['actor', 'actor', 'actor'])
    expect(workerHair?.motionTransitions?.map(item => item.key)).toEqual(['past', 'current'])
    expect(workerHair?.surfaces.map(item => item.id)).toEqual(expect.arrayContaining([
      'base-rig-a0', 'face-rig-a0', 'base-rig-b1', 'face-rig-b1', 'base-rig-c2', 'face-rig-c2',
      'transition-back-current', 'transition-face-current'
    ]))
    expect(workerHair?.surfaces.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'base-rig-other0', 'transition-back-past', 'transition-face-past', 'transition-back-unused', 'transition-face-unused'
    ]))
    expect(workerHair?.textures.map(item => item.id)).toEqual(expect.arrayContaining(['texture-rig-a0', 'texture-rig-b1', 'texture-rig-c2']))
    expect(workerHair?.textures.map(item => item.id)).not.toContain('texture-rig-other0')
  })

  it('preserves mouth-loop assets added to the per-part snapshot', () => {
    const { project } = fixture()
    project.assets.push(...['mouth-loop', 'mouth-source', 'mouth-talk'].map(asset))
    const data = createEditorV6ExportWorkerData(project, { index: 0, startFrame: 100, endFrame: 205 }, {
      startFrame: 100, cycleFrames: 30,
      states: [{ elementId: 'actor', characterId: 'character-1', blockIds: [], assetId: 'mouth-loop', sourceAssetId: 'mouth-source', baseAssetIds: { talk: 'mouth-talk' }, frames: [] }]
    })
    expect(data.project.assets.map(item => item.id)).toEqual(expect.arrayContaining(['mouth-loop', 'mouth-source', 'mouth-talk']))
  })
})
