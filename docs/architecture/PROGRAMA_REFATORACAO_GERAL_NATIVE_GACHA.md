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
| 3 | Fabricador e Customizador | Em andamento | Fluxo de catálogo/customizações coberto de ponta a ponta; gravação de roupas, operações de cabelo e projeção dos modelos de cabelo, persistência serializada por personagem com recuperação e estado final protegido contra writes obsoletos, seleção de peça no Customizador, carregamento/hidratação, seleção, duplicação, exclusão e publicação de folha-base do Fabricador, validação de conjuntos, corte de peças por junta, histórico de grades e seleção/carregamento assíncrono de poses em Roupas DEV, além da projeção/paginação do catálogo de poses do Customizador, têm fronteiras/testes próprios. Restam mapear/decompor os workspaces maiores e ampliar cenários de reabertura. |
| 4 | Studio, Editor V6 e fluxos de vídeo | Em andamento | Criação/duplicação, impressão, remoção da seleção e remoção de personagem do Studio extraídas; assets de personagem só são descartados quando não há referências na cena. Criação de narrador/fala/pensamento e exclusão da seleção no Editor V6 também têm comandos próprios com testes de vínculos e precedência. Miniatura 480×270 corrigida; paridade Turbo e exportação facial 720p/1080p aprovadas. A impressão foi validada do canvas ao handler IPC com fixture sintética. A antiga tela Video Studio não tem rota, mas as bibliotecas legadas seguem ativas em Roteiros e como origem de mídia do Editor V6. Teste de cancelamento do worker cobre espera do compositor. Comparação sintética da exportação 240 s validou 284 transições em 1/2 workers; permanecem revisão visual e cobertura adicional dos fluxos de áudio/vídeo do Studio e Editor V6. |
| 5 | Roteiros, Base de Vídeos, Opções, componentes e CSS | Em andamento | Biblioteca continua dona dos arquivos/IDs; Roteiros mantém metadados e referências. Guardas, fila de snapshots, canais, fila de metadados, carregamento, listagem, publicação, CRUD de categorias, importação e exclusões da Base de Vídeos têm contratos testados; estilos da Base de Vídeos e modelos/comandos de Opções têm módulos por feature. Restam decomposição adicional dos workspaces e migração gradual do CSS com revisão visual. |
| 6 | Performance, CI e consolidação | Em andamento | Workflow da Dev-V2 roda gates gerais e Editor V6 por plataforma; build Windows é reutilizado pelos testes MP4. Baselines sintéticos de projeção, indexação, processamento de pixels e exportação 240 s registrados. Restam medições de inicialização e interação real dos workspaces, repetição das comparações de desempenho sem carga concorrente e consolidação da cobertura. |

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

### Modelo de dados do workspace de cabelo

- **Fronteira extraída:** `hairWorkspaceModel.ts` concentra encaixe inicial por peça, busca da cabeça, estado vazio, categorias por lado, remoção de uma peça, preservação de escala aparente e conversão de grades/estilos salvos para o rascunho editável. `HairWorkspace` mantém estado React, importação, workers, feedback e chamadas IPC.
- **Legado protegido:** estilos antigos continuam recebendo a categoria derivada do campo legado; a fonte original, aplicação ao rascunho e opções de chroma continuam usando os mesmos fallbacks. Estilos atuais mantêm prioridade sobre os valores da sessão, inclusive `false` e zero. A constante pública `defaultHairCategoriesBySide` segue reexportada pelo módulo de salvamento existente.
- **Testes:** nove cenários cobrem geometria, defaults, categorias, lados, remoção, escala, conversão de grade, carregamento atual/legado e delegação da página. `npm run test:fabricator:hair-workspace-model` passou 9/9.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e todos os scripts encadeados; typecheck, auditoria arquitetural (598 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `5804311` (`refactor: isolate Fabricator hair workspace model`).
- **Compatibilidade:** nenhum schema, PNG, ID de estilo, canal IPC, formato salvo ou regra de propriedade do catálogo foi alterado.

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

### Benchmarks sintéticos de seletores

- **Execução:** 2026-11-02, scripts locais com sete amostras e mediana por algoritmo, enquanto o usuário jogava. Os scripts comparam derivações antigas e indexadas com a mesma fixture e verificam equivalência; não medem a duração da tela real nem substituem perfil de Electron. A carga do jogo pode afetar os tempos.
- **Studio:** 2.000 elementos de cena (500 personagens), 200 renders não relacionados. Derivação anterior 34,563 ms; projeção memoizada 0,180 ms; 191,49×. A validade depende de a referência dos elementos de cena permanecer igual nos renders não relacionados.
- **Customizador:** 700 conjuntos, 4.200 componentes, seis painéis e 80 renders. Derivação anterior 957,777 ms; índice de candidatos 11,576 ms; 82,74×. A validade depende de referências de catálogo estáveis entre edições do personagem.
- **Editor V6:** 120 personagens, 2.400 planos, cinco rodadas. Preparação anterior 151,73 ms e 2.400 serializações; índice 9,00 ms e 120 serializações; 16,87×. Ambos completaram os mesmos 2.400 planos e retiveram 256 entradas; o mecanismo antigo reteve 7.517.184 bytes aproximados em chaves serializadas, enquanto o novo armazena 8.192 bytes de chaves de plano, 3.515.040 bytes de fingerprints e 2.900 bytes de IDs únicos.
- **Interpretação e limite:** os resultados confirmam melhoria das três derivações sintéticas já substituídas por modelos memoizados/indexados. Não são comparações de builds antigos versus atuais, benchmarks de inicialização ou demonstração de gargalo atual; não justificam otimização adicional sem perfil do mesmo fluxo real.
- **Verificação:** `npm run bench:studio:character-projection`, `npm run bench:customizer:wardrobe-candidates` e `npm run bench:editor-v6:motion-preparation` passaram nesta execução, conferindo igualdade de resultados quando previsto.

### Benchmarks sintéticos de composição, indexação e exportação

- **Condição das medições:** o usuário informou que estava jogando durante os testes. Os tempos abaixo foram coletados sob carga concorrente não controlada; use-os como amostras exploratórias, não como comparação definitiva de desempenho. A validação de igualdade e de integridade dos resultados continua válida.

- **Animador:** `npm run bench:animator:garments`, com 2.500 partes e 2.500 roupas em cinco rodadas, mediu 64,532 ms na busca linear e 8,661 ms no mapa indexado (7,45×); as 2.500 camadas produzidas foram idênticas.
- **Juntas do Fabricador:** `npm run bench:fabricator:joints`, com 1.500 partes, 1.499 juntas e 1.459 marcadores em sete rodadas, mediu 62,838 ms em varreduras repetidas e 2,095 ms no índice (29,99×).
- **Viewport do Editor V6:** `npm run bench:editor-v6:visible-motion`, com 30.000 blocos e janela de 1.000 quadros, mediu 87,826 ms para varrer 29.999 pares e 0,124 ms para obter os 34 planos visíveis (711,14×); os planos comparados foram idênticos.
- **Composição de folha-base:** `npm run bench:fabricator:compose-worker:medium` usou uma imagem sintética de 3.072 × 1.536 com oito peças e confirmou pixels idênticos. Medianas em três rodadas: renderer legado 49,0 ms (maior intervalo de timer 16,4 ms); núcleo direto 53,3 ms (20,8 ms); worker novo 163,5 ms (1,1 ms); worker reutilizado 143,0 ms (6,1 ms). O worker reduziu a interrupção observada na thread principal, mas aumentou a latência total do processamento.
- **Folha de olhos:** `npm run bench:fabricator:eye-sheet`, com 2.400 × 2.400 pixels e três rodadas, mediu 196,19 ms de processamento; a alocação inicial da fila adaptativa caiu de 21,97 MiB para 0,25 MiB (98,86%). O caminho medido exclui decode, PNG, agendamento do worker e heap Chromium.
- **Correção do harness de exportação:** `silent240` agora gera a timeline sem blocos de fala/pensamento desde o início, mantendo as chaves dos atlas coerentes. A conferência dos 142 quadros por rodada usa lotes de 16 para evitar a falha do filtro FFmpeg que ocorria ao analisar todas as amostras em uma expressão. A validação rigorosa de produção permaneceu intacta.
- **Exportação 240 s:** `npm run test:editor-v6:stress-offscreen -- --export-stress --compare-workers` passou seis rodadas alternadas (1, 2, 2, 1, 1, 2 workers) com 7.200 quadros a 30 FPS, 284 atlas/transições visíveis, 142 quadros decodificados por rodada e nenhum áudio. Medianas: 1 worker 26.758 ms (renderização 26.060 ms; pico Main 270.385.152 bytes); 2 workers 16.004 ms (renderização 15.318 ms; pico Main 330.461.184 bytes). As seis saídas passaram a validação FFprobe e mantiveram pelo menos 284 transições visíveis. Duas threads foram mais rápidas nesta amostra e usaram mais memória; repetir sem carga concorrente antes de tomar decisão de performance.
- **Interpretação:** são medições locais sintéticas de CPU/Chromium, sensíveis à máquina e ao runtime. Confirmam igualdade apenas nos cenários comparados e identificam a diferença entre latência total e bloqueio da interface; não demonstram melhora percebida pelo usuário nem constituem comparação de builds antigos e atuais.
- **Verificação:** cinco benchmarks sintéticos de domínio passaram; `npm run test:editor-v6:stress-profile` passou 11/11; `npm run test:editor-v6` passou com 221 testes e 1 ignorado; exportação stress alternada 1/2 workers passou; `npm run typecheck`, `npm run audit:architecture` (593 arquivos TS/TSX), `npm run build` e `git diff --check` passaram.

### Comandos de impressão do Studio

- **Fronteira extraída:** `createStudioPrintCommands` em `src/renderer/src/features/studio/studioPrintCommands.ts` coordena exportação do print e abertura da pasta. `StudioPage` mantém a seleção da cena e os estados de aviso/erro; o comando injeta a drenagem de saves, renderer, invoker IPC e trackers já usados pelo Studio.
- **Ordem e contratos preservados:** exportar continua aguardando `flushDocumentWrites`, gerando o canvas, rastreando `saveStudioPrint` e mostrando o mesmo caminho retornado pelo Main. `openStudioPrints` continua no tracker de operações. Canais, IDs, caminho de persistência e formato PNG não mudaram.
- **Teste integrado sintético:** sete cenários cobrem ordem, falhas no flush/render/gravação, cena ausente, abertura da pasta e a sequência real `makeCanvasPrint` → handler `studio:save-print` → bytes gravados por um filesystem em memória. A suíte existente continua cobrindo autorização de sender e materialização da pasta no Main.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; a nova suíte de impressão passou 7/7. `npm run typecheck`, `npm run audit:architecture` (584 arquivos TS/TSX), `npm run build` e `git diff --check` passaram.
- **Commit local:** `6f053fb` (`refactor: isolate Studio print commands`).
- **Dados:** nenhum arquivo do usuário foi lido ou modificado; o teste integrado usa apenas buffers, canvas e fixtures em memória.

### Remoção de personagem e referências locais do Studio

- **Fronteira extraída:** `removeStudioCharacterElement` em `src/renderer/src/features/studio/studioCharacterRemoval.ts` agora calcula a remoção do elemento e a limpeza do render local; `StudioPage` continua controlando histórico, seleção e autosave.
- **Integridade de referências:** o PNG do personagem só sai da lista de assets da cena se não houver outro elemento usando o ID nem `backgroundAssetId` apontando para ele. O asset do Studio e os arquivos de outros projetos permanecem sob os serviços existentes; nenhuma exclusão de arquivo ou mudança no formato foi introduzida.
- **Testes sintéticos:** quatro cenários de dados cobrem remoção de asset órfão, compartilhamento entre personagens, referência pelo fundo e preservação de assets não relacionados; um quinto confirma a delegação da página e a limpeza da seleção. A suíte de persistência/transação do Studio continua no gate geral.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e scripts encadeados, incluindo a nova suíte 5/5; typecheck, audit arquitetural (600 arquivos TS/TSX), build e `git diff --check` passaram.
- **Compatibilidade:** os documentos, IDs, IPC, histórico e propriedade do Studio não mudam. Não foram lidos dados pessoais nem assets do perfil.
- **Commit local:** `092357f` (`refactor: isolate Studio character removal`).

### Criação de texto na timeline do Editor V6

- **Fronteira extraída:** `createEditorV6TextElementCommand` concentra inclusão de narrador, fala e pensamento, incluindo seleção de faixa, vínculo opcional ao personagem e seleção do bloco recém-criado. `EditorV6Page` injeta frame, criação de IDs, atualização da cena e callbacks do inspector.
- **Sequência preservada:** sem projeto não há efeito; fala/pensamento sem personagem apresentam a mesma mensagem antes de pausar. Com personagem, o playback pausa antes da leitura do frame e da checagem de faixa; bloqueio só consulta a faixa de destino (`video` para narrador). O elemento continua compartilhando ID entre cena e estado do bloco por `addEditorV6ElementAtFrame`.
- **Testes:** seis casos cobrem narrador, fala/pensamento anexados, falta de personagem, faixas bloqueadas/de outro tipo, projeto ausente e integração/delegação da página.
- **Verificações:** `npm run test:editor-v6:text-element-command` passou 6/6; `npm run test:editor-v6` passou com 221 testes e 1 ignorado; `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados, incluindo o comando. Typecheck, audit arquitetural (601 arquivos TS/TSX), build e `git diff --check` passaram.
- **Compatibilidade:** documentos, IDs, tracks, snapshots, playback, seleção, callbacks, histórico e contratos de persistência não mudam.
- **Commit local:** `43509df` (`refactor: isolate Editor V6 text creation`).

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

### Persistência de personagem no Customizador

- **Fronteira extraída:** `saveCustomizerCharacter` concentra a atualização otimista do roster, fila por ID, persistência, recuperação do snapshot do serviço após erro e notificação legada. O hook React injeta setters e APIs Electron; o comando não altera catálogo-fonte do Fabricador.
- **Concorrência corrigida:** um save antigo que falhava enquanto outro save do mesmo ID estava enfileirado podia deixar o estado global em erro mesmo depois do save mais recente terminar com sucesso. Agora somente a última Promise da fila controla `saved/error`; sucesso mais recente limpa esse erro obsoleto. Writes continuam sequenciais por personagem e erro da gravação final continua acionando a recuperação do roster.
- **Testes sintéticos:** seis cenários cobrem otimização local, falha com recuperação, recuperação indisponível, serialização, erro antigo seguido de sucesso mais novo e bloqueio durante exclusão.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; persistência do Customizador 6/6; typecheck, audit arquitetural (587 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `413e75f` (`refactor: isolate Customizer character saves`).
- **Compatibilidade:** IDs, JSON, canais IPC, sequência de gravação e contratos de ownership do personagem permaneceram iguais.

### Comandos de backup em Opções

- **Fronteira extraída:** `createOptionsBackupCommands` centraliza o estado de feedback e a orquestração das ações de criar, verificar, restaurar e excluir backups. `OptionsPage` mantém a composição React e injeta os serviços `window.desktop`; persistência, recuperação e validações continuam no domínio de gerenciamento de dados.
- **Semânticas preservadas:** criação, verificação e exclusão atualizam a lista após a operação; restauração preparada ou cancelada não atualiza a lista e mantém a mensagem específica. Erros liberam `busy`, apresentam a mensagem de serviço e não ocultam falhas.
- **Testes:** oito casos cobrem as ações, resultados válidos/inválidos, cancelamento, erro e delegação da página. `npm run test:options:backup-commands` passou 8/8.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e todos os scripts encadeados; typecheck, auditoria arquitetural (588 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `c724489` (`refactor: isolate Options backup commands`).
- **Compatibilidade:** canais IPC, formatos de backup, recuperação e regra de propriedade dos dados não foram alterados.

### Comandos de migração em Opções

- **Fronteira extraída:** `createOptionsMigrationCommands` coordena iniciar a migração, pedir pausa e reiniciar após validação. `OptionsPage` continua dona do listener de progresso, do resumo de domínios e da apresentação; os canais e serviços do Electron seguem inalterados.
- **Semânticas preservadas:** a execução limpa erro/progresso, habilita estado ocupado, executa e atualiza o resumo; `finally` limpa busy, solicitação de pausa e progresso. Pausa mantém a solicitação até chegar progresso posterior; reinício apenas limpa erro anterior antes da chamada. Mensagens de falha mantêm os fallbacks existentes.
- **Testes:** oito casos cobrem ordenação, sucesso, falhas com/sem `Error`, pausa, reinício e delegação da página. `npm run test:options:migration-commands` passou 8/8.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e scripts encadeados; typecheck, auditoria arquitetural (589 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `6d48089` (`refactor: isolate Options migration commands`).
- **Compatibilidade:** nenhum dado, schema, evento de progresso ou canal IPC foi alterado.

### Persistência de snapshots em Roteiros

- **Fronteira extraída:** `createRoteiroSnapshotPersistence` concentra revisões, writes ativos, última solicitação, snapshot persistido e o flush da versão mais recente. `RoteirosPage` continua dona do estado de domínio, do listener de navegação/saída e injeta o snapshot atual; `RoteiroWorkspace` continua sem gravar documentos.
- **Corridas cobertas:** somente a revisão mais recente pode marcar o estado como salvo/erro. Falha de uma revisão antiga não apaga a solicitação nova; uma falha da revisão atual libera nova tentativa. O flush espera writes ativos, verifica a versão atual e persiste-a antes de resolver; antes do carregamento, não grava um snapshot vazio.
- **Testes:** sete cenários sintéticos cobrem revisões concorrentes, falhas antigas/atuais, retry e flush (carregamento, estado ocioso, write ativo e recuperação). `npm run test:roteiros:snapshot-persistence` passou 7/7; o contrato do inventário de flush do renderer passou 14/14.
- **Verificações:** `npm run test:refactor` passou com 641 testes e todos os scripts encadeados; `npm run test:roteiros` 16/16; typecheck, auditoria arquitetural (590 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `fa34f9a` (`refactor: extract Roteiros snapshot persistence`).
- **Compatibilidade:** formato do documento, IDs, IPC, persistência no Main e fronteira de propriedade de vídeos da biblioteca permanecem inalterados.

### Duplicação de slot do Fabricador

- **Fronteira extraída:** `duplicateFabricatorSlot` coordena validação do alvo, cancelamento do timer, persistência do projeto atual, duplicação pelo serviço proprietário, atualização do resumo e sinalização de assets. `FabricatorPage` ainda escolhe o projeto mais recente e aplica os setters React.
- **Ordem e falhas:** alvo ausente/ocupado ou igual à origem não produz efeitos; o slot novo só aparece no catálogo visual após o IPC de duplicação concluir. Falha ao salvar impede a duplicação; falha do serviço não atualiza resumo nem emite `assets-updated`; ambos liberam o estado ocupado e mostram a mensagem atual.
- **Testes sintéticos:** nove verificações cobrem ordem, alvos inválidos, falha de salvamento, falha do catálogo e delegação da página. `npm run test:fabricator:duplicate-slot` passou 9/9.
- **Verificações:** `npm run test:refactor` passou com 641 testes e scripts encadeados; typecheck, auditoria arquitetural (591 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `ca1a970` (`refactor: isolate Fabricator slot duplication`).
- **Compatibilidade:** IDs, arquivos, formato do projeto e canal IPC `duplicateFabricatorSlot` permanecem iguais; fixture sintética, sem ler nem gravar slots existentes.

### Exclusão de slot do Fabricador

- **Fronteira extraída:** `deleteFabricatorSlotCommand` coordena confirmação, trava de exclusão, invalidação da sessão ativa, flush de writes, chamada ao serviço proprietário e recuperação da sessão após falha. `FabricatorPage` injeta as operações de IPC, cancelamento de workers, setters e reload.
- **Ordem e proteção:** rejeição sem slot, durante outra exclusão ou após cancelar confirmação não produz efeitos. Para slot ativo, a sessão é invalidada antes do flush; o IPC só roda depois do flush. Sucesso só remove o resumo após o serviço confirmar. Falha repõe o projeto com nova revisão ou recarrega o slot se a sessão já estiver vazia. Slot inativo não toca na sessão aberta.
- **Testes sintéticos:** sete casos cobrem guardas, textos de confirmação para slot e recuperação, ordem de flush/remoção, slot inativo, restauração após erro, reload sem projeto e delegação da página. `npm run test:fabricator:delete-slot-command` passou 7/7; nenhum dado real foi usado.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e scripts encadeados; typecheck, auditoria arquitetural (597 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `cffa44d` (`refactor: isolate Fabricator slot deletion`).
- **Compatibilidade:** mantém o canal `deleteFabricatorSlot`, as confirmações, o flush e a recuperação já existentes; não muda o contrato de armazenamento nem apaga dados durante os testes.

### Seleção e carregamento de slot do Fabricador

- **Fronteira extraída:** `selectFabricatorSlotCommand` coordena a troca de slot, enquanto `FabricatorPage` fornece os setters/ref, cancelamento de workers, persistência, reset da sessão e adaptação do snapshot. `loadFabricatorSlotForEditing` permanece responsável por carregar histórico e hidratar o projeto.
- **Concorrência e falhas:** o projeto atual é persistido antes de trocar. Falha impede reset/carregamento; geração obsoleta após o save não altera a seleção. Slot vazio e slot com recuperação ambígua preservam seus caminhos atuais. Respostas antigas do loader não publicam o snapshot nem encerram o loading pertencente à solicitação nova.
- **Testes:** nove cenários cobrem ordem, ausência de projeto, falha de save, respostas obsoletas, slot vazio, recuperação manual e falha de load; os seis casos de `fabricator-slot-load.test.mjs` continuam cobrindo carga, histórico e hidratação. `npm run test:fabricator:slot-selection-command` passou 9/9 e `npm run test:fabricator:slot-load` 6/6.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e todos os scripts encadeados; typecheck, auditoria arquitetural (599 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `2f97a54` (`refactor: isolate Fabricator slot selection`).
- **Compatibilidade:** canais de carga e salvamento, IDs, histórico e formato de projeto permanecem iguais; testes usam snapshots sintéticos.

### Publicação de folha-base no Fabricador

- **Fronteira extraída:** `publishModelSourceResult` prepara a nova versão a partir do resultado editado, serializa o projeto e assets, e coordena a publicação pelo serviço do Fabricador. `FabricatorPage` injeta o projeto atual, as travas de interação, histórico, caches, setters e eventos; o serviço dono do catálogo continua responsável pela publicação atômica.
- **Ordem preservada:** recusa sem projeto ou enquanto processamento/chroma/histórico/publicação impedem a edição; marca salvamento e publicação ativos, cancela timer e persiste o projeto antes do IPC de publicação. Só após o serviço devolver o novo nome da folha limpa histórico/assets/surfaces e atualiza o projeto local. Falhas mantêm `saveState=error`, liberam a trava e são propagadas ao editor.
- **Testes sintéticos:** seis casos cobrem guardas, ordem, payload de assets incluindo base de chroma opcional, atualização somente depois do IPC, erros antes/depois de serializar e delegação da página. `npm run test:fabricator:model-source-publish-result` passou 6/6.
- **Verificações:** `npm run test:refactor` passou com 641 testes e scripts encadeados; `npm run test:fabricator` 36/36; typecheck, auditoria arquitetural (592 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `811ac13` (`refactor: isolate Fabricator model source publishing`).
- **Compatibilidade:** nenhum schema, ID, conteúdo serializado, canal IPC ou propriedade do catálogo foi alterado; fixtures sintéticas sem acesso à biblioteca de usuário.

### Corte de roupas longas nas juntas do modelo

- **Fronteira extraída:** `splitWardrobeGarmentPairAtJoint` calcula os dois lados, encontra as juntas, recorta os pixels e monta peças superior/inferior com categorias, anexos, dimensões e encaixes correspondentes. `WardrobeWorkspace` mantém a interação, a adaptação de `Image`/canvas e verifica que o rascunho ainda é a mesma referência antes de publicar a substituição.
- **Atomicidade da sessão:** o comando acumula os recortes em memória e só retorna o par completo; falta de par, junta ou osso lança o erro existente e a página não altera o rascunho. A gravação continua sendo responsabilidade do salvamento do conjunto pelo serviço do Fabricador.
- **Testes sintéticos:** quatro cenários cobrem a divisão bilateral, preservação de IDs superiores e criação de IDs inferiores, categorias e bindings, par incompleto, junta ausente no segundo lado e guarda de resultado obsoleto na página. `npm run test:fabricator:wardrobe-joint-split` passou 4/4.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes na suíte principal e todos os scripts encadeados; `npm run test:geometry` 5/5; `npm run test:character-contracts` 15/15; typecheck, audit arquitetural (593 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `84b9d80` (`refactor: isolate wardrobe joint garment splitting`).
- **Compatibilidade:** nenhuma mudança de preview, PNG, ID, schema, payload persistido ou propriedade dos conjuntos; a calibração e o corte continuam usando o modelo-base de catálogo do Fabricador.

### Histórico de edição das grades de roupas DEV

- **Fronteira extraída:** `createWardrobeGridHistory` em `src/renderer/src/features/fabricator/wardrobe/wardrobeGridHistory.ts` é dono das pilhas de desfazer/refazer das grades importadas de mangas e calças. `WardrobeWorkspace` mantém a sessão React, registra os snapshots nos mesmos pontos de edição, limpa o histórico ao trocar/reiniciar a sessão e aplica os snapshots retornados.
- **Comportamento preservado:** só `sleeve-grid-3x4` e `pants-grid-3x4` entram no histórico; há limite de 30 snapshots, nova edição limpa refazer e os atalhos seguem inativos quando o foco está em campos de texto, seleção ou conteúdo editável. Nenhum snapshot é persistido fora do rascunho atual.
- **Testes:** quatro cenários cobrem filtro e limite, ciclo desfazer/refazer, limpeza das pilhas e integração/guarda de atalhos. `npm run test:fabricator:wardrobe-grid-history` passou 4/4.
- **Verificações:** `npm run test:refactor` passou com 641 testes na suíte principal e scripts encadeados; typecheck, auditoria arquitetural (594 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `187c75a` (`refactor: isolate wardrobe grid history`).
- **Compatibilidade:** não muda formatos salvos, IDs, comportamento de outras roupas ou o contrato de gravação do Fabricador.

### Seletor de pose para prévia de roupas

- **Fronteira extraída:** `WardrobeTestPosePicker` concentra o diálogo acessível, a listagem de poses e seus estados de carregamento/vazio. `WardrobeWorkspace` mantém a propriedade da sessão, a consulta ao IPC e a validação de que a pose escolhida ainda pertence ao modelo/slot solicitado.
- **Comportamento preservado:** títulos, instrução de cópia visual, numeração, resumo, data local, bloqueio da lista durante carregamento e fechamento por botão/fundo são os mesmos. Fechar invalida a geração pendente, encerra o loading e oculta o diálogo; a resposta assíncrona antiga não consegue atualizar a sessão.
- **Testes:** três verificações cobrem acessibilidade/cópia não destrutiva, conteúdo e estado de carregamento, e delegação do cancelamento. `npm run test:fabricator:wardrobe-test-pose-picker` passou 3/3.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e scripts encadeados; typecheck, auditoria arquitetural (595 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `d26a328` (`refactor: extract wardrobe test pose picker`).
- **Compatibilidade:** nenhum canal IPC, dado de pose, arquivo salvo, ID ou estilo foi alterado.

### Comandos assíncronos de pose de teste em Roupas DEV

- **Fronteira extraída:** `createWardrobeTestPoseCommands` coordena listagem/carregamento de poses, loading do modal, preparação dos offsets da prévia e invalidação de respostas antigas. `WardrobeWorkspace` mantém as guardas de origem/calibração e injeta IPC e setters.
- **Concorrência e contrato:** fechar o seletor, sair da prévia, abrir outro conjunto, trocar o slot ou desmontar o workspace invalida a geração ativa; respostas antigas não atualizam catálogo, pose, erro ou loading. A pose carregada ainda deve corresponder ao `modelSlot` e ao `poseSlot` pedidos antes de entrar na prévia.
- **Testes sintéticos:** sete casos cobrem filtro de slots vazios, erros, fechamento durante listagem, carregamento válido, pose ausente/incompatível, saída durante carga e integração da workspace. `npm run test:fabricator:wardrobe-test-pose-commands` passou 7/7; `test:fabricator:wardrobe-test-pose-picker` passou 3/3.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e todos os scripts encadeados; typecheck, auditoria arquitetural (604 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `7df3c38` (`refactor: isolate wardrobe test pose commands`).
- **Compatibilidade:** não modifica poses, conjuntos, slots, IPC ou dados persistidos; a prévia continua visual e não regrava a pose do Fabricador.

### Modelo de navegação do catálogo de poses do Customizador

- **Fronteira extraída:** `buildCustomizerPoseBrowserModel` em `src/renderer/src/features/customizer/customizerPoseBrowserModel.ts` projeta as poses utilizáveis do catálogo, respeitando slot selecionado, slots com recuperação pendente, ordenação, categorias, tamanho de página e limite da página ativa. Funções puras separadas calculam o próximo item da navegação circular e a página adjacente limitada.
- **Integração:** `CustomizerPage` memoiza o modelo pelas entradas do catálogo e estado de navegação; continua dona dos setters e dos comandos de seleção/salvamento de personagem.
- **Testes:** seis cenários cobrem filtro/ordenação, ordem de categorias, páginas cheias e vazias, limites, navegação circular e delegação da página. `npm run test:customizer:pose-browser-model` passou 6/6.
- **Verificações:** `npm run test:refactor` passou com 641/641 testes principais e scripts encadeados; typecheck, auditoria arquitetural (596 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `e77e9ed` (`refactor: isolate customizer pose browser model`).
- **Compatibilidade:** o filtro de slots em recuperação, categorias iniciais, tamanho de página e navegação permanecem iguais; não altera catálogo ou customização persistidos.

### Comando de exclusão da seleção no Editor V6

- **Fronteira extraída:** `createEditorV6DeleteSelectedCommand` coordena a exclusão da seleção corrente e injeta as operações de alteração da cena, edição do fundo no frame atual, remoção de personagem e limpeza das seleções.
- **Precedência e propriedade preservadas:** sem projeto ativo não há efeitos; fundo selecionado tem precedência e grava um estado vazio no frame corrente; clipe de vídeo selecionado remove somente o bloco da timeline, mantendo o asset na biblioteca do projeto; personagem continua usando `removeStageCharacter`; outros elementos são removidos da cena sem apagar assets do projeto. Cada caminho limpa a seleção correspondente como antes.
- **Testes sintéticos:** cinco casos cobrem fundo, clipe com preservação de mídia, personagem delegado, precedência/falta de projeto e integração da página. `npm run test:editor-v6:delete-selected-command` passou 5/5.
- **Verificações:** `npm run test:editor-v6` passou com 221 testes aprovados e 1 ignorado; `npm run test:refactor` passou com 641 testes na suíte principal e os scripts encadeados; typecheck, auditoria arquitetural (602 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `c905315` (`refactor: isolate Editor V6 selected deletion`).
- **Compatibilidade:** formatos do projeto, IDs, assets, regras de histórico e contratos do Editor V6 permanecem iguais; nenhum dado pessoal foi usado.

### Comando de exclusão da seleção no Studio

- **Fronteira extraída:** `createStudioDeleteSelectedCommand` encaminha o fundo selecionado, elementos e personagens às operações próprias da cena; `StudioPage` permanece dona da seleção e injeta `changeScene`, relógio e callbacks.
- **Propriedade preservada:** remover o fundo apenas limpa `backgroundAssetId`; remover uma imagem/elemento atualiza a cena, sem apagar o asset do projeto; personagens continuam delegando a `removeStudioCharacterElement`, que descarta o render somente quando as referências permitirem. IDs selecionados obsoletos mantêm a semântica anterior de limpar a seleção e registrar a atualização da cena.
- **Testes sintéticos:** cinco casos cobrem fundo, personagem, elemento com asset retido, ID obsoleto/estados vazios e delegação da página. `npm run test:studio:delete-selected-command` passou 5/5.
- **Verificações:** regressões de remoção de personagem 5/5, criação/duplicação 3/3 e impressão 7/7; `npm run test:refactor` passou com 641/641 testes principais e todos os scripts encadeados; typecheck, auditoria arquitetural (603 arquivos TS/TSX), build e `git diff --check` passaram.
- **Commit local:** `076ca75` (`refactor: isolate Studio selected deletion`).
- **Compatibilidade:** documento, IDs, histórico, referências de mídia e contratos IPC permanecem inalterados; os testes usam dados sintéticos.

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
| `413e75f` | Extrai gravação por personagem e evita que erro de write obsoleto vença o sucesso mais recente | Local em `Dev-V2`; sem publicação. |
| `c724489` | Isola os comandos de backup de Opções e preserva seus efeitos de refresh/restauração | Local em `Dev-V2`; sem publicação. |
| `6d48089` | Isola as ações de migração de Opções mantendo pausa e progresso assíncrono | Local em `Dev-V2`; sem publicação. |
| `fa34f9a` | Extrai a persistência de snapshots do renderer de Roteiros com flush de estado atual | Local em `Dev-V2`; sem publicação. |
| `ca1a970` | Extrai a sequência de salvamento e duplicação de slot do Fabricador | Local em `Dev-V2`; sem publicação. |
| `811ac13` | Isola a publicação da folha-base editada após persistir o projeto Fabricador | Local em `Dev-V2`; sem publicação. |
| `f85d0ae` | Registra benchmarks sintéticos e análise inicial do harness de exportação do Editor V6 | Local em `Dev-V2`; sem publicação. |
| `84b9d80` | Extrai corte bilateral de roupas DEV por junta com fixtures sintéticas | Local em `Dev-V2`; sem publicação. |
| `e48e2ed` | Registra corte de roupas DEV por junta e resultados das verificações | Local em `Dev-V2`; sem publicação. |
| `4f44b0b` | Corrige o cenário silencioso e a validação por amostras da exportação de stress | Local em `Dev-V2`; sem publicação. |
| `1b6bf17` | Registra comparação sintética de exportação do Editor V6 e ressalva de carga concorrente | Local em `Dev-V2`; sem publicação. |
| `187c75a` | Extrai o histórico de edição de grades de roupas DEV | Local em `Dev-V2`; sem publicação. |
| `3113ebe` | Registra histórico de grades de roupas DEV e resultados da verificação | Local em `Dev-V2`; sem publicação. |
| `d26a328` | Extrai o seletor de pose para prévia de roupas DEV | Local em `Dev-V2`; sem publicação. |
| `4cd0b47` | Registra extração do seletor de pose e resultados de verificação | Local em `Dev-V2`; sem publicação. |
| `e77e9ed` | Isola projeção e navegação do catálogo de poses do Customizador | Local em `Dev-V2`; sem publicação. |
| `a737bed` | Registra extração da projeção/navegação de poses do Customizador | Local em `Dev-V2`; sem publicação. |
| `cffa44d` | Extrai o comando de exclusão de slot do Fabricador | Local em `Dev-V2`; sem publicação. |
| `d42bb1c` | Registra a extração do comando de exclusão de slot | Local em `Dev-V2`; sem publicação. |
| `5804311` | Extrai o modelo de dados do workspace de cabelo | Local em `Dev-V2`; sem publicação. |
| `000bd69` | Registra o modelo de dados do workspace de cabelo | Local em `Dev-V2`; sem publicação. |
| `2f97a54` | Extrai a seleção/carregamento de slot do Fabricador | Local em `Dev-V2`; sem publicação. |
| `092357f` | Extrai a remoção de personagem e protege referências locais de asset no Studio | Local em `Dev-V2`; sem publicação. |
| `43509df` | Extrai o comando de criação de narrador/fala/pensamento do Editor V6 | Local em `Dev-V2`; sem publicação. |
| `c905315` | Extrai o comando de exclusão da seleção do Editor V6 | Local em `Dev-V2`; sem publicação. |
| `076ca75` | Extrai o comando de exclusão da seleção do Studio | Local em `Dev-V2`; sem publicação. |
| `7df3c38` | Extrai coordenação de listagem/carregamento de poses de teste em Roupas DEV | Local em `Dev-V2`; sem publicação. |

