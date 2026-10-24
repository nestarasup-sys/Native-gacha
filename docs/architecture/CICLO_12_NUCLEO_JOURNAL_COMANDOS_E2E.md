# Ciclo 12 — arquitetura compartilhada, journal Studio, comandos e E2E Windows

Data: 2026-10-22. Branch `feature/model-source-editor`, PR #5 draft sobre `refactor/shared-character-core`; não fundir na `main`. Os BATs e os formatos IPC, JSON, SQLite, G-V5 e bibliotecas pessoais permanecem inalterados.

## 1. Núcleo compartilhado de personagem

- `src/renderer/src/characters/characterSourceResolver.ts` separa a escolha de modelo fonte e pose, proporções e dimensões. O compositor `characterRenderer.ts` utiliza o resolvedor sem alterar seu contrato de saída.
- `features/videoStudio/transitionRenderer.ts` deixa de importar a página `CustomizerPage`. Usa o mesmo compositor compartilhado do Customizador e do Studio.
- `scripts/architecture/boundaries-baseline.json` impõe zero imports runtime entre features (antes restava um).
- Teste `tests/cycle12-core-history.test.mjs` garante a fronteira; os golden de composição existentes continuam executados.

## 2. Recuperação de assets Studio

- `electron/domains/storage/studioAssetTransaction.ts` mantém backups por projeto em `.studio-assets-transaction` antes de sobrescrever PNGs legados. Publica o manifesto `studio.json` somente depois das mídias; em queda antes da promoção recupera bytes anteriores no próximo acesso.
- O marcador `committed.ok` confirma commits quando o JSON não mudou mas os bytes mudaram. A comparação dos hashes do manifesto detecta promoção confirmada mesmo após queda antes do marcador quando os manifestos diferem.
- `documentPersistence.ts` reabre recuperando primeiro o journal e usa publicação com rollback. Frames `@video-frame:sha256` e asset paths legados permanecem.
- Teste `tests/studio-asset-transaction.test.mjs`: rollback com PNG truncado, saída de diretório rejeitada, recuperação após crash simulado, projeto sentinela intocado, commit completo e mesmo JSON com PNG atualizado.
- O journal é transação de **arquivos Studio no projeto**; não promete atomicidade distribuída SQLite+JSON+PNG entre todos os domínios. SQLite, recuperação de perfis, backups e outros stores conservam seus próprios protocolos.

## 3. Modularização de comandos React

- `features/customizer/useCustomizerCharacterCommands.ts` concentra selecionar, persistir por ID com fila, notificar eventos e aplicar overrides da personalização, sem modificar as fontes Fabricador.
- `src/shared/studioHistory.ts` implementa record/undo/redo puros de snapshots de cena, preservando limite de 30, timestamps e fluxo de UI existente. `StudioPage.tsx` delega para essas operações.
- Os hooks de elencos, modelos/poses, bibliotecas e inspector, criados em Ciclos 10/11, permanecem. Não foram reescritos JSXs/visuais dos editores.

## 4. E2E Electron real Windows em duas execuções

- `scripts/fabricator/capture-real-ui.cjs` executa dois processos Electron sequenciais no mesmo **sandbox sintético exclusivo** (`GACHA_DEV_AI_TEST=1`); processo 2 não recria fixtures.
- Primeira execução: fotografa oito telas reais do Fabricador com modelo completo, cria personagem pela UI do Customizador, salva seleção de modelo/pose via `window.desktop` público, cria Studio pela UI, abre cena, seleciona personagem no modal do elenco, salva e captura tela.
- Segundo processo (reinicialização real): relê personagem e Studio via IPC, verifica IDs, pose/modelo, referências a assets válidas, abre a cena e captura `studio-reaberto.png`.
- `scripts/fabricator/review-real-ui-captures.cjs --with-workspaces` valida onze PNGs, hashes SHA-256, dimensões e IDs do fluxo; workflow de captura publica artifact para revisão humana.
- Sem aprovar automaticamente baselines: screenshots que passaram em hash podem conter anomalia de aparência. Verificação visual humana é um aceite distinto.
- Timeout de 180 segundos por processo evita jobs presos indefinidamente. Qualquer falha aborta o fluxo.

## Portões de qualidade

`npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck`, `npm run build`, CI Core Ubuntu + Windows, Quality Linux e workflow Electron GUI Windows. Novas suites: `studio-asset-transaction`, `cycle12-core-history`. O resultado deve ser confirmado no HEAD, não reaproveitado de builds antigos.

## Restrições preservadas

- Autoridade Fabricador DEV para bibliotecas, Customizador para deltas de personagem e Studio para sobrescritas por cena.
- Nenhum merge na `main`, nenhuma migração de dados de usuário ou modificação dos BATs.
- Sem alteração no motor de exportação de vídeo.
- Testes usam diretórios temporários; não usar perfis pessoais para capturas automáticas.
