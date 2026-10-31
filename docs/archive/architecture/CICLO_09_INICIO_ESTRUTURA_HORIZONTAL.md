# Ciclo 09 — início da estrutura horizontal do Native Gacha

Data: 2026-10-22.
Branch: `feature/model-source-editor`; PR #5 com base `refactor/shared-character-core`.
Esta primeira fatia **não representa o término dos quatro projetos arquiteturais**.
Nenhum merge na `main`; não reescrever dados legados nem alterar os BATs.

## 1. Renderização compartilhada

O Video Studio não faz mais oito imports dinâmicos de `features/customizer/CustomizerPage.tsx` para usar `renderArtwork`, `renderSavedCharacter` e `prepareSavedCharacterRenderer`: importa diretamente `src/renderer/src/characters/characterRenderer.ts`. `RenderedCharacterPortrait.tsx` também aponta para esse renderizador.

A lógica de `expressionTransforms.ts` foi promovida para `src/renderer/src/characters/studioExpressionTransforms.ts`. O antigo caminho de Studio é mantido como reexport para compatibilidade. Roteiros e Video Studio passam a usar o módulo compartilhado, sem criar dependências runtime novas entre features.

Próximo passo: separar carregamento de imagens, resolução dos assets e composição do renderizador de 1.129 linhas em etapas com oráculos de pixels/poses.

## 2. Domínio do Studio Principal no Electron

`electron/domains/studio/primaryIpc.ts` registra agora `studio:list`, `studio:save` e `studio:delete` com as mesmas assinaturas. O módulo recebe serviços injetados, autenticação do sender, telemetria e a fila de gravação original do `main.ts`. O Video Studio conserva seu registro e fluxo existentes.

`tests/studio-primary-ipc.test.mjs` cobre autorização, formato UUID, serialização, falha e retomada da fila.

Próximo passo: extrair as operações de diretório/asset, persistência de cenas e os demais canais do Studio, mantendo a separação dos serviços de exportação do Video Studio.

## 3. Editores React por funcionalidade

`src/renderer/src/features/roteiros/RoteirosPage.tsx` recebe o workspace até então embutido em `ui/App.tsx`; o shell passa a ter aproximadamente 50 linhas e carrega Roteiros com lazy route. Nenhum contrato de roteiro, conteúdo ou vídeo foi migrado. Extrações adicionais de hooks/ações do Roteiros, Customizador e Studio Principal permanecem para os próximos cortes.

`tests/cycle09-architecture.test.mjs` impede que roteamento volte a conter lógica da página ou que Video Studio/retratos voltem a importar `CustomizerPage` para renderizar. A auditoria de arquitetura passa a exigir `ui/App.tsx <= 100` linhas e `electron/main.ts <= 2900`.

## 4. Contrato de publicação persistente

`electron/domains/storage/atomicManifest.ts` implementa escrita de manifesto JSON em arquivo temporário no **mesmo diretório**, promoção por rename, retry de bloqueios transitórios do Windows e limpeza somente do temporário da operação. Mantém o manifesto anterior em caso de falha na promoção; não busca backups arbitrários nem faz migração.

O `writeStudio` no main e os catálogos de cabelo/rosto em `catalogPersistence.ts` consomem o helper. A publicação especial `wardrobe.json`, com backup legado, continua com seu protocolo anterior. Testes de falhas e simulação de bloqueio: `tests/atomic-json-manifest.test.mjs`.

Próximo passo: definir protocolos separados para snapshot, referência cruzada, delete e recuperação de cada domínio, incluindo crash com SQLite real e integração com `DataBackupService`.

## Critérios gerais de validação

`npm run audit:architecture`, `npm run test:refactor`, testes de geometria, `npm run typecheck`, `npm run build` em Ubuntu/Windows. Não declarar screenshot gráfico nem restauração real aprovados com base apenas nesses testes. Usar perfis sintéticos; nunca tocar na biblioteca pessoal.

O orçamento de imports entre features foi reduzido para os caminhos agora desacoplados, para que a arquitetura não regresse. A dependência runtime restante do Video Studio para o Customizador continua registrada com teto temporário de um import e exige revisão na próxima fatia.
