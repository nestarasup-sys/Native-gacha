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
| 3 | Fabricador e Customizador | Não iniciada | Preservar catálogo-fonte, instâncias e overrides; cobrir ciclo completo de edição. |
| 4 | Studio, Editor V6 e fluxos de vídeo | Não iniciada | Manter engines distintas, paridade de exportação e caminhos legados de dados. |
| 5 | Roteiros, Base de Vídeos, Opções, componentes e CSS | Não iniciada | Preservar propriedade da biblioteca de mídia e bloqueio de referências. |
| 6 | Performance, CI e consolidação | Não iniciada | Medir antes/depois; remover legado somente após comprovar ausência de consumidores. |

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

O Node test runner não resolvia imports relativos extensionless `.ts` usados por dois contratos existentes. `scripts/testing/resolve-typescript-extensions.mjs` e `register-typescript-extensions.mjs` são exclusivos de testes e permitem rodar esses contratos sem alterar imports de produto. `npm run test:character-contracts` passou 15/15.

## Falhas preexistentes

As falhas abaixo já estavam na baseline de `f416a02` antes da primeira alteração desta execução. Não foram mascaradas ou removidas:

1. `fabricator-customizer-studio-continuity.test.mjs`: importação do par espelhado de sobrancelhas espera contagem `2`, recebe `0`.
2. Mesmo arquivo: importação de atlas ocular espera `{'eye-left':'eye-left'}`, recebe `{}`.
3. Mesmo arquivo: importação de detalhe facial lança `TypeError` ao acessar `id` de valor indefinido.
4. `renderizador deve usar um pivô por peça...`: expectativa estrutural antiga por `layer.push({ group, ...item })` não corresponde à implementação atual.
5. `a página delega deformação ao hook...`: expectativa por `hasDirtyWarpImage(component.id)` não corresponde à implementação atual.

O Node test runner conta também a suíte agregadora que contém as três primeiras falhas; por isso reporta seis falhas no total: cinco casos com asserções que falham e o grupo agregado. As falhas 1–3 pertencem ao fluxo Fabricador/Customizador e serão investigadas na Fase 3; as falhas 4–5 serão verificadas ao mapear geometria compartilhada e seu consumidor Fabricador, nas Fases 2–3. Nenhuma correção deve enfraquecer esses contratos de teste sem evidência.

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

