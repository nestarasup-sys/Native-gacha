# Ciclo 14 — Sequência 1 → 2 → 3 → 5 → 6 → 4 → 7

Data: 2026-10-22. PR #5 draft; branch `feature/model-source-editor` sobre `refactor/shared-character-core`.
Sem merge na `main`. Sem alteração de BATs Windows, IPC legados, formatos JSON/SQLite, perfis reais, ou motor de exportação.

## 1. Catálogos — journal de múltiplos PNGs

`electron/domains/fabricator/catalogImageTransaction.ts` foi criado para documentar os bytes originais de cada PNG que será alterado antes de gravar o primeiro. Cada conjunto usa `.catalog-transaction` (diretório privado do conjunto); a estrutura registra `oldHash`, `nextHash`, `manifestName`, IDs e existência anterior. Publicação/limpeza só ocorre após promoção de `wardrobe.json`, `hair.json`, `hair-style.json`, `face.json` ou `item.json`. Quando a operação falha antes da promoção, restaura imagens antigas e remove arquivos criados. Reabertura trata journals pendentes. Valida journal, caminhos e backups antes de efetuar qualquer rollback; sidecars de edição `.paint.png` não são modificados. As leituras de rosto/cabelo/roupa do `electron/main.ts` invocam recuperação antes de hidratar.

`catalogPersistence.ts` mantém o swap legado de `wardrobe.json.backup`, o preflight de imagens ausentes e a remoção de PNGs obsoletos **após** a promoção. Escrever via adapter `DomainFileSystem` conserva suporte ao armazenamento ativado em SQLite. Novos testes em `tests/fabricator-catalog-image-transaction.test.mjs`: falha após PNG alterado, promoção falha, reabertura com journal de crash, bloqueio de ID malicioso, sidecar preservado e isolamento de conjunto.

**Limite conhecido:** a publicação de vários arquivos tem rollback por journal, não é transação distribuída sincronizada globalmente com todos os bancos e mídias da aplicação. Crash entre promoção de manifesto idêntico e escrita de `committed.ok` é tratado de forma conservadora para não manter PNGs não confirmados. Nenhuma recuperação destrutiva automática dos conjuntos pessoais previamente corrompidos.

## 2. Electron Main — domínio de expressões

`electron/domains/fabricator/expressionStorage.ts` recebeu funções de catálogo de presets, coleções, rascunho de expressões e leitura/gravação associada. `main.ts` injeta validações, caminhos, root do perfil e adapter de arquivos. A assinatura dos handlers IPC e os esquemas existentes não foram alterados; o módulo não importa `electron` nem a UI.

## 3. Customizador — painéis de roupas

`src/renderer/src/features/customizer/wardrobePanelModel.ts` centraliza tipos, categorias, páginas, seleção de componentes por lado e renderização de thumbnails. `CustomizerPage.tsx` mantém estado e JSX, mas delega regras de correspondência. Nenhum recorte do Fabricador é regravado pelo processo de seleção.

## 5. Compositor visual — geometria compartilhada

`src/renderer/src/characters/characterGeometry.ts` contém `trimTransparentImage`, `fitElementToTrim` e `faceRenderGeometry` usados por ambos os Studios. Removidas duplicações locais. O path anterior `videoStudio/characterGeometry.ts` apenas reexporta para compatibilidade. Novo `tests/shared-character-geometry.test.mjs` verifica proporções, espelhamento, rotação, cálculos 16:9 e ausência de implementações divergentes.

## 6. Salvamento ordenado — Studio e Video Studio

`src/shared/serializedDocumentSave.ts` garante ordem FIFO para salvamentos iniciados por ambos os editores, encapsulando a chamada pública existente. Erro de um save não bloqueia próximo. Cada página possui sua própria fila de writes, respeitando a separação entre Studio Principal e Video Studio. `tests/serialized-studio-save.test.mjs` verifica ordem, erros/retry, fila ociosa e contratos nas páginas.

**Limite:** a fila cobre os comandos normais de salvar/autosave das páginas; outros caminhos diretos de criação, duplicação e importação de assets continuam usando os serviços existentes. Não é lock global entre todas as telas/processos.

## 4. Video Studio — editor e inspector

`VideoStudioEditor.tsx` delega `captureVideoPoster` ao módulo `videoPoster.ts`; o fluxo continua usando `gacha-video://library/...`, capturando frame com canvas e timeout, sem mudança de exportação FFmpeg. O inspector de rosto/expressão/pose agora usa `src/renderer/src/characters/useStudioInspectorState.ts` (mesma lógica do Studio Principal, com shim de compatibilidade em `features/studio/useStudioInspectorState.ts`).

## 7. Performance — medições, não só linhas

`tests/runtime-performance-smoke.test.mjs` mede criação de PNG com `sharp`, leitura simultânea de quatro arquivos, hits de cache, tamanho de cache e consumo de heap, registrando métricas no log TAP da CI sem limites temporais frágeis. O workflow de Electron real inclui `timingsMs.firstProcessFlow` e `timingsMs.reopenedFlow` no `workspace-manifest.json` dos onze screenshots sintéticos, permitindo acompanhar degradação real no Windows. O audit estático em `performance-audit.cjs` teve budgets reduzidos para main, Customizador, Studio e Video Studio e acrescentou novos módulos ao inventário.

**Limites:** resultados de Node/sharp são benchmark sintético; não medem FPS ou pico real de memória do Chromium nem certificam qualidade visual. Os prints de Electron têm hashes/integridade automáticos; aprovação estética permanece humana.

## Portões do ciclo

- `npm run audit:architecture`
- `npm run test:refactor`, incluindo os três testes novos de transação, salvamento e geometria + performance
- `npm run typecheck`, `npm run build`
- Core Ubuntu/Windows, Quality Linux, Electron GUI Windows com `--with-workspaces`

Uma entrega só está verificada após sucesso no **HEAD atual**, não por CI de commits anteriores cancelada pela concorrência. PR permanece em draft até aprovação manual.
