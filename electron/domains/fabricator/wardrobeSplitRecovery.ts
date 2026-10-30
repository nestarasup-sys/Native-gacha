import type { ModelPart, WardrobeSet } from '../../../src/shared/fabricator'
import { dirname, join } from 'node:path'

type PartIdentity = Pick<ModelPart, 'id' | 'name'>

export function createSplitAwareWardrobeReader(deps: {
  read: (modelSlot: number, id: string) => Promise<WardrobeSet | null>
  slotPath: (slot: number) => string
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  readdir: (path: string) => Promise<string[]>
}) {
  return async (modelSlot: number, id: string): Promise<WardrobeSet | null> => {
    const set = await deps.read(modelSlot, id)
    if (!set) return null
    try {
      const folder = deps.slotPath(modelSlot)
      const current = JSON.parse(await deps.readFile(join(folder, 'project.json'), 'utf8')) as { parts: PartIdentity[] }
      if (set.components.every(component => current.parts.some(part => part.id === component.attachedPartId))) return set
      const base = dirname(folder)
      const names = (await deps.readdir(base)).filter(name => new RegExp(`^\\.model-source-backup-${modelSlot}-[a-f0-9-]+$`).test(name))
      const history = await Promise.all(names.map(async name => {
        const manifest = JSON.parse(await deps.readFile(join(base, name, 'project.json'), 'utf8')) as { parts: PartIdentity[] }
        return manifest.parts
      }))
      return recoverWardrobeSplitBindings(set, current.parts, history)
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return set
      throw reason
    }
  }
}

/** Recover legacy split survivors only when a publication backup proves the
 * original identity and the remaining, unsplit bones still identify this rig. */
export function recoverWardrobeSplitBindings(
  set: WardrobeSet, current: readonly PartIdentity[], history: readonly (readonly PartIdentity[])[]
): WardrobeSet {
  const currentIds = new Set(current.map(part => part.id))
  const aliases = new Map<string, string>()
  for (const component of set.components) {
    const oldId = component.attachedPartId
    if (currentIds.has(oldId) || aliases.has(oldId)) continue
    const candidates = new Set<string>()
    for (const previous of history) {
      const original = previous.find(part => part.id === oldId)
      if (!original) continue
      const stable = current.filter(part => !part.name.endsWith(' - parte'))
      if (!stable.length || !stable.every(part => previous.some(old => old.id === part.id && old.name === part.name))) continue
      const survivors = current.filter(part => part.name === `${original.name} - parte`
        && !previous.some(old => old.id === part.id))
      if (survivors.length === 1) candidates.add(survivors[0].id)
    }
    if (candidates.size === 1) aliases.set(oldId, [...candidates][0])
  }
  if (!aliases.size) return set
  // Ambiguous merges must remain visible to the existing integrity validator.
  const targets = [...aliases.values()]
  const components = set.components.map(component => {
    const id = aliases.get(component.attachedPartId)
    if (!id || targets.filter(target => target === id).length !== 1
      || (component.binding && component.binding.boneId !== component.attachedPartId)) return component
    return { ...component, attachedPartId: id,
      ...(component.binding ? { binding: { ...component.binding, boneId: id } } : {}) }
  })
  return { ...set, components }
}
