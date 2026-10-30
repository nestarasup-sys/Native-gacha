import { describe, it, expect } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { attachEditorV6Motion, editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { isEditorV6BlinkFrame, pruneEditorV6TimelineSnapshots, resolveEditorV6ElementsAtFrame, splitEditorV6Block, setEditorV6BlockTiming, duplicateEditorV6Block } from '../../src/shared/editorV6Timeline'
import { interpolateEditorV6Face, interpolateEditorV6Pose, motionAngle } from '../../src/shared/editorV6MotionInterpolation'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { editorV6VisualKey } from '../../src/shared/editorV6Export'
import { editorV6FaceModeAtFrame, editorV6FaceModeDuringMotion, isEditorV6BlinkRenderMode } from '../../src/shared/editorV6FaceSchedule'

function fixture() {
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: crypto.randomUUID(), text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1 }
  const document: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Motion', color: '#d7b5cd', createdAt: '2026-10-26T12:00:00.000Z', updatedAt: '2026-10-26T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: actor.assetId!, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
  const track = document.timeline.tracks.find(t => t.kind === 'character')!
  document.timeline = splitEditorV6Block(document.timeline, track.blocks[0].id, 90)
  const second = document.timeline.tracks.find(t => t.kind === 'character')!.blocks[1]
  second.state = { ...second.state!, poseSlot: 2 }
  return document
}
function bake(document: EditorV6Document): EditorV6MotionBakeResult {
  const plan = editorV6MotionPlans(document)[0], assetId = crypto.randomUUID()
  return { asset: { id: assetId, category: 'character', name: 'Motion', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true }, motion: { version: 1, key: plan.key, assetId, frames: plan.samples.map((s, i) => ({ offset: s.offset, sprite: { x: i * 10, y: 0, width: 10, height: 10, atlasWidth: 70, atlasHeight: 10 }, x: i, y: 0, width: 20, height: 30, rotation: 0, flipX: false })) }, metrics: { milliseconds: 1, preparedRigs: 9, samples: 7, atlasPixels: 700 } }
}
describe('V6 motion scheduling and portable cache', () => {
  it('mantém piscadas automáticas curtas no projeto longo de estresse', () => {
    const runs: number[] = []
    let previous = false, start = 0
    for (let frame = 0; frame <= 20_000; frame++) {
      const blinking = isEditorV6BlinkFrame('long-stress-project', 'alice', frame)
      if (blinking && !previous) start = frame
      if (!blinking && previous && start > 0) runs.push(frame - start)
      previous = blinking
    }
    expect(runs.length).toBeGreaterThan(100)
    expect(runs.every((duration) => duration >= 3 && duration <= 7)).toBe(true)
  })

  it('keeps closed eyes active in the combined talk-blink face mode', () => {
    expect(isEditorV6BlinkRenderMode('blink')).toBe(true)
    expect(isEditorV6BlinkRenderMode('talk-blink')).toBe(true)
    expect(isEditorV6BlinkRenderMode('talk')).toBe(false)
    expect(isEditorV6BlinkRenderMode(undefined)).toBe(false)
    expect(editorV6FaceModeDuringMotion('blink')).toBeUndefined()
    expect(editorV6FaceModeDuringMotion('talk-blink')).toBe('talk')
    expect(editorV6FaceModeDuringMotion('talk')).toBe('talk')
  })

  it('preserves the exact 250ms and samples seven integer frames', () => {
    const plan = editorV6MotionPlans(fixture())[0]
    expect(plan.startFrame).toBe(82.5)
    expect(plan.samples.map(s => s.offset)).toEqual([-7,-6,-5,-4,-3,-2,-1])
    expect(plan.samples[0].progress).toBeCloseTo(1 / 15)
  })
  it('invalidates baked transitions when the saved pose changes', () => {
    const doc = fixture(), beforePlan = editorV6MotionPlans(doc)[0]
    const ready = attachEditorV6Motion(doc, beforePlan.blockId, bake(doc))
    const changedTimeline = {
      ...ready.timeline,
      tracks: ready.timeline.tracks.map((track) => track.kind === 'character'
        ? { ...track, blocks: track.blocks.map((block) => block.state ? { ...block, state: { ...block.state, poseSourceRevision: '2026-10-26T12:01:00.000Z' } } : block) }
        : track)
    }
    const changed = { ...ready, timeline: changedTimeline }
    expect(editorV6MotionPlans(changed)[0].key).not.toBe(beforePlan.key)
    expect(missingEditorV6Motions(changed)).toHaveLength(1)
  })
  it('mantém a fala e suprime piscadas durante a transição sem atualizar o personagem por quadro', () => {
    const doc = fixture(), speech = doc.timeline.tracks.find((track) => track.kind === 'speech')!
    speech.blocks = [{ id: crypto.randomUUID(), label: 'Fala durante a troca', characterId: 'alice', startFrame: 86, durationFrames: 2 }]
    const plan = editorV6MotionPlans(doc)[0]
    expect(plan.samples.some((sample) => sample.faceMode === 'talk')).toBe(true)
    for (const sample of plan.samples) {
      const frame = plan.endFrame + sample.offset, talking = frame >= 86 && frame < 88
      expect(sample.faceMode).toBe(talking ? 'talk' : undefined)
      expect(sample.faceMode === 'blink' || sample.faceMode === 'talk-blink').toBe(false)
    }
    const withoutSpeech = { ...doc, timeline: { ...doc.timeline, tracks: doc.timeline.tracks.map((track) => ({ ...track, blocks: track.kind === 'speech' ? [] : track.blocks })) } }
    expect(editorV6MotionPlans(withoutSpeech)[0].key).not.toBe(plan.key)
  })
  it('uses open eyes for automatic blink frames inside pose and expression motion', () => {
    const doc = fixture()
    const blinkRunStart = Array.from({ length: 250 }, (_, index) => index + 20).find((frame) => isEditorV6BlinkFrame(doc.id, 'alice', frame) && !isEditorV6BlinkFrame(doc.id, 'alice', frame - 1))!
    const characterTrack = doc.timeline.tracks.find((track) => track.kind === 'character')!
    const transitionEnd = blinkRunStart + 7
    characterTrack.blocks[0] = { ...characterTrack.blocks[0], durationFrames: transitionEnd }
    characterTrack.blocks[1] = { ...characterTrack.blocks[1], startFrame: transitionEnd }
    const speech = doc.timeline.tracks.find((track) => track.kind === 'speech')!
    const speakingBlinkFrame = blinkRunStart + 1
    speech.blocks = [{ id: crypto.randomUUID(), label: 'Fala durante a piscada', characterId: 'alice', startFrame: speakingBlinkFrame, durationFrames: 1 }]

    const plan = editorV6MotionPlans(doc)[0]
    expect(editorV6FaceModeAtFrame(doc.id, doc.timeline, 'alice', speakingBlinkFrame)).toBe('talk-blink')
    const speakingSample = plan.samples.find((sample) => plan.endFrame + sample.offset === speakingBlinkFrame)
    expect(speakingSample?.faceMode).toBe('talk')
    const otherBlinkSamples = plan.samples.filter((sample) => {
      const frame = plan.endFrame + sample.offset
      return isEditorV6BlinkFrame(doc.id, 'alice', frame) && frame !== speakingBlinkFrame
    })
    expect(otherBlinkSamples.length).toBeGreaterThan(0)
    expect(otherBlinkSamples.every((sample) => sample.faceMode === undefined)).toBe(true)
    expect(plan.samples.every((sample) => sample.faceMode !== 'blink' && sample.faceMode !== 'talk-blink')).toBe(true)
  })
  it('seeks directly into motion and ends exactly at the destination', () => {
    const doc = fixture(), result = bake(doc), ready = attachEditorV6Motion(doc, editorV6MotionPlans(doc)[0].blockId, result)
    expect(missingEditorV6Motions(ready)).toHaveLength(0)
    expect(resolveEditorV6ElementsAtFrame(ready, 82)[0].motionSprite).toBeUndefined()
    expect(resolveEditorV6ElementsAtFrame(ready, 83)[0].motionSprite?.x).toBe(0)
    expect(resolveEditorV6ElementsAtFrame(ready, 89)[0].motionSprite?.x).toBe(60)
    expect(resolveEditorV6ElementsAtFrame(ready, 83, { includeMotion: false })[0].assetId).toBe(doc.elements[0].assetId)
    expect(resolveEditorV6ElementsAtFrame(ready, 83, { includeMotion: false })[0].motionSprite).toBeUndefined()
    const scene = (frame: number) => ({ background: ready.backgroundColor, elements: resolveEditorV6ElementsAtFrame(ready, frame) })
    expect(editorV6VisualKey(scene(86))).not.toBe(editorV6VisualKey(scene(87)))
    expect(resolveEditorV6ElementsAtFrame(ready, 90)[0].poseSlot).toBe(2)
    expect(resolveEditorV6ElementsAtFrame(ready, 90)[0].motionSprite).toBeUndefined()
    expect(editorV6DocumentSchema.safeParse(JSON.parse(JSON.stringify(ready))).success).toBe(true)
  })
  it('invalidates edits, ignores stale completion and prunes orphan atlases', () => {
    const doc = fixture(), result = bake(doc), id = editorV6MotionPlans(doc)[0].blockId
    const ready = attachEditorV6Motion(doc, id, result)
    const changed = { ...ready, timeline: setEditorV6BlockTiming(ready.timeline, id, { startFrame: 100 }) }
    const track = changed.timeline.tracks.find(t => t.kind === 'character')!
    track.blocks[1] = { ...track.blocks[1], state: { ...track.blocks[1].state!, poseSlot: 3 } }
    expect(attachEditorV6Motion(changed, id, result)).toBe(changed)
    expect(missingEditorV6Motions(changed, 95, 100)).toHaveLength(1)
    const clean = pruneEditorV6TimelineSnapshots(changed)
    expect(clean.assets.some(a => a.id === result.asset.id)).toBe(false)
    expect(clean.timeline.tracks.flatMap(t => t.blocks).some(b => b.incomingMotion)).toBe(false)
    expect(missingEditorV6Motions(ready)).toHaveLength(0) // immutable undo state
  })
  it('does not animate position, talk or blink by themselves', () => {
    for (const patch of [{ x: 10 }, { faceAppearance: { eyeState: 'closed', mouthOpen: true } }]) {
      const doc = fixture(), track = doc.timeline.tracks.find(t => t.kind === 'character')!
      track.blocks[1].state = { ...track.blocks[0].state!, ...patch } as EditorV6Element
      expect(editorV6MotionPlans(doc)).toHaveLength(0)
    }
  })
  it('honors track/block switches, hiding and source revision changes', () => {
    for (const mode of ['track','block','hidden','revision']) {
      const doc = fixture(), track = doc.timeline.tracks.find(t => t.kind === 'character')!
      if (mode === 'track') track.motionEnabled = false
      if (mode === 'block') track.blocks[1].motionEnabled = false
      if (mode === 'hidden') track.hidden = true
      if (mode === 'revision') { track.blocks[0].state!.characterSourceUpdatedAt = 'old'; track.blocks[1].state!.characterSourceUpdatedAt = 'new' }
      expect(editorV6MotionPlans(doc)).toHaveLength(0)
    }
  })
  it('keeps characters independent and distinguishes inherited pose from base pose', () => {
    const doc = fixture(), track = doc.timeline.tracks.find(t => t.kind === 'character')!
    track.blocks[0].state = { ...track.blocks[0].state!,poseSlot: undefined }
    track.blocks[1].state = { ...track.blocks[1].state!,poseSlot: null }
    const otherId = crypto.randomUUID()
    const other = { ...track,id: crypto.randomUUID(),characterId: 'bob',blocks: track.blocks.map(b=>({...b,id: crypto.randomUUID(),elementId: otherId,state: {...b.state!,id: otherId,characterId: 'bob'}})) }
    doc.timeline = { ...doc.timeline,tracks: [...doc.timeline.tracks,other] }
    expect(editorV6MotionPlans(doc)).toHaveLength(2)
    const firstPlan = editorV6MotionPlans(doc)[0]
    const result = bake(doc)
    const ready = attachEditorV6Motion(doc,firstPlan.blockId,result)
    expect(missingEditorV6Motions(ready)).toHaveLength(1)
    expect(missingEditorV6Motions(ready)[0].characterId).toBe('bob')
  })
  it('clamps short periods and ignores an identical duplicated pose', () => {
    const doc = fixture(), track = doc.timeline.tracks.find(t => t.kind === 'character')!
    track.blocks[1].startFrame = 3
    expect(editorV6MotionPlans(doc)[0].samples.map(s => s.offset)).toEqual([-2,-1])
    const duplicate = { ...doc, timeline: duplicateEditorV6Block(doc.timeline, track.blocks[1].id) }
    expect(editorV6MotionPlans(duplicate)).toHaveLength(1)
  })
  it('keeps a rotating limb attached to its authored pivot', () => {
    const a = { width: 100,height: 100,parts: [{ id: 'arm',x: 45,y: 50,width: 10,height: 40,rotation: 0,jointAnchor: { x: 50,y: 50 } }] } as unknown as Parameters<typeof interpolateEditorV6Pose>[0]
    const b = { ...a,parts: [{ ...a.parts[0],x: 25,y: 30,rotation: 90 }] }
    const middle = interpolateEditorV6Pose(a,b,.5).parts[0]
    expect(Math.hypot(middle.x+5-50,middle.y+20-50)).toBeCloseTo(20)
    expect(middle.jointAnchor).toEqual({x:50,y:50})
    expect(interpolateEditorV6Pose(a,b,0).parts[0].x).toBeCloseTo(45)
    expect(interpolateEditorV6Pose(a,b,1).parts[0].x).toBeCloseTo(25)
  })
  it('interpolates actual part geometry and takes the shortest angular path', () => {
    const a = { width: 100, height: 100, parts: [{ id: 'arm', x: 10, y: 10, width: 20, height: 20, rotation: 350 }], layerOrder: ['arm'], hiddenPartIds: [] } as unknown as Parameters<typeof interpolateEditorV6Pose>[0]
    const b = { ...a, parts: [{ ...a.parts[0], x: 50, rotation: 10 }] }
    expect(interpolateEditorV6Pose(a,b,.5).parts[0].x).toBe(30)
    expect(interpolateEditorV6Pose(a,b,.5).parts[0].rotation).toBe(360)
    expect(motionAngle(1080, 10, .5)).toBe(1085)
    const face = interpolateEditorV6Face({ faceTransforms: { test: { x: 0,y: 0,width: 100,height: 100,rotation: 350 } } } as EditorV6Element, { faceTransforms: { test: { x: 20,y: 10,width: 120,height: 100,rotation: 10 } } } as EditorV6Element,.5)
    expect(face.transforms.test.x).toBe(10)
    expect(face.transforms.test.rotation).toBe(360)
  })
  it('interpolates mouth blush rotation through the shortest angular path', () => {
    const effect = (rotation: number) => ({ enabled: true, color: '#e86388', opacity: .5, softness: .5, size: .12, offsetY: 0, rotation })
    const effects = (rotation: number) => ({ shadow: effect(0), blush: effect(0), mouthBlush: effect(rotation) })
    const from = { activeExpressionEffects: effects(179) } as unknown as EditorV6Element
    const to = { activeExpressionEffects: effects(-179) } as unknown as EditorV6Element
    expect(interpolateEditorV6Face(from, to, .5).effects?.mouthBlush.rotation).toBeCloseTo(180)
  })
})
