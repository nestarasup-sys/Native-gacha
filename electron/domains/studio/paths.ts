import { join } from 'node:path'

/** Caminhos persistidos dos projetos do Studio e do Editor Gacha. */
export function createStudioPaths(userDataPath: () => string) {
  const studioLibraryPath = (workspace: 'studio' | 'video' = 'studio') => join(
    userDataPath(), 'studios', workspace === 'video' ? 'Editor Gacha' : 'Studio Principal'
  )
  const studioPath = (id: string) => join(studioLibraryPath('studio'), `studio-${id}`)
  return { studioLibraryPath, studioPath }
}
