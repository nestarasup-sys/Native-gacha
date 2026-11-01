import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { useEditorV6CharacterSnapshotRefresh } from '../../src/renderer/src/features/editorV6/useEditorV6CharacterSnapshotRefresh'
import { editorV6CharacterEyeSourceRevision, editorV6CharacterWardrobeSourceRevision, editorV6CharacterHairSourceRevision, editorV6CharacterHeadExtraSourceRevision, type PoseRevisionSnapshot } from '../../src/renderer/src/features/editorV6/editorV6CharacterSourceModel'

/** Real React effect cancellation and Canvas rendering, with a delayed old
 * Fabricator read. All data belongs to this synthetic document. */
export async function checkConcurrentSourceRefresh(character: CustomizerCharacter, provider: CharacterRenderAssetProvider, dataUrl: string) {
  let releaseOld!: () => void
  const oldRead = new Promise<void>(resolve => { releaseOld = resolve })
  let beganOldRead = false, oldReadFinished = false
  const delayedProvider = new Proxy(provider, { get(target, key) {
    if (key === 'loadFabricatorSlot') return async (slot: number) => {
      if (!beganOldRead) { beganOldRead = true; await oldRead; oldReadFinished = true }
      return target.loadFabricatorSlot(slot)
    }
    return Reflect.get(target, key)
  } })
  const desktop = window.desktop
  Object.defineProperty(window, 'desktop', { configurable: true, value: { fabricator: delayedProvider } })
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: character.id, assetId: crypto.randomUUID(), text: character.name,
    x: 0, y: 0, width: 20, height: 50, rotation: 0, zIndex: 1, poseSlot: 1, characterSourceUpdatedAt: 'old' }
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Concurrent synthetic refresh', color: '#ffffff', createdAt: character.createdAt, updatedAt: character.updatedAt,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor], assets: [{ id: actor.assetId!, category: 'character', name: character.name, mimeType: 'image/png', dataUrl }], timeline: createEditorV6Timeline([actor]) }
  let latestDocument = project
  const errors: string[] = []
  const noop = () => {}
  const reportError = (message: string) => { errors.push(message) }
  const stageRef = { current: null }
  function Harness({ currentCharacter, sources }: { currentCharacter: CustomizerCharacter; sources: PoseRevisionSnapshot }) {
    const [document, setDocument] = useState(project)
    latestDocument = document
    useEditorV6CharacterSnapshotRefresh({ project: document, availableCharacters: [currentCharacter], poseSourceSnapshot: sources,
      sceneRef: stageRef, updateProject: setDocument, markUnsaved: noop, pausePlayback: noop, reportError })
    return null
  }
  const mount = document.createElement('div'); document.body.append(mount)
  const root = createRoot(mount)
  const revisions = (revision: string): PoseRevisionSnapshot => ({ projectId: project.id, revisions: { '1:1': revision }, modelRevisions: { '1': revision },
    wardrobeRevisions: { '1:synthetic-wardrobe': revision }, hairRevisions: { '1:synthetic-hair': revision }, headExtraRevisions: { '1:synthetic-head-extra': revision },
    eyeRevisions: { '1:eye:synthetic-eye': revision, '1:pupil:synthetic-pupil': revision } })
  const waitUntil = async (condition: () => boolean) => {
    for (let i = 0; i < 500; i++) {
      if (condition()) return
      if (errors.length) throw Error(errors.join('; '))
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw Error('Timed out waiting for synthetic source refresh')
  }
  try {
    flushSync(() => root.render(createElement(Harness, { currentCharacter: { ...character, updatedAt: 'revision-1' }, sources: revisions('revision-1') })))
    await waitUntil(() => beganOldRead)
    const latestCharacter = { ...character, updatedAt: 'revision-12', customization: { ...character.customization,
      bodyDimensions: { ...character.customization.bodyDimensions!, thighsWidth: 135 }, proportions: { ...character.customization.proportions!, head: 120 } } }
    for (let revision = 2; revision <= 12; revision++) {
      flushSync(() => root.render(createElement(Harness, { currentCharacter: { ...latestCharacter, updatedAt: `revision-${revision}` }, sources: revisions(`revision-${revision}`) })))
    }
    await waitUntil(() => latestDocument.elements[0].characterSourceUpdatedAt === 'revision-12')
    const newestAsset = latestDocument.elements[0].assetId
    releaseOld()
    await waitUntil(() => oldReadFinished)
    await new Promise(resolve => setTimeout(resolve, 100))
    const current = latestDocument.elements[0]
    if (current.assetId !== newestAsset || current.characterSourceUpdatedAt !== 'revision-12' || current.modelSourceRevision !== 'revision-12') throw Error('An old async render replaced the latest source revision')
    const sources = revisions('revision-12')
    if (current.wardrobeSourceRevision !== editorV6CharacterWardrobeSourceRevision(latestCharacter, sources.wardrobeRevisions!)
      || current.eyeSourceRevision !== editorV6CharacterEyeSourceRevision(latestCharacter, sources.eyeRevisions!)) throw Error('Source revisions were mixed across concurrent refreshes')
    if (current.hairSourceRevision !== editorV6CharacterHairSourceRevision(latestCharacter, sources.hairRevisions!)
      || current.headExtraSourceRevision !== editorV6CharacterHeadExtraSourceRevision(latestCharacter, sources.headExtraRevisions!)
      || current.poseSourceRevision !== 'revision-12') throw Error('Hair, head extras or pose retained an old revision')
    for (const track of latestDocument.timeline.tracks) for (const block of track.blocks) {
      if (block.state?.kind === 'character' && block.state.characterSourceUpdatedAt !== 'revision-12') throw Error('A timeline block retained an old character revision')
    }
    return { revisions: 12, oldResultRejected: true, sceneAndTimelineConsistent: true }
  } finally {
    releaseOld(); root.unmount(); mount.remove()
    Object.defineProperty(window, 'desktop', { configurable: true, value: desktop })
  }
}
