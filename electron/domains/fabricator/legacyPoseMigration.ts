import { dirname, join } from 'node:path'

export type LegacyPoseMigrationDependencies = {
  getLegacyRoot: () => string
  poseSlotCount: number
  poseSlotPath: (modelSlot: number, poseSlot: number) => string
  poseDraftPath: (modelSlot: number) => string
  isValidModelSlot: (modelSlot: number) => boolean
  files: {
    readFile: (path: string, encoding: 'utf8') => Promise<string>
    access: (path: string) => Promise<void>
    mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
    rename: (source: string, destination: string) => Promise<void>
  }
}

/** Moves legacy pose slots into their owning model folders without overwriting data. */
export function createLegacyPoseMigration(deps: LegacyPoseMigrationDependencies) {
  let migration: Promise<void> | null = null

  async function migrate(): Promise<void> {
    const root = deps.getLegacyRoot()
    for (let poseSlot = 1; poseSlot <= deps.poseSlotCount; poseSlot += 1) {
      const legacyFolder = join(root, `slot-${poseSlot}`)
      try {
        const project = JSON.parse(await deps.files.readFile(join(legacyFolder, 'pose.json'), 'utf8')) as { sourceModelSlot?: number }
        const modelSlot = project.sourceModelSlot
        if (typeof modelSlot !== 'number' || !deps.isValidModelSlot(modelSlot)) continue
        const destination = deps.poseSlotPath(modelSlot, poseSlot)
        try { await deps.files.access(join(destination, 'pose.json')) } catch {
          await deps.files.mkdir(dirname(destination), { recursive: true })
          await deps.files.rename(legacyFolder, destination)
        }
      } catch (reason) {
        if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      }
    }

    const legacyDraft = join(root, 'draft')
    try {
      const draft = JSON.parse(await deps.files.readFile(join(legacyDraft, 'draft.json'), 'utf8')) as { project: { sourceModelSlot: number } }
      const modelSlot = draft.project.sourceModelSlot
      if (typeof modelSlot !== 'number' || !deps.isValidModelSlot(modelSlot)) return
      const destination = deps.poseDraftPath(modelSlot)
      try { await deps.files.access(join(destination, 'draft.json')) } catch {
        await deps.files.mkdir(dirname(destination), { recursive: true })
        await deps.files.rename(legacyDraft, destination)
      }
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }
  }

  function ensure(): Promise<void> {
    if (migration) return migration
    const current = migrate()
    migration = current
    void current.catch(() => {
      // A migração parcial é retomável: slots movidos passam a ENOENT e são ignorados.
      if (migration === current) migration = null
    })
    return current
  }

  return { ensure, getTrackedTask: () => migration }
}
