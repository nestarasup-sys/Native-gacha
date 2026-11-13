/** Face sheets are only needed while one of the Inspector's custom views is visible. */
export function shouldLoadEditorV6FaceCatalog(inspectorOpen: boolean, inspectorTab: 'editor' | 'custom'): boolean {
  return inspectorOpen && inspectorTab === 'custom'
}
