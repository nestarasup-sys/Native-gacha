import { app, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { advanceHairMotionToFrame, createHairMotionState } from '../../src/shared/hairMotionEngine'
import { editorV6ElementSize } from '../../src/shared/editorV6SceneModel'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { editorV6HairMotionHeadAnchorX, editorV6HairMotionInstancePhase, interpolateEditorV6HairMotionRig, type EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { motionEase } from '../../src/shared/editorV6MotionInterpolation'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs') as { resolveEditorV6TestVideoToolsDirectory: (root: string) => string }
const { createWindowsProcessSampler } = require('../../scripts/editor-v6/windowsProcessSampler.cjs') as { createWindowsProcessSampler: (scriptPath: string) => { sample: (processes: Array<{ pid: number; role: string }>, frame: number) => Promise<{ sampledAt: string; frame: number; processes: Array<{ pid: number; role: string; name: string; workingSetBytes: number; privateBytes: number; cpuSeconds: number | null; cpuPercentSincePreviousSample: number | null }> }>; close: () => Promise<void> } }
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
app.setPath('userData', join(folder, 'profile'))
app.on('window-all-closed', () => {})
process.on('unhandledRejection', error => { console.error(error); app.exit(1) })

async function main() {
  await app.whenReady()
  const ffmpeg = join(videoTools, 'ffmpeg.exe')
  const pngCrcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    return crc >>> 0
  })
  const pngChunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type), bytes = Buffer.concat([name, data])
    let crc = 0xffffffff
    for (const byte of bytes) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, bytes, checksum])
  }
  const encodeRgbaPng = (width: number, height: number, pixels: Buffer) => {
    const scanlines = Buffer.alloc((width * 4 + 1) * height)
    for (let y = 0; y < height; y += 1) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))])
    return `data:image/png;base64,${png.toString('base64')}`
  }
  const faceSurfacePixels = (headShift = 0) => {
    const width = 64, height = 64, pixels = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (((x - 32 - headShift) / 12) ** 2 + ((y - 21) / 11) ** 2 > 1) continue
      const offset = (y * width + x) * 4
      pixels[offset] = 255; pixels[offset + 1] = 255; pixels[offset + 2] = 255; pixels[offset + 3] = 255
    }
    setHeadAnchorMarker(pixels, 32 + headShift, 21)
    return pixels
  }
  const faceSurfaceData = (headShift = 0) => encodeRgbaPng(64, 64, faceSurfacePixels(headShift))
  const setHeadAnchorMarker = (pixels: Buffer, centerX: number, centerY: number) => {
    // A unique synthetic fiducial lets the test measure the actual head point
    // even when a translucent hair strand occludes part of the face silhouette.
    for (let y = centerY - 1; y <= centerY + 1; y += 1) for (let x = centerX - 1; x <= centerX + 1; x += 1) {
      const offset = (y * 64 + x) * 4
      pixels[offset] = 0; pixels[offset + 1] = 255; pixels[offset + 2] = 0; pixels[offset + 3] = 255
    }
  }
  const headMarkerPixels = (headShift = 0) => {
    const pixels = Buffer.alloc(64 * 64 * 4)
    setHeadAnchorMarker(pixels, 32 + headShift, 21)
    return pixels
  }
  const bodyPixels = () => {
    const width = 64, height = 64, pixels = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const torso = y >= 29 && y <= 53 && x >= 22 && x <= 42
      const neck = y >= 24 && y < 31 && x >= 28 && x <= 36
      const leftArm = y >= 31 && y <= 52 && x >= 14 && x <= 24
      const rightArm = y >= 31 && y <= 52 && x >= 40 && x <= 50
      const leftLeg = y >= 50 && x >= 22 && x <= 30
      const rightLeg = y >= 50 && x >= 34 && x <= 42
      if (!torso && !neck && !leftArm && !rightArm && !leftLeg && !rightLeg) continue
      const offset = (y * width + x) * 4
      pixels[offset] = 255; pixels[offset + 1] = 224; pixels[offset + 2] = 70; pixels[offset + 3] = 255
    }
    return pixels
  }
  const checkerboardData = () => {
    const width = 64, height = 64, pixels = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const shade = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? 72 : 208
      const offset = (y * width + x) * 4
      pixels[offset] = shade; pixels[offset + 1] = shade; pixels[offset + 2] = shade; pixels[offset + 3] = 255
    }
    return encodeRgbaPng(width, height, pixels)
  }
  const solidHairData = () => {
    const width = 64, height = 256, pixels = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x - 15, 49 - x), alpha = Math.max(0, Math.min(255, (edge + .5) * 255))
      if (!alpha) continue
      const offset = (y * width + x) * 4
      pixels[offset] = 16; pixels[offset + 1] = 132; pixels[offset + 2] = 36; pixels[offset + 3] = alpha
    }
    return encodeRgbaPng(width, height, pixels)
  }
  const portraitPixels = (headShift: number, includeHair = true) => {
    const width = 64, height = 64, pixels = bodyPixels()
    const locks = [[19, 8, 230, 100, 45], [24, 5, 25, 115, 175], [40, 5, 30, 135, 185], [45, 8, 235, 130, 40]]
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (((x - 32 - headShift) / 12) ** 2 + ((y - 21) / 11) ** 2 <= 1) {
        pixels[offset] = 255; pixels[offset + 1] = 246; pixels[offset + 2] = 225; pixels[offset + 3] = 255
      }
      for (const [center, thickness, red, green, blue] of includeHair ? locks : []) {
        const strand = center + headShift + 1.8 * Math.sin(y / 13 + center)
        if (y > 10 && y < 64 && Math.abs(x - strand) < thickness / 10) {
          pixels[offset] = red; pixels[offset + 1] = green; pixels[offset + 2] = blue; pixels[offset + 3] = 255
        }
      }
    }
    setHeadAnchorMarker(pixels, 32 + headShift, 21)
    return pixels
  }
  const sourceCropForPixels = (pixels: Buffer) => {
    let left = 64, top = 64, right = -1, bottom = -1
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
      if (pixels[(y * 64 + x) * 4 + 3] <= 8) continue
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
    assert(right >= left && bottom >= top, 'A arte sintética do personagem não tem pixels visíveis.')
    return { left, top, width: right - left + 1, height: bottom - top + 1 }
  }
  const cropPixels = (pixels: Buffer, crop: { left: number; top: number; width: number; height: number }) => {
    const output = Buffer.alloc(crop.width * crop.height * 4)
    for (let y = 0; y < crop.height; y += 1) {
      const start = ((crop.top + y) * 64 + crop.left) * 4
      pixels.copy(output, y * crop.width * 4, start, start + crop.width * 4)
    }
    return output
  }
  const strandData = (base: string, light: string) => {
    const width = 256, height = 512, pixels = Buffer.alloc(width * height * 4)
    const rgb = (color: string) => [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16))
    const baseRgb = rgb(base), lightRgb = rgb(light)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const centers = [44 + 7 * Math.sin(y / 49) + y * .05, 164 + 9 * Math.sin((y + 30) / 60) - y * .07]
      let alpha = 0, color = baseRgb
      for (const [index, center] of centers.entries()) {
        const halfWidth = index === 0 ? 19 : 27, distance = Math.abs(x - center)
        const coverage = Math.max(0, Math.min(1, halfWidth + .6 - distance))
        if (coverage * 215 > alpha) { alpha = coverage * 215; color = baseRgb }
        const strandDistance = Math.abs(x - (center + 5 * Math.sin(y / (23 + index * 7)) + (index ? -9 : 8)))
        const strandCoverage = Math.max(0, Math.min(1, 1.15 - strandDistance)) * (y % 11 === 0 ? .38 : .78)
        if (strandCoverage * 200 > alpha) { alpha = strandCoverage * 200; color = lightRgb }
      }
      const offset = (y * width + x) * 4
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = Math.round(alpha)
    }
    return encodeRgbaPng(width, height, pixels)
  }
  // Keep the Editor V6 source PNG cropped around a deliberately off-center
  // alpha bounds box while the hair rigs retain the full artwork coordinates.
  const firstPortrait = portraitPixels(0), firstCrop = sourceCropForPixels(firstPortrait)
  const secondPortrait = portraitPixels(2), secondCrop = sourceCropForPixels(secondPortrait)
  assert(firstCrop.left > 0 && firstCrop.top > 0 && firstCrop.width < 64 && firstCrop.height < 64, 'O fixture deve cobrir uma origem de recorte transparente não centralizado.')
  const characterCanvasWidth = 40
  const actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: 'synthetic-character', assetId: 'synthetic-character-image', text: 'Fixture', x: -24, y: -8, width: characterCanvasWidth * firstCrop.width / 64, height: characterCanvasWidth * 16 / 9 * firstCrop.height / 64, characterCanvasWidth, rotation: 0, flipX: false, zIndex: 1, poseSlot: 1 }
  const now = new Date().toISOString()
  const checkerboardAssetId = 'synthetic-checkerboard-background'
  const project: EditorV6Document = {
    schemaVersion: 1, id: randomUUID(), title: 'Hair motion synthetic export', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [
      { id: actor.assetId!, category: 'character', name: 'Synthetic character', mimeType: 'image/png', dataUrl: encodeRgbaPng(firstCrop.width, firstCrop.height, cropPixels(firstPortrait, firstCrop)) },
      { id: checkerboardAssetId, category: 'background', name: 'Synthetic checkerboard', mimeType: 'image/png', dataUrl: checkerboardData() }
    ],
    elements: [actor], timeline: { ...createEditorV6Timeline([actor]), durationFrames: 61 }
  }
  const characterTrack = project.timeline.tracks.find(track => track.kind === 'character')!
  const firstBlock = characterTrack.blocks[0]
  const secondAssetId = 'synthetic-character-pose-2'
  const secondState: EditorV6Element = { ...actor, assetId: secondAssetId, poseSlot: 2, x: -21, y: -6, width: characterCanvasWidth * secondCrop.width / 64, height: characterCanvasWidth * 16 / 9 * secondCrop.height / 64, rotation: 12, flipX: true }
  characterTrack.blocks = [
    { ...firstBlock, durationFrames: 30 },
    { ...firstBlock, id: 'synthetic-pose-two', startFrame: 30, durationFrames: 31, state: secondState, label: 'Pose 2' }
  ]
  project.assets.push({ id: secondAssetId, category: 'character', name: 'Synthetic character pose 2', mimeType: 'image/png', dataUrl: encodeRgbaPng(secondCrop.width, secondCrop.height, cropPixels(secondPortrait, secondCrop)) })
  const transitionPlan = editorV6MotionPlans(project)[0]
  assert(transitionPlan?.samples.length === 7, 'o fixture deve conter uma transição real de pose de sete quadros')
  const atlasWidth = transitionPlan.samples.length * 64, atlasPixels = Buffer.alloc(atlasWidth * 64 * 4)
  const transitionCrops = transitionPlan.samples.map(sample => {
    const progress = sample.progress, offsetX = Math.round(progress * 2), pixels = portraitPixels(offsetX, false)
    return { progress, crop: sourceCropForPixels(pixels), pixels }
  })
  for (const [index, transition] of transitionCrops.entries()) {
    const cropped = cropPixels(transition.pixels, transition.crop)
    for (let y = 0; y < transition.crop.height; y += 1) cropped.copy(atlasPixels, (y * atlasWidth + index * 64) * 4, y * transition.crop.width * 4, (y + 1) * transition.crop.width * 4)
  }
  const transitionLayerAtlasPixels = (getPixels: (index: number) => Buffer) => {
    const output = Buffer.alloc(atlasWidth * 64 * 4)
    for (const [index, transition] of transitionCrops.entries()) {
      const cropped = cropPixels(getPixels(index), transition.crop)
      for (let y = 0; y < transition.crop.height; y += 1) {
        cropped.copy(output, (y * atlasWidth + index * 64) * 4, y * transition.crop.width * 4, (y + 1) * transition.crop.width * 4)
      }
    }
    return output
  }
  const transitionBehindAtlas = transitionLayerAtlasPixels(() => bodyPixels())
  const transitionFaceAtlas = transitionLayerAtlasPixels(index => faceSurfacePixels(Math.round(transitionCrops[index].progress * 2)))
  const transitionMarkerAtlas = transitionLayerAtlasPixels(index => headMarkerPixels(Math.round(transitionCrops[index].progress * 2)))
  const motionAssetId = 'synthetic-motion-atlas'
  project.assets.push({ id: motionAssetId, category: 'character', name: 'Synthetic pose transition', mimeType: 'image/png', dataUrl: encodeRgbaPng(atlasWidth, 64, atlasPixels), timelineSnapshot: true })
  characterTrack.blocks[1].incomingMotion = {
    version: 1, key: transitionPlan.key, assetId: motionAssetId,
    frames: transitionPlan.samples.map((sample, index) => {
      const crop = transitionCrops[index].crop
      return {
        offset: sample.offset, sprite: { x: index * 64, y: 0, width: crop.width, height: crop.height, atlasWidth, atlasHeight: 64 },
        x: actor.x + (secondState.x - actor.x) * sample.progress, y: actor.y + (secondState.y - actor.y) * sample.progress,
        width: characterCanvasWidth * crop.width / 64, height: characterCanvasWidth * 16 / 9 * crop.height / 64,
        rotation: secondState.rotation * sample.progress, flipX: sample.progress >= .5
      }
    })
  }
  const transitionMotionFrames = characterTrack.blocks[1].incomingMotion.frames
  const mouthPatchPixels = Buffer.alloc(4 * 3 * 4)
  for (let offset = 0; offset < mouthPatchPixels.length; offset += 4) {
    mouthPatchPixels[offset] = 255; mouthPatchPixels[offset + 1] = 0; mouthPatchPixels[offset + 2] = 255; mouthPatchPixels[offset + 3] = 255
  }
  const preset = {
    physics: { wind: 100, gust: 100, speed: 250, stiffness: 0, damping: 0, responsiveness: 0, anchor: 0 },
    enabled: { back: true, front: true, fringe: true }, intensity: { back: 100, front: 100, fringe: 150 }
  }
  const headAtFrame = (frame: number) => {
    const element = resolveEditorV6SceneAtFrame(project, frame).elements.find(item => item.id === actor.id)
    if (!element) return .5
    if (element.motionSprite) {
      const sampleIndex = Math.round(element.motionSprite.x / 64)
      const sample = transitionPlan.samples[sampleIndex]
      const frame = hairAnimation.motionTransitions![0].frames[sampleIndex]
      const rig = interpolateEditorV6HairMotionRig(hairAnimation.rigs[0], hairAnimation.rigs[1], motionEase(sample.progress))
      return editorV6HairMotionHeadAnchorX(element, { ...rig, sourceCrop: frame.crop })
    }
    const rig = hairAnimation.rigs.find(item => item.assetId === element.assetId)
    if (rig) return editorV6HairMotionHeadAnchorX(element, rig)
    return (50 + element.x) / 100
  }
  const simulateAt = (frames: number[]) => {
    const state = createHairMotionState()
    for (const frame of frames) advanceHairMotionToFrame(state, { ...preset.physics, enabled: true }, frame, headAtFrame, 1.2)
    return { offsets: [...state.offsets], velocities: [...state.velocities], time: state.time }
  }
  const hairAnimation: EditorV6HairMotionBundle = {
    presetSlot: 1, preset,
    surfaces: [
      { id: 'body', dataUrl: encodeRgbaPng(64, 64, bodyPixels()) },
      { id: 'face-pose-1', dataUrl: faceSurfaceData() },
      { id: 'face-pose-2', dataUrl: faceSurfaceData(2) },
      { id: 'marker-pose-1', dataUrl: encodeRgbaPng(64, 64, headMarkerPixels()) },
      { id: 'marker-pose-2', dataUrl: encodeRgbaPng(64, 64, headMarkerPixels(2)) },
      { id: 'transition-behind', dataUrl: encodeRgbaPng(atlasWidth, 64, transitionBehindAtlas) },
      { id: 'transition-face', dataUrl: encodeRgbaPng(atlasWidth, 64, transitionFaceAtlas) },
      { id: 'transition-marker', dataUrl: encodeRgbaPng(atlasWidth, 64, transitionMarkerAtlas) },
      { id: 'transition-face-patch', dataUrl: encodeRgbaPng(4, 3, mouthPatchPixels) }
    ],
    textures: [
      { id: 'back', dataUrl: strandData('#1769aa', '#9edcff') },
      { id: 'front', dataUrl: strandData('#a81757', '#ffc4df') },
      { id: 'fringe', dataUrl: strandData('#e45b16', '#ffe0a1') },
      { id: 'solid', dataUrl: solidHairData() }
    ],
    rigs: [
      {
        elementId: actor.id, assetId: actor.assetId!, characterId: actor.characterId!, poseSlot: 1, baseSurfaceId: 'body', faceSurfaceId: 'face-pose-1', overlaySurfaceId: 'marker-pose-1',
        artworkWidth: 64, artworkHeight: 64, outputWidth: 64, outputHeight: 64, shapeScaleX: 1, shapeScaleY: 1,
        sourceCrop: firstCrop, sourceHead: { width: 32, height: 24 },
        targetHead: { x: 16, y: 8, width: 32, height: 24, rotation: 0 },
        layers: [
        { id: 'back-1', textureId: 'back', side: 'back', width: 28, height: 48, x: -4, y: 8, scaleX: .9, scaleY: 1, rotation: -4, flipX: true, phase: 0 },
        { id: 'front-1', textureId: 'front', side: 'front', width: 32, height: 46, x: 1, y: 7, scaleX: 1, scaleY: .94, rotation: 3, flipX: false, phase: 1.2 },
        { id: 'solid-1', textureId: 'solid', side: 'front', width: 32, height: 46, x: 12, y: 8, scaleX: 1, scaleY: 1, rotation: -3, flipX: false, phase: 3.6 },
        { id: 'fringe-1', textureId: 'fringe', side: 'fringe', width: 30, height: 31, x: 1, y: -5, scaleX: 1.05, scaleY: 1, rotation: -2, flipX: false, phase: 2.4 }
        ]
      },
      {
        elementId: actor.id, assetId: secondAssetId, characterId: actor.characterId!, poseSlot: 2, baseSurfaceId: 'body', faceSurfaceId: 'face-pose-2', overlaySurfaceId: 'marker-pose-2',
        artworkWidth: 64, artworkHeight: 64, outputWidth: 64, outputHeight: 64, shapeScaleX: 1, shapeScaleY: 1,
        sourceCrop: secondCrop, sourceHead: { width: 32, height: 24 },
        targetHead: { x: 18, y: 8, width: 32, height: 24, rotation: 2 },
        layers: [
          { id: 'back-1', textureId: 'back', side: 'back', width: 28, height: 48, x: -4, y: 8, scaleX: .9, scaleY: 1, rotation: -4, flipX: true, phase: 0 },
          { id: 'front-1', textureId: 'front', side: 'front', width: 32, height: 46, x: 1, y: 7, scaleX: 1, scaleY: .94, rotation: 3, flipX: false, phase: 1.2 },
          { id: 'solid-1', textureId: 'solid', side: 'front', width: 32, height: 46, x: 12, y: 8, scaleX: 1, scaleY: 1, rotation: -3, flipX: false, phase: 3.6 },
          { id: 'fringe-1', textureId: 'fringe', side: 'fringe', width: 30, height: 31, x: 1, y: -5, scaleX: 1.05, scaleY: 1, rotation: -2, flipX: false, phase: 2.4 }
        ]
      }
    ],
    motionTransitions: [{
      elementId: actor.id, key: transitionPlan.key, startFrame: transitionPlan.startFrame, endFrame: transitionPlan.endFrame,
      behindFaceSurfaceId: 'transition-behind', faceSurfaceId: 'transition-face', overlaySurfaceId: 'transition-marker', faceAtlasSurfaceId: 'transition-face-patch',
      frames: transitionPlan.samples.map((sample, index) => {
        const motionFrame = transitionMotionFrames[index], crop = transitionCrops[index].crop
        return {
          offset: sample.offset, sprite: motionFrame.sprite, crop,
          x: motionFrame.x, y: motionFrame.y, width: motionFrame.width, height: motionFrame.height,
          rotation: motionFrame.rotation, flipX: motionFrame.flipX,
          facePatch: {
            sprite: { x: 0, y: 0, width: 4, height: 3, atlasWidth: 4, atlasHeight: 3 },
            x: (30 - crop.left) / crop.width, y: (29 - crop.top) / crop.height,
            width: 4 / crop.width, height: 3 / crop.height,
            replace: true, replaceBounds: { x: 0, y: 0, width: 1, height: 1 }
          }
        }
      })
    }]
  }
  assert(JSON.stringify(simulateAt([0, 22, 30, 31, 60])) === JSON.stringify(simulateAt([30, 60])), 'a física deve ser independente da ordem de captura inclusive durante a transição')
  const processMemorySamples: Array<Record<string, unknown>> = []
  const sampledRendererPids = new Set<number>()
  const longRendererWindows = new Map<number, Electron.BrowserWindow>()
  let activeBenchmarkTrial: string | null = null
  const summarizeProcess = (metric: Electron.ProcessMetric | undefined) => metric ? ({
    type: metric.type,
    workingSetBytes: Number.isFinite(metric.memory?.workingSetSize) ? Math.round(metric.memory.workingSetSize * 1024) : null,
    privateBytes: Number.isFinite(metric.memory?.privateBytes) ? Math.round(metric.memory.privateBytes * 1024) : null,
    cpuPercentSincePreviousSample: Number.isFinite(metric.cpu?.percentCPUUsage) ? metric.cpu.percentCPUUsage : null
  }) : null
  const payload: EditorV6WorkerPayload = { project, width: 320, height: 180, layeredVideo: false, hairAnimation }
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'), inspectCapture: ({ window, frame }) => {
    const rendererPid = window.webContents.getOSProcessId()
    if (rendererPid) longRendererWindows.set(rendererPid, window)
    if (!rendererPid || sampledRendererPids.has(rendererPid)) return
    sampledRendererPids.add(rendererPid)
    const metrics = app.getAppMetrics()
    const rendererMetric = metrics.find(metric => metric.pid === rendererPid)
    const mainMetric = metrics.find(metric => metric.pid === process.pid)
    const gpuMetrics = metrics.filter(metric => /gpu/i.test(metric.type))
    const auxiliaryMetrics = metrics.filter(metric => metric.pid !== rendererPid && metric.pid !== process.pid && !/gpu/i.test(metric.type))
    processMemorySamples.push({
      frame, trial: activeBenchmarkTrial, main: summarizeProcess(mainMetric), exportRenderer: summarizeProcess(rendererMetric),
      gpuProcesses: gpuMetrics.map(summarizeProcess),
      otherElectronProcesses: auxiliaryMetrics.map(summarizeProcess),
      dedicatedGpuMemoryBytes: null
    })
  } })
  let sequential: Awaited<ReturnType<typeof factory.create>> | undefined
  let split: Awaited<ReturnType<typeof factory.create>> | undefined
  try {
    sequential = await factory.create(payload, new AbortController().signal)
    const first = await sequential.frame(0)
    const beforeTransition = await sequential.frame(22)
    const transitionStart = await sequential.frame(23)
    const transitionMiddleFrames = []
    for (let frame = 24; frame <= 28; frame += 1) transitionMiddleFrames.push(await sequential.frame(frame))
    const transitionEnd = await sequential.frame(29)
    const middle = await sequential.frame(30)
    const afterTransition = await sequential.frame(31)
    const last = await sequential.frame(60)
    assert(first.bitmap && beforeTransition.bitmap && transitionStart.bitmap && transitionEnd.bitmap && middle.bitmap && afterTransition.bitmap && last.bitmap, 'O worker não entregou os quadros capturados da animação de cabelo.')
    const saveCapture = (name: string, bitmap: Buffer, width = 320, height = 180) => writeFile(join(folder, name), execFileSync(ffmpeg, ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { input: bitmap, windowsHide: true }))
    await Promise.all([
      saveCapture('hair-frame-000.png', first.bitmap), saveCapture('hair-frame-022-before-transition.png', beforeTransition.bitmap),
      saveCapture('hair-frame-023-transition-start.png', transitionStart.bitmap), saveCapture('hair-frame-029-transition-end.png', transitionEnd.bitmap),
      saveCapture('hair-frame-030-after-transition.png', middle.bitmap), saveCapture('hair-frame-031-after-transition.png', afterTransition.bitmap), saveCapture('hair-frame-060.png', last.bitmap)
    ])
    const redPixelCount = (bitmap: Buffer) => {
      let count = 0
      for (let index = 0; index < bitmap.length; index += 4) {
        const [a, b, c] = bitmap.subarray(index, index + 3)
        if ((a > 140 && b < 110 && c < 110) || (c > 140 && b < 110 && a < 110)) count += 1
      }
      return count
    }
    assert(redPixelCount(first.bitmap) > 10, 'O cabelo de fixture não foi composto sobre o personagem.')
    const translucentHairPixelCount = (bitmap: Buffer) => {
      let count = 0
      for (let index = 0; index < bitmap.length; index += 4) {
        const [blue, green, red] = bitmap.subarray(index, index + 3)
        if (red > 45 && red < 245 && green > 65 && blue > 65) count += 1
      }
      return count
    }
    const chromaticHairPixelCount = (bitmap: Buffer) => {
      let count = 0
      for (let index = 0; index < bitmap.length; index += 4) {
        const blue = bitmap[index], green = bitmap[index + 1], red = bitmap[index + 2]
        const channels = [red, green, blue], spread = Math.max(...channels) - Math.min(...channels)
        if (spread < 42 || (red > 205 && green > 205 && blue < 90)) continue
        if ((blue > red * 1.12 && blue > green * 1.08)
          || (red > green * 1.35 && red > blue * 1.2)
          || (green > red * 1.45 && green > blue * 1.45)) count += 1
      }
      return count
    }
    const fullTransitionFrames = [transitionStart, ...transitionMiddleFrames, transitionEnd]
    assert(fullTransitionFrames.every(frame => frame.bitmap && chromaticHairPixelCount(frame.bitmap) > 10), 'O cabelo desapareceu em pelo menos uma amostra da troca de pose.')
    const expressionOnlyProject = structuredClone(project)
    const expressionOnlyTrack = expressionOnlyProject.timeline.tracks.find(track => track.kind === 'character')!
    const expressionOnlyState = { ...actor, activeExpressionPresetId: 'synthetic-expression-change' }
    expressionOnlyTrack.blocks[1].state = expressionOnlyState
    const expressionOnlyPlan = editorV6MotionPlans(expressionOnlyProject)[0]
    assert(expressionOnlyPlan && expressionOnlyPlan.from.poseSlot === expressionOnlyPlan.to.poseSlot
      && expressionOnlyPlan.from.x === expressionOnlyPlan.to.x && expressionOnlyPlan.from.y === expressionOnlyPlan.to.y
      && expressionOnlyPlan.from.width === expressionOnlyPlan.to.width && expressionOnlyPlan.from.height === expressionOnlyPlan.to.height,
      'O fixture facial deve trocar a expressão sem mudar pose, posição ou escala do ator.')
    expressionOnlyTrack.blocks[1].incomingMotion = structuredClone(characterTrack.blocks[1].incomingMotion)
    expressionOnlyTrack.blocks[1].incomingMotion!.key = expressionOnlyPlan.key
    const expressionOnlyHair = structuredClone(hairAnimation)
    expressionOnlyHair.motionTransitions![0].key = expressionOnlyPlan.key
    expressionOnlyHair.preset.physics = { ...expressionOnlyHair.preset.physics, wind: 0, gust: 0, speed: 100, stiffness: 0, damping: 0, responsiveness: 100, anchor: 0 }
    const expressionReferenceHair = structuredClone(expressionOnlyHair)
    expressionReferenceHair.preset.physics.responsiveness = 0
    const expressionOnlyWorker = await factory.create({ ...payload, project: expressionOnlyProject, hairAnimation: expressionOnlyHair }, new AbortController().signal)
    const expressionReferenceWorker = await factory.create({ ...payload, project: expressionOnlyProject, hairAnimation: expressionReferenceHair }, new AbortController().signal)
    try {
      for (let frame = 23; frame <= 29; frame += 1) {
        const actual = await expressionOnlyWorker.frame(frame), reference = await expressionReferenceWorker.frame(frame)
        assert(actual.bitmap && reference.bitmap, `Quadro facial ${frame} ausente no teste de isolamento da física.`)
        let differentPixels = 0
        for (let offset = 0; offset < actual.bitmap.length; offset += 4) {
          if (actual.bitmap[offset] !== reference.bitmap[offset] || actual.bitmap[offset + 1] !== reference.bitmap[offset + 1]
            || actual.bitmap[offset + 2] !== reference.bitmap[offset + 2] || actual.bitmap[offset + 3] !== reference.bitmap[offset + 3]) differentPixels++
        }
        assert(differentPixels === 0, `Uma transição apenas facial injetou movimento físico no cabelo no quadro ${frame} (${differentPixels} pixels divergentes).`)
      }
    } finally { expressionOnlyWorker.close(); expressionReferenceWorker.close() }
    // Compare the same body's pixel bounds with and without hair export when
    // its saved rectangle deliberately does not follow the 16:9-derived height.
    const stretchedProject = structuredClone(project)
    for (const element of stretchedProject.elements) if (element.id === actor.id) element.height *= .82
    for (const track of stretchedProject.timeline.tracks) for (const block of track.blocks) {
      if (block.state?.id === actor.id) block.state.height *= .82
      if (block.incomingMotion) for (const motionFrame of block.incomingMotion.frames) motionFrame.height *= .82
    }
    const stretchedPlan = editorV6MotionPlans(stretchedProject)[0]
    const stretchedBlock = stretchedProject.timeline.tracks.flatMap(track => track.blocks).find(block => block.id === stretchedPlan.blockId)!
    stretchedBlock.incomingMotion!.key = stretchedPlan.key
    const stretchedHair = { ...hairAnimation, preset: { ...hairAnimation.preset, intensity: { back: 0, front: 0, fringe: 0 } }, rigs: hairAnimation.rigs.map(rig => ({ ...rig, layers: rig.layers.filter(layer => layer.id === 'solid-1').map(layer => ({ ...layer, side: 'back' as const })) })), motionTransitions: hairAnimation.motionTransitions!.map(transition => ({ ...transition, key: stretchedPlan.key, frames: transition.frames.map(frame => ({ ...frame, height: frame.height * .82 })) })) }
    const referenceWorker = await factory.create({ project: stretchedProject, width: 320, height: 180, layeredVideo: false }, new AbortController().signal)
    const stretchedWorker = await factory.create({ project: stretchedProject, width: 320, height: 180, layeredVideo: false, hairAnimation: stretchedHair }, new AbortController().signal)
    try {
      const bodyRows = (bitmap: Buffer) => {
        let top = 180, bottom = -1
        for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
          const index = (y * 320 + x) * 4, blue = bitmap[index], green = bitmap[index + 1], red = bitmap[index + 2]
          if (red > 240 && green > 200 && blue > 40 && blue < 100) { top = Math.min(top, y); bottom = Math.max(bottom, y) }
        }
        return { top, bottom }
      }
      for (const frame of [0, 23, 29, 30]) {
        const reference = await referenceWorker.frame(frame), actual = await stretchedWorker.frame(frame)
        assert(reference.bitmap && actual.bitmap, `Quadro ${frame} ausente na comparação de proporções.`)
        const expected = bodyRows(reference.bitmap), observed = bodyRows(actual.bitmap)
        assert(expected.bottom > expected.top && observed.bottom > observed.top && Math.abs(expected.top - observed.top) <= 2 && Math.abs(expected.bottom - observed.bottom) <= 2,
          `A altura do corpo mudou com o cabelo no quadro ${frame}: referência ${JSON.stringify(expected)}, cabelo ${JSON.stringify(observed)}.`)
      }
    } finally { referenceWorker.close(); stretchedWorker.close() }
    const magentaFacePatchPixels = (bitmap: Buffer) => {
      let count = 0
      for (let offset = 0; offset < bitmap.length; offset += 4) if (bitmap[offset] > 220 && bitmap[offset + 2] > 220 && bitmap[offset + 1] < 35) count++
      return count
    }
    const transitionFacePatchCounts = fullTransitionFrames.map(frame => magentaFacePatchPixels(frame.bitmap!))
    const transitionFacePatchCount = transitionFacePatchCounts[0]
    assert(transitionFacePatchCounts.every(count => count > 2), `A troca de pose deixou de preservar a camada facial preparada junto ao cabelo dinâmico (${transitionFacePatchCounts.join(', ')} pixels).`)
    // A single opaque strand makes its expected center independently measurable
    // against the head anchor, including cropped and mirrored transition frames.
    const centeredHair = { ...hairAnimation, preset: { ...hairAnimation.preset, intensity: { back: 0, front: 0, fringe: 0 } }, rigs: hairAnimation.rigs.map(rig => ({ ...rig, layers: rig.layers.filter(layer => layer.id === 'solid-1') })) }
    const centerWorker = await factory.create({ ...payload, hairAnimation: centeredHair }, new AbortController().signal)
    try {
      for (const frame of [0, 23, 29, 30]) {
        const captured = await centerWorker.frame(frame)
        assert(captured.bitmap, `Sem quadro para verificar o encaixe do cabelo: ${frame}.`)
        const scene = resolveEditorV6SceneAtFrame(project, frame).elements.find(item => item.id === actor.id)!
        const index = scene.motionSprite ? Math.round(scene.motionSprite.x / 64) : -1
        const sample = index >= 0 ? hairAnimation.motionTransitions![0].frames[index] : undefined
        const rig = sample ? interpolateEditorV6HairMotionRig(centeredHair.rigs[0], centeredHair.rigs[1], motionEase(transitionPlan.samples[index].progress)) : centeredHair.rigs.find(item => item.assetId === scene.assetId)!
        const crop = sample?.crop ?? rig.sourceCrop
        const geometry = sample ? { ...scene, ...sample } : scene
        const size = editorV6ElementSize(geometry)
        const angle = rig.targetHead.rotation * Math.PI / 180
        const strand = rig.layers[0]
        const sourceX = rig.targetHead.x + rig.targetHead.width / 2 + strand.x * Math.cos(angle) - strand.y * Math.sin(angle)
        const sourceY = rig.targetHead.y + rig.targetHead.height / 2 + strand.x * Math.sin(angle) + strand.y * Math.cos(angle)
        let dx = (sourceX - crop.left - crop.width / 2) / crop.width * size.width * 320 / 100
        const dy = (sourceY - crop.top - crop.height / 2) / crop.height * size.height * 180 / 100
        if (geometry.flipX) dx = -dx
        const rotation = geometry.rotation * Math.PI / 180
        const expectedX = 320 * (50 + geometry.x) / 100 + dx * Math.cos(rotation) - dy * Math.sin(rotation)
        const expectedY = 180 * (50 + geometry.y) / 100 + dx * Math.sin(rotation) + dy * Math.cos(rotation)
        let count = 0, sumX = 0, sumY = 0
        for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
          const offset = (y * 320 + x) * 4, blue = captured.bitmap[offset], green = captured.bitmap[offset + 1], red = captured.bitmap[offset + 2]
          if (green < 90 || green > 180 || red > 55 || blue > 75) continue
          count++; sumX += x + .5; sumY += y + .5
        }
        assert(count > 100, `A peça de referência ficou invisível no quadro ${frame}.`)
        const error = Math.hypot(sumX / count - expectedX, sumY / count - expectedY)
        assert(error < 3.5, `O centro da peça se afastou da cabeça no quadro ${frame}: ${error.toFixed(2)} px.`)
        if (frame === 23) {
          const strandAngle = (rig.targetHead.rotation + strand.rotation) * Math.PI / 180
          const outerX = sourceX + 8 * Math.cos(strandAngle), outerY = sourceY + 8 * Math.sin(strandAngle)
          assert(outerX > crop.left + crop.width, 'O fixture deve colocar cabelo fora do recorte do corpo.')
          let outerDx = (outerX - crop.left - crop.width / 2) / crop.width * size.width * 320 / 100
          const outerDy = (outerY - crop.top - crop.height / 2) / crop.height * size.height * 180 / 100
          if (geometry.flipX) outerDx = -outerDx
          const px = Math.round(320 * (50 + geometry.x) / 100 + outerDx * Math.cos(rotation) - outerDy * Math.sin(rotation))
          const py = Math.round(180 * (50 + geometry.y) / 100 + outerDx * Math.sin(rotation) + outerDy * Math.cos(rotation))
          let outsideVisible = false
          for (let y = Math.max(0, py - 1); y <= Math.min(179, py + 1); y++) for (let x = Math.max(0, px - 1); x <= Math.min(319, px + 1); x++) {
            const offset = (y * 320 + x) * 4, blue = captured.bitmap[offset], green = captured.bitmap[offset + 1], red = captured.bitmap[offset + 2]
            if (green >= 90 && green <= 180 && red <= 55 && blue <= 75) outsideVisible = true
          }
          assert(outsideVisible, 'A transição cortou o cabelo que ultrapassa o recorte do corpo.')
        }
      }
    } finally { centerWorker.close() }
    let transitionDynamicChangedPixels = 0
    const staticMotionWorker = await factory.create({ ...payload, hairAnimation: { ...hairAnimation, preset: { ...hairAnimation.preset, intensity: { back: 0, front: 0, fringe: 0 } } } }, new AbortController().signal)
    try {
      const staticTransition = await staticMotionWorker.frame(26), animatedTransition = await sequential.frame(26)
      assert(staticTransition.bitmap && animatedTransition.bitmap, 'Não foi possível comparar o cabelo dinâmico com a textura estática durante a troca de pose.')
      for (let offset = 0; offset < animatedTransition.bitmap.length; offset += 4) {
        if (animatedTransition.bitmap[offset] !== staticTransition.bitmap[offset] || animatedTransition.bitmap[offset + 1] !== staticTransition.bitmap[offset + 1]
          || animatedTransition.bitmap[offset + 2] !== staticTransition.bitmap[offset + 2] || animatedTransition.bitmap[offset + 3] !== staticTransition.bitmap[offset + 3]) transitionDynamicChangedPixels++
      }
      assert(transitionDynamicChangedPixels > 10, `O cabelo não foi deformado durante motionSprite (${transitionDynamicChangedPixels} pixels diferentes da camada sem movimento).`)
    } finally { staticMotionWorker.close() }
    const pixelHairBounds = (bitmap: Buffer, width: number, height: number) => {
      let left = width, top = height, right = -1, bottom = -1, pixels = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const blue = bitmap[offset], green = bitmap[offset + 1], red = bitmap[offset + 2]
        const channels = [red, green, blue], spread = Math.max(...channels) - Math.min(...channels)
        const hair = spread >= 42 && !(red > 205 && green > 205 && blue < 90)
          && ((blue > red * 1.12 && blue > green * 1.08)
            || (red > green * 1.35 && red > blue * 1.2)
            || (green > red * 1.45 && green > blue * 1.45))
        if (!hair) continue
        pixels++
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      return { left: pixels ? left : null, top: pixels ? top : null, right: pixels ? right : null, bottom: pixels ? bottom : null, pixels }
    }
    assert(translucentHairPixelCount(first.bitmap) > 20, 'A composição perdeu os pixels de borda e fios semitransparentes do fixture.')
    const backgroundChecks: Record<string, number> = {}
    const geometryCaptureFrames = [0, 22, 23, 29, 30, 31, 60]
    const geometryCaptures = new Map<number, Buffer>()
    const backgrounds = [
      { name: 'white', color: '#ffffff' }, { name: 'black', color: '#000000' },
      { name: 'colored', color: '#6b7240' }, { name: 'checkerboard', color: '#626262', assetId: checkerboardAssetId }
    ]
    for (const background of backgrounds) {
      const backgroundProject = { ...project, backgroundColor: background.color, backgroundAssetId: background.assetId ?? null }
      const backgroundWorker = await factory.create({ ...payload, project: backgroundProject }, new AbortController().signal)
      try {
        const frames = background.name === 'colored' ? geometryCaptureFrames : [0]
        for (const frame of frames) {
          const captured = await backgroundWorker.frame(frame)
          assert(captured.bitmap, `Não foi possível capturar o fundo ${background.name} no quadro ${frame}.`)
          if (background.name === 'colored') geometryCaptures.set(frame, captured.bitmap)
          if (frame === 0) {
            backgroundChecks[background.name] = chromaticHairPixelCount(captured.bitmap)
            await saveCapture(`hair-background-${background.name}.png`, captured.bitmap)
          }
        }
        assert(backgroundChecks[background.name] > 10, `O cabelo perdeu seus pixels coloridos no fundo ${background.name}.`)
      } finally { backgroundWorker.close() }
    }
    const geometryFrames = geometryCaptureFrames.map(frame => {
      const bitmap = geometryCaptures.get(frame)!
      const sceneElement = resolveEditorV6SceneAtFrame(project, frame).elements.find(element => element.id === actor.id)
      assert(sceneElement, `O personagem sintético sumiu do diagnóstico no quadro ${frame}.`)
      const transitionIndex = sceneElement.motionSprite ? Math.round(sceneElement.motionSprite.x / 64) : -1
      const transitionFrame = transitionIndex >= 0 ? hairAnimation.motionTransitions![0].frames[transitionIndex] : undefined
      const sceneRig = !sceneElement.motionSprite && sceneElement.assetId ? hairAnimation.rigs.find(item => item.assetId === sceneElement.assetId) : undefined
      const transitionRig = transitionFrame
        ? { ...interpolateEditorV6HairMotionRig(hairAnimation.rigs[0], hairAnimation.rigs[1], motionEase(transitionPlan.samples[transitionIndex].progress)), sourceCrop: transitionFrame.crop }
        : undefined
      const headRig = transitionRig ?? sceneRig
      const expectedSourceHead = sceneElement.motionSprite
        ? (() => {
            const sample = transitionPlan.samples[transitionIndex]
            return { x: 32 + Math.round(sample.progress * 2), y: 21, atlasSample: transitionIndex }
          })()
        : { x: sceneElement.assetId === secondAssetId ? 34 : 32, y: 21, atlasSample: null }
      const size = editorV6ElementSize(sceneElement)
      const center = { x: 320 * (50 + sceneElement.x) / 100, y: 180 * (50 + sceneElement.y) / 100 }
      const sourceCrop = headRig?.sourceCrop ?? { left: 0, top: 0, width: 64, height: 64 }
      let local = {
        x: (expectedSourceHead.x + .5 - sourceCrop.left - sourceCrop.width / 2) / sourceCrop.width * size.width * 320 / 100,
        y: (expectedSourceHead.y + .5 - sourceCrop.top - sourceCrop.height / 2) / sourceCrop.height * size.height * 180 / 100
      }
      if (sceneElement.flipX) local.x *= -1
      const rotation = sceneElement.rotation * Math.PI / 180
      const expectedHead = {
        x: center.x + local.x * Math.cos(rotation) - local.y * Math.sin(rotation),
        y: center.y + local.x * Math.sin(rotation) + local.y * Math.cos(rotation)
      }
      let headMarkerX = 0, headMarkerY = 0, headMarkerPixels = 0
      let hairX = 0, hairY = 0, hairPixels = 0
      let left = 320, top = 180, right = -1, bottom = -1
      for (let y = 0; y < 180; y += 1) for (let x = 0; x < 320; x += 1) {
        const offset = (y * 320 + x) * 4
        const blue = bitmap[offset], green = bitmap[offset + 1], red = bitmap[offset + 2]
        if (green > 235 && red < 20 && blue < 20) { headMarkerX += x; headMarkerY += y; headMarkerPixels++ }
        const channels = [red, green, blue], spread = Math.max(...channels) - Math.min(...channels)
        const hair = spread >= 42 && !(red > 205 && green > 205 && blue < 90)
          && ((blue > red * 1.12 && blue > green * 1.08)
            || (red > green * 1.35 && red > blue * 1.2)
            || (green > red * 1.45 && green > blue * 1.45))
        if (!hair) continue
        hairX += x; hairY += y; hairPixels++
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      assert(headMarkerPixels >= 2, `Não foi possível localizar o marcador da cabeça do fixture no quadro ${frame}.`)
      const observedHead = { x: headMarkerX / headMarkerPixels, y: headMarkerY / headMarkerPixels }
      const headDrift = Math.hypot(observedHead.x - expectedHead.x, observedHead.y - expectedHead.y)
      assert(headDrift <= 1.5, `A âncora da cabeça do fixture saiu da posição derivada da geometria da cena no quadro ${frame} (${headDrift.toFixed(2)} px).`)
      const physicsHeadAnchorStageX = headRig ? editorV6HairMotionHeadAnchorX(sceneElement, headRig) : null
      const physicsAnchorDrift = physicsHeadAnchorStageX === null ? null : Math.abs(physicsHeadAnchorStageX * 320 - expectedHead.x)
      if (physicsAnchorDrift !== null) assert(physicsAnchorDrift <= 2.5, `A inércia ignorou o recorte/crop da pose no quadro ${frame} (${physicsAnchorDrift.toFixed(2)} px).`)
      assert(hairPixels > 10, `Não foi possível localizar o cabelo do fixture no quadro ${frame}.`)
      const hairCentroid = { x: hairX / hairPixels, y: hairY / hairPixels }
      return {
        frame, output: { width: 320, height: 180 },
        scene: { assetId: sceneElement.assetId, x: sceneElement.x, y: sceneElement.y, width: sceneElement.width, height: sceneElement.height, rotation: sceneElement.rotation, flipX: sceneElement.flipX, motionSprite: sceneElement.motionSprite ?? null },
        sourceCrop, expectedSourceHead, expectedHeadStagePx: expectedHead,
        observedHeadStagePx: observedHead, headDriftPx: Number(headDrift.toFixed(3)), headMarkerPixels,
        hairCentroidStagePx: hairCentroid, hairRelativeToHeadPx: { x: Number((hairCentroid.x - observedHead.x).toFixed(3)), y: Number((hairCentroid.y - observedHead.y).toFixed(3)) },
        hairBounds: { left, top, right, bottom }, hairPixels,
        rigHeadCenterOutputPx: headRig ? {
          x: headRig.outputWidth / 2 + (headRig.targetHead.x + headRig.targetHead.width / 2 - headRig.artworkWidth / 2) * headRig.shapeScaleX,
          y: headRig.outputHeight / 2 + (headRig.targetHead.y + headRig.targetHead.height / 2 - headRig.artworkHeight / 2) * headRig.shapeScaleY
        } : null,
        physicsHeadAnchorStageX, physicsAnchorDriftPx: physicsAnchorDrift === null ? null : Number(physicsAnchorDrift.toFixed(3)),
        rotationDegrees: sceneElement.rotation, absoluteFrame: frame,
        motionMode: sceneElement.motionSprite ? 'export-recomposed-motionSprite' : 'export-webgl-mesh'
      }
    })
    const alphaWorker = await factory.create({ ...payload, layeredVideo: true }, new AbortController().signal)
    let alphaLayerPixels = 0, transparentLayerPixels = 0
    try {
      const captured = await alphaWorker.frame(0)
      const layerBytes = 320 * 180 * 4
      assert(captured.bitmap?.length === layerBytes * 2, 'A captura RGBA em camadas não preservou os dois planos de composição.')
      const foreground = captured.bitmap!.subarray(layerBytes)
      for (let index = 3; index < foreground.length; index += 4) {
        if (foreground[index] === 0) transparentLayerPixels++
        else if (foreground[index] < 255) alphaLayerPixels++
      }
      assert(transparentLayerPixels > 1000, 'O plano de frente não preservou áreas transparentes fora do personagem.')
      assert(alphaLayerPixels > 10, 'O plano de frente perdeu os pixels alfa semitransparentes do cabelo.')
      assert(chromaticHairPixelCount(foreground) > 10, 'O plano transparente removeu as cores do cabelo.')
      await saveCapture('hair-frame-000-alpha-layer.png', foreground)
    } finally { alphaWorker.close() }
    assert(!first.bitmap.equals(last.bitmap), 'O cabelo ficou parado durante a exportação experimental.')
    assert(!transitionStart.bitmap.equals(transitionEnd.bitmap), 'A geometria da cabeça deixou de acompanhar a troca de pose durante o atlas.')
    assert(!middle.bitmap.equals(afterTransition.bitmap), 'O balanço do cabelo não retomou após a troca de pose.')
    split = await factory.create(payload, new AbortController().signal)
    const turboChunkStart = await split.frame(30)
    const turboChunkEnd = await split.frame(60)
    assert(turboChunkStart.bitmap && turboChunkEnd.bitmap, 'O worker Turbo não entregou os quadros de comparação.')
    await Promise.all([saveCapture('hair-frame-030-turbo.png', turboChunkStart.bitmap), saveCapture('hair-frame-060-turbo.png', turboChunkEnd.bitmap)])
    assert(middle.bitmap.equals(turboChunkStart.bitmap), 'O primeiro quadro de um trecho Turbo divergiu do render sequencial.')
    const differentPixels = (left: Buffer, right: Buffer) => {
      let count = 0
      for (let index = 0; index < left.length; index += 4) if (left[index] !== right[index] || left[index + 1] !== right[index + 1] || left[index + 2] !== right[index + 2] || left[index + 3] !== right[index + 3]) count += 1
      return count
    }
    assert(last.bitmap.equals(turboChunkEnd.bitmap), `A animação mudou de fase na fronteira de um trecho Turbo (${differentPixels(last.bitmap, turboChunkEnd.bitmap)} pixels divergiram).`)
    split.close(); split = undefined
    sequential.close(); sequential = undefined

    // Category regression: rearHair is POSTERIOR; backHair is TRASEIRO.
    // Two front-side pieces are deliberately present: only the one explicitly
    // marked rearHair may move. Capture actual offscreen BGRA frames.
    const makePosteriorFixture = (reacting: boolean): EditorV6HairMotionBundle => ({
      ...structuredClone(hairAnimation),
      ...(reacting ? { poseReactionOnly: true, motionTransitions: [] } : {}),
      preset: {
        ...structuredClone(hairAnimation.preset),
        enabled: { back: false, front: reacting, fringe: false }
      },
      rigs: hairAnimation.rigs.map(rig => ({
        ...structuredClone(rig),
        layers: rig.layers.map(piece => ({
          ...piece,
          id: piece.id === 'front-1' ? 'rearHair:1'
            : piece.id === 'back-1' ? 'backHair:1'
              : piece.id === 'solid-1' ? 'ahoge:1'
                : piece.id === 'fringe-1' ? 'frontHair:1' : piece.id
        }))
      }))
    })
    const stillWorker = await factory.create({ ...payload, hairAnimation: makePosteriorFixture(false) }, new AbortController().signal)
    const reactionWorker = await factory.create({ ...payload, hairAnimation: makePosteriorFixture(true) }, new AbortController().signal)
    const canonicalWorker = await factory.create({ ...payload, hairAnimation: undefined }, new AbortController().signal)
    try {
      // The canonical full-character atlas supplies all seven transition
      // frames. No second hairless atlas may alter a single BGRA pixel.
      for (const sample of transitionPlan.samples) {
        const frame = transitionPlan.endFrame + sample.offset
        const [baseline, reaction] = await Promise.all([canonicalWorker.frame(frame), reactionWorker.frame(frame)])
        assert(baseline.bitmap && reaction.bitmap && baseline.bitmap.equals(reaction.bitmap),
          'A transição sem atlas extra não preservou RGBA exato no quadro ' + frame + '.')
      }
      for (const frame of [0, 30, 40, 60]) {
        const [stationary, reaction] = await Promise.all([stillWorker.frame(frame), reactionWorker.frame(frame)])
        assert(stationary.bitmap && reaction.bitmap, 'A reação do Posterior não entregou quadros BGRA.')
        const diff = differentPixels(stationary.bitmap, reaction.bitmap)
        if (frame === 40) assert(diff > 0, 'O cabelo POSTERIOR não reagiu após a transição.')
        else assert(diff === 0, 'O modo posterior modificou peças ou um quadro em repouso: ' + frame + ' (' + diff + ' pixels).')
        if (frame === 0) {
          const next = await reactionWorker.frame(1)
          const sameResolvedElements = JSON.stringify(resolveEditorV6SceneAtFrame(project, 0).elements)
            === JSON.stringify(resolveEditorV6SceneAtFrame(project, 1).elements)
          if (sameResolvedElements) {
            const independent = await stillWorker.frame(1)
            assert(independent.bitmap && stationary.bitmap.equals(independent.bitmap),
              'R28: a referência independente de repouso mudou os pixels BGRA entre quadros idênticos.')
            assert(next.reused === true && next.bitmap === undefined,
              'R28: o worker deveria reutilizar o bitmap anterior sem outra captura para quadro idêntico.')
          }
        }
      }
    } finally {
      canonicalWorker.close()
      stillWorker.close()
      reactionWorker.close()
    }

    const hiRes = await factory.create({ ...payload, width: 1280, height: 720 }, new AbortController().signal)
    try {
      const deformed = await hiRes.frame(10)
      assert(deformed.bitmap, 'O worker não entregou pixels sem compressão para validar as emendas da malha.')
      await saveCapture('hair-frame-010-720p-rgba.png', deformed.bitmap, 1280, 720)
      const solidHairRows = Array.from({ length: 720 }, (_, y) => {
        let count = 0
        for (let x = 0; x < 1280; x += 1) {
          const offset = (y * 1280 + x) * 4
          const blue = deformed.bitmap![offset], green = deformed.bitmap![offset + 1], red = deformed.bitmap![offset + 2]
          if (green > 65 && green > red * 1.8 && green > blue * 1.5) count += 1
        }
        return count
      })
      const visibleRows = solidHairRows.map((count, y) => count > 20 ? y : -1).filter(y => y >= 0)
      const firstVisibleRow = visibleRows[0] ?? -1
      const lastVisibleRow = visibleRows.at(-1) ?? -1
      const continuousRows = firstVisibleRow >= 0 ? solidHairRows.slice(firstVisibleRow, lastVisibleRow + 1) : []
      assert(continuousRows.length >= 250, 'A textura contínua perdeu cobertura no comprimento do cabelo ao deformar em WebGL.')
      assert(continuousRows.every(count => count > 0), 'A malha deixou linhas transparentes entre faixas da camada contínua.')
    } finally { hiRes.close() }

    const ffprobe = join(videoTools, 'ffprobe.exe')
    const exportHairMp4 = (width: number, height: number, startFrame: number, endFrame: number, turbo: boolean, name: string, exportProject: EditorV6Document = project, exportHairAnimation: EditorV6HairMotionBundle = hairAnimation) => {
      const outputPath = join(folder, name)
      return runEditorV6Export(exportProject, { startFrame, endFrame, width, height, turbo, encoder: 'cpu', hairAnimationPresetSlot: 1, ...(exportHairAnimation.loopFrames ? { hairAnimationLoopFrames: exportHairAnimation.loopFrames } : {}) }, {
        ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath, reportPath: join(folder, `${name}.report.json`), signal: new AbortController().signal,
        getCharacters: async () => [], bakeMotion: async () => { throw Error('O fixture não deve preparar animações de pose.') },
        ...(exportHairAnimation.preparationProfile ? { hairPreparation: exportHairAnimation.preparationProfile } : {}),
        createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({ project: renderProject, width, height, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}), hairAnimation: exportHairAnimation }, signal),
        audioPath: () => join(folder, 'unused-audio.wav'), mediaPath: () => join(folder, 'unused-media.mp4'), progress: () => {}
      })
    }
    const outputPath = join(folder, 'hair-motion.mp4')
    const samplePreparationProfile = {
      totalMilliseconds: 18.25,
      stages: [{ name: 'prepareCharacterRenderers', samples: 2, totalMilliseconds: 10, maxMilliseconds: 6 }],
      counts: { surfaces: 6, textures: 2, rigs: 2, motionTransitions: 1, encodedCharacters: 512 }
    }
    const report = await exportHairMp4(320, 180, 0, 61, true, 'hair-motion.mp4',
      project, { ...hairAnimation, preparationProfile: samplePreparationProfile })
    assert(report.state === 'completed' && !report.fallback && report.attempts[0]?.parts.length === 2, 'A exportação MP4 com animação de cabelo não concluiu em dois trechos Turbo.')
    assert(report.hairPreparation?.totalMilliseconds === samplePreparationProfile.totalMilliseconds,
      'R27: o relatório principal perdeu o tempo medido antes de iniciar o MP4.')
    const exportedReport = JSON.parse(await readFile(join(folder, 'hair-motion.mp4.report.json'), 'utf8')) as typeof report
    assert(exportedReport.hairPreparation?.stages[0]?.name === 'prepareCharacterRenderers'
      && exportedReport.hairPreparation.counts.encodedCharacters === 512,
      'R27: o arquivo JSON não persistiu corretamente os diagnósticos do preparo de cabelo.')
    assert(report.attempts[0].parts.every(part => (part.frameTiming?.hairCompositionMs?.samples ?? 0) > 0), 'O relatório do export não separou o tempo da composição experimental de cabelo.')
    assert(report.attempts[0].parts.reduce((total, part) => total + (part.frameTiming?.hairMotionPrewarmMs?.totalMs ?? 0), 0) > 0, 'O relatório não mediu o custo do pré-aquecimento da física do cabelo.')
    assert(report.attempts[0].parts.reduce((total, part) => total + (part.frameMetrics?.hairRasterFrames ?? 0), 0) === 61, 'O relatório não contabilizou uma superfície rasterizada de cabelo por quadro exportado.')
    assert(report.attempts[0].parts.reduce((total, part) => total + (part.frameMetrics?.hairRasterPixels ?? 0), 0) > 0, 'O relatório não mediu os pixels rasterizados da camada de cabelo.')

    // New mode: actual offscreen MP4 through the same fixture/codec path.
    // This short test exercises loop vectors in both Turbo halves without
    // requiring the real private Preset 2. The full wrap is unit-tested.
    const numericalLoopHair = { ...hairAnimation, loopFrames: 120 as const }
    const loopReport = await exportHairMp4(320, 180, 0, 31, true, 'hair-motion-loop-4s.mp4', project, numericalLoopHair)
    assert(loopReport.state === 'completed' && !loopReport.fallback && loopReport.attempts[0]?.parts.length === 2,
      'O MP4 de cabelo em loop numérico não concluiu com duas partes Turbo.')
    assert(loopReport.attempts[0].parts.reduce((sum, part) => sum + (part.frameMetrics?.hairRasterFrames ?? 0), 0) === 31,
      'O loop experimental não rasterizou exatamente os 31 quadros do vídeo de teste.')


    // Compare the final composited pixels from two real MP4 exports. The paired
    // scene has identical IDs/settings and differs only by global flipX, so the
    // animated hair centroid must reflect around the actor without editing its
    // persisted negative wind preset.
    const staticDirectionProject = structuredClone(project)
    const staticDirectionTrack = staticDirectionProject.timeline.tracks.find(track => track.kind === 'character')!
    const staticDirectionSourceBlock = staticDirectionTrack.blocks[0]
    staticDirectionProject.timeline.durationFrames = 61
    const staticDirectionBlock = { ...staticDirectionSourceBlock, startFrame: 0, durationFrames: 61, state: { ...actor, flipX: false } }
    delete staticDirectionBlock.incomingMotion
    staticDirectionTrack.blocks = [staticDirectionBlock]
    staticDirectionProject.elements = [{ ...actor, flipX: false }]
    const staticDirectionHair: EditorV6HairMotionBundle = {
      ...structuredClone(hairAnimation), preset: { ...structuredClone(hairAnimation.preset), physics: { ...hairAnimation.preset.physics, wind: -50, gust: 28 } },
      rigs: hairAnimation.rigs.filter(rig => rig.assetId === actor.assetId), motionTransitions: []
    }
    const normalPieceHair = structuredClone(staticDirectionHair)
    normalPieceHair.rigs[0].layers = normalPieceHair.rigs[0].layers.map(piece => piece.id === 'solid-1' ? { ...piece, x: 0, y: 0, rotation: 0, flipX: false } : piece)
    const mirroredPieceHair = structuredClone(normalPieceHair)
    mirroredPieceHair.rigs[0].layers = mirroredPieceHair.rigs[0].layers.map(piece => piece.id === 'solid-1' ? { ...piece, flipX: true } : piece)
    const mirroredDirectionProject = structuredClone(staticDirectionProject)
    mirroredDirectionProject.elements = mirroredDirectionProject.elements.map(element => element.id === actor.id ? { ...element, flipX: true } : element)
    const mirroredDirectionTrack = mirroredDirectionProject.timeline.tracks.find(track => track.kind === 'character')!
    mirroredDirectionTrack.blocks = mirroredDirectionTrack.blocks.map(block => ({ ...block, state: block.state ? { ...block.state, flipX: true } : block.state }))
    const directionPresetBefore = JSON.stringify(staticDirectionHair.preset)
    const normalDirectionReport = await exportHairMp4(320, 180, 0, 61, false, 'hair-direction-negative-normal.mp4', staticDirectionProject, staticDirectionHair)
    const mirroredDirectionReport = await exportHairMp4(320, 180, 0, 61, false, 'hair-direction-negative-mirrored.mp4', mirroredDirectionProject, staticDirectionHair)
    const normalPieceReport = await exportHairMp4(320, 180, 0, 61, false, 'hair-piece-normal.mp4', staticDirectionProject, normalPieceHair)
    const mirroredPieceReport = await exportHairMp4(320, 180, 0, 61, false, 'hair-piece-flipped.mp4', staticDirectionProject, mirroredPieceHair)
    assert(normalDirectionReport.state === 'completed' && mirroredDirectionReport.state === 'completed' && normalPieceReport.state === 'completed' && mirroredPieceReport.state === 'completed', 'A comparação de espelhamento não concluiu as exportações MP4 reais.')
    assert(JSON.stringify(staticDirectionHair.preset) === directionPresetBefore && staticDirectionHair.preset.physics.wind === -50, 'A exportação alterou o preset negativo salvo para corrigir o espelhamento.')
    const directionFrames = [0, 5, 10, 15, 20, 30, 45, 60]
    const readDirectionFrames = (name: string) => execFileSync(ffmpeg, ['-v', 'error', '-i', join(folder, name), '-vf', `select='${directionFrames.map(frame => `eq(n,${frame})`).join('+')}'`, '-fps_mode', 'passthrough', '-frames:v', String(directionFrames.length), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 8 * 1024 ** 2 })
    const normalDirectionPixels = readDirectionFrames('hair-direction-negative-normal.mp4')
    const mirroredDirectionPixels = readDirectionFrames('hair-direction-negative-mirrored.mp4')
    const normalPiecePixels = readDirectionFrames('hair-piece-normal.mp4')
    const mirroredPiecePixels = readDirectionFrames('hair-piece-flipped.mp4')
    const directionFrameBytes = 320 * 180 * 3
    assert(normalDirectionPixels.length === directionFrameBytes * directionFrames.length && mirroredDirectionPixels.length === directionFrameBytes * directionFrames.length, 'FFmpeg não decodificou os quadros necessários para comparar a direção visual do cabelo.')
    const actorCenterX = 320 * (50 + actor.x) / 100
    const greenHairCentroids = (pixels: Buffer, excludeMarker = false) => directionFrames.map((_frame, sampleIndex) => {
      let count = 0, sumX = 0
      const start = sampleIndex * directionFrameBytes
      for (let y = 0; y < 180; y += 1) for (let x = 0; x < 320; x += 1) {
        const offset = start + (y * 320 + x) * 3, red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
        if (green <= 60 || green <= red * 1.8 || green <= blue * 1.5 || (excludeMarker && green > 220 && red < 35 && blue < 60)) continue
        count += 1; sumX += x + .5
      }
      assert(count > 10, `O cabelo verde não apareceu no quadro MP4 ${directionFrames[sampleIndex]}.`)
      return sumX / count
    })
    const normalDirectionCentroids = greenHairCentroids(normalDirectionPixels), mirroredDirectionCentroids = greenHairCentroids(mirroredDirectionPixels)
    const mirrorErrors = directionFrames.map((_frame, index) => Math.abs(normalDirectionCentroids[index] + mirroredDirectionCentroids[index] - actorCenterX * 2))
    assert(mirrorErrors.every(error => error < 2), `O espelhamento global não inverteu a composição final do cabelo nos pixels MP4 (erros: ${mirrorErrors.map(value => value.toFixed(2)).join(', ')} px).`)
    const motionDeltas = directionFrames.map((_frame, index) => Math.abs((normalDirectionCentroids[index] - normalDirectionCentroids[0]) + (mirroredDirectionCentroids[index] - mirroredDirectionCentroids[0])))
    assert(motionDeltas.every(delta => delta < 1.5), `O movimento de cabelo não preservou a direção oposta no MP4 espelhado (${motionDeltas.map(value => value.toFixed(2)).join(', ')} px).`)
    assert(normalDirectionCentroids.some((center, index) => index > 0 && Math.abs(center - normalDirectionCentroids[0]) > .25), 'O cabelo no primeiro quadro MP4 não começou em uma fase de movimento observável.')
    const normalPieceCentroids = greenHairCentroids(normalPiecePixels, true), mirroredPieceCentroids = greenHairCentroids(mirroredPiecePixels, true)
    const pieceMirrorAxisX = 320 * editorV6HairMotionHeadAnchorX(staticDirectionProject.elements[0], normalPieceHair.rigs[0])
    const pieceMirrorErrors = directionFrames.map((_frame, index) => Math.abs(normalPieceCentroids[index] + mirroredPieceCentroids[index] - pieceMirrorAxisX * 2))
    assert(pieceMirrorErrors.every(error => error < 2), `O flipX individual da peça não refletiu os pixels do cabelo no MP4 (${pieceMirrorErrors.map(value => value.toFixed(2)).join(', ')} px).`)
    const pieceMotionErrors = directionFrames.map((_frame, index) => Math.abs((normalPieceCentroids[index] - normalPieceCentroids[0]) + (mirroredPieceCentroids[index] - mirroredPieceCentroids[0])))
    assert(pieceMotionErrors.every(error => error < 1.5), `A resposta da inércia ao flipX da peça divergiu no MP4 (${pieceMotionErrors.map(value => value.toFixed(2)).join(', ')} px).`)
    const rawFrames = execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', "select='eq(n,0)+eq(n,30)+eq(n,60)'", '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 16 * 1024 ** 2 })
    const frameBytes = 320 * 180 * 3
    assert(rawFrames.length === frameBytes * 3, 'O MP4 não contém os quadros esperados para validar a animação de cabelo.')
    const isSyntheticHairPixel = (red: number, green: number, blue: number) =>
      (blue > 120 && blue > red * 1.2 && green < 190)
      || (red > 100 && red > green * 1.2 && blue > 55)
    const isSyntheticMouthPixel = (red: number, green: number, blue: number) => red > 190 && green < 75 && blue < 100
    const redPixels = (frameIndex: number) => {
      const pixels = new Uint8Array(320 * 180)
      let count = 0
      const start = frameIndex * frameBytes
      for (let y = 0; y < 180; y += 1) for (let x = 0; x < 320; x += 1) {
        const offset = start + (y * 320 + x) * 3
        if (isSyntheticHairPixel(rawFrames[offset], rawFrames[offset + 1], rawFrames[offset + 2])) { pixels[y * 320 + x] = 1; count += 1 }
      }
      return { count, pixels }
    }
    const firstHair = redPixels(0), lastHair = redPixels(2)
    assert(firstHair.count > 10, 'O MP4 final não contém a camada de cabelo preparada.')
    let changedHairPixels = 0
    for (let index = 0; index < firstHair.pixels.length; index += 1) if (firstHair.pixels[index] !== lastHair.pixels[index]) changedHairPixels += 1
    assert(changedHairPixels > 5, `O MP4 final não mostra o movimento do cabelo entre o início e o fim (${changedHairPixels} pixels mudaram).`)
    const verifyResolutionExport = (name: string, width: number, height: number, frameCount: number) => {
      const path = join(folder, name)
      const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-of', 'json', path], { windowsHide: true }).toString())
      const stream = probe.streams?.[0]
      assert(stream?.width === width && stream?.height === height, `${name}: resolução do MP4 diferente da solicitada`)
      assert(Number(stream?.nb_frames) === frameCount && stream?.r_frame_rate === '30/1', `${name}: duração ou FPS fora do contrato`)
      assert(stream?.codec_name === undefined || stream.codec_name === 'h264', `${name}: codec inesperado`)
      assert(reportFor(name).attempts[0]?.parts.every(part => (part.frameTiming?.hairCompositionMs?.samples ?? 0) > 0), `${name}: composição de cabelo não foi medida`)
      const indices = frameCount > 20 ? [0, Math.floor(frameCount / 2), frameCount - 1] : [0, Math.floor(frameCount / 2), frameCount - 1]
      const selected = indices.map(index => `eq(n,${index})`).join('+')
      const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', path, '-vf', `select='${selected}'`, '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 64 * 1024 ** 2 })
      const frameBytes = width * height * 3
      assert(raw.length === frameBytes * 3, `${name}: FFmpeg não devolveu os três quadros sintéticos esperados`)
      const hairPixels = indices.map((_frame, frameIndex) => {
        let count = 0
        for (let offset = frameIndex * frameBytes; offset < (frameIndex + 1) * frameBytes; offset += 3) if (isSyntheticHairPixel(raw[offset], raw[offset + 1], raw[offset + 2])) count += 1
        return count
      })
      assert(hairPixels.every(count => count > 50), `${name}: o cabelo não ficou visível em todos os quadros amostrados (${hairPixels.join(', ')})`)
      return { width, height, frameCount, fps: stream.r_frame_rate, hairPixels }
    }
    const reportsByName = new Map<string, Awaited<ReturnType<typeof exportHairMp4>>>([['hair-motion.mp4', report], ['hair-direction-negative-normal.mp4', normalDirectionReport], ['hair-direction-negative-mirrored.mp4', mirroredDirectionReport], ['hair-piece-normal.mp4', normalPieceReport], ['hair-piece-flipped.mp4', mirroredPieceReport]])
    const reportFor = (name: string) => reportsByName.get(name)!
    const median = (values: number[]) => {
      const ordered = [...values].sort((left, right) => left - right)
      const middle = Math.floor(ordered.length / 2)
      const value = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
      return Number(value.toFixed(2))
    }
    const benchmarkTrials: Array<{ mode: 'safe' | 'turbo'; repetition: number; width: number; height: number; frames: number; workers: number; elapsedMilliseconds: number; fallback: boolean; hairPixels: number[] }> = []
    const run720Benchmark = async (mode: 'safe' | 'turbo', repetition: number, name: string) => {
      activeBenchmarkTrial = `${mode}-${repetition}`
      const started = performance.now()
      let result: Awaited<ReturnType<typeof exportHairMp4>>
      try { result = await exportHairMp4(1280, 720, 0, 31, mode === 'turbo', name) }
      finally { activeBenchmarkTrial = null }
      reportsByName.set(name, result)
      const elapsedMilliseconds = performance.now() - started
      const expectedWorkers = mode === 'turbo' ? 2 : 1
      assert(result.state === 'completed' && !result.fallback && result.attempts[0]?.parts.length === expectedWorkers, `A exportação 720p ${mode} ${repetition} não concluiu com ${expectedWorkers} worker(s).`)
      const pixels = verifyResolutionExport(name, 1280, 720, 31)
      const trial = { mode, repetition, width: 1280, height: 720, frames: 31, workers: result.attempts[0].parts.length, elapsedMilliseconds: Number(elapsedMilliseconds.toFixed(2)), fallback: result.fallback, hairPixels: pixels.hairPixels }
      benchmarkTrials.push(trial)
      return { report: result, metrics: pixels }
    }
    const safe720RunA = await run720Benchmark('safe', 1, 'hair-motion-720p-safe.mp4')
    const turbo720RunA = await run720Benchmark('turbo', 1, 'hair-motion-720p-turbo-a.mp4')
    const safe720RunB = await run720Benchmark('safe', 2, 'hair-motion-720p-safe-repeat.mp4')
    const turbo720RunB = await run720Benchmark('turbo', 2, 'hair-motion-720p-turbo-b.mp4')
    const result720 = safe720RunA.metrics
    const started1080 = performance.now()
    const turbo1080 = await exportHairMp4(1920, 1080, 20, 50, true, 'hair-motion-1080p-turbo-start-late.mp4')
    reportsByName.set('hair-motion-1080p-turbo-start-late.mp4', turbo1080)
    const turbo1080Milliseconds = performance.now() - started1080
    assert(turbo1080.state === 'completed' && !turbo1080.fallback && turbo1080.attempts[0]?.parts.length === 2, 'A exportação Turbo 1080p com início tardio e troca de pose não concluiu em duas partes.')
    const result1080 = verifyResolutionExport('hair-motion-1080p-turbo-start-late.mp4', 1920, 1080, 30)
    let combinedLongProfile: Record<string, unknown> | undefined
    if (process.argv.includes('--long-combined-profile')) {
      const durationFrames = 300 * 30
      const speechCharacterIds = new Set<string>()
      const mouthAtlasWidth = 192, mouthAtlasHeight = 64
      const mouthAtlasPixels = Buffer.alloc(mouthAtlasWidth * mouthAtlasHeight * 4)
      for (let sample = 0; sample < 3; sample += 1) {
        const centerX = sample * 64 + 32, centerY = 32, halfHeight = [3, 8, 14][sample]
        for (let y = centerY - halfHeight; y <= centerY + halfHeight; y += 1) for (let x = centerX - 18; x <= centerX + 18; x += 1) {
          if (((x - centerX) / 18) ** 2 + ((y - centerY) / halfHeight) ** 2 > 1) continue
          const offset = (y * mouthAtlasWidth + x) * 4
          mouthAtlasPixels[offset] = 245; mouthAtlasPixels[offset + 1] = 24; mouthAtlasPixels[offset + 2] = 43; mouthAtlasPixels[offset + 3] = 255
        }
      }
      const mouthAtlasDataUrl = encodeRgbaPng(mouthAtlasWidth, mouthAtlasHeight, mouthAtlasPixels)
      const bakeMouthLoop = async (request: EditorV6MotionBakeRequest): Promise<EditorV6MotionBakeResult> => {
        if (!request.plan.key.startsWith('mouth-loop:')) {
          const sourceMotion = project.timeline.tracks.find(track => track.kind === 'character')?.blocks[1]?.incomingMotion
          const poseAsset = sourceMotion ? project.assets.find(asset => asset.id === sourceMotion.assetId) : undefined
          assert(speechCharacterIds.has(request.character.id) && sourceMotion && poseAsset, `A preparação da pose sintética recebeu um personagem ou atlas inesperado: ${request.character.id}, ${request.plan.key}.`)
          const offsetX = request.plan.from.x - actor.x
          const faceAssetId = `synthetic-pose-face-${request.character.id}`
          const faceAsset: EditorV6Asset = { id: faceAssetId, category: 'character', name: 'Atlas facial sintético da pose', mimeType: 'image/png', dataUrl: mouthAtlasDataUrl, timelineSnapshot: true }
          const faceSprite = { x: 0, y: 0, width: 64, height: 64, atlasWidth: mouthAtlasWidth, atlasHeight: mouthAtlasHeight }
          const motion = {
            ...sourceMotion, key: request.plan.key, faceAssetId,
            frames: sourceMotion.frames.map(frame => ({
              ...frame, x: frame.x + offsetX,
              facePatch: { sprite: faceSprite, x: 0.42, y: 0.22, width: 0.16, height: 0.09 }
            }))
          }
          return { asset: poseAsset, faceAsset, motion, metrics: { milliseconds: 0, preparedRigs: 1, samples: motion.frames.length, atlasPixels: motion.frames.reduce((total, frame) => total + frame.sprite.width * frame.sprite.height, 0) } }
        }
        assert(speechCharacterIds.has(request.character.id) && request.mouthScaleSamples?.length === 3, 'A preparação da boca recebeu um personagem ou ciclo inesperado.')
        const mouthAssetId = randomUUID()
        const mouthAtlasAsset: EditorV6Asset = { id: mouthAssetId, category: 'character', name: 'Atlas sintético da fala', mimeType: 'image/png', dataUrl: mouthAtlasDataUrl, timelineSnapshot: true }
        const frames = request.plan.samples.map((sample, index) => {
          const sprite = { x: index * 64, y: 0, width: 64, height: 64, atlasWidth: mouthAtlasWidth, atlasHeight: mouthAtlasHeight }
          return {
            offset: sample.offset, sprite, x: request.plan.from.x, y: request.plan.from.y,
            width: request.plan.from.width, height: request.plan.from.height, rotation: 0, flipX: false,
            facePatch: { sprite, x: 0.42, y: 0.22, width: 0.16, height: 0.09 }
          }
        })
        return { asset: mouthAtlasAsset, assetRole: 'face-atlas', mouthIsolationMode: 'legacy-patch', motion: { version: 1, key: request.plan.key, assetId: mouthAssetId, frames }, metrics: { milliseconds: 0, preparedRigs: 1, samples: frames.length, atlasPixels: mouthAtlasWidth * mouthAtlasHeight } }
      }
      const createCombinedScenario = (actorCount: number, scenarioFrames: number, includePoseTransition = true) => {
        const sourceTrack = project.timeline.tracks.find(track => track.kind === 'character')!
        const sourceSpeechTrack = project.timeline.tracks.find(track => track.kind === 'speech')!
        const sourceFirstBlock = sourceTrack.blocks[0]
        const sourceTransitionBlock = sourceTrack.blocks[1]
        const sourceMotion = sourceTransitionBlock.incomingMotion
        const sourceTransition = hairAnimation.motionTransitions?.find(item => item.elementId === actor.id)
        assert(sourceMotion && sourceTransition && scenarioFrames > 30, 'O fixture combinado precisa da transição de pose sintética.')
        const profiles = Array.from({ length: actorCount }, (_, index) => {
          const elementId = index === 0 ? actor.id : randomUUID()
          const characterId = actorCount === 1 ? actor.characterId! : `synthetic-character-${index + 1}`
          const x = actorCount === 1 ? actor.x : ((index + .5) / actorCount) * 100 - 50
          const label = actorCount === 1 ? 'Perfil sintético fala e cabelo' : `Personagem sintético ${index + 1}`
          const startsMirrored = actorCount > 1 && index % 2 === 1
          const base = { ...actor, id: elementId, characterId, text: label, x, flipX: startsMirrored, zIndex: index + 1 }
          const pose = { ...secondState, id: elementId, characterId, text: label, x: x + (actorCount === 1 ? 0 : .5), flipX: true, zIndex: index + 1 }
          const character: CustomizerCharacter = {
            id: characterId, name: label, hair: '', outfit: '', skin: '',
            customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] },
            createdAt: now, updatedAt: now
          }
          speechCharacterIds.add(characterId)
          return { elementId, characterId, label, base, pose, character, startsMirrored }
        })
        const characterTracks = profiles.map(profile => ({
          ...sourceTrack, id: randomUUID(), characterId: profile.characterId, name: profile.label,
          blocks: includePoseTransition
            ? [
              { ...sourceFirstBlock, id: randomUUID(), elementId: profile.elementId, characterId: profile.characterId, startFrame: 0, durationFrames: 30, state: profile.base },
              { ...sourceTransitionBlock, id: randomUUID(), elementId: profile.elementId, characterId: profile.characterId, startFrame: 30, durationFrames: scenarioFrames - 30, state: profile.pose, incomingMotion: { ...sourceMotion, key: '', frames: sourceMotion.frames.map(frame => ({ ...frame, x: frame.x + profile.base.x - actor.x, flipX: profile.startsMirrored || frame.flipX })) } }
            ]
            : [{ ...sourceFirstBlock, id: randomUUID(), elementId: profile.elementId, characterId: profile.characterId, startFrame: 0, durationFrames: scenarioFrames, state: profile.base }]
        }))
        const nonCharacterIds = project.elements.filter(element => element.kind !== 'character').map(element => element.id)
        const provisional: EditorV6Document = {
          ...project, id: randomUUID(), title: `Perfil sintético · ${actorCount} personagens · fala e cabelo`, elements: profiles.map(profile => profile.base),
          timeline: {
            ...project.timeline, durationFrames: scenarioFrames,
            knownElementIds: [...new Set([...nonCharacterIds, ...profiles.map(profile => profile.elementId)])],
            tracks: project.timeline.tracks.flatMap(track => track.kind === 'character'
              ? characterTracks
              : track.kind === 'speech'
                ? [{ ...sourceSpeechTrack, blocks: profiles.map(profile => ({ id: randomUUID(), label: `Fala sintética · ${profile.label}`, characterId: profile.characterId, startFrame: 0, durationFrames: scenarioFrames })) }]
                : [track])
          }
        }
        const plans = editorV6MotionPlans(provisional)
        assert(plans.length === (includePoseTransition ? actorCount : 0), `Esperadas ${includePoseTransition ? actorCount : 0} transições sintéticas, recebidas ${plans.length}.`)
        const plansByBlockId = new Map(plans.map(plan => [plan.blockId, plan]))
        const combinedProject = {
          ...provisional,
          timeline: {
            ...provisional.timeline,
            tracks: provisional.timeline.tracks.map(track => ({ ...track, blocks: track.blocks.map(block => {
              if (!block.incomingMotion) return block
              const plan = plansByBlockId.get(block.id)
              assert(plan, `A transição sintética do bloco ${block.id} não foi planejada.`)
              return { ...block, incomingMotion: { ...block.incomingMotion, key: plan.key } }
            }) }))
          }
        } satisfies EditorV6Document
        const scenarioHairAnimation: EditorV6HairMotionBundle = {
          ...hairAnimation,
          rigs: profiles.flatMap(profile => hairAnimation.rigs.filter(rig => rig.elementId === actor.id).map(rig => ({ ...rig, elementId: profile.elementId, characterId: profile.characterId }))),
          motionTransitions: includePoseTransition ? profiles.flatMap(profile => {
            const plan = plans.find(item => item.elementId === profile.elementId)
            assert(plan, `A transição de cabelo do personagem ${profile.label} não foi planejada.`)
            return [{ ...sourceTransition, elementId: profile.elementId, key: plan.key, frames: sourceTransition.frames.map(frame => ({ ...frame, x: frame.x + profile.base.x - actor.x, flipX: profile.startsMirrored || frame.flipX })) }]
          }) : []
        }
        return { project: combinedProject, characters: profiles.map(profile => profile.character), hairAnimation: scenarioHairAnimation, instances: profiles.map(profile => ({ elementId: profile.elementId, x: profile.base.x, startsMirrored: profile.startsMirrored, phase: editorV6HairMotionInstancePhase(profile.elementId) })) }
      }
      const memorySampler = createWindowsProcessSampler(join(root, 'scripts/editor-v6/windows-process-sampler.ps1'))
      const ffmpegPids = new Set<number>()
      const memorySamples: Array<Record<string, unknown>> = []
      const samplingErrors: string[] = []
      const startedAt = new Date().toISOString(), startedClock = performance.now()
      let lastFrame = 0, sampleInFlight = false, activeProfileName = 'matrix-setup'
      const sampleCombinedMemory = async () => {
        if (sampleInFlight) return
        sampleInFlight = true
        try {
          const electronMetrics = app.getAppMetrics()
          const processes = new Map<number, string>()
          for (const metric of electronMetrics) processes.set(metric.pid,
            metric.pid === process.pid ? 'main'
              : longRendererWindows.has(metric.pid) ? 'exportRenderer'
                : /gpu/i.test(metric.type) ? 'gpu' : `electron:${metric.type}`)
          for (const pid of ffmpegPids) processes.set(pid, 'ffmpeg')
          const renderer = [...longRendererWindows.entries()].find(([, window]) => !window.isDestroyed())
          const rendererHeap = renderer ? await renderer[1].webContents.executeJavaScript(`(() => { const memory = performance.memory; return memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null })()`).catch(() => null) : null
          const system = await memorySampler.sample([...processes].map(([pid, role]) => ({ pid, role })), lastFrame)
          memorySamples.push({
            profile: activeProfileName, elapsedMilliseconds: Math.round(performance.now() - startedClock), sampledAt: system.sampledAt, frame: lastFrame,
            mainNodeMemory: process.memoryUsage(), rendererHeap,
            electronProcesses: electronMetrics.map(metric => ({ pid: metric.pid, type: metric.type, workingSetBytes: Number.isFinite(metric.memory?.workingSetSize) ? Math.round(metric.memory.workingSetSize * 1024) : null, privateBytes: Number.isFinite(metric.memory?.privateBytes) ? Math.round(metric.memory.privateBytes * 1024) : null, cpuPercent: Number.isFinite(metric.cpu?.percentCPUUsage) ? metric.cpu.percentCPUUsage : null })),
            operatingSystemProcesses: system.processes
          })
        } catch (error) { samplingErrors.push(error instanceof Error ? error.message : String(error)) }
        finally { sampleInFlight = false }
      }
      const runCombinedExport = (scenario: ReturnType<typeof createCombinedScenario>, options: { name: string; frames: number; width: number; height: number; turbo: boolean }) => {
        const outputPath = join(folder, `${options.name}.mp4`)
        return runEditorV6Export(scenario.project, { startFrame: 0, endFrame: options.frames, width: options.width, height: options.height, turbo: options.turbo, encoder: 'cpu', hairAnimationPresetSlot: 1 }, {
          ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath,
          reportPath: join(folder, `${options.name}.mp4.report.json`), signal: new AbortController().signal,
          getCharacters: async () => scenario.characters, bakeMotion: bakeMouthLoop,
          createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({ project: renderProject, width: options.width, height: options.height, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}), hairAnimation: scenario.hairAnimation }, signal),
          audioPath: () => join(folder, 'unused-audio.wav'), mediaPath: () => join(folder, 'unused-media.mp4'),
          onFfmpegProcessStarted: pid => ffmpegPids.add(pid), progress: status => { lastFrame = Math.max(lastFrame, status.frames) }
        })
      }
      const profileProcessPeaks = (profile: string) => {
        const peaks = new Map<string, { workingSetBytes: number; privateBytes: number }>()
        for (const sample of memorySamples.filter(item => item.profile === profile)) for (const processRow of sample.operatingSystemProcesses as Array<{ role: string; workingSetBytes: number; privateBytes: number }>) {
          const peak = peaks.get(processRow.role) ?? { workingSetBytes: 0, privateBytes: 0 }
          peak.workingSetBytes = Math.max(peak.workingSetBytes, processRow.workingSetBytes)
          peak.privateBytes = Math.max(peak.privateBytes, processRow.privateBytes)
          peaks.set(processRow.role, peak)
        }
        return Object.fromEntries(peaks)
      }
      const sampleTimer = setInterval(() => { void sampleCombinedMemory() }, 3000)
      let combinedReport: Awaited<ReturnType<typeof runEditorV6Export>> | undefined
      const matrixScenarios: Array<Record<string, unknown>> = []
      try {
        const matrixFrames = 30 * 30
      const matrixScenariosByActorCount = new Map([4, 8].map(actorCount => [actorCount, createCombinedScenario(actorCount, matrixFrames)] as const))
      const matrixMotionProfiles = new Map<number, Map<string, number[][]>>()
        for (const actorCount of [4, 8]) for (const turbo of [false, true]) {
          const mode = turbo ? 'turbo-2workers' : 'safe-1worker'
          const name = `hair-mouth-matrix-${actorCount}actors-1080p-${mode}`
          const scenario = matrixScenariosByActorCount.get(actorCount)!
          activeProfileName = name
          lastFrame = 0
          await sampleCombinedMemory()
          console.log(`[V6 combined profile] ${actorCount} personagens, 1080p, ${mode}, 30 s`)
          const started = performance.now()
          const matrixReport = await runCombinedExport(scenario, { name, frames: matrixFrames, width: 1920, height: 1080, turbo })
          const elapsedMilliseconds = performance.now() - started
          assert(matrixReport.state === 'completed' && matrixReport.totalFrames === matrixFrames && !matrixReport.fallback, `${name}: exportação incompleta ou com fallback.`)
          const expectedWorkers = turbo ? 2 : 1
          assert(matrixReport.attempts[0]?.parallelism === expectedWorkers, `${name}: esperado ${expectedWorkers} worker(s).`)
          assert(matrixReport.mouthAnimation?.characters === actorCount && matrixReport.mouthAnimation.legacyPatchStates > 0, `${name}: a fala não cobriu os ${actorCount} personagens.`)
          const matrixParts = matrixReport.attempts.flatMap(attempt => attempt.parts)
          const matrixHairFrames = matrixParts.reduce((total, part) => total + (part.frameMetrics?.hairRasterFrames ?? 0), 0)
          const matrixHairPixels = matrixParts.reduce((total, part) => total + (part.frameMetrics?.hairRasterPixels ?? 0), 0)
          assert(matrixHairFrames === actorCount * matrixFrames && matrixHairPixels > 0, `${name}: faltam superfícies rasterizadas de cabelo por personagem/quadro.`)
          const matrixHairCompositionSamples = matrixParts.reduce((total, part) => total + (part.frameTiming?.hairCompositionMs?.samples ?? 0), 0)
          assert(matrixHairCompositionSamples === matrixFrames, `${name}: composição por quadro não foi medida.`)
          const hairMotionPrewarmMilliseconds = matrixParts.reduce((total, part) => total + (part.frameTiming?.hairMotionPrewarmMs?.totalMs ?? 0), 0)
          assert(hairMotionPrewarmMilliseconds > 0, `${name}: o custo de pré-aquecimento por instância não foi registrado.`)
          const outputPath = join(folder, `${name}.mp4`)
          const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', outputPath], { windowsHide: true }).toString()) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }> }
          const stream = probe.streams?.[0]
          assert(stream?.width === 1920 && stream.height === 1080 && stream.r_frame_rate === '30/1' && Number(stream.nb_frames) === matrixFrames, `${name}: FFprobe encontrou dimensões, FPS ou contagem de quadros incorretos.`)
          const sampled = [0, Math.floor(matrixFrames / 2), matrixFrames - 1]
          const rgb = execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', `select='${sampled.map(frame => `eq(n,${frame})`).join('+')}'`, '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 64 * 1024 ** 2 })
          const frameBytes = 1920 * 1080 * 3
          assert(rgb.length === frameBytes * 3, `${name}: FFmpeg não decodificou três quadros completos.`)
          const decodedPixels = sampled.map((_frame, sampleIndex) => {
            let hair = 0, mouth = 0
            for (let offset = sampleIndex * frameBytes; offset < (sampleIndex + 1) * frameBytes; offset += 3) {
              if (isSyntheticHairPixel(rgb[offset], rgb[offset + 1], rgb[offset + 2])) hair += 1
              if (isSyntheticMouthPixel(rgb[offset], rgb[offset + 1], rgb[offset + 2])) mouth += 1
            }
            return { hair, mouth }
          })
          assert(decodedPixels.every(sample => sample.hair > 100 && sample.mouth > 5), `${name}: cabelo ou boca não visíveis nos quadros decodificados (${JSON.stringify(decodedPixels)}).`)
          const orderedInstances = [...scenario.instances].sort((left, right) => left.x - right.x)
          assert(orderedInstances.filter(instance => instance.startsMirrored).length === actorCount / 2, `${name}: o fixture não distribuiu igualmente personagens espelhados.`)
          let perInstanceCentroids: Array<{ elementId: string; startsMirrored: boolean; phase: number; relativeCentroids: number[]; trajectory: number[] }> = []
          if (actorCount === 4) {
            const motionSampleFrames = [0, 5, 10, 15, 20, 25]
            const motionRgb = execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', `select='${motionSampleFrames.map(frame => `eq(n,${frame})`).join('+')}'`, '-fps_mode', 'passthrough', '-frames:v', String(motionSampleFrames.length), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 64 * 1024 ** 2 })
            const motionFrameBytes = 1920 * 1080 * 3
            assert(motionRgb.length === motionFrameBytes * motionSampleFrames.length, `${name}: faltam quadros MP4 para medir a fase individual.`)
            perInstanceCentroids = orderedInstances.map((instance, actorIndex) => {
              const left = actorIndex === 0 ? 0 : (1920 * (50 + orderedInstances[actorIndex - 1].x) / 100 + 1920 * (50 + instance.x) / 100) / 2
              const right = actorIndex === orderedInstances.length - 1 ? 1920 : (1920 * (50 + instance.x) / 100 + 1920 * (50 + orderedInstances[actorIndex + 1].x) / 100) / 2
              const centerX = 1920 * (50 + instance.x) / 100
              const centroids = motionSampleFrames.map((_frame, sampleIndex) => {
                let count = 0, sumX = 0
                const frameStart = sampleIndex * motionFrameBytes
                for (let y = 0; y < 1080; y += 1) for (let x = Math.max(0, Math.floor(left)); x < Math.min(1920, Math.ceil(right)); x += 1) {
                  const offset = frameStart + (y * 1920 + x) * 3
                  const red = motionRgb[offset], green = motionRgb[offset + 1], blue = motionRgb[offset + 2]
                  if (green <= 60 || green <= red * 1.8 || green <= blue * 1.5 || (green > 220 && red < 35 && blue < 60)) continue
                  count += 1; sumX += x + .5
                }
                assert(count > 20, `${name}: cabelo sintético verde não encontrado na instância ${instance.elementId}, quadro ${motionSampleFrames[sampleIndex]}.`)
                return sumX / count - centerX
              })
              return { elementId: instance.elementId, startsMirrored: instance.startsMirrored, phase: instance.phase, relativeCentroids: centroids.map(value => Number(value.toFixed(3))), trajectory: centroids.map(value => Number((value - centroids[0]).toFixed(3))) }
            })
            const uniqueMotionPairs = perInstanceCentroids.flatMap((left, leftIndex) => perInstanceCentroids.slice(leftIndex + 1).map(right => Math.max(...left.trajectory.map((value, index) => Math.abs(value - right.trajectory[index])))))
            assert(uniqueMotionPairs.every(distance => distance > .5), `${name}: duas instâncias tiveram trajetórias de cabelo sincronizadas ou indistinguíveis (${uniqueMotionPairs.map(value => value.toFixed(2)).join(', ')} px).`)
          }
          const currentMotionByInstance = new Map(perInstanceCentroids.map(instance => [instance.elementId, instance.trajectory]))
          const previousMode = matrixMotionProfiles.get(actorCount)
          if (actorCount === 4 && turbo) {
            assert(previousMode, `${name}: não há perfil seguro para comparar a mesma cena com Turbo.`)
            for (const instance of orderedInstances) {
              const safeTrajectory = previousMode.get(instance.elementId), turboTrajectory = currentMotionByInstance.get(instance.elementId)
              assert(safeTrajectory && turboTrajectory && safeTrajectory.every((value, index) => Math.abs(value - turboTrajectory[index]) <= 1.5), `${name}: fase/movimento diferente entre modo seguro e Turbo na instância ${instance.elementId}.`)
            }
          } else if (actorCount === 4) matrixMotionProfiles.set(actorCount, currentMotionByInstance)
          await sampleCombinedMemory()
          matrixScenarios.push({ name, actors: actorCount, speech: true, hairAnimation: true, resolution: '1920x1080', fps: 30, frames: matrixFrames, workers: expectedWorkers, elapsedMilliseconds: Number(elapsedMilliseconds.toFixed(2)), hairMotionPrewarmMilliseconds: Number(hairMotionPrewarmMilliseconds.toFixed(3)), fallback: matrixReport.fallback, mp4Validated: true, mouthCharacters: matrixReport.mouthAnimation?.characters, hairRasterFrames: matrixHairFrames, hairRasterPixels: matrixHairPixels, decodedPixels, perInstanceHairMotion: perInstanceCentroids, processPeaks: profileProcessPeaks(name), samples: memorySamples.filter(sample => sample.profile === name).length })
        }
        assert(matrixScenarios.length === 4, 'A matriz combinada não concluiu 4/8 personagens em 1080p seguro e Turbo.')

        const longProfileName = 'hair-mouth-5min-1actor-720p-safe'
        const longScenario = createCombinedScenario(1, durationFrames, false)
        activeProfileName = longProfileName
        lastFrame = 0
        await sampleCombinedMemory()
        const combinedOutput = join(folder, 'hair-mouth-5min-720p.mp4')
        combinedReport = await runCombinedExport(longScenario, { name: 'hair-mouth-5min-720p', frames: durationFrames, width: 1280, height: 720, turbo: false })
        assert(combinedReport.state === 'completed' && combinedReport.totalFrames === durationFrames && !combinedReport.fallback, 'O perfil combinado de 5 minutos não concluiu os 9.000 quadros sem fallback.')
        const expectedMouthBatches = Math.ceil(durationFrames / 300)
        assert(combinedReport.mouthAnimation?.stateAtlases === expectedMouthBatches && combinedReport.mouthAnimation.legacyPatchStates === expectedMouthBatches && combinedReport.mouthAnimation.isolatedStates === 0, 'O perfil combinado não registrou todos os lotes sintéticos da camada de boca.')
        const hairCompositionSamples = combinedReport.attempts.flatMap(attempt => attempt.parts).reduce((total, part) => total + (part.frameTiming?.hairCompositionMs?.samples ?? 0), 0)
        assert(hairCompositionSamples === durationFrames, 'O perfil combinado não mediu a composição do cabelo em todos os quadros.')
        const combinedParts = combinedReport.attempts.flatMap(attempt => attempt.parts)
        const hairRasterMetrics = combinedParts.reduce((total, part) => ({
          frames: total.frames + (part.frameMetrics?.hairRasterFrames ?? 0),
          pixels: total.pixels + (part.frameMetrics?.hairRasterPixels ?? 0)
        }), { frames: 0, pixels: 0 })
        assert(hairRasterMetrics.frames === durationFrames && hairRasterMetrics.pixels > 0, 'O perfil combinado não comprovou as superfícies diretas de cabelo nos quadros.')
        const combinedProbe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', combinedOutput], { windowsHide: true }).toString()) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }> }
        const combinedStream = combinedProbe.streams?.[0]
        assert(combinedStream?.width === 1280 && combinedStream.height === 720 && combinedStream.r_frame_rate === '30/1' && Number(combinedStream.nb_frames) === durationFrames, 'O FFprobe encontrou resolução, FPS ou duração incorreta no perfil combinado.')
        const sampledFrames = [0, 4500, durationFrames - 1]
        const combinedRgb = execFileSync(ffmpeg, ['-v', 'error', '-i', combinedOutput, '-vf', `select='${sampledFrames.map(frame => `eq(n,${frame})`).join('+')}'`, '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 16 * 1024 ** 2 })
        const combinedFrameBytes = 1280 * 720 * 3
        assert(combinedRgb.length === combinedFrameBytes * 3, 'Não foi possível decodificar os três quadros do perfil combinado.')
        const decodedLongPixels = sampledFrames.map((_frame, sampleIndex) => {
          let hair = 0, mouth = 0
          for (let offset = sampleIndex * combinedFrameBytes; offset < (sampleIndex + 1) * combinedFrameBytes; offset += 3) {
            if (isSyntheticHairPixel(combinedRgb[offset], combinedRgb[offset + 1], combinedRgb[offset + 2])) hair += 1
            if (isSyntheticMouthPixel(combinedRgb[offset], combinedRgb[offset + 1], combinedRgb[offset + 2])) mouth += 1
          }
          return { hair, mouth }
        })
        assert(decodedLongPixels.every(sample => sample.hair > 100 && sample.mouth > 5), `A camada de cabelo ou a boca não foi visível nos quadros amostrados do perfil combinado: ${JSON.stringify(decodedLongPixels)}.`)
        await new Promise(resolveDelay => setTimeout(resolveDelay, 20_000))
        await sampleCombinedMemory()
        const longProfileSamples = memorySamples.filter(sample => sample.profile === longProfileName)
        const processPeaks = profileProcessPeaks(longProfileName)
        combinedLongProfile = {
          syntheticOnly: true, passed: true, gameRunningByUserStatement: false, controlledBenchmark: false,
          startedAt, durationSeconds: durationFrames / 30, frames: durationFrames, resolution: '1280x720', fps: 30,
          actors: 1, speech: 'contínua; atlas de boca sintético legado preparado', hairAnimation: true, turbo: false,
          exportMilliseconds: combinedReport.milliseconds, phaseMilliseconds: combinedReport.phaseMilliseconds,
          mouthAnimation: combinedReport.mouthAnimation, hairCompositionSamples, hairRasterMetrics,
          captureSamples: combinedReport.attempts.flatMap(attempt => attempt.parts).reduce((total, part) => total + (part.frameTiming?.captureMs?.samples ?? 0), 0),
          ffmpegWriteSamples: combinedReport.attempts.flatMap(attempt => attempt.parts).reduce((total, part) => total + (part.frameTiming?.ffmpegWriteMs?.samples ?? 0), 0),
          sampledFrames, decodedLongPixels, processPeaks, memorySamples: longProfileSamples, matrixScenarios, samplingErrors,
          note: 'Executado com o PC livre e sem jogo em execução, conforme correção do usuário; processos de fundo do Windows não foram controlados. Memória privada/working set do processo GPU não é VRAM. A matriz adicional cobre 4/8 personagens, fala+cabelo, 1080p, 30 s e 1/2 workers; o perfil longo individual continua em 720p/seguro.'
        }
        await writeFile(join(folder, 'hair-mouth-5min-memory-profile.json'), JSON.stringify(combinedLongProfile, null, 2))
      } finally {
        clearInterval(sampleTimer)
        await memorySampler.close()
      }
    }
    await writeFile(join(folder, 'geometry.json'), JSON.stringify({ syntheticOnly: true, canvas: { width: 64, height: 64 }, sourceHead: { width: 32, height: 24 }, poses: hairAnimation.rigs.map(rig => ({ assetId: rig.assetId, targetHead: rig.targetHead, sourceCrop: rig.sourceCrop, output: { width: rig.outputWidth, height: rig.outputHeight }, shapeScale: { x: rig.shapeScaleX, y: rig.shapeScaleY } })), transition: { startFrame: transitionPlan.startFrame, endFrame: transitionPlan.endFrame, sampledFrames: transitionPlan.samples.map(sample => transitionPlan.endFrame + sample.offset) }, scene: { rotation: secondState.rotation, flipX: secondState.flipX }, textures: hairAnimation.textures.map(item => item.id), layers: hairAnimation.rigs[0].layers.map(layer => ({ id: layer.id, side: layer.side, x: layer.x, y: layer.y, width: layer.width, height: layer.height, scaleX: layer.scaleX, scaleY: layer.scaleY, rotation: layer.rotation, flipX: layer.flipX })), checkedFrames: [0, 10, 22, 23, 29, 30, 31, 60], pixelChecks: { coloredHairByBackground: backgroundChecks, transparentLayerPixels, semitransparentLayerPixels: alphaLayerPixels } }, null, 2))
    await writeFile(join(folder, 'geometry-frames.json'), JSON.stringify({ syntheticOnly: true, sourceSpace: '64x64 character artwork', stageSpace: '320x180 output pixels', frames: geometryFrames }, null, 2))
    await writeFile(join(folder, 'background-checks.json'), JSON.stringify({ syntheticOnly: true, colorPixelCounts: backgroundChecks, transparentLayerPixels, semitransparentHairPixels: alphaLayerPixels }, null, 2))
    const sourceTextureBytes = (256 * 512 * 4) * 3 + 64 * 256 * 4
    const meshFramebufferBytes = Math.max(1, Math.ceil(256 * 1.8)) * Math.max(1, Math.ceil(512 * 1.3)) * 4
    await writeFile(join(folder, 'resolution-checks.json'), JSON.stringify({
      syntheticOnly: true,
      benchmarkContext: {
        gameRunningByUserStatement: false, controlledBenchmark: false,
        node: process.version, electron: process.versions.electron, platform: process.platform, architecture: process.arch,
        outputResolutions: ['1280x720', '1920x1080'], framesPerSecond: 30,
        memorySamples: processMemorySamples,
        workerComparison: {
          kind: 'synthetic-export-only-hair', controlledBenchmark: false, repeatedRunsPerMode: 2,
          order: benchmarkTrials.map(trial => `${trial.mode}-${trial.repetition}`),
          runs: benchmarkTrials,
          mediansMilliseconds: {
            safe: median(benchmarkTrials.filter(trial => trial.mode === 'safe').map(trial => trial.elapsedMilliseconds)),
            turbo: median(benchmarkTrials.filter(trial => trial.mode === 'turbo').map(trial => trial.elapsedMilliseconds))
          },
          note: 'Amostras pareadas na mesma resolução e número de quadros, alternadas, com o PC livre e sem jogo em execução conforme informado pelo usuário. Processos de fundo do Windows não foram controlados; os números não representam garantia de desempenho geral.'
        },
        webglAllocationEstimateBytes: { sourceTexturesRgba8: sourceTextureBytes, largestReusableOutputCanvasRgba8: meshFramebufferBytes, combined: sourceTextureBytes + meshFramebufferBytes, gpuMemoryApiAvailable: false },
        note: 'Electron reporta memória de processo em working set/private bytes, não VRAM nem alocações exatas do driver; tamanhos WebGL são estimativas RGBA8 a partir das dimensões sintéticas.'
      },
      '720pSafe': { ...result720, elapsedMilliseconds: benchmarkTrials[0].elapsedMilliseconds },
      '720pWorkerComparison': { trials: benchmarkTrials, safeRepeatCompleted: safe720RunB.report.state === 'completed', turboRepeatsCompleted: turbo720RunA.report.state === 'completed' && turbo720RunB.report.state === 'completed' },
      '1080pTurboLateStart': { ...result1080, startFrame: 20, elapsedMilliseconds: turbo1080Milliseconds }
    }, null, 2))
    await writeFile(join(folder, 'result.json'), JSON.stringify({ passed: true, framesChecked: [0, 10, 22, 23, 29, 30, 31, 60], transitionFramesChecked: fullTransitionFrames.length, transitionDynamicChangedPixels, transitionFacePatchPixels: transitionFacePatchCount, transitionFacePatchPixelsPerSample: transitionFacePatchCounts, animatedPixels: true, translucentHairPixels: translucentHairPixelCount(first.bitmap), layers: 4, noContinuousLayerSeamsAt720p: true, localHeadChangesBetweenPoses: true, motionAtlasFramesCaptured: true, turboBoundaryStable: true, backgroundsChecked: ['white', 'black', 'colored', 'checkerboard'], backgroundHairPixels: backgroundChecks, transparentLayerPixels, semitransparentHairPixels: alphaLayerPixels, mp4Completed: true, mp4HairChangedPixels: changedHairPixels, globalFlipDirectionMp4: { presetWindPreserved: staticDirectionHair.preset.physics.wind, prewarmMilliseconds: normalDirectionReport.attempts.flatMap(attempt => attempt.parts).reduce((total, part) => total + (part.frameTiming?.hairMotionPrewarmMs?.totalMs ?? 0), 0), decodedFrames: directionFrames, normalCentroids: normalDirectionCentroids.map(value => Number(value.toFixed(3))), mirroredCentroids: mirroredDirectionCentroids.map(value => Number(value.toFixed(3))), mirrorErrorsPx: mirrorErrors.map(value => Number(value.toFixed(3))), mirroredMotionDeltaErrorsPx: motionDeltas.map(value => Number(value.toFixed(3))), firstFrameAlreadyMoving: normalDirectionCentroids.some((center, index) => index > 0 && Math.abs(center - normalDirectionCentroids[0]) > .25) }, individualPieceFlipMp4: { mirrorAxisX: Number(pieceMirrorAxisX.toFixed(3)), normalCentroids: normalPieceCentroids.map(value => Number(value.toFixed(3))), flippedCentroids: mirroredPieceCentroids.map(value => Number(value.toFixed(3))), mirrorErrorsPx: pieceMirrorErrors.map(value => Number(value.toFixed(3))), mirroredMotionDeltaErrorsPx: pieceMotionErrors.map(value => Number(value.toFixed(3))) }, '720pSafeExport': true, '1080pTurboLateStart': true, ...(combinedLongProfile ? { longCombinedProfile: { passed: true, durationSeconds: 300, frames: 9000, resolution: '1280x720', exportMilliseconds: combinedLongProfile.exportMilliseconds, sampleCount: (combinedLongProfile.memorySamples as unknown[]).length, hairRasterMetrics: combinedLongProfile.hairRasterMetrics, matrixScenarios: combinedLongProfile.matrixScenarios } } : {}) }))
  } finally {
    sequential?.close(); split?.close(); factory.dispose()
  }
}

main().then(() => app.exit(0), error => { console.error(error); app.exit(1) })
