import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('captura visual da Logs Dev exige o sandbox DEV AI e opera somente no perfil sintético', async () => {
  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8')
  const runner = await readFile(new URL('../scripts/logs-dev/capture-real-ui.cjs', import.meta.url), 'utf8')
  const capture = await readFile(new URL('../electron/domains/storage/logsDevVisualCapture.ts', import.meta.url), 'utf8')
  assert.match(main, /GACHA_DEV_AI_TEST === '1' && process\.env\.GACHA_LOGS_DEV_REAL_UI_CAPTURE === '1'/)
  assert.match(runner, /GACHA_DEV_AI_SANDBOX: sandbox/)
  assert.match(runner, /\.dev-ai-sandbox\.json/)
  assert.match(runner, /GACHA_DEV_AI_TEST: '1'/)
  assert.match(main, /join\(app\.getPath\('appData'\), 'logs-dev-captures'\)/)
  assert.match(capture, /captureLogsDevRealScreens/)
  assert.doesNotMatch(runner, /app-data|userData|private-copy/)
})
