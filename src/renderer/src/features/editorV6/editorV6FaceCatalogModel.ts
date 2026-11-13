/** Face sheets are only needed while one of the Inspector's custom views is visible. */
export function shouldLoadEditorV6FaceCatalog(inspectorOpen: boolean, inspectorTab: 'editor' | 'custom'): boolean {
  return inspectorOpen && inspectorTab === 'custom'
}

/** Pose thumbnails and expression presets are exclusive to the Presets view. */
export function shouldLoadEditorV6PresetCatalog(
  inspectorOpen: boolean,
  inspectorTab: 'editor' | 'custom',
  customView: 'face' | 'presets'
): boolean {
  return inspectorOpen && inspectorTab === 'custom' && customView === 'presets'
}
