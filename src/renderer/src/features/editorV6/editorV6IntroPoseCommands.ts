import { EDITOR_V6_SOURCE_FRAME_VERSION } from './editorV6SourceFrame'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import type { prepareEditorV6PoseChange } from './editorV6PosePreparation'
import { normalizeEditorV6IntroPoseFace, editEditorV6IntroAppearance, editorV6IntroInspectorTarget } from './editorV6IntroInspectorTarget'

type PreparePose = (input: Parameters<typeof prepareEditorV6PoseChange>[0]) => ReturnType<typeof prepareEditorV6PoseChange>

export async function prepareEditorV6IntroPoseBatch(
  project: EditorV6Document, source: EditorV6Element, character: CustomizerCharacter,
  characters: readonly CustomizerCharacter[], prepare: PreparePose
) {
  const sourceModel = character.customization.modelSlot ?? 1
  const slot = source.poseSlot === undefined ? character.customization.poseSlot ?? null : source.poseSlot
  const byId = new Map(characters.map(item => [item.id, item]))
  const catalog = new Map<number, ReturnType<typeof window.desktop.fabricator.listFabricatorPoseSlots>>()
  const poses = (model: number) => {
    const pending = catalog.get(model) ?? window.desktop.fabricator.listFabricatorPoseSlots(model)
    catalog.set(model, pending)
    return pending
  }
  const sourcePose = slot === null ? null : (await poses(sourceModel)).find(pose => pose?.sourceModelSlot === sourceModel && pose.slot === slot)
  if (slot !== null && !sourcePose) throw Error('A pose selecionada não está mais disponível no modelo.')
  const prepared: Array<{ id: string; assetId: string | undefined; apply: (doc: EditorV6Document) => EditorV6Document }> = []
  const skipped = new Set<string>()
  for (const track of project.timeline.tracks) {
    if (track.kind !== 'intro' || track.locked) continue
    for (const block of track.blocks) {
      const element = editorV6IntroInspectorTarget(project, block)
      if (!element?.characterId || element.id === source.id) continue
      const target = byId.get(element.characterId)
      if (!target) { skipped.add(element.text); continue }
      const model = target.customization.modelSlot ?? 1
      let targetSlot = slot
      if (sourcePose && model !== sourceModel) {
        const matches = (await poses(model)).filter(pose => pose?.sourceModelSlot === model && pose.name === sourcePose.name)
        targetSlot = matches.length === 1 ? matches[0]?.slot ?? null : null
        if (targetSlot === null) { skipped.add(target.name); continue }
      }
      const face = await normalizeEditorV6IntroPoseFace(element, target)
      const rendered = await prepare({ element: face, character: target, poseSlot: targetSlot })
      if (!rendered) throw Error('Não foi possível preparar a pose de ' + target.name + '.')
      prepared.push({ id: block.id, assetId: element.assetId, apply: doc => ({
        ...doc,
        elements: doc.elements.map(item => item.id === block.id ? { ...face, poseSlot: targetSlot, faceRendererVersion: EDITOR_V6_SOURCE_FRAME_VERSION, ...rendered.geometry, faceModeAssetIds: { ...rendered.baked.assetIds, [rendered.baseMode]: element.assetId } } : item),
        assets: [...doc.assets.map(asset => asset.id === element.assetId ? { ...asset, dataUrl: rendered.baked.dataUrl, mimeType: 'image/png' as const } : asset), ...rendered.baked.extraAssets]
      }) })
    }
  }
  return {
    skipped: [...skipped],
    apply: (current: EditorV6Document) => {
      if (current.id !== project.id) return current
      for (const item of prepared) {
        current = editEditorV6IntroAppearance(current, item.id, working =>
          working.elements.find(element => element.id === item.id)?.assetId === item.assetId ? item.apply(working) : working)
      }
      return current
    }
  }
}
