import { join } from 'node:path'

/** Caminhos persistidos da biblioteca de personagens do Customizador. */
export function createCustomizerPaths(userDataPath: () => string) {
  const characterLibraryPath = () => join(userDataPath(), 'customizer', 'characters')
  const characterManifestPath = () => join(characterLibraryPath(), 'characters.json')
  return { characterLibraryPath, characterManifestPath }
}
