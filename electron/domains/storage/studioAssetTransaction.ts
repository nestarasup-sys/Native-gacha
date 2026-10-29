/** Journal de undo de assets do Studio Principal; preserva os paths legados. */
import {
  createAssetManifestTransaction,
  type AssetManifestPublication,
  type AssetManifestTransactionFiles
} from './assetManifestTransaction.ts'

const transaction = createAssetManifestTransaction({
  journalDirectory: '.studio-assets-transaction',
  manifestFileName: 'studio.json',
  domainName: 'Studio'
})

export function recoverStudioAssetTransaction(files: AssetManifestTransactionFiles, folder: string): Promise<void> {
  return transaction.recover(files, folder)
}

export function publishStudioAssetsAndManifest(options: AssetManifestPublication): Promise<void> {
  return transaction.publish(options)
}
