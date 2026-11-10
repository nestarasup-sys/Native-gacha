# Refatoração incremental do Editor V6

**Estado:** em andamento
**Início:** 10/11/2026
**Base:** `Dev-V2` em `eb248d35`
**Branch de trabalho:** `codex/editor-v6-refactor`
**Isolamento:** worktree `GACHA EM C++-V6-REFACTOR`; a branch `Dev-V2` continua intacta.

## Objetivo

Organizar os módulos que compõem o Editor V6 sem reescrever o produto de uma vez. Cada ciclo deve deixar uma responsabilidade mais clara, manter os contratos existentes e registrar o que foi inspecionado, alterado e ainda precisa de validação.

Este documento acompanha a execução. A pesquisa técnica, o mapa de integrações e os protocolos de desempenho continuam nos documentos existentes:

- [Arquitetura e integração](ARQUITETURA_E_INTEGRACAO.md)
- [Pesquisa Chromium e refatoração](PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md)
- [Plano executável e gates de desempenho](pesquisa-sistemica/PLANO_EXECUTAVEL.md)
- [Progresso dos experimentos de exportação](pesquisa-sistemica/PROGRESSO_E_RESULTADOS.md)

## Regras de segurança

- O documento V6 continua sendo a fonte persistida; esta refatoração não altera schema, IDs, caminhos, canais IPC ou formato dos projetos.
- Preview, timeline e exportação continuam usando os mesmos contratos e regras visuais.
- Cada ciclo tem escopo pequeno e commit local próprio. Não publicar nem integrar em `Dev-V2` sem solicitação explícita.
- Experimentos de desempenho permanecem no harness isolado. Nenhum dado real de projeto entra como fixture de teste.
- Um resultado de código ou de compilação não é apresentado como benchmark.

## Auditoria inicial do código

- `EditorV6Page.tsx` tinha 938 linhas e ainda concentrava parte das transações do documento, edição de snapshots por bloco, histórico, undo/redo e persistência de importações.
- Há fronteiras existentes que devem ser preservadas: `useEditorV6DocumentPersistence` serializa gravações e drena operações; `useEditorV6ProjectLibrary` carrega o catálogo e o projeto ativo; `editorV6Store` guarda o documento ativo, resumos e histórico; comandos de mídia, texto, criação e remoção já têm módulos próprios.
- Os componentes de maior risco — `motion/bakeMotion.ts`, `exportWorker.tsx` e preparação de cabelo — permanecem fora do primeiro ciclo. Uma redução de linhas não justifica alterar algoritmos de renderização ou exportação sem evidência de benefício.
- A branch de laboratório existente contém alterações locais de outra rodada. Elas foram preservadas; este trabalho começou numa worktree nova baseada no commit publicado de `Dev-V2`.
- A worktree não tem `app-data` nem projetos reais. A refatoração e os testes desta etapa usam somente código e fixtures sintéticas; um export de ponta a ponta com personagem real depende de uma cópia autorizada.

## Sequência de ciclos

1. **Comandos, histórico e edição do documento — implementado e verificado:** retirar da página a coordenação de patch, histórico, undo/redo e gravação de mídia importada.
2. **Projeções de cena e seleção:** mapear dependências entre documento, quadro atual, Inspector e preview; extrair regra pura quando houver um contrato testável.
3. **Interação do palco:** separar rascunhos de arraste/transformação das edições persistidas, preservando captura do ponteiro, cancelamento e histórico.
4. **Preparação de poses e aparências faciais:** separar renderização, crop anterior, bake de variantes e medição da geometria da gravação no documento; manter os contratos de imagem atuais.
5. **Timeline e mídia:** revisar comandos, geometria visível e sincronização; manter a virtualização atual e evitar recriar estado persistido.
6. **Exportação:** documentar os limites entre job, workers, captura, FFmpeg, cancelamento e recuperação antes de considerar mudanças no pipeline.
7. **Medição:** qualquer mudança de performance depende de comparação controlada e paridade de saída, conforme o plano sistêmico existente.

Os ciclos são independentes; a ordem pode mudar quando o código ou uma regressão demonstrar outra causa prioritária.

## Registro

### Ciclo 1 — comandos do documento e histórico (implementado e verificado)

**Mudança:** criada a fábrica `createEditorV6DocumentCommands` em `src/renderer/src/features/editorV6/editorV6DocumentCommands.ts`. A página injeta os estados e serviços atuais; o módulo reúne edição de documento e snapshots, handlers de cena/fundo/vídeo, gravação de imports, histórico e undo/redo.

**Motivo:** manter em um lugar as regras que transformam o documento e a timeline, deixando a página como composição e ponto de ligação dos comandos. O nome legado `patchStudio` foi trocado por `patchDocument`, alinhando a regra ao domínio próprio do Editor V6.

**Compatibilidade:** nenhuma mudança em schema, persistência, IPC, IDs, renderização, ordenação de camadas ou comportamento de undo/redo foi intencional. O diff moveu a lógica existente para o módulo novo.

**Verificação:** 8 testes focados passaram (`editor-v6-document-commands` e `editor-v6-delete-selected-command`); `npm run typecheck`, `npm run audit:architecture` (717 arquivos), `npm run build` e `git diff --check` também passaram. Exportação com projeto real não foi executada.

**Próximo passo:** revisar seleção/projeção de cena e os handlers de render facial, sem trocar o renderer nem o pipeline de exportação.

### Ciclo 2 — preparação de troca de pose (implementado e verificado)

**Mudança:** criada `editorV6PosePreparation.ts` para preparar o renderer da pose selecionada, medir a largura-base de projetos legados sem `characterCanvasWidth`, renderizar e assar as variantes faciais, liberar os renderers e calcular a geometria. `EditorV6Page` continua responsável por atualizar elemento, assets e revisões de fonte no documento.

**Motivo:** a troca de pose misturava trabalho de Canvas e geometria com a coordenação da tela. O recorte novo tem dependências explícitas e pode ser exercitado sem personagem salvo ou dados reais.

**Compatibilidade:** a sequência e os argumentos de renderização, o cálculo da largura-base, o `faceMode`, o bake das variantes, a atualização de pose e as revisões salvas foram preservados. Não houve mudança de schema, IPC ou formato de projeto.

**Verificação:** 18 testes Vitest e 10 testes Node focados passaram; três testes sintéticos cobrem largura-base legada, largura já salva e descarte do renderer quando o bake falha. `npm run typecheck`, `npm run audit:architecture` (718 arquivos), `npm run build` e `git diff --check` passaram.

**Limite:** sem `app-data` na worktree, a troca ainda não foi exercitada com personagens reais; a mudança não altera o caminho de exportação.

### Ciclo 3 — preparação de aparência facial (implementado e verificado)

**Mudança:** criada `editorV6FaceAppearancePreparation.ts` para reunir a renderização anterior, o crop usado para compensar a troca de imagem, a resolução de modo/efeitos da expressão e o bake da nova aparência. A página ainda controla o renderer compartilhado, a publicação no documento, o histórico e a geometria dependente do tamanho atual do palco.

**Motivo:** a página coordenava diretamente renderizações anterior e nova e também decidia como `expressionState` altera efeitos e modo facial. A regra `Object.hasOwn` é preservada para distinguir propriedade ausente de propriedade explicitamente definida como `undefined`.

**Compatibilidade:** a cache, o cancelamento e as proteções contra preview obsoleto continuam no hook `useEditorV6FacePreview`; a atualização de assets, expressão, transformações e histórico permanece no fluxo existente. Sem mudanças em persistência, IPC ou renderer.

**Verificação:** 20 testes Vitest e 10 testes Node focados passaram; os testes sintéticos conferem a ordem das renderizações, o crop anterior, o modo ativo e o override explícito de `undefined`. `npm run typecheck`, `npm run audit:architecture` (719 arquivos), `npm run build` e `git diff --check` passaram.
