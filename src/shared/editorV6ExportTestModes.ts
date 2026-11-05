/**
 * Export laboratory only. All modes preserve timeline, resolution, encoder,
 * samples and the exact token-verified bitmap. Each knob changes execution
 * strategy, not the output contract. No mode silently enables R36/R37.
 */
export type EditorV6ExportTestMode =
  | 'controle' | 'movimentos-1' | 'boca-1' | 'captura-8' | 'rosto-legado' | 'combinado'

export const EDITOR_V6_EXPORT_TEST_MODES: ReadonlyArray<{
  id: EditorV6ExportTestMode; label: string; description: string
}> = [
  { id: 'controle', label: '01 · Controle', description: 'Padrão atual: 2 movimentos, 2 bocas e captura segura de 16 ms.' },
  { id: 'movimentos-1', label: '02 · Movimentos 1×', description: 'Prepara transições em uma lane. Mede se reduz a disputa de recursos.' },
  { id: 'boca-1', label: '03 · Boca 1×', description: 'Prepara um atlas de boca de cada vez. Isola o custo da concorrência.' },
  { id: 'captura-8', label: '04 · Captura 8 ms', description: 'Tenta novamente mais cedo após um bitmap antigo; o token continua obrigatório.' },
  { id: 'rosto-legado', label: '05 · Rosto clássico', description: 'Compara o recorte facial antigo com PNG contra o recorte sem encode.' },
  { id: 'combinado', label: '06 · Combinado', description: 'Movimentos em 1 lane + captura de 8 ms, com boca em 2.' }
]

export type EditorV6ExportTestSettings = Readonly<{
  motionConcurrency: 1 | 2
  mouthConcurrency: 1 | 2
  captureRetryMilliseconds: 8 | 16
  encodeFaceCropPng: boolean
}>
const settings: Readonly<Record<EditorV6ExportTestMode, EditorV6ExportTestSettings>> = {
  controle: { motionConcurrency: 2, mouthConcurrency: 2, captureRetryMilliseconds: 16, encodeFaceCropPng: false },
  'movimentos-1': { motionConcurrency: 1, mouthConcurrency: 2, captureRetryMilliseconds: 16, encodeFaceCropPng: false },
  'boca-1': { motionConcurrency: 2, mouthConcurrency: 1, captureRetryMilliseconds: 16, encodeFaceCropPng: false },
  'captura-8': { motionConcurrency: 2, mouthConcurrency: 2, captureRetryMilliseconds: 8, encodeFaceCropPng: false },
  'rosto-legado': { motionConcurrency: 2, mouthConcurrency: 2, captureRetryMilliseconds: 16, encodeFaceCropPng: true },
  combinado: { motionConcurrency: 1, mouthConcurrency: 2, captureRetryMilliseconds: 8, encodeFaceCropPng: false }
}
export function isEditorV6ExportTestMode(value: unknown): value is EditorV6ExportTestMode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(settings, value)
}
export function editorV6ExportTestSettings(mode?: EditorV6ExportTestMode): EditorV6ExportTestSettings {
  if (mode !== undefined && !isEditorV6ExportTestMode(mode)) throw Error('Modo de teste de exportação inválido.')
  return settings[mode ?? 'controle']
}
