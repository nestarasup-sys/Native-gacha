# Mapa de extrações do Fabricador

## Propriedade

O Fabricador é dono do catálogo-fonte de modelos, poses, roupa, cabelo, expressões e animações. Customizador e Studio consomem snapshots/referências por contratos; extrações não devem copiar catálogo nem inverter essa dependência.

A duplicação de pose cria um novo snapshot no slot vazio do mesmo modelo, com imagens independentes. O IPC valida a origem, reserva o destino na fila de gravação e rejeita slots existentes. O rascunho em edição e os vínculos de exportação permanecem associados aos seus slots originais.

## Padrões com evidência

- A composição de tela é dividida entre `FabricatorPage` e workspaces, mas os workspaces continuam extensos; análise externa identificou `ModelSourceEditor`, `HairWorkspace`, `FaceComponentsWorkspace`, `ExpressionPresetWorkspace` e `AnimatorWorkspace` como cinco áreas grandes.
- A pasta `src/renderer/src/features/fabricator/` contém componentes, modelos puros, hooks e comandos; os domínios Electron e `src/shared` mantêm persistência/contratos fora da UI.
- Os registrars IPC de poses, expressões, cabelo, face, animação, roupas, projetos e source model já separam transporte e serviços (`electron/domains/fabricator/*Ipc.ts`).

## Riscos

- Mover código visual que cria/reordena assets sem mover sua transação correspondente pode deixar preview e catálogo divergir.
- Componentes de workspace acessam comandos/contexto local; extrair sem mapear callbacks e drafts pode quebrar undo, cancelamento e salvamento.
- IDs de slot/pose e referências para Customizador/Studio são contratos persistidos; renomeação de propriedades ou IDs não é refatoração visual.

## Ordem de extração sugerida

1. Extrair subcomponentes de apresentação sem efeitos nem persistência, começando por listas/controles com props pequenas.
2. Extrair hooks de consultas por workspace sem copiar/cachear catálogo-fonte em cada consumidor.
3. Mover sequências de salvamento para comandos do domínio que já possui a entidade, preservando filas e validação.
4. Reduzir `FabricatorPage` a roteamento/composição depois que cada workspace puder montar com estado explícito.
5. Medir renderizações antes/depois; não memoizar se props mudam em cada evento ou se o custo não aparece no profiler.

Manter testes de contrato por domínio e continuidade Fabricador→Customizador/Studio como gate de cada extração. Nenhum arquivo do Fabricador foi alterado nesta fase.
