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
- No início, a worktree não tinha `app-data`. Depois, por solicitação do usuário, a pasta foi copiada da branch principal para esta worktree; esta rodada não abriu projetos ou mídia reais. A refatoração e os testes usam fixtures sintéticas, e um export de ponta a ponta com personagem real ainda não foi executado.

## Sequência de ciclos

1. **Comandos, histórico e edição do documento — implementado e verificado:** retirar da página a coordenação de patch, histórico, undo/redo e gravação de mídia importada.
2. **Projeções de cena e seleção — mapeadas e cobertas:** manter a resolução de cena e a seleção do Inspector em módulos próprios; verificar seleção de bloco, estado no playhead, snapshot-base e assets associados.
3. **Interação do palco:** separar rascunhos de arraste/transformação das edições persistidas, preservando captura do ponteiro, cancelamento e histórico.
4. **Preparação de pose, aparência e transformações faciais — em andamento avançado:** preparação de render/crop/bake, comandos de transform e agora aplicação dos snapshots estão separados; preservar agendamento e cache do preview.
5. **Snapshots de elenco — implementado e verificado:** preparação e publicação do elenco em módulos próprios; manter referência por modelo, geometria, assets retidos e revisões de fonte.
6. **Timeline e mídia — em andamento avançado:** cálculo de arraste, comandos de faixa e linhas visuais da timeline estão separados; preservar virtualização, sincronização e edição transitória.
7. **Exportação — em andamento:** separar registro de jobs e handlers de mídia/cópia; preservar workers, captura, FFmpeg, cancelamento e recuperação.
8. **Medição:** qualquer mudança de performance depende de comparação controlada e paridade de saída, conforme o plano sistêmico existente.
9. **Ciclo de vida dos projetos:** criação/duplicação e exclusão protegida por gravação concluída; manter a ordem de publicação e a seleção coerentes.

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

### Ciclo 4 — materialização de snapshots do elenco (implementado e verificado)

**Mudança:** criada `editorV6CastSnapshots.ts` para renderizar os personagens selecionados e montar os assets e elementos de cena com tamanho, ordem de camada, expressão inicial e revisões de fonte. A página continua dona do plano de inclusão/remoção, da retenção de assets usados por outros elementos e da gravação no documento.

**Motivo:** o handler do elenco combinava montagem dos snapshots com coordenação de modal e estado da tela. A materialização agora pode ser verificada com renderers e referências sintéticas, sem abrir projetos reais.

**Compatibilidade:** referências continuam reutilizadas por `modelSlot`; o bake inicial segue em `idle`; `zIndex`, IDs, referências faciais, revisões e geometria continuam no mesmo contrato. `planEditorV6CastSelection` e `retainEditorV6CastAssets` não foram alterados.

**Verificação:** 22 testes Vitest e 17 testes Node focados passaram, incluindo reuso da referência por modelo, associação de assets e liberação de renderer em falha. `npm run typecheck`, `npm run audit:architecture` (720 arquivos), `npm run build` e `git diff --check` passaram.

**Limite:** o fluxo foi exercitado com personagens e imagens sintéticas; nenhuma `app-data` foi copiada para esta worktree.

### Ciclo 5 — comandos de transformação facial (implementado e verificado)

**Mudança:** criada `editorV6FaceTransformCommands.ts` para reunir a composição dos transforms, a gravação no documento e o agendamento/flush da prévia. A página injeta seleção, estado atual do projeto e os callbacks que já possui.

**Motivo:** o handler ainda combinava edição de rascunho, sincronização com o Inspector e resolução do bloco da timeline. Separar essa coordenação permite testar a prioridade do bloco selecionado e o fallback para o playhead sem acionar renderer ou Canvas.

**Compatibilidade:** cache, debounce e cancelamento permanecem em `useEditorV6FacePreview`; a gravação continua respeitando o parâmetro `record`, e o bloco da timeline continua preferindo o selecionado antes de procurar o do playhead.

**Verificação:** 28 testes Vitest e 17 testes Node focados passaram; cenários cobrem merge de transforms, preview do bloco selecionado, fallback do playhead e elementos que não são personagens. `npm run typecheck`, typecheck explícito dos testes novos, `npm run audit:architecture` (721 arquivos), `npm run build` e `git diff --check` passaram.

**Limite:** a validação cobre comando, seleção de bloco e fluxo do preview; não foi feito export com projeto real, pois a worktree segue sem `app-data`.

### Ciclo 6 — seleção do Inspector (verificado)

**Mudança:** `editorV6Selection.ts` já isolava esta regra; foram adicionados testes diretos para suas prioridades e dados retornados, sem alterar o comportamento.

**Cobertura:** bloco selecionado compatível tem prioridade; sem correspondência, usa-se o estado do playhead; depois vêm elementos visíveis e snapshot-base. Também foram cobertos personagem visível, seleção de mídia de vídeo, asset de fundo e ausência de projeto.

**Observação:** a timeline mantém o último estado de personagem após o fim do último bloco; a fixture reflete esse contrato, sem tratar o estado como clip expirado.

**Verificação:** 12 testes Vitest passaram junto com as regressões de transform facial e arraste do palco; o typecheck explícito da nova fixture passou.

### Ciclo 7 — cálculo de arraste da timeline (implementado e verificado)

**Mudança:** criada `editorV6TimelineDrag.ts` para montar a fotografia estável dos vizinhos/alvos de snap no início do gesto e calcular a prévia de movimento/redimensionamento sem React ou persistência. `EditorV6Timeline` continua dona da captura do ponteiro, estado de rascunho e confirmação em `pointerup` ou descarte em `pointercancel`/Escape.

**Motivo:** a regra de arraste ocupava a tela e misturava coordenadas de ponteiro, limites de timeline, alinhamento e normalização. Separar a transformação pura deixa os invariantes exercitáveis sem Electron ou projeto salvo.

**Compatibilidade:** preservados o snap de 7 pixels e o Alt temporário, o limite de origem de clipes de mídia, estados persistentes de personagem/fundo, deslocamento do próximo bloco e o vínculo de clipes filhos ao vídeo pai. A normalização final e o momento em que o documento é persistido permanecem iguais.

**Verificação:** 33 testes Vitest passaram (`editorV6TimelineDrag`, `editorV6Timeline` e `editorV6Selection`); `npm run typecheck`, `npm run audit:architecture` (722 arquivos), `npm run build` e `git diff --check` passaram. Os novos cenários usam exclusivamente timelines/mídias sintéticas.

### Ciclo 8 — auditoria dos limites da exportação (mapeada; pipeline intacto)

**Caminho confirmado:** `EditorV6ExportPanel` configura e acompanha o job; `editorV6ExportCommands` cria snapshots fora de drafts Immer, valida o plano, prepara o pacote opcional de cabelo e chama a API tipada do preload. `electron/preload.ts` encaminha somente os métodos explícitos, e `exportIpc.ts` valida o remetente/documento/opções, escolhe destino, mantém ownership do job, controla cancelamento e participa do drain no encerramento. `exportRunner.ts` orquestra preparo de personagem/movimento, renderização, codificação, mixagem, validação, publicação e relatório; `exportWorkers.ts` cria BrowserWindows ocultas com sandbox e `exportWorker.tsx` compõe/captura os quadros. `exportProcess.ts` concentra timeout, aborto e encerramento de subprocessos FFmpeg/FFprobe.

**Arquivos e recuperação:** o runner cria uma pasta temporária identificada sob `app.getPath('temp')`, monta partes temporárias, prepara um MP4 candidato ao lado do destino, publica por rename com caminho alternativo para destino ocupado, salva relatório no projeto e remove a pasta temporária somente quando ela está sob a raiz temporária e tem o prefixo esperado. O IPC retém jobs ativos no inventário de operações até o término; o shutdown aborta jobs e drena as promessas.

**Decisão:** não alterar o pipeline nem testar uma exportação real nesta auditoria. O registro/ownership/cancelamento de jobs foi extraído no Ciclo 9 e os handlers de mídia/cópia no Ciclo 11; captura, FFmpeg, formatos persistidos e recuperação continuam fora dessas mudanças.

**Cobertura existente a reutilizar:** `exportIpcLifecycle.test.ts`, `exportProcess.test.ts`, `exportRunner.test.ts`, `exportWorkers.test.ts` e os smokes Electron continuam sendo os gates.

### Ciclo 9 — registro e ownership de jobs de exportação (implementado e verificado)

**Mudança:** criada `electron/domains/editorV6/exportJobRegistry.ts`. A unidade passa a possuir o mapa de jobs, busca do job mais recente por janela, verificação de jobs ativos, cancelamento coletivo, inventário de promessas pendentes e remoção de históricos terminais. `exportIpc.ts` continua registrando canais, validando a origem/UUID e fazendo a transição de status do caso de uso.

**Compatibilidade:** o limite continua em 20 entradas antes de limpar jobs terminais; jobs ativos nunca são removidos. A rota continua restringindo status/cancelamento/relatório à janela proprietária, e o shutdown ainda inclui cada promise ativa no drain. Nenhuma mudança no pipeline, armazenamento, esquema ou IPC público.

**Verificação:** 26 testes Vitest passaram (`exportJobRegistry`, `exportIpcLifecycle`, `exportProcess` e `editorV6TimelineDrag`), incluindo ownership do cancelamento por janela; `npm run test:application:persistence-shutdown` passou (11 testes), assim como `npm run typecheck`, `npm run audit:architecture` (723 arquivos), `npm run build` e `git diff --check`.

### Ciclo 10 — aplicação de aparência facial e pose (implementado e verificado)

**Mudança:** criada `editorV6CharacterAppearanceCommands.ts` para coordenar o preparo de aparência/pose com os snapshots do projeto, edição dos assets, histórico e revisões de origem. `EditorV6Page` agora compõe os preparadores, renderer e comandos; não mantém mais os handlers de gravação facial e pose.

**Compatibilidade:** mantidos o guard de projeto/personagem ocupado, cache e cancelamento do renderer facial, lazy import do renderer de personagem para pose, escolha entre patch sem histórico e `changeScene`, crop anterior, versão do renderer facial, geometria, assets por modo e cálculo de revisões da pose/roupa/cabelo/extras/olhos.

**Verificação:** 32 testes Vitest passaram em oito arquivos relacionados a comandos, preparação de pose/face, preview, snapshots, seleção, transforms e arraste da timeline. `npm run typecheck`, `npm run audit:architecture` (724 arquivos), `npm run build` e `git diff --check` passaram. Os testes usam fixtures sintéticas; não foi executado export com projeto real.

### Ciclo 11 — handlers de mídia da exportação (implementado e verificado)

**Mudança:** importação de mídia e áudio, vínculo a itens da biblioteca e cópia de assets ao duplicar projeto agora são registrados por `exportMediaIpc.ts`. O módulo também concentra a resolução do caminho de áudio usada pela exportação; `exportIpc.ts` permanece responsável por lifecycle, jobs e coordenação do runner.

**Compatibilidade:** preservados os canais IPC, validação de origem e UUIDs, extensões, limites de arquivo/duração, schemas, diretórios, nomes dos arquivos, referências vivas à biblioteca e cópias locais. Toda gravação continua no mesmo `pendingFileWrites`, portanto o shutdown ainda aguarda importações e duplicações em andamento. Nenhuma alteração no schema ou no pipeline de renderização/codificação.

**Verificação:** 38 testes Vitest passaram em seis arquivos de lifecycle/runner/processo/workers/biblioteca; incluídos casos sintéticos de vínculo de áudio e vídeo da biblioteca e cópia local para duplicação de projetos. `npm run typecheck`, `npm run audit:architecture` (725 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 12 — exclusão segura de projetos (implementado e verificado)

**Mudança:** a sequência de exclusão foi movida para `editorV6ProjectDeletion.ts`; `EditorV6Page` mantém a confirmação visual e conecta o comando aos estados e ao bridge do Electron.

**Compatibilidade e proteção:** projetos ativos continuam exigindo flush antes da exclusão. Só depois do sucesso o comando remove o resumo, limpa a seleção correspondente e encerra o projeto ativo; falha no flush ou no IPC conserva o projeto e apresenta o erro. Excluir outro projeto não pausa nem fecha o projeto atual.

**Verificação:** 11 testes Node passaram em `projectDeletion` e `projectCreation`, cobrindo flush, ordem de exclusão, isolamento de projeto não ativo, preservação em erro e ausência de alvo. `npm run typecheck`, `npm run audit:architecture`, `npm run build` e `git diff --check` passaram.

### Ciclo 13 — coordenação da seleção de elenco (implementado e verificado)

**Mudança:** criada `editorV6CastCommands.ts` para coordenar o plano de elenco, a preparação dos snapshots, a retenção dos assets ainda usados, a atualização do documento e o fechamento do seletor. `EditorV6Page` injeta o renderer e continua dona da composição da tela.

**Compatibilidade:** a seleção continua preservando elementos não removidos, ordem Z e assets referenciados. Os assets atuais são lidos dentro da função de atualização para não descartar escritas feitas enquanto os renderers trabalham; erros mantêm o seletor aberto e liberam o estado de gravação.

**Verificação:** 12 testes Vitest passaram em quatro arquivos de comandos, plano, snapshots e aparência do personagem, incluindo uma atualização concorrente de assets. `npm run typecheck`, `npm run audit:architecture`, `npm run build` e `git diff --check` passaram.

### Ciclo 14 — comandos de faixas da timeline (implementado e verificado)

**Mudança:** criada `editorV6TimelineTrackCommands.ts` para coordenar bloqueio, ordenação, renomeação, visibilidade e criação de blocos a partir das faixas. `EditorV6Timeline` conserva eventos de ponteiro, preview do arraste, playback e apresentação.

**Compatibilidade:** permanecem as regras de grupo/ordem das faixas, exceções das faixas bloqueadas, reutilização do estado do objeto no cursor, seleção do bloco de personagem já existente e orientação para importar mídia quando necessário. A criação continua normalizando a timeline e mantendo IDs conhecidos, duração e seleção.

**Verificação:** 35 testes Vitest passaram em três arquivos (`EditorV6Timeline`, comandos de faixa e arraste), cobrindo seleção, mutações bloqueadas, criação de fala/objeto, grupos de ordenação e dicas de importação. `npm run typecheck`, `npm run audit:architecture`, `npm run build` e `git diff --check` passaram.

### Ciclo 15 — linhas visuais da timeline (implementado e verificado)

**Mudança:** movida a renderização memoizada das faixas e dos blocos para `EditorV6TimelineRows.tsx`. `EditorV6Timeline` mantém a captura dos ponteiros, o arraste transitório, o playhead, os atalhos e o menu de ações.

**Compatibilidade:** classes e estrutura visual, ordenação, faixa de fundo, cores por personagem, cálculo dos intervalos de movimento e filtro dos blocos visíveis foram preservados. A memoização continua isolando as linhas das atualizações do playback; o contrato novo é tipado por `EditorV6TimelineRowsProps`.

**Verificação:** 35 testes Vitest passaram nos testes da timeline, comandos de faixa e arraste. `npm run typecheck`, `npm run audit:architecture` (729 arquivos), `npm run build` e `git diff --check` passaram. A suíte usa timelines sintéticas; não foi feito export com projeto real.

### Ciclo 16 — comandos de print (implementado e verificado)

**Mudança:** criada `editorV6PrintCommands.ts` para coordenar flush do documento, captura do quadro atual, gravação do PNG e abertura da pasta de prints. `EditorV6Page` injeta o renderer e a ponte IPC, mantendo os botões e as mensagens na tela.

**Compatibilidade:** a captura continua acontecendo depois do flush, no playhead atual e em 1920×1080 PNG. O tracker de operações continua cobrindo tanto a geração quanto a abertura; erros de flush, renderer e IPC continuam apresentados na página. Nenhum canal, caminho persistido ou formato de projeto foi alterado.

**Verificação:** 5 testes Node focados passaram, incluindo ordem flush/captura/gravação, resolução e MIME, falha antes de salvar, ausência de projeto e erro ao abrir a pasta. `npm run typecheck`, `npm run audit:architecture` (730 arquivos), `npm run build` e `git diff --check` passaram. Os testes usam projeto sintético; nenhuma mídia de `app-data` foi lida.
