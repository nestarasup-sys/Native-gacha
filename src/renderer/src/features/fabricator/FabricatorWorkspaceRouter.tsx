import { lazy, Suspense, type ReactNode } from 'react'
import type { FabricatorSectionId } from './FabricatorSectionNavigation'

const PoseWorkspace = lazy(async () => ({ default: (await import('./PoseWorkspace')).PoseWorkspace }))
const WardrobeWorkspace = lazy(async () => ({ default: (await import('./wardrobe/WardrobeWorkspace')).WardrobeWorkspace }))
const FaceComponentsWorkspace = lazy(async () => ({ default: (await import('./face/FaceComponentsWorkspace')).FaceComponentsWorkspace }))
const HeadExtrasWorkspace = lazy(async () => ({ default: (await import('./face/HeadExtrasWorkspace')).HeadExtrasWorkspace }))
const HairWorkspace = lazy(async () => ({ default: (await import('./HairWorkspace')).HairWorkspace }))
const AnimatorWorkspace = lazy(async () => ({ default: (await import('./AnimatorWorkspace')).AnimatorWorkspace }))
const DesignWorkspace = lazy(async () => ({ default: (await import('./DesignWorkspace')).DesignWorkspace }))
const ExpressionPresetWorkspace = lazy(async () => ({ default: (await import('./ExpressionPresetWorkspace')).ExpressionPresetWorkspace }))
const FaceAnimatorWorkspace = lazy(async () => ({ default: (await import('./FaceAnimatorWorkspace')).FaceAnimatorWorkspace }))

export function FabricatorWorkspaceRouter({
  activeSection,
  activeSlot,
  modelWorkspace
}: {
  activeSection: FabricatorSectionId
  activeSlot: number
  modelWorkspace: ReactNode
}) {
  let workspace: ReactNode

  switch (activeSection) {
    case 'Design Dev':
      workspace = <DesignWorkspace />
      break
    case 'Poses':
      workspace = <PoseWorkspace baseModelSlot={activeSlot} />
      break
    case 'Roupas':
      workspace = <WardrobeWorkspace baseModelSlot={activeSlot} />
      break
    case 'Olhos':
      workspace = <FaceComponentsWorkspace mode="eyes" baseModelSlot={activeSlot} />
      break
    case 'Rosto':
      workspace = <FaceComponentsWorkspace mode="face" baseModelSlot={activeSlot} />
      break
    case 'Preset Expressão Dev':
      workspace = <ExpressionPresetWorkspace modelSlot={activeSlot} />
      break
    case 'Animador Rosto Dev':
      workspace = <FaceAnimatorWorkspace modelSlot={activeSlot} />
      break
    case 'Cabeças extra':
      workspace = <HeadExtrasWorkspace baseModelSlot={activeSlot} />
      break
    case 'Cabelos Dev':
      workspace = <HairWorkspace baseModelSlot={activeSlot} />
      break
    case 'Animador Dev':
      workspace = <AnimatorWorkspace baseModelSlot={activeSlot} />
      break
    case 'Modelos':
      workspace = modelWorkspace
      break
  }

  return <Suspense fallback={<div role="status" aria-busy="true">Carregando área…</div>}>{workspace}</Suspense>
}
