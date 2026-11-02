# Programa de Refatoração Geral do Native-gacha

Este documento acompanha a execução das Fases 1–6 e complementa a baseline da [Auditoria da Fase 0](./AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md). As decisões de arquitetura e os resultados das verificações ficam centralizados aqui para evitar relatórios paralelos.

## Regras de execução

- Branch exclusiva: `Dev-V2`. Trabalho local; sem push, PR, merge, rebase, troca de branch ou reset destrutivo.
- Preservar os dados existentes e manter estáveis `window.desktop`, canais IPC, IDs, formatos persistidos e propriedade dos dados por domínio.
- Usar fixtures sintéticas para testes de armazenamento e recuperação.
- Fazer commits locais pequenos, após verificações pertinentes, e atualizar este documento a cada fatia concluída.
- A Fase 0 é a baseline concluída. Fases amplas só serão marcadas como concluídas quando os contratos, verificações e revisão do diff estiverem fechados.

## Estado inicial confirmado

- Branch: `Dev-V2`.
- Commit-base inspecionado: `f416a02a7f9bd73a96282edf57fb00d57aaef83b`.
- Árvore de trabalho estava limpa antes da execução. A referência remota estava sincronizada.
- `npm run audit:architecture`: aprovado, sem imports locais ausentes ou violações de fronteira.
- `npm run typecheck`: falhava em `electron/main.ts:959–960`, por chamar `WebContents.getProcessMemoryInfo`, que não existe no contrato instalado do Electron.
- `npm run test:refactor` na baseline: 617 testes, 611 aprovados e 6 falhas existentes, descritas em “Falhas preexistentes”.
- Node local: `24.18.0`; workflows existentes fixam `22.22.0`. Não atualizar frameworks nem runtime como parte desta execução.

## Progresso por fase

| Fase | Escopo | Estado | Evidência/pendências |
| --- | --- | --- | --- |
| 0 | Auditoria e baseline arquitetural | Concluída antes deste programa | [Relatório da Fase 0](./AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md). |
| 1 | Electron, IPC, persistência, backups e filas | Concluída | Diagnóstico de memória corrigido; ciclo de encerramento extraído e coberto; diferenças das filas mapeadas; backup, manutenção e segurança de janela passaram. Os gatilhos gerais de CI de `Dev-V2` ficam na Fase 6. |
| 2 | Núcleo compartilhado de personagens | Concluída | Consumidores e regressões mapeados. Escala-base idêntica entre Studio e Editor V6 centralizada; renderizadores e contratos de exportação distintos mantidos. Testes de personagem/gênero/roupas articuladas executáveis por script dedicado. |
| 3 | Fabricador e Customizador | Em andamento | Fluxo de catálogo/customizações coberto de ponta a ponta; gravação de roupas, operações de cabelo, seleção de peça no Customizador, carregamento/hidratação de slot com guards de seleção obsoleta e validação de conjuntos salvos em Roupas DEV têm fronteiras/testes próprios. Restam mapear/decompor os workspaces maiores e ampliar cenários de reabertura. |
| 4 | Studio, Editor V6 e fluxos de vídeo | Em andamento | Criação/duplicação e impressão do Studio extraídas; miniatura 480×270 corrigida; paridade Turbo e exportação facial 720p/1080p aprovadas. A impressão foi validada do canvas ao handler IPC com fixture de arquivos sintética. A antiga tela Video Studio não tem rota, mas as bibliotecas legadas seguem ativas em Roteiros e como origem de mídia do Editor V6. Teste de cancelamento do worker cobre espera do compositor. Restam medições e validação comparativa dos workers de exportação. |
| 5 | Roteiros, Base de Vídeos, Opções, componentes e CSS | Em andamento | Biblioteca continua dona dos arquivos/IDs; Roteiros mantém metadados e referências. Guardas, canais, fila, carregamento, listagem, publicação, CRUD de categorias, importação e exclusões da Base de Vídeos têm contratos testados; estilos da Base de Vídeos e cálculos puros de Opções têm módulos por feature. Restam decomposição adicional dos workspaces e migração gradual do CSS com revisão visual. |
| 6 | Performance, CI e consolidação | Em andamento | Workflow da Dev-V2 roda gates gerais e Editor V6 por plataforma; build Windows é reutilizado pelos testes MP4. Baseline repetível do cenário médio do Editor V6 registrada e captura IPC passou a ser estruturada. Restam medições de inicialização, Studio, outros workspaces e exportação, além de comparações repetidas antes de otimizar. |

## Fatias implementadas

### Diagnóstico de memória do renderer

- **Causa:** o Main chamava `event.sender.getProcessMemoryInfo()`, ausente do tipo/runtime suportado em `WebContents` nesta versão do Electron.
- **Mudança:** usa `app.getAppMetrics()`, seleciona a métrica cujo PID corresponde a `event.sender.getOSProcessId()` e converte os campos documentados em KB para bytes uma única vez. Campo ausente, PID não encontrado ou memória indisponível resulta em `null`. `rendererSharedBytes` continua `null`, pois `MemoryInfo` não o fornece.
- **Contrato preservado:** `RuntimeDiagnosticsSnapshot`, nomes de campo e canal IPC permanecem iguais. A validação de sender do registrador de diagnósticos continua sendo executada antes da coleta.
- **Arquivos:** `electron/application/rendererMemorySnapshot.ts`, `electron/main.ts`, `tests/application/renderer-memory-snapshot.test.mjs`, script `test:refactor` em `package.json`.
- **Commit local:** `697dee891e787c02fce129375c421fee9dc97291` (`fix: map renderer diagnostics from app metrics`).
- **Verificações:** o teste focado passou (4/4); `npm run typecheck` passou; `npm run audit:architecture` passou (563 arquivos TS/TSX, sem violações); `git diff --check` passou. `npm run test:refactor` executou 621 testes: 615 passaram e as mesmas 6 falhas preexistentes permaneceram.

### Coordenador de encerramento e inventário de persistência

- **Fronteira extraída:** `createPersistenceShutdownHandler` em `electron/application/persistenceShutdown.ts` possui apenas estado e sequência do evento `before-quit`. O `main.ts` continua montando o inventário e injeta cancelamento/drenagem de exports, retomada após falha, recriação de janela, aviso, fechamento do catálogo e `app.quit()`.
- **Comportamento preservado:** cliques/reentradas durante uma drenagem são bloqueados sem iniciar outra; falha mantém o app aberto, retoma handlers que podem ser repetidos e recria janela se necessário; sucesso fecha o catálogo antes de chamar `quit`, cuja reentrada já pode encerrar o processo.
- **Semânticas de fila confirmadas; não consolidadas:**
  - `createKeyedOperationQueue` serializa operações da mesma chave e permite concorrência entre chaves. A falha é devolvida ao chamador; por padrão a fila continua sem manter a falha no inventário. Com `retainFailures: true`, a cauda rejeitada continua visível ao flush até uma operação subsequente da chave se resolver.
  - Roteiros usa uma única chave serial e retém falhas para o inventário principal. `waitForPendingWrites()` usa `Promise.allSettled`, portanto aguarda sem propagar o erro; o flush central lê a fila retida e transforma falhas em erro de flush.
  - `createPendingOperationTracker` acompanha somente operações de filesystem ainda ativas e as retira do inventário quando terminam, com ou sem sucesso. A Promise original continua entregando erro ao chamador. É adequado para operações curtas de arquivo, não substitui uma fila serial com falhas retidas.
  - Filas do renderer e do processo principal permanecem separadas; gravações do renderer são drenadas antes por flush explícito. Não são intercambiáveis só por compartilharem a ideia de “pendente”.
- **Testes/arquivos:** `tests/application/persistence-shutdown.test.mjs` cobre drenagem, evento duplicado, reentrada bem-sucedida e nova tentativa após falha. `tests/keyed-operation-queue.test.mjs`, `tests/roteiros-write-queue.test.mjs`, `tests/media-library-pending-inventory.test.mjs` e `tests/pending-persistence-inventory.test.mjs` registram as políticas já existentes. Script local: `npm run test:application:persistence-shutdown`.
- **Verificações da fatia:** coordenação/persistência 10/10; backup e manutenção 7/7; segurança da janela 4/4; typecheck passou; auditoria arquitetural passou (564 arquivos TS/TSX); build de produção passou; seis falhas conhecidas de `test:refactor` continuam sem mudança.
- **Sem mudança de dados:** nenhuma fila foi consolidada, formato persistido foi alterado ou arquivo de usuário foi usado como fixture.

### Geometria comum de escala-base de personagens

- **Evidência:** `fitStudioCharacterToStage` e `fitEditorV6CharacterToStage` continham a mesma fórmula, os mesmos limites e os mesmos campos de saída. Studio e Editor V6 continuam usando wrappers próprios nos pontos de chamada e mantêm seus contratos atuais.
- **Mudança:** a regra idêntica foi movida para `src/shared/characterStageGeometry.ts`; `studioCharacterGeometry.ts` e `editorV6CharacterGeometry.ts` reexportam os tipos anteriores e delegam sem transformação. A geometria facial/crops e os renderizadores de exportação continuam independentes.
- **Consumidores mapeados:** Studio (seleção e posicionamento do elenco), Editor V6 (inserção na timeline), Customizador (renderer compartilhado e adaptação do tronco por gênero), Roteiros (renderer compartilhado) e Editor V6 exportação/motion (renderer específico do Editor V6). O Fabricador segue dono do catálogo e das fontes; nenhum dado de personagem foi copiado ou persistido nesta alteração.
- **Teste:** `tests/shared-character-stage-geometry.test.mjs` compara os dois wrappers com a regra central para pose neutra, pose articulada e dimensões inválidas. O loader legado de `tests/studio-character-geometry.test.cjs` agora resolve dependências TypeScript para manter sua execução CommonJS.
- **Verificações:** `npm run test:geometry` 5/5; `npm run test:character-flow` 2/2; testes Studio e geometria facial 9/9; `npm run test:editor-v6` 220 aprovados e 1 ignorado (mais 3 testes sintéticos de stress); typecheck, audit arquitetural (565 arquivos TS/TSX) e build passaram. `npm run test:refactor`: 615 aprovados e 6 falhas preexistentes, sem novas falhas.
- **Limite desta fatia:** proporções corporais, adaptações de tronco masculino, roupas articuladas, cabelo, rosto, expressões, piscadas, poses e espelhamento continuam com regras próprias até que o mapeamento demonstre igualdade de contrato e fixtures específicos cubram preview e exportação.

### Matriz de contratos compartilhados e regressões

| Comportamento | Regra/dono e consumidores | Evidência de teste |
| --- | --- | --- |
| Gênero e tronco masculino independente | Fabricador persiste `maleTorso` como cópia própria; Customizador escolhe gender por personagem e troca somente o artwork em memória; roupas DEV usam a referência por conjunto. | `npm run test:character-contracts` cobre torso masculino, fallback legado feminino e preview por gênero (15/15 no conjunto). |
| Proporções | `src/shared/bodyShape.ts` aplica dimensões da instância sem escrever no catálogo; Editor V6 atualiza snapshots de personagem por seu próprio contrato. | `test:geometry` cobre defaults e overrides por personagem; `test:editor-v6` cobre refresh de snapshot e geometria. |
| Roupas articuladas e juntas | Fabricador monta/calibra juntas e separa roupa no espaço da junta; Animator resolve camadas; renderizadores de Customizador e Editor V6 consomem roupas por IDs e peças anexadas. | `test:character-contracts` cobre assembly/cortes de junta; `test:fabricator:visual` e o golden de personagem passaram no conjunto `test:refactor`. |
| Cabelo, rosto e expressão | Renderizador compartilhado compõe camadas estáticas para preview; catálogos faciais e expressões mantêm identidade/transformações por domínio. | `animator-head-overlays` e `fabricator-complete-character-golden` passaram; os cenários de catálogo permanecem no conjunto de contratos. |
| Piscar e fala | Agendamento e combinação de boca/piscada são regras específicas de timeline e export do Editor V6; o renderer do Editor V6 fica separado do compositor de preview. | `npm run test:editor-v6` passou com 220 testes e 1 skip, incluindo agenda facial, olhos fechados, fala e motion. |
| Poses e espelhamento | Fabricador é dono do rig/pose e IDs de peça; Studio e Editor V6 conservam posição do ator e usam snapshots próprios. | `fabricator-visual-geometry`, `wardrobe-joint-assembly`, `studio-character-geometry` e a suíte de motion cobrem transformação, rotação, flip e poses. |

O módulo `editorV6CharacterRenderer.ts` continua separado de `characterRenderer.ts`: o primeiro mantém material cacheado, buffers e descarte próprios para motion/export; o segundo atende o compositor reutilizável de preview. O mapeamento não demonstrou contratos iguais para fundi-los.

O Node test runner não resolvia imports relativos extensionless `.ts` usados por contratos existentes. `scripts/testing/resolve-typescript-extensions.mjs` e `register-typescript-extensions.mjs` são exclusivos de testes e agora também emulam imports JSON sem atributos, como o Vite já permite. Os imports de produto permanecem inalterados.

### Primeira fronteira de comando no Fabricador e continuidade do catálogo

- **Gravação de roupas:** `saveWardrobeSetDraft` em `src/renderer/src/features/fabricator/wardrobe/saveWardrobeSetDraft.ts` passou a coordenar a serialização, extração dos PNGs atuais e do backup de deformação, chamada de persistência, notificação de assets e atualização do catálogo. `WardrobeWorkspace` permanece responsável pelo estado visual e feedback de salvamento.
- **Contrato preservado:** o comando não muda IDs, schema, campos persistidos ou canal IPC. `renderAboveHair` continua verdadeiro somente para óculos/acessórios de cabeça explicitamente configurados; todos os PNGs continuam sendo enviados por ID, separados dos metadados.
- **Código morto removido:** o hook de deformação mantinha um `Set` de imagens sujas sem nenhum leitor; a persistência já usa os assets presentes no rascunho do conjunto. Removemos o rastreador e suas duas funções não utilizadas. A invalidação do cache continua por ID quando uma imagem é substituída.
- **Continuidade real:** `tests/character-production-flow.test.mjs` agora altera e salva o catálogo usando `createFabricatorModelWriter`, reabre o modelo pelo catálogo e verifica que as personalizações salvas de duas personagens continuam idênticas no repositório do Customizador. Também confirma que salvar personalizações não altera o manifesto-fonte.
- **Testes do comando:** `tests/wardrobe-save-command.test.mjs` cobre payload sem PNGs embutidos, imagens atuais e backup, campos de gênero/modelo, atualização da lista e falha de gravação sem notificação prematura. Incluído em `test:refactor` por `test:fabricator:wardrobe-save`.
- **Testes ajustados à implementação:** os checks de composição e deformação verificam a estrutura real (um pivô por peça e cache invalidado por componente), sem exigir sintaxe antiga. O fixture de importação facial injeta `notifyAssetsUpdated`, dependência obrigatória do comando. O teste de prévia verifica a identidade do objeto quando o artwork não muda; o código preserva essa referência.
- **Verificações:** `npm run test:refactor` passou, incluindo os 2 novos testes do comando; `npm run typecheck`, `npm run audit:architecture` (566 arquivos TS/TSX, sem violações) e `npm run build` passaram.
- **Próxima etapa da Fase 3:** inventariar os maiores componentes Fabricador/Customizador e extrair outras fronteiras de estado/comando somente quando a propriedade do dado e os efeitos de persistência estiverem claros.

### Sincronização da peça selecionada no Customizador

- **Fronteira extraída:** `CustomizerPage` continua dona da seleção interativa; o hook `useCustomizerClothingSelection` sincroniza essa seleção com personagem, categoria e catálogo carregado. O modelo puro resolve a peça padrão e a reconciliação da aba Ajustar sem importar React, Electron ou persistência.
- **Semânticas preservadas:** reset ao trocar de personagem, escolha do primeiro grupo quando não há seleção, prioridade do `componentId` persistido, fallback de grupos legados por categoria, seleção restrita à categoria Ajustar e retenção de IDs explícitos enquanto os detalhes do conjunto carregam. A ordem dos efeitos permanece a mesma da página.
- **Propriedade dos dados:** apenas lê grupos de roupa pertencentes à personalização do personagem e detalhes do catálogo do Fabricador; não escreve no catálogo nem altera JSON persistido, IDs ou vínculos.
- **Verificações:** sete testes sintéticos cobrem a resolução de seleção e a delegação da página; `npm run test:refactor`, typecheck, audit arquitetural (575 arquivos TS/TSX) e build passaram.
- **Commit local:** `ca6ae76` (`refactor: isolate customizer clothing selection`).
- **Pendências:** esta extração reduz a lógica de sincronização na página; outras seções do Customizador e os workspaces maiores do Fabricador ainda precisam de fronteiras individuais e cobertura de reabertura.

### Comandos de projeto do Studio

- **Fronteira extraída:** `createStudioProjectCommands` em `src/renderer/src/features/studio/studioProjectCommands.ts` agora é dono da criação e duplicação de cenas. A página mantém seleção, lista e estado visual; o comando injeta ID, relógio, persistência e callbacks da interface.
- **Vínculos ao duplicar:** cada asset e elemento recebe ID novo; `backgroundAssetId` e `element.assetId` são remapeados para os assets duplicados antes da escrita. A lista só é atualizada depois de `writeDocument` concluir.
- **Engines mantidas separadas:** Editor V6 conserva `editorV6ProjectCreation.ts`, os documentos com timeline e os fluxos próprios de áudio/mídia/exportação. A extração do Studio não compartilha builders nem altera os formatos de projeto.
- **Verificações:** `test:studio:project-commands` passou 3/3; persistência/histórico/asset transaction do Studio passou 26/26; `npm run test:refactor` passou; `npm run test:editor-v6` passou com 220 testes e 1 skip; typecheck, audit arquitetural (567 arquivos TS/TSX) e build passaram.
- **Pendências:** validar ponta a ponta a impressão/exportação do Studio, revisar jobs/workers e o fluxo de áudio/vídeo do Editor V6, além de conferir dados legados sem reativar a antiga interface Video Studio.

### Fidelidade do fundo na miniatura do Studio

- **Causa comprovada:** `makeCanvasPrint` escala o contexto para a resolução de saída, mas o preenchimento do fundo usava `canvas.width`/`canvas.height` como coordenadas lógicas depois da escala. Na miniatura de 480 × 270, isso pintava somente uma área de 120 × 67,5 pixels no bitmap final.
- **Correção:** o retângulo de fundo agora usa a área lógica fixa de 1920 × 1080 sob a escala de saída, a mesma referência usada pelos elementos. A impressão de 1920 × 1080 preserva sua geometria e as miniaturas de 480 × 270 cobrem o canvas por inteiro.
- **Contrato preservado:** não muda estrutura do documento, autosave, resolução das impressões, resolução das miniaturas ou composição de elementos; corrige o preenchimento do fundo que ficava incompleto na miniatura.
- **Verificações:** o novo teste sintético reproduziu a falha antes da correção e passou depois; `tests/serialized-studio-save.test.mjs` 7/7, `npm run test:refactor`, typecheck, audit arquitetural (573 arquivos TS/TSX) e build passaram.
- **Commit local:** `b69685c` (`fix: cover Studio thumbnail after canvas scaling`).
- **Pendências:** ainda falta uma captura visual ponta a ponta do botão Print, salvamento da imagem e abertura da pasta materializada; essa correção cobre a geração das miniaturas de autosave.

### Paridade real de MP4 e exportação facial do Editor V6

- **Dados protegidos:** os caminhos de saída do usuário já continham relatórios/fixtures. Os scripts de paridade agora reconhecem `NATIVE_GACHA_TEST_OUTPUT_DIR`; sem variável, mantêm `out/` como antes (incluindo os paths que o CI arquiva); com override, resultados e fixture sintético de boca vão para a pasta solicitada.
- **Contrato:** `check-overlay-parity.cjs`, `check-face-export.cjs` e `check-motion.cjs` usam o mesmo resolvedor para os resultados; o HTML/preload compilado segue em `out/renderer` e `out/preload`. Um teste unitário comprova o default compatível e o override.
- **Verificações reais em Windows:** `npm run test:editor-v6` passou com 220 testes e 1 skip. `test:editor-v6:export-overlay` passou com 60 frames e 2 partes Turbo. `test:editor-v6:face-export-silent` passou; os clipes 720p/1080p foram gerados e validados (143.370 e 353.076 bytes nos fixtures desta execução). A composição reportou zero pixels divergentes nos cinco fundos, invalidação por revisão de asset aprovada e landmarks faciais dentro do limiar.
- **Diretório:** os artefatos reais foram gravados em uma pasta única criada dentro do diretório temporário do sistema, não em `out/` já existente. O Electron emitiu uma mensagem de estado de GPU na saída do processo; os dois relatórios registram `passed: true` e os comandos saíram com código 0.
- **Verificações do resolvedor:** `test:editor-v6:stress-profile` passou 5/5, incluindo os dois casos de diretório; sintaxe dos três scripts e `git diff --check` passaram.
- **Commit local:** `da90c8d` (`test: isolate Editor V6 export artifacts`).
- **Pendências:** a paridade real reduz incerteza de exportação facial e Turbo; continua faltando medir comparação de performance inicial/depois e revisar as capturas/exportações do Studio.

### Worker de exportação e propriedade das bibliotecas legadas de vídeo

- **Mapa de rotas e consumidores:** `src/renderer/src/ui/App.tsx` registra `/editor-v6`, sem rota antiga do Video Studio. As bibliotecas `video-studio.media` e `video-studio.backgrounds` continuam necessárias: Roteiros lista/importa/exclui fundos pela API `videoBackgrounds`; o Main resolve mídia para Roteiros e para links da biblioteca usados no Editor V6. Caminhos, IDs e migrações permanecem protegidos; não restaurar a interface antiga nem remover esses serviços.
- **Worker offscreen:** a exportação aguarda a pintura do compositor antes de capturar cada frame. Uma regressão sintética agora cancela durante essa espera e confirma que a janela fecha, os listeners são limpos e `capturePage` não recebe um frame obsoleto.
- **Contrato preservado:** somente cobertura de teste; sem mudança de formato de projeto, caminhos de mídia, canais IPC ou ciclo normal de exportação.
- **Verificações:** `npm run test:editor-v6` passou com 221 testes e 1 skip; `npm test` passou com 29 testes incluindo armazenamento e biblioteca legada de vídeo; `npm run test:refactor` passou.
- **Commit local:** `e5b5ff9` (`test: cover cancelled Editor V6 frame capture`).
- **Pendências:** validar a impressão ponta a ponta do Studio e medir duração/memória de exportação; a interface e a paridade já verificadas não substituem essas medições.

### Ciclo de vida do worker de cabelo do Fabricador

- **Fronteira extraída:** `hairProcessorClient.ts` é dono do protocolo renderer ↔ worker para recorte de pares e grades de três estilos. `HairWorkspace` continua dona do estado de importação, revisão, prévia e persistência dos conjuntos.
- **Falhas e recursos:** o cliente valida o layout da resposta e encerra o worker em sucesso, erro retornado, erro do Worker, layout inesperado e exceção ao enviar a mensagem. Uma resposta tardia depois do encerramento não altera a Promise.
- **Contrato preservado:** URL do worker, `type: 'module'`, campos enviados (`dataUrl`, tolerância, modo, layout, padding e divisões da grade) e mensagens de erro existentes permanecem iguais. A função recebe factory opcional somente para testes; o produto continua criando o mesmo Worker nativo.
- **Testes:** `tests/hair-processor-client.test.mjs` cobre o envio, resposta válida, erros e encerramento do recurso; `hair-import-grid.test.mjs` cobre importação e geometria dos cortes; `fabricator-hair-storage.test.mjs` verifica persistência dos PNGs e estilos sem alterar legado.
- **Verificações:** cliente 3/3; grade/importação 12/12; armazenamento 2/2; `npm run test:refactor`, typecheck, audit arquitetural (570 arquivos TS/TSX) e build passaram.
- **Commit local:** `1641353` (`refactor: isolate Fabricator hair worker client`).
- **Pendências:** estado, carregamentos e comandos editoriais continuam concentrados no workspace; não foi alterado formato de estilo, PNG ou catálogo.

### Comando de salvamento de conjuntos de cabelo

- **Fronteira extraída:** `saveHairStyleDraft` em `hairStyleSaveCommand.ts` é responsável por gerar o payload de `HairStyleSave`, separar PNGs atuais, fontes e originais de deformação do metadado, normalizar transformações e persistir. `HairWorkspace` fica com feedback e atualizações da sessão/catalogação.
- **Contrato mantido:** IDs existentes continuam iguais; novos IDs e timestamps seguem gerados no renderer; `createdAt` permanece estável ao editar; nome, categorias, defaults de chroma, transforms e referência de origem usam as mesmas regras; o IPC continua recebendo metadados e assets em argumentos separados. A ausência de PNG original de uma deformação bloqueia a gravação antes do IPC.
- **Teste:** `hair-style-save-command.test.mjs` cobre edição/novo ID, metadata-versus-binary, original de deformação ausente e falha de persistência sem retorno de sucesso.
- **Verificações:** teste focado 4/4; cliente do worker 3/3; armazenamento capilar 2/2; importação/grade 12/12; `npm run test:refactor`, typecheck, audit arquitetural (571 arquivos TS/TSX) e build passaram.
- **Commit local:** `add2123` (`refactor: isolate Fabricator hair style saving`).
- **Pendências:** outros carregamentos e comandos de `HairWorkspace` continuam no componente; não houve mudança de schema ou formato salvo.

### Carregamento da sessão de Roupas DEV

- **Fronteira extraída:** `loadWardrobeWorkspaceSnapshot` lê slots do Fabricador, o modelo-fonte do slot e a listagem detalhada de conjuntos em paralelo. Se o slot solicitado estiver vazio, retorna o redirecionamento para o primeiro slot preenchido; caso exista modelo, tenta recuperar sua referência original a partir do histórico disponível.
- **Concorrência e fallback:** `WardrobeWorkspace` mantém a limpeza/estado visual e valida `requestId` antes de aplicar a resposta, inclusive após as operações assíncronas. Histórico ausente ou falha ao lê-lo mantém a referência de calibração; falhas nas leituras principais continuam indo para o tratamento de erro da página.
- **Propriedade e compatibilidade:** a recuperação é somente para a sessão de calibração da roupa; não publica edição no catálogo-fonte. APIs existentes, slot, IDs dos conjuntos e contrato persistido não mudaram.
- **Testes sintéticos:** cinco cenários cobrem leituras paralelas, recuperação, redirecionamento, histórico ausente/erro, falha principal e proteção da página contra respostas obsoletas.
- **Verificações:** teste focado 5/5; `npm run test:refactor` passou com 641 testes no conjunto principal e todos os scripts encadeados; typecheck, audit arquitetural (582 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `26fbd39` (`refactor: isolate wardrobe workspace loading`).
- **Pendências:** `WardrobeWorkspace` segue entre os maiores componentes da interface; estado de edição, importação e interação do canvas precisam de fronteiras próprias sem fundir propriedades do Fabricador e do Customizador.

### Validação ao abrir um conjunto de Roupas DEV

- **Fronteira extraída:** `loadWardrobeSetForEditing` carrega o conjunto salvo e compara cada `attachedPartId` e `binding.boneId` com os ossos da referência original e do modelo atual. Incompatibilidades são devolvidas para aviso da página; os metadados carregados não são corrigidos automaticamente.
- **Falha e concorrência:** conjunto removido após a listagem mantém a mensagem de domínio existente. O guard `requestId` continua impedindo a ativação de uma resposta obsoleta, e erros continuam no feedback já existente.
- **Propriedade e compatibilidade:** o loader só lê o conjunto do catálogo do Fabricador; não converte, publica ou salva as peças. O Customizador e outros consumidores seguem recebendo os mesmos IDs e vínculos.
- **Testes sintéticos:** cinco cenários cobrem compatibilidade válida, osso ausente, binding divergente, conjunto removido e integração do guard da página.
- **Verificações:** teste focado 5/5; `npm run test:refactor` passou com 641 testes no conjunto principal e todos os scripts encadeados; typecheck, audit arquitetural (583 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `fc8d74a` (`refactor: isolate wardrobe set compatibility checks`).
- **Pendências:** estado de edição, importação e canvas do `WardrobeWorkspace` continuam na página e exigem testes específicos de geometria e persistência antes de extrações maiores.

### Proteção de referências de mídia dos Roteiros e escopo do CSS de Opções

- **Propriedade preservada:** a biblioteca de mídia segue responsável pelos arquivos e IDs de fundos e GIFs; Roteiros continua responsável pelas referências. Os serviços de exclusão chamam os guards SQLite antes de excluir e bloqueiam a operação quando o catálogo não está disponível.
- **Regressões sintéticas:** `tests/roteiros-asset-reference-guards.test.mjs` cobre bloqueio de fundo referenciado, bloqueio de GIF referenciado, exclusão após remover a referência e falha segura quando o catálogo não inicializou. Usa `DatabaseSync(':memory:')`; nenhum dado do perfil ou arquivo de usuário é usado.
- **Compatibilidade do teste:** `RoteirosRepository` passou de parâmetro-propriedade TypeScript para campo explícito, mantendo a mesma API/runtime e permitindo o import direto com `node --experimental-strip-types` usado pelos testes.
- **CSS de Opções:** as regras do bloco `Options / local diagnostics` foram movidas de `src/renderer/src/ui/styles.css` para `src/renderer/src/features/options/options.css`, carregadas pelo próprio `OptionsPage`. Comparação do conteúdo contra `HEAD` confirmou as 124 linhas originais idênticas; a alteração organiza propriedade sem redesign ou ajuste de declarações.
- **Verificações:** `test:roteiros:asset-references` 3/3; `npm run test:roteiros` 16/16; `npm run test:base-videos` 7/7; `npm run test:refactor`, `npm run typecheck`, `npm run audit:architecture` (567 arquivos TS/TSX) e `npm run build` passaram; `git diff --check` passou.
- **Commit local:** `497079f` (`refactor: scope Options styles and test roteiro media guards`).
- **Pendências:** decompor os workspaces de Roteiros/Base de Vídeos/Opções onde houver fronteiras reais de sessão/comando; continuar movendo CSS por feature com verificação de equivalência. Nenhuma mudança de schema ou formato persistido.

### Modelo puro de diagnósticos da tela Opções

- **Fronteira extraída:** `optionsDiagnostics.ts` concentra formatação de bytes/datas, rótulos de armazenamento e migração, soma de uso local e geração de alertas. `OptionsPage.tsx` continua dona do estado da tela, efeitos e chamadas `window.desktop`; a persistência e os canais IPC não mudaram.
- **Contrato preservado:** os textos, ordem e níveis dos alertas, cálculo de bytes e locale `pt-BR` foram movidos sem alteração de comportamento. CSS e markup da tela não foram alterados nesta fatia.
- **Testes:** `tests/options-diagnostics.test.mjs` cobre formatação, soma de armazenamento, estado de erro, itens ilegíveis/não referenciados, migração pendente, estado saudável e ausência de medição. Os testes usam objetos sintéticos.
- **Verificações:** teste focado 5/5; `npm run test:refactor` passou com 631 testes na suíte principal e os scripts encadeados; `npm run typecheck`, `npm run audit:architecture` (568 arquivos TS/TSX) e `npm run build` passaram.
- **Commit local:** `6735283` (`refactor: extract Options diagnostics model`).
- **Pendências:** o estado e a orquestração assíncrona de Opções permanecem na página; qualquer extração futura deverá preservar assinaturas IPC, cancelamento/estado de progresso da migração e sequência das operações de backup.

### Contrato de canais IPC da Base de Vídeos

- **Contrato centralizado:** `src/shared/baseVideosIpcChannels.ts` mapeia, com verificação TypeScript de cobertura, cada método de `BaseVideosDesktopApi` para sua string IPC legada e fornece invoker tipado para o preload.
- **Uso em ambas as bordas:** `electron/preload.ts` e `electron/domains/baseVideos/ipc.ts` usam o mesmo mapa. A ordem dos argumentos e resultados permanece igual; cada handler Main ainda verifica o sender antes de chamar o serviço.
- **Teste:** a suíte de Base de Vídeos confere os nove canais e argumentos do invoker, além de testar validação, categorias, metadados, publicação e bloqueios de exclusão de mídia referenciada.
- **Verificações:** `npm run test:base-videos` passou 8/8; typecheck, audit arquitetural (569 arquivos TS/TSX) e build passaram.
- **Commit local:** `e338db9` (`refactor: centralize Base de Vídeos IPC contract`).
- **Pendências:** Roteiros e as demais APIs não tipadas no preload seguem separadas nesta fase; não houve rename de canal nem mudança de comportamento de exclusão.

### Fila de gravação de metadados da Base de Vídeos

- **Fronteira extraída:** `baseVideoDetailsSaveQueue.ts` é dona dos mapas por vídeo, debounce, coalescência da última edição, serialização por ID, flush individual e flush do ciclo de vida. `BaseVideosPage` mantém a edição imediata do estado visual e injeta persistência, feedback e timers.
- **Semânticas preservadas:** atraso de 350 ms; uma gravação em voo por vídeo; edição que chega durante uma gravação é gravada logo depois; flush drena as gravações e falha se uma persistência falhar; a edição com falha permanece pendente para retry; mudança de categoria e exclusão continuam flushando antes de alterar referências.
- **Propriedade dos dados:** a fila só transporta `BaseVideoDetails` para `window.desktop.baseVideos.saveDetails`; Biblioteca de Mídia continua dona dos arquivos e IDs, e Base de Vídeos dos metadados. Não consolida a fila com as cadeias de Roteiros, Studio, Editor V6 ou Fabricador.
- **Testes:** `base-video-details-save-queue.test.mjs` usa timers e persistência sintéticos para cobrir debounce, serialização, edição durante in-flight, flush de encerramento, falha e retry. O teste estrutural de pendências confirma que a página delega à fila e continua registrada no flusher global.
- **Verificações:** fila 4/4; testes de pendências 14/14; Base de Vídeos 8/8; `npm run test:refactor`, typecheck, audit arquitetural (572 arquivos TS/TSX) e build passaram.
- **Commit local:** `1d6e938` (`refactor: isolate Base de Vídeos detail save queue`).
- **Pendências:** o restante dos comandos editoriais de Base de Vídeos permanece na página; criação/edição de categoria ainda exige revisão própria antes de extração.

### Comando de exclusão de categoria da Base de Vídeos

- **Fronteira extraída:** `deleteBaseVideoCategory` identifica os vídeos vinculados, drena sequencialmente suas gravações pendentes, apaga a categoria pelo serviço existente e só então limpa as atribuições na sessão da página. A UI continua dona do estado de busy/erro e da lista de categorias.
- **Falhas e compatibilidade:** uma falha no flush impede a exclusão; uma falha no serviço impede a limpeza em memória. A sequência e a ordem estável que já existiam na página foram preservadas. Não mudaram canal IPC, IDs, formato salvo, ownership de arquivos ou regras de exclusão da biblioteca.
- **Testes sintéticos:** quatro cenários cobrem caminho de sucesso, erro no flush, erro ao excluir e delegação da página ao comando. `npm run test:base-videos` também cobre categorias, metadados, publicação, validação IPC e bloqueios de mídia referenciada.
- **Verificações:** teste focado 4/4; `npm run test:base-videos` 8/8; `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; typecheck, audit arquitetural (576 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `c81a7b9` (`refactor: isolate Base Videos category deletion`).
- **Pendências:** criação/edição de categoria ainda não foram extraídas; esses fluxos requerem preservar sua semântica transacional antes de mudar de fronteira.

### Modelo de busca, filtro e ordenação da Base de Vídeos

- **Fronteira extraída:** `baseVideoListModel.ts` aplica busca nos campos existentes, separação entre publicados/rascunhos, filtro de linha temporal e os quatro modos de ordenação. `BaseVideosPage` mantém os controles React e memoriza o resultado chamando o modelo puro.
- **Semântica preservada:** locale `pt-BR`, trim e caixa da busca, consultas a nome/ID/número/descrição/contexto, número zero como publicado, rascunhos por data mais recente, duração nula como zero e ordem de publicação numérica. A função não altera a lista recebida.
- **Testes sintéticos:** sete cenários cobrem filtros, campos buscáveis, ordenações, metadados ausentes, não mutação e delegação da página.
- **Verificações:** teste focado 7/7; `npm run test:refactor` passou com 641 testes no conjunto principal e os scripts encadeados; `npm run test:base-videos` 8/8; typecheck, audit arquitetural (577 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `4d2df05` (`refactor: extract Base Videos list model`).
- **Pendências:** a criação/edição de categoria e importação seguem na página; preservar operações parciais e compensações ao extrair esses fluxos.

### Comando de publicação de rascunho da Base de Vídeos

- **Fronteira extraída:** `publishBaseVideoDraft` drena a gravação pendente do vídeo antes de chamar o `publish` já existente. `BaseVideosPage` mantém o estado de busy/erro, publica o número retornado nos detalhes em memória e troca para a lista principal apenas após sucesso.
- **Falhas e propriedade:** falha no flush impede a publicação; erro do serviço é propagado ao mesmo tratamento existente da página. O comando não aloca números, toca metadados persistidos, modifica a biblioteca ou altera o contrato IPC; a numeração segue pertencendo ao serviço de Base de Vídeos.
- **Testes sintéticos:** quatro cenários cobrem ordem, retorno do número, flush com falha, falha do serviço e delegação/atualização da página.
- **Verificações:** teste focado 4/4; `npm run test:refactor` passou com 641 testes no conjunto principal e os scripts encadeados; typecheck, audit arquitetural (578 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `c83f270` (`refactor: isolate Base Videos draft publishing`).
- **Pendências:** a criação/edição de categoria e importação permanecem na página; investigar seus caminhos de falha e compensação antes de novas extrações.

### Comando de exclusão sequencial de vídeos da Base

- **Fronteira extraída:** `deleteBaseVideosSequentially` processa os IDs selecionados na ordem recebida, aguarda o flush de cada vídeo e depois chama a exclusão do serviço já existente. O callback de conclusão só recebe um ID depois que a exclusão desse vídeo terminou.
- **Falhas parciais:** flush ou exclusão com erro interrompe a sequência e propaga a falha. A página mantém no array somente os IDs concluídos, atualiza itens/metadados removidos e retira apenas esses IDs da seleção, preservando o retry do restante.
- **Contrato e propriedade:** serviço `baseVideos.deleteVideo`, validação de referências à biblioteca e ownership dos arquivos não mudaram; o comando apenas coordena flush e chamadas em série.
- **Testes sintéticos:** quatro cenários cobrem ordem, sucesso, falha de flush, falha na exclusão e integração da página com a seleção parcial.
- **Verificações:** teste focado 4/4; `npm run test:refactor` passou com 641 testes no conjunto principal e todos os scripts encadeados; typecheck, audit arquitetural (579 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `3e4e7b8` (`refactor: isolate Base Videos batch deletion`).
- **Pendências:** criação/edição de categoria e importação ainda concentram suas compensações e atualizações de sessão na página.

### Carregamento de snapshot da Base de Vídeos

- **Fronteira extraída:** `loadBaseVideosSnapshot` consulta em paralelo a Biblioteca de Mídia, os detalhes da Base e as categorias, associa metadados pelo ID do vídeo e preenche detalhes padrão para itens sem registro. O mesmo loader é usado na abertura e no recarregamento.
- **Semântica preservada:** itens sem mídia são omitidos do mapa visual; mídia sem metadados recebe os mesmos valores vazios de antes; IDs e objetos persistidos continuam intactos. O efeito inicial mantém seu cancelamento de atualização após unmount; a página mantém feedback, estado carregado e retry.
- **Testes sintéticos:** três testes cobrem chamadas paralelas, junção/fallback por ID, propagação de erro sem snapshot parcial e delegação tanto da abertura quanto do retry.
- **Verificações:** teste focado 3/3; `npm run test:refactor` passou com 641 testes no conjunto principal e todos os scripts encadeados; typecheck, audit arquitetural (581 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `8cbee7f` (`refactor: centralize Base Videos snapshot loading`).
- **Pendências:** operações de categoria e importação continuam na página; outros estados de loading e sincronização externa ainda precisam revisão feature por feature.

### Gates gerais de CI na Dev-V2 e reutilização do bundle

- **Gates gerais:** o workflow `editor-v6-parity.yml` passa a rodar `audit:architecture`, `test:refactor`, `test:geometry` e `typecheck` em um job Ubuntu para cada push ou PR da Dev-V2. Os testes de timeline/export do Editor V6 continuam em Linux e Windows.
- **Build sem repetição:** o job Windows da matriz faz o único build do workflow e publica por um dia os diretórios `out/main`, `out/preload` e `out/renderer`. O job de paridade MP4 depende da matriz e baixa esse bundle; não executa outro build. A seleção exclui todo o restante de `out/`, que localmente continha saídas de outras ferramentas/testes e não deve ser transportado como artifact.
- **Compatibilidade do export:** o artifact inclui `out/renderer/editor-v6-export.html`, os assets renderer e o preload usados pelos testes offscreen. O teste facial gera no próprio job o fixture de motion em `out/editor-v6-motion-check`; não precisa de dados locais transferidos.
- **Validação:** YAML carregado e estrutura do workflow conferida com `js-yaml` e assertions locais (gates, matriz, dependência, nomes/paths do artifact e ausência de build duplicado). `npm run test:refactor`, `npm run test:geometry` (5/5), `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram localmente.
- **Limite da verificação:** não houve execução hospedada do GitHub Actions nesta alteração; o upload/download de artifact depende da próxima execução na Dev-V2.
- **Commit local:** `2c3d5a3` (`ci: add Dev-V2 general gates and reuse export bundle`).
- **Pendências:** ampliar medições repetíveis para inicialização, Studio, outros workspaces e duração/uso de memória em exportações; revisar os gates para cobertura dos fluxos restantes sem duplicar trabalho.

### Baseline atual de performance e captura IPC estruturada

- **Escopo e ambiente:** baseline local, depois das fatias já executadas até `7b90bcc`, em Windows com Electron 45.1.0/Chromium 156.0.8078.49, viewport 1430 × 868, 12 processadores lógicos e `deviceMemory` reportada como 16 GB. O Editor V6 abriu um projeto sintético isolado com 4 personagens, 284 blocos, 7 tracks e 24 assets; reprodução medida por 30 segundos.
- **Timeline:** 74,9 callbacks RAF/s; 30,03 atualizações DOM/s e 29,96 avanços lógicos/s. Intervalos medidos dos frames: p50 13,3 ms, p95 13,6 ms, p99 13,7 ms, pior 14 ms; nenhum acima de 33 ms ou 50 ms; zero lacunas lógicas e zero lacunas de atualização do DOM. A captura confirma cadência e estado após commit, não que cada frame tenha sido fisicamente apresentado pelo monitor.
- **Memória do renderer:** heap JavaScript começou em 64,2 MiB, atingiu pico de 84,7 MiB e terminou em 40,6 MiB. O observador de GC não estava disponível nesse Chromium, então esses números não permitem atribuir a queda a uma coleta específica nem representam memória total do processo.
- **Interação sintética:** seek 50 ms, duplicação de bloco 100 ms e sequência pausa/retomada 865 ms; fluxo completo 915 ms. A sequência concluiu e retomou em frame válido. O teste de 30 segundos não observou erros de página.
- **IPC observado no mesmo cenário:** `customizer:characters:list` 3 chamadas, média/pior 23,12/24,76 ms; `editor-v6:projects:list` 4, 89,78/148,55 ms; `editor-v6:projects:load` 1, 88,88/88,88 ms; `editor-v6:projects:save` 4, 202,57/247,41 ms. São amostras pequenas de um perfil sintético, não evidência suficiente para classificar esses canais como gargalos.
- **Limite da baseline:** a Fase 0 não deixou medições de performance anteriores às refatorações; este é o ponto de referência atual, não uma comparação pré/pós. Ainda não medimos inicialização, captura/exportação do Studio, abertura dos outros workspaces ou duração de exportação do Editor V6. Não haverá otimização inferida somente destes resultados; repetir o mesmo cenário e acrescentar fixtures comparáveis antes de decidir.
- **Captura IPC:** `ipcPerformanceSnapshot.ts` transforma os acumuladores em linhas tipadas e, somente com `GV5_IPC_PERF=1`, emite um marcador JSON além da tabela existente. O relatório offscreen agora armazena objetos numéricos e o estado da captura em vez de linhas formatadas do terminal; rótulos são canais e contagens/latências, sem payloads, caminhos ou IDs.
- **Validação:** a execução de 30 segundos passou no cenário `medium`; uma segunda execução curta confirmou o marcador JSON no processo Electron e gravou 4 métricas IPC estruturadas no relatório. Testes do snapshot 1/1, parser 2/2 e perfil de stress 7/7. `npm run test:refactor`, `npm run test:editor-v6` (220 aprovados, 1 ignorado), typecheck, audit arquitetural (573 arquivos TS/TSX) e build passaram.
- **Commit local:** `bfdcde6` (`refactor: structure IPC performance snapshots`).
- **Artefatos:** resultados completos e fixtures de medição foram criados em diretórios temporários do sistema. Os perfis de teste foram sintéticos; nenhum perfil `app-data` existente foi lido ou alterado.

### Comandos de impressão do Studio

- **Fronteira extraída:** `createStudioPrintCommands` em `src/renderer/src/features/studio/studioPrintCommands.ts` coordena exportação do print e abertura da pasta. `StudioPage` mantém a seleção da cena e os estados de aviso/erro; o comando injeta a drenagem de saves, renderer, invoker IPC e trackers já usados pelo Studio.
- **Ordem e contratos preservados:** exportar continua aguardando `flushDocumentWrites`, gerando o canvas, rastreando `saveStudioPrint` e mostrando o mesmo caminho retornado pelo Main. `openStudioPrints` continua no tracker de operações. Canais, IDs, caminho de persistência e formato PNG não mudaram.
- **Teste integrado sintético:** sete cenários cobrem ordem, falhas no flush/render/gravação, cena ausente, abertura da pasta e a sequência real `makeCanvasPrint` → handler `studio:save-print` → bytes gravados por um filesystem em memória. A suíte existente continua cobrindo autorização de sender e materialização da pasta no Main.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; a nova suíte de impressão passou 7/7. `npm run typecheck`, `npm run audit:architecture` (584 arquivos TS/TSX), `npm run build` e `git diff --check` passaram.
- **Commit local:** `6f053fb` (`refactor: isolate Studio print commands`).
- **Dados:** nenhum arquivo do usuário foi lido ou modificado; o teste integrado usa apenas buffers, canvas e fixtures em memória.

### Criação e edição de categorias da Base de Vídeos

- **Fronteira extraída:** `createBaseVideoCategory` e `renameBaseVideoCategory` agora vivem junto dos demais comandos de categoria. `BaseVideosPage` continua dona do busy/erro e injeta as chamadas `window.desktop`, a ordenação da sessão e as atualizações de formulário.
- **Sequência preservada:** criação persiste primeiro e só depois adiciona à lista, agenda a atribuição do vídeo na fila existente e limpa o campo. Renomeação substitui os dados locais e fecha a edição apenas após o serviço retornar com sucesso. Falhas deixam o rascunho e os dados locais intactos. Nenhuma regra de nomes, cores, IDs ou persistência mudou.
- **Testes:** oito cenários verificam create/rename e suas falhas, exclusão e a delegação da página. A atribuição continua usando `baseVideoDetailsSaveQueue`, que possui cobertura própria de debounce, ordenação, flush e retry.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e scripts encadeados; testes de categoria 8/8; typecheck, audit arquitetural (584 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `63e2c2b` (`refactor: isolate Base Videos category edits`).
- **Propriedade:** Biblioteca de Mídia continua dona dos arquivos/IDs e Base de Vídeos das categorias e metadados; não houve alteração de schema ou escrita direta fora dos serviços atuais.

### Importação de rascunhos da Base de Vídeos

- **Fronteira extraída:** `importBaseVideoDraft` coordena o seletor da Biblioteca de Mídia, gravação dos metadados iniciais, publicação do rascunho na sessão e reconhecimento posterior da duração. `BaseVideosPage` permanece dona da UI, do estado `busy` e das atualizações visuais injetadas.
- **Propriedade e compensação:** Biblioteca continua criando e mantendo o arquivo e seu ID; Base de Vídeos grava os metadados pelo serviço próprio. Se essa gravação falhar depois da importação, a compensação continua chamando `baseVideos.deleteVideo`, que mantém seus guards de referências e a coordenação da exclusão. Se somente o reconhecimento da duração falhar, o vídeo permanece como rascunho, conforme antes.
- **Testes sintéticos:** cinco cenários cobrem importação e ordem de publicação, cancelamento, falha de metadados com compensação, falha na duração sem apagar o rascunho e delegação/liberação do busy pela página. Testes não acessam a biblioteca ou perfil reais.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; importação 5/5; typecheck, audit arquitetural (585 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `9e6643d` (`refactor: isolate Base Videos draft import`).
- **Contratos:** IPCs, IDs, formatos persistidos e ordem de compensação não mudaram.

### CSS da Base de Vídeos

- **Mudança:** as 69 regras consecutivas da Base de Vídeos foram movidas de `ui/styles.css` para `features/baseVideos/baseVideos.css`, carregada pela página da feature. O bloco contém somente seletores Base de Vídeos, incluindo os overrides de componentes de Roteiros que já estavam escopados por `.base-video-notes-panel`.
- **Equivalência:** comparei o trecho extraído contra o blob versionado antes da alteração; os 8.480 caracteres de declarações são idênticos após normalização de quebras de linha. Build confirmou que o Vite emite o CSS associado à página. Não foi feita captura manual da tela; a revisão visual por browser continua pendente para esta migração e para as próximas etapas de CSS.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e os scripts encadeados; typecheck, audit arquitetural (585 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `6afe17e` (`refactor: scope Base Videos styles`).
- **Limite:** regras mistas globais e outros blocos de Base de Vídeos espalhados no stylesheet permanecem onde estavam para migração individual posterior; não houve alteração de aparência intencional.

### Carregamento e hidratação de slot do Fabricador

- **Fronteira extraída:** `loadFabricatorSlotForEditing` carrega o projeto e o histórico, mantém o fallback de histórico vazio e chama `prepareLoadedFabricatorProject`. `FabricatorPage` ainda controla a troca visual do slot, o salvamento anterior, o reset dos editores e a publicação final do projeto.
- **Semântica preservada:** a checagem de geração ocorre após a leitura do projeto, após histórico e depois da hidratação; histórico é instalado antes da preparação, como no fluxo anterior. Projeto ausente mantém o erro existente. Se o histórico falhar, o modelo ainda abre com undo/redo vazios e o aviso atual; seleção obsoleta não publica um snapshot antigo.
- **Testes sintéticos:** seis cenários cobrem ordem, fallback, projeto ausente e respostas obsoletas em cada etapa, além da integração estrutural da página. Nenhum projeto salvo foi carregado nos testes.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; carregamento de slot 6/6; typecheck, audit arquitetural (586 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `c980558` (`refactor: isolate Fabricator slot hydration`).
- **Pendências:** o restante de `FabricatorPage` segue concentrando seleção de peças, processamento/importação de imagem e geometria; a decomposição deve continuar por fluxo e manter as filas e guards existentes.

## Reconciliação das falhas da baseline

As falhas observadas na execução inicial da suíte em `f416a02` foram investigadas e reconciliadas:

- Os três erros de importação facial eram causados pelo harness não injetar `notifyAssetsUpdated`, obrigatório no contrato da dependência; corrigimos o fixture sem alterar validação de produção.
- O Node runner não resolvia imports TypeScript extensionless nem JSON sem atributo. O resolver isolado em `scripts/testing/` agora cobre ambos somente nos testes.
- A prévia do Customizador criava um objeto novo mesmo quando o artwork não mudava, quebrando o contrato de identidade do modelo/pose; preservamos a referência original nesse caminho.
- Dois checks estruturais de roupas esperavam sintaxe que já não representava a implementação; foram atualizados para verificar o item com grupo e pivô individuais, o fallback de pose e o comando dono da gravação.
- A execução atual de `npm run test:refactor` termina com sucesso; não restam falhas conhecidas dessa baseline na suíte agregada.

## Decisões e riscos abertos

- A extração de `electron/main.ts` precisa preservar ordem de bootstrap, injeção de dependências, autorização IPC, flush de escrita e recuperação no encerramento.
- As filas de persistência não serão fundidas só por semelhança de sintaxe. Já estão mapeadas suas diferenças de falha, concorrência, retenção e inventário; qualquer consolidação futura precisará preservar esses contratos com testes.
- `Fabricador` continua proprietário do catálogo-fonte; `Customizador` da instância e personalizações do personagem; `Studio` do documento/cena; `Editor V6` do projeto/timeline. Consumidores se ligam por IDs explícitos.
- Os caminhos legados `video-studio.media` e `video-studio.backgrounds` permanecem protegidos enquanto houver consumidores de dados. Não restaurar a UI/rota antiga.
- Nenhuma alteração de schema, migração, exclusão de assets ou formato salvo foi incluída nesta fatia.

## Registro de commits

| Commit | Fatia | Estado |
| --- | --- | --- |
| `697dee891e787c02fce129375c421fee9dc97291` | Diagnóstico de memória do renderer e testes | Local em `Dev-V2`; sem publicação. |
| `627a654f531240788ac2f56b6392a081e180e738` | Coordenador de encerramento, semânticas de filas e testes | Local em `Dev-V2`; sem publicação. |
| `b171929e1a7f263796dcfa7265a13b4d7d063692` | Compartilha a geometria-base idêntica entre Studio e Editor V6 | Local em `Dev-V2`; sem publicação. |
| `a5c30c21c32bd47618ee6d08850c5eda96631e68` | Habilita execução Node de contratos de personagem com imports TS extensionless | Local em `Dev-V2`; sem publicação. |
| `986aba7` | Extrai o comando de gravação de roupas e cobre continuidade Fabricador/Customizador | Local em `Dev-V2`; sem publicação. |
| `da3ee89` | Extrai criação/duplicação de projetos do Studio sem compartilhar o contrato do Editor V6 | Local em `Dev-V2`; sem publicação. |
| `497079f` | Preserva guardas de referências de mídia de Roteiros e move CSS de Opções sem alterar regras | Local em `Dev-V2`; sem publicação. |
| `6735283` | Extrai cálculos e alertas puros de Opções, com testes sintéticos | Local em `Dev-V2`; sem publicação. |
| `e338db9` | Centraliza os nove canais IPC da Base de Vídeos no preload e no Main | Local em `Dev-V2`; sem publicação. |
| `2c3d5a3` | Adiciona gates gerais para Dev-V2 e reutiliza o bundle Windows na paridade MP4 | Local em `Dev-V2`; sem publicação. |
| `1641353` | Extrai o cliente e o ciclo de vida do worker de processamento capilar | Local em `Dev-V2`; sem publicação. |
| `add2123` | Extrai a preparação e gravação do conjunto de cabelo com cobertura de assets | Local em `Dev-V2`; sem publicação. |
| `1d6e938` | Extrai a fila por vídeo de Base de Vídeos com testes de concorrência e retry | Local em `Dev-V2`; sem publicação. |
| `da90c8d` | Permite redirecionar resultados sintéticos de paridade/export sem sobrescrever `out/` existente | Local em `Dev-V2`; sem publicação. |
| `bfdcde6` | Estrutura snapshots IPC e captura baseline de timeline/memória em perfil sintético | Local em `Dev-V2`; sem publicação. |
| `b69685c` | Corrige o preenchimento do fundo nas miniaturas do Studio após a escala do canvas | Local em `Dev-V2`; sem publicação. |
| `ca6ae76` | Extrai o modelo e o hook de seleção de roupas do Customizador | Local em `Dev-V2`; sem publicação. |
| `e5b5ff9` | Cobre cancelamento durante a espera do compositor no worker de exportação | Local em `Dev-V2`; sem publicação. |
| `94df39e` | Documenta ownership das bibliotecas de vídeo legadas e validação do cancelamento de workers | Local em `Dev-V2`; sem publicação. |
| `c81a7b9` | Extrai exclusão de categoria da Base de Vídeos com ordem de flush testada | Local em `Dev-V2`; sem publicação. |
| `4d2df05` | Extrai seleção, busca e ordenação da Base de Vídeos em modelo puro | Local em `Dev-V2`; sem publicação. |
| `c83f270` | Extrai o comando de publicação de rascunho com flush de metadados | Local em `Dev-V2`; sem publicação. |
| `3e4e7b8` | Extrai exclusão sequencial com preservação de sucessos parciais | Local em `Dev-V2`; sem publicação. |
| `8cbee7f` | Centraliza carregamento e composição do snapshot da Base de Vídeos | Local em `Dev-V2`; sem publicação. |
| `26fbd39` | Extrai carregamento concorrente da sessão de Roupas DEV e cobertura de respostas obsoletas | Local em `Dev-V2`; sem publicação. |
| `fc8d74a` | Extrai validação de vínculos ao abrir conjuntos salvos de Roupas DEV | Local em `Dev-V2`; sem publicação. |
| `210e0d1` | Documenta o limite de validação dos vínculos de conjuntos salvos de Roupas DEV | Local em `Dev-V2`; sem publicação. |
| `6f053fb` | Extrai comandos de impressão do Studio e cobre a exportação completa até o IPC | Local em `Dev-V2`; sem publicação. |
| `63e2c2b` | Extrai criação e renomeação de categorias da Base de Vídeos com testes de falha | Local em `Dev-V2`; sem publicação. |
| `9e6643d` | Extrai a importação de rascunhos da Base com compensação testada | Local em `Dev-V2`; sem publicação. |
| `6afe17e` | Move o primeiro bloco integral de CSS da Base de Vídeos sem alterar declarações | Local em `Dev-V2`; sem publicação. |
| `c980558` | Extrai carregamento/hidratação de slot e protege gerações obsoletas do Fabricador | Local em `Dev-V2`; sem publicação. |

