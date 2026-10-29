import type { FabricatorProject } from '../../../../../shared/fabricator'
import { sourceRect, type ModelSourceDimensions } from './modelSourceGeometry.ts'

/** Upper bound calibrated against synthetic 2 MP, 4.7 MP and 8 MP compositor benchmarks. */
export const MAIN_THREAD_COMPOSE_PIXEL_BUDGET = 14_500_000

export function estimateModelSourceComposePixels(
  project: Pick<FabricatorProject, 'width' | 'height' | 'parts'>,
  edits: ModelSourceDimensions
): number {
  return project.width * project.height * 2 + project.parts.reduce((total, part) => {
    const rect = sourceRect(part, edits[part.id])
    return total + rect.width * rect.height
  }, 0)
}

/** Moderate compositions avoid worker startup and cross-thread image payload costs. */
export function shouldComposeModelSourceOnMainThread(
  project: Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'tolerance'>,
  edits: ModelSourceDimensions,
  tolerance: number
): boolean {
  return tolerance === project.tolerance
    && estimateModelSourceComposePixels(project, edits) <= MAIN_THREAD_COMPOSE_PIXEL_BUDGET
}
