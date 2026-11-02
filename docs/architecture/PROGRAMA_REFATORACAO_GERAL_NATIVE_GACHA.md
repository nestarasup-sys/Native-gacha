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
| 3 | Fabricador e Customizador | Em andamento | Fluxo de catálogo/customizações coberto de ponta a ponta; primeira fronteira de gravação do Fabricador extraída. Restam mapear/decompor os maiores workspaces e ampliar cenários de reabertura. |
| 4 | Studio, Editor V6 e fluxos de vídeo | Em andamento | Criação/duplicação de cenas do Studio extraídas e testadas; comandos próprios do Editor V6, timeline e exportação permanecem separados. Restam a revisão de vídeos, workers e paridade de exportação. |
| 5 | Roteiros, Base de Vídeos, Opções, componentes e CSS | Em andamento | Biblioteca continua dona dos arquivos/IDs; Roteiros mantém metadados e referências. Guardas de exclusão têm testes sintéticos; canais da Base de Vídeos passaram a usar mapa tipado compartilhado por preload/Main; estilos e cálculos puros de Opções foram isolados. Restam decomposição dos workspaces e etapas adicionais de CSS. |
| 6 | Performance, CI e consolidação | Em andamento | Workflow da Dev-V2 agora roda gates gerais e Editor V6 por plataforma; build Windows é reutilizado pelos testes MP4 via artifact limitado aos diretórios compilados. Restam baseline de performance comum, medição de gargalos e cobertura dos outros módulos. |

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

### Comandos de projeto do Studio

- **Fronteira extraída:** `createStudioProjectCommands` em `src/renderer/src/features/studio/studioProjectCommands.ts` agora é dono da criação e duplicação de cenas. A página mantém seleção, lista e estado visual; o comando injeta ID, relógio, persistência e callbacks da interface.
- **Vínculos ao duplicar:** cada asset e elemento recebe ID novo; `backgroundAssetId` e `element.assetId` são remapeados para os assets duplicados antes da escrita. A lista só é atualizada depois de `writeDocument` concluir.
- **Engines mantidas separadas:** Editor V6 conserva `editorV6ProjectCreation.ts`, os documentos com timeline e os fluxos próprios de áudio/mídia/exportação. A extração do Studio não compartilha builders nem altera os formatos de projeto.
- **Verificações:** `test:studio:project-commands` passou 3/3; persistência/histórico/asset transaction do Studio passou 26/26; `npm run test:refactor` passou; `npm run test:editor-v6` passou com 220 testes e 1 skip; typecheck, audit arquitetural (567 arquivos TS/TSX) e build passaram.
- **Pendências:** revisar caminho de captura/exportação do Studio, jobs e workers do Editor V6, fluxo de áudio/vídeo, paridade preview/export e dados legados das bibliotecas sem reativar a antiga interface Video Studio.

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

### Gates gerais de CI na Dev-V2 e reutilização do bundle

- **Gates gerais:** o workflow `editor-v6-parity.yml` passa a rodar `audit:architecture`, `test:refactor`, `test:geometry` e `typecheck` em um job Ubuntu para cada push ou PR da Dev-V2. Os testes de timeline/export do Editor V6 continuam em Linux e Windows.
- **Build sem repetição:** o job Windows da matriz faz o único build do workflow e publica por um dia os diretórios `out/main`, `out/preload` e `out/renderer`. O job de paridade MP4 depende da matriz e baixa esse bundle; não executa outro build. A seleção exclui todo o restante de `out/`, que localmente continha saídas de outras ferramentas/testes e não deve ser transportado como artifact.
- **Compatibilidade do export:** o artifact inclui `out/renderer/editor-v6-export.html`, os assets renderer e o preload usados pelos testes offscreen. O teste facial gera no próprio job o fixture de motion em `out/editor-v6-motion-check`; não precisa de dados locais transferidos.
- **Validação:** YAML carregado e estrutura do workflow conferida com `js-yaml` e assertions locais (gates, matriz, dependência, nomes/paths do artifact e ausência de build duplicado). `npm run test:refactor`, `npm run test:geometry` (5/5), `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram localmente.
- **Limite da verificação:** não houve execução hospedada do GitHub Actions nesta alteração; o upload/download de artifact depende da próxima execução na Dev-V2.
- **Commit local:** `2c3d5a3` (`ci: add Dev-V2 general gates and reuse export bundle`).
- **Pendências:** estabelecer medições repetíveis para inicialização, telas, memória, gravação, timeline e exportação; revisar os gates para cobertura dos fluxos restantes sem duplicar trabalho.

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

