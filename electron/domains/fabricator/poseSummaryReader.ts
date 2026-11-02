import { join } from 'node:path'
import { resolvePoseCategory, type FabricatorPoseSave, type FabricatorPoseSummary } from '../../../src/shared/fabricator.ts'

const MAX_CONCURRENT_POSE_SUMMARY_READS = 8

export async function readPoseSlotSummaries(options: {
  requestedModelSlot?: number
  slotCount: number
  poseSlotCount: number
  poseSlotPath: (modelSlot: number, poseSlot: number) => string
  readFile: (path: string, encoding: 'utf8') => Promise<string>
}): Promise<Array<FabricatorPoseSummary | null>> {
  const modelSlots = options.requestedModelSlot === undefined
    ? Array.from({ length: options.slotCount }, (_, index) => index + 1)
    : [options.requestedModelSlot]
  const jobs = modelSlots.flatMap((modelSlot) => Array.from({ length: options.poseSlotCount }, (_, index) => ({
    modelSlot,
    slot: index + 1
  })))
  const summaries = new Array<FabricatorPoseSummary | null>(jobs.length).fill(null)
  let nextIndex = 0

  async function readNext(): Promise<void> {
    while (true) {
      const index = nextIndex++
      const job = jobs[index]
      if (!job) return
      try {
        const manifest = JSON.parse(await options.readFile(join(options.poseSlotPath(job.modelSlot, job.slot), 'pose.json'), 'utf8')) as FabricatorPoseSave
        if (manifest.sourceModelSlot !== job.modelSlot || manifest.slot !== job.slot) continue
        summaries[index] = {
          slot: job.slot,
          sourceModelSlot: job.modelSlot,
          name: manifest.name,
          category: resolvePoseCategory(manifest),
          sourceModelName: manifest.sourceModelName,
          partCount: manifest.parts.length,
          updatedAt: manifest.updatedAt
        }
      } catch { /* Slots sem manifest válido continuam vazios. */ }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_POSE_SUMMARY_READS, jobs.length)
  await Promise.all(Array.from({ length: workerCount }, () => readNext()))
  return summaries
}
