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
4. **Timeline e mídia:** revisar comandos, geometria visível e sincronização; manter a virtualização atual e evitar recriar estado persistido.
5. **Exportação:** documentar os limites entre job, workers, captura, FFmpeg, cancelamento e recuperação antes de considerar mudanças no pipeline.
6. **Medição:** qualquer mudança de performance depende de comparação controlada e paridade de saída, conforme o plano sistêmico existente.

Os ciclos são independentes; a ordem pode mudar quando o código ou uma regressão demonstrar outra causa prioritária.

## Registro

### Ciclo 1 — comandos do documento e histórico (implementado e verificado)

**Mudança:** criada a fábrica `createEditorV6DocumentCommands` em `src/renderer/src/features/editorV6/editorV6DocumentCommands.ts`. A página injeta os estados e serviços atuais; o módulo reúne edição de documento e snapshots, handlers de cena/fundo/vídeo, gravação de imports, histórico e undo/redo.

**Motivo:** manter em um lugar as regras que transformam o documento e a timeline, deixando a página como composição e ponto de ligação dos comandos. O nome legado `patchStudio` foi trocado por `patchDocument`, alinhando a regra ao domínio próprio do Editor V6.

**Compatibilidade:** nenhuma mudança em schema, persistência, IPC, IDs, renderização, ordenação de camadas ou comportamento de undo/redo foi intencional. O diff moveu a lógica existente para o módulo novo.

**Verificação:** 8 testes focados passaram (`editor-v6-document-commands` e `editor-v6-delete-selected-command`); `npm run typecheck`, `npm run audit:architecture` (717 arquivos), `npm run build` e `git diff --check` também passaram. Exportação com projeto real não foi executada.

**Próximo passo:** revisar os demais handlers ainda definidos na página e decidir, com base nos fluxos reais, se a próxima extração é seleção/projeção de cena ou interação do palco. Não iniciar uma troca de renderer ou do pipeline de exportação nesta etapa.
