# Ciclo 10 — cinco prioridades de estruturação do Native Gacha

Data: 2026-10-22. Branch: `feature/model-source-editor`, PR #5 em draft sobre `refactor/shared-character-core`. **Nenhum merge em main.** BATs, caminhos de bibliotecas, perfis, JSONs e contratos IPC existentes preservados. Video Studio: sem mudança no motor de exportação.

Estas são **cinco extrações iniciais**; não representam a conclusão da modularização do produto.

## 1. Roteiros: editor de seção independente

`src/renderer/src/features/roteiros/RoteiroSectionEditor.tsx` foi extraído de `RoteirosPage.tsx`. Ele mantém os mesmos campos, biblioteca de vídeos, blocos, efeitos de edição e callbacks. A página de workspace continua coordenando roteiro, exportação e modais de projeto. O arquivo da página principal passou de aproximadamente 816 para 553 linhas, e seu editor de seção ficou com aproximadamente 273. Nenhum arquivo de roteiro existente foi transformado.

## 2. Studio/Video Studio: modelo puro de cena

`src/shared/studioSceneModel.ts` compartilha snapshots de Studio e Video Studio (mantendo a diferença do campo opcional `videoTimeline`), aplicação de snapshot, chave de cache de personagem e dimensionamento por escala. `StudioPage.tsx` e `VideoStudioEditor.tsx` passaram a importar estas funções sem duplicar sua implementação. A função de igualdade específica de timeline, canvas e lógica de exportação permanecem em seus locais anteriores.

Teste: `tests/cycle10-shared-scene-selection.test.mjs`.

## 3. Customizador: ciclo de vida de elenco

`features/customizer/useCustomizerCharacterRoster.ts` concentra os estados de coleção e seleção, referência da lista, fila por personagem, carregamento inicial via IPC e preferência de personagem ativo. `src/shared/customizerSelection.ts` fornece fallback puro por ID estável. A página continua responsável por comandos explícitos de recarga, edição e salvamento e não altera o formato `customizer/characters/characters.json`.

Teste: fallback, ID, ausência de mutações; verificação estática de que o efeito inicial migrou, sem proibir recargas explícitas.

## 4. Electron Main: índice de Studio e Video Studio modular

`electron/domains/studio/libraryIndex.ts` recebe filesystem e leitura de projeto injetados. Lista pastas `studio-UUID`, ordena cenas, gera resumos de card de Video Studio e preserva a migração *em leitura* de `studio-card.json` ausente. Os dados completos de vídeo não são carregados para listar cards. `electron/main.ts` delega essas operações sem alterar os caminhos.

Teste: `tests/cycle10-studio-library-index.test.mjs` com diretórios sintéticos, ordenação, arquivo inválido, geração de card legado, preservação de IDs e ausência de hidratação desnecessária.

## 5. IPC do Studio tipado ponta a ponta

`src/shared/studioIpcChannels.ts` define os oito canais públicos da API `StudioDesktopApi`, incluindo `app:flush-pending-writes`. `electron/preload.ts` usa `createStudioInvoker` com argumentos e retorno inferidos a partir do contrato; o domínio `primaryIpc.ts` consome o mesmo mapa, assim como o flush no main. Nomes legados permanecem idênticos.

Teste: `tests/cycle10-studio-ipc-and-editor-structure.test.mjs`, verificando as oito strings, unicidade e passagem dos argumentos, além da separação dos componentes React.

## Portas de qualidade

- `npm run audit:architecture`
- `npm run test:refactor`, incluindo as novas três suites de testes
- `npm run typecheck`
- `npm run build`
- Gates Linux e Windows nas ações GitHub.
- `performance-audit.cjs` agora mede também ambos os arquivos de Roteiros e reduz orçamento de crescimento de Customizador, Studio, Video Studio e Electron Main.

Os testes não substituem a revisão visual humana do Electron real nem operações com perfis pessoais. A recuperação multi-perfil e SQLite continua sendo um tema próprio de validação; não foi introduzida uma migração de banco.

## Próximos cortes

1. Reduzir o último acoplamento runtime entre features (Video Studio → Customizador).
2. Extrair o restante do estado de edição do Customizador para hooks por responsabilidade e testar comportamento GUI no Electron Windows.
3. Separar a persistência completa de cena e assets de `electron/main.ts` em repositório de Studio, incluindo escrita atômica de cards.
4. Reduzir a página Studio a controladores/componentes menores sem quebrar snapshots.
5. Consolidar testes de recuperação entre bancos, backups e refs cruzadas.

Manter as regras: Fabricador DEV é autor das bibliotecas; Customizador guarda diferenças por personagem; Studio guarda diferenças por cena. Nenhum módulo deve sobrescrever silenciosamente as fontes de outro.
