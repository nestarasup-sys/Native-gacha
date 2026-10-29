/** Journal de undo de assets do Editor V6; preserva os paths legados. */
import {
  createAssetManifestTransaction,
  type AssetManifestPublication,
  type AssetManifestTransactionFiles
} from '../storage/assetManifestTransaction.ts'

const transaction = createAssetManifestTransaction({
  journalDirectory: '.editorV6-assets-transaction',
  manifestFileName: 'editorV6.json',
  domainName: 'EditorV6'
})

export function recoverEditorV6AssetTransaction(files: AssetManifestTransactionFiles, folder: string): Promise<void> {
  return transaction.recover(files, folder)
}

export function publishEditorV6AssetsAndManifest(options: AssetManifestPublication): Promise<void> {
  return transaction.publish(options)
}
