import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { EditorV6Element, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../../../../shared/editorV6'
import { editorV6MotionPlan } from '../../../../../shared/editorV6Motion'
import { renderSavedCharacter } from '../../../characters/editorV6CharacterRenderer'
import { fitElementToTrim, trimTransparentImage } from '../../../characters/characterGeometry'
import { bakeEditorV6Motion } from '../motion/bakeMotion'

const expectedNames = ['STRESS_Aurora', 'STRESS_Nix', 'STRESS_Brisa', 'STRESS_Dorian'] as const

type CapturedGeometry = { x: number; y: number; width: number; height: number }
type CapturedPose = { poseSlot: number; dataUrl: string; width: number; height: number; geometry: CapturedGeometry }
type CapturedTransition = { fromPoseSlot: number; toPoseSlot: number; assetDataUrl: string; frames: unknown[]; metrics: { milliseconds: number; preparedRigs: number; samples: number; atlasPixels: number } }
type CapturedCharacter = { character: CustomizerCharacter; poses: CapturedPose[]; transitions: CapturedTransition[] }

declare global {
  interface Window { __editorV6StressCapture?: { status: 'ready' | 'done' | 'error'; result?: CapturedCharacter[]; error?: string } }
}

function actorState(character: CustomizerCharacter, poseSlot: number, assetId: string, geometry?: CapturedGeometry): EditorV6Element {
  return {
    id: `stress-capture-${character.id}`,
    kind: 'character',
    characterId: character.id,
    characterSourceUpdatedAt: character.updatedAt,
    poseSlot,
    faceAppearance: character.customization.faceAppearance,
    assetId,
    text: character.name,
    x: geometry?.x ?? 0,
    y: geometry?.y ?? 0,
    width: geometry?.width ?? 18,
    height: geometry?.height ?? 42,
    rotation: 0,
    zIndex: 20
  }
}

function makeBlock(element: EditorV6Element, startFrame: number, id: string): EditorV6TimelineBlock {
  return { id, elementId: element.id, characterId: element.characterId, label: element.text, startFrame, durationFrames: 60, state: element }
}

export async function publishEditorV6StressCharacters(): Promise<void> {
  window.__editorV6StressCapture = { status: 'ready' }
  try {
    const allCharacters = await window.desktop.customizer.listCustomizerCharacters()
    const characters = expectedNames.map((name) => allCharacters.find((candidate) => candidate.name === name))
    if (characters.some((character) => !character)) throw new Error(`O perfil sintético precisa conter estes quatro personagens: ${expectedNames.join(', ')}.`)

    const captured: CapturedCharacter[] = []
    for (const candidate of characters as CustomizerCharacter[]) {
      const slots = [...new Set([candidate.customization.poseSlot, candidate.customization.poseSlot === 1 ? 2 : 1])]
      if (slots.some((slot) => slot === null || slot === undefined)) throw new Error(`${candidate.name} não tem uma pose do Fabricador selecionada.`)
      const poses: CapturedPose[] = []
      for (const poseSlot of slots as number[]) {
        const renderStarted = performance.now()
        const character = { ...candidate, customization: { ...candidate.customization, poseSlot } }
        const image = await renderSavedCharacter(character)
        if (!image.dataUrl.startsWith('data:image/png;base64,') || image.width < 100 || image.height < 100) throw new Error(`${candidate.name}: o motor não gerou um snapshot PNG válido.`)
        const untrimmed = actorState(candidate, poseSlot, `stress:${candidate.id}:${poseSlot}`)
        const crop = await trimTransparentImage(image.dataUrl)
        const normalized = crop ? fitElementToTrim(untrimmed, crop) : untrimmed
        poses.push({ poseSlot, dataUrl: crop?.dataUrl ?? image.dataUrl, width: crop?.width ?? image.width, height: crop?.height ?? image.height, geometry: { x: normalized.x, y: normalized.y, width: normalized.width, height: normalized.height } })
        console.info(`[V6 stress] ${candidate.name} pose ${poseSlot}: ${(performance.now() - renderStarted).toFixed(1)} ms`)
      }

      const transitions: CapturedTransition[] = []
      for (const [fromPoseSlot, toPoseSlot] of [[slots[0], slots[1]], [slots[1], slots[0]]] as Array<[number, number]>) {
        const fromGeometry = poses.find((pose) => pose.poseSlot === fromPoseSlot)!.geometry
        const toGeometry = poses.find((pose) => pose.poseSlot === toPoseSlot)!.geometry
        const base = actorState(candidate, fromPoseSlot, `stress:${candidate.id}:${fromPoseSlot}`, fromGeometry)
        const target = actorState(candidate, toPoseSlot, `stress:${candidate.id}:${toPoseSlot}`, toGeometry)
        const track: EditorV6TimelineTrack = {
          id: `stress-capture-track-${candidate.id}`, kind: 'character', characterId: candidate.id,
          name: candidate.name, muted: false, locked: false, motionEnabled: true,
          blocks: [makeBlock(base, 0, `stress-capture-from-${candidate.id}`), makeBlock(target, 30, `stress-capture-to-${candidate.id}`)]
        }
        const plan = editorV6MotionPlan(track, track.blocks[0], track.blocks[1])
        if (!plan) throw new Error(`${candidate.name}: o plano de transição de ${fromPoseSlot} para ${toPoseSlot} ficou vazio.`)
        const baked = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character: candidate }, window.desktop.fabricator)
        transitions.push({ fromPoseSlot, toPoseSlot, assetDataUrl: baked.asset.dataUrl, frames: baked.motion.frames, metrics: baked.metrics })
        console.info(`[V6 stress] ${candidate.name} transição ${fromPoseSlot}→${toPoseSlot}: ${baked.metrics.milliseconds.toFixed(1)} ms, ${baked.metrics.samples} quadros`)
      }
      captured.push({ character: candidate, poses, transitions })
    }
    window.__editorV6StressCapture = { status: 'done', result: captured }
  } catch (reason) {
    const error = reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    window.__editorV6StressCapture = { status: 'error', error }
    console.error('[V6 stress] Falha ao renderizar personagens sintéticos:', error)
  }
}
