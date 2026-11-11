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
2. **Projeções de cena e seleção — implementadas e cobertas:** manter a resolução de cena e a seleção do Inspector em módulos próprios e compor ambas pelo view model da tela; verificar seleção de bloco, estado no playhead, snapshot-base, personagem-fonte e assets associados.
3. **Interação do palco — em andamento avançado:** separar o cálculo puro da posição/destino de movimento do ciclo de captura do ponteiro, preservando rollback, cancelamento e histórico.
4. **Preparação de pose, aparência e transformações faciais — em andamento avançado:** preparação de render/crop/bake, comandos de transform e agora aplicação dos snapshots estão separados; preservar agendamento e cache do preview.
5. **Snapshots de elenco — implementado e verificado:** preparação e publicação do elenco em módulos próprios; manter referência por modelo, geometria, assets retidos e revisões de fonte.
6. **Timeline e mídia — em andamento avançado:** cálculo de arraste, comandos de faixa e linhas visuais da timeline estão separados; preservar virtualização, sincronização e edição transitória.
7. **Exportação — em andamento:** separar planejamento de intervalo/fala, contrato e inicialização do relatório, sondagem/seleção de codificadores, política de tentativas/fallback, prontidão de personagens/movimentos, encerramento/limpeza de jobs, registro de jobs, handlers de mídia/cópia, preparação/cache de movimentos e preparação/mixagem de áudio, ciclo de artefatos temporários, publicação do candidato, composição/codificação/sondagem FFmpeg, transporte de quadros, ciclo de vida de cada trecho, agendamento de tentativas e finalização/validação; preservar workers, captura, cancelamento e recuperação.
8. **Medição:** qualquer mudança de performance depende de comparação controlada e paridade de saída, conforme o plano sistêmico existente.
9. **Ciclo de vida e biblioteca de projetos:** criação/duplicação, exclusão protegida por gravação concluída e apresentação do catálogo; manter a ordem de publicação e a seleção coerentes.

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

### Ciclo 17 — saída segura do projeto (implementado e verificado)

**Mudança:** criada `editorV6ProjectExit.ts` para coordenar o flush de todas as operações pendentes antes de pausar o playback e limpar o estado de projeto, ferramenta, seleção e visualização cheia. A página permanece dona dos setters e da navegação visual.

**Compatibilidade e proteção:** continua usando `flushEditorV6Writes`, que drena operações pendentes e gravações do documento. Se o flush falhar, o projeto continua aberto e a causa é mostrada; os estados só são limpos depois do sucesso. Não houve mudança na persistência ou nos dados salvos.

**Verificação:** 14 testes Node passaram para saída, criação e exclusão, cobrindo ordem de flush, falhas e preservação do projeto ativo. `npm run typecheck`, `npm run audit:architecture` (731 arquivos), `npm run build` e `git diff --check` passaram. A verificação usa projeto sintético.

### Ciclo 18 — preparação e mixagem de áudio na exportação (implementado e verificado)

**Mudança:** criada `electron/domains/editorV6/exportAudio.ts` para mapear áudio de blocos de timeline, combinar com as trilhas de exportação, montar os filtros FFmpeg e classificar erros de decodificação. `exportRunner.ts` continua coordenando a junção final e a política de publicação.

**Compatibilidade:** foram movidas sem alteração as regras de faixas ocultas/mutadas, `audioEnabled`, referência de mídia, ordem entre áudio de exportação e timeline, recorte pelo intervalo, mixagem, recuperação tolerada pelo FFmpeg e identificação da fonte com erro. Não houve alteração no formato do relatório, IPC, documentos ou argumentos do fluxo final.

**Verificação:** 4 testes Node sintéticos cobrem projeção de áudio, recorte, filtros estritos/de recuperação e identificação/classificação de erro. Mais 22 testes Vitest de runner e lifecycle IPC passaram; `npm run typecheck`, `npm run audit:architecture` (732 arquivos), `npm run build` e `git diff --check` passaram. Não foi executado export MP4 real.

### Ciclo 19 — artefatos temporários e relatórios de exportação (implementado e verificado)

**Mudança:** criada `electron/domains/editorV6/exportArtifacts.ts` para criar a pasta temporária identificada do job, gravar o relatório via arquivo temporário e rename, remover o MP4 candidato ausente ou existente e apagar apenas a pasta de exportação com prefixo esperado dentro da raiz permitida. `exportRunner.ts` continua decidindo quando salvar o relatório e como comunicar falhas de limpeza.

**Compatibilidade e proteção:** preservados o prefixo `editor-v6-export-`, o arquivo `.tmp` exclusivo, a publicação atômica do relatório, a tolerância a candidato já removido e o limite de remoção recursiva pela raiz/prefixo. O candidato MP4 segue sendo o caminho oculto e exclusivo calculado para aquele job, ao lado do destino escolhido. A agregação de erro, o aviso após publicação e os estados do job continuam no runner.

**Verificação:** 5 testes Node com diretórios temporários sintéticos cobrem criação, substituição atômica, limpeza após falha no rename, comportamento de `ENOENT` e recusa de caminhos fora da raiz/prefixo. Mais 22 testes Vitest de runner e lifecycle IPC passaram; `npm run typecheck`, `npm run audit:architecture` (733 arquivos), `npm run build` e `git diff --check` passaram. Nenhum MP4 real foi gerado.

### Ciclo 20 — métricas e tempos da exportação (implementado e verificado)

**Mudança:** criada `electron/domains/editorV6/exportMetrics.ts` para acumular histogramas de latência por fase, resumir p50/p95/máximo, somar contadores de quadros e registrar duração das fases principais. `exportRunner.ts` continua definindo quando cada amostra começa e termina e compondo o relatório.

**Compatibilidade:** preservados bucket de 0,1 ms até 200 ms, tratamento de amostras não positivas/não finitas, contagem e arredondamento, métricas de quadro aceitas e valores `phaseMilliseconds` do relatório. As métricas locais de PNG que não fazem parte do tipo compartilhado seguem suportadas no relatório do runner; não houve alteração de IPC ou schema.

**Verificação:** 3 testes Node sintéticos cobrem histogramas/percentis e limite dos buckets, filtros dos contadores e acumulação do tempo de fase. Mais 22 testes Vitest do runner e lifecycle IPC passaram; `npm run typecheck`, `npm run audit:architecture` (734 arquivos), `npm run build` e `git diff --check` passaram. Não foi executado export MP4.

### Ciclo 21 — publicação do candidato validado (implementado e verificado)

**Objetivo:** mover para `exportArtifacts.ts` a regra de mover o MP4 candidato para o destino solicitado e usar um nome de recuperação apenas quando o destino estiver bloqueado. O runner continua determinando o momento em que a publicação é segura, após validação do arquivo.

**Compatibilidade:** preservados os códigos de erro que permitem recuperação (`EPERM`, `EACCES`, `EBUSY`, `EEXIST`), o nome `(recuperado-<8 caracteres do job>)`, o aviso entregue ao usuário e a propagação de outras falhas como falta de espaço. Sem alteração em formato, destino ou momento de publicação.

**Verificação:** 26 testes Vitest do runner e lifecycle IPC passaram, incluindo publicação normal, os quatro códigos recuperáveis e propagação de erro não recuperável. Os 5 testes Node do ciclo de artefatos também passaram; `npm run typecheck`, `npm run audit:architecture` (734 arquivos), `npm run build` e `git diff --check` passaram. Nenhum MP4 real foi gerado.

### Ciclo 22 — composição de vídeos FFmpeg (implementado e verificado)

**Objetivo:** retirar do laço `renderPart` a montagem de argumentos de entrada, filtros de posição/escala/rotação e composição de saída de vídeos sobrepostos. O runner continua planejando os clips e resolvendo caminhos de mídia; o novo módulo só traduz esse plano para argumentos FFmpeg.

**Compatibilidade:** preservados ordem dos clips, seek/duração em segundos, offsets relativos ao início de cada trecho, posicionamento, rotação, sinalização BT.709 e composição da entrada em duas camadas. O runner continua reexportando a constante de filtro de cor pelo caminho antigo. Sem alteração no planejamento compartilhado, nos workers ou nos formatos de exportação.

**Verificação:** 3 testes Node sintéticos cobrem seek, duração, offsets, ordem, posição, rotação e modo em camadas; 30 testes Vitest de runner, lifecycle IPC e paridade da timeline passaram; os 5 testes Node de artefatos também passaram. `npm run typecheck`, `npm run audit:architecture` (735 arquivos), `npm run build` e `git diff --check` passaram. Nenhum MP4 foi gerado.

### Ciclo 23 — apresentação da biblioteca de projetos (implementado e verificado)

**Objetivo:** retirar da `EditorV6Page` a tela de catálogo inicial — cabeçalho, ações, estado de carregamento/vazio, cartões e diálogo de importação — para `EditorV6ProjectBrowser.tsx`. A página continua dona dos hooks, operações, confirmação de exclusão, seleção ativa e gravação/importação.

**Compatibilidade:** mantidos marcação visual, classes, rótulos acessíveis, estado de seleção, condições de habilitação, conteúdo do diálogo e callbacks atuais. A página ainda executa a confirmação de exclusão e a transição para o projeto selecionado. Nenhuma alteração no catálogo persistido, dados reais, navegação ou IPC.

**Verificação:** 4 testes Vitest de renderização cobrem carregamento, lista vazia, diálogo de importação e cartões selecionados; 11 testes Node de criação, duplicação e exclusão passaram. `npm run typecheck`, `npm run audit:architecture` (736 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 24 — finalização e validação da exportação (implementado e verificado)

**Objetivo:** retirar do `exportRunner.ts` a concatenação de trechos, recuperação estrita de falhas decodificáveis no áudio, inspeção das emendas e validação do arquivo final para `exportFinalization.ts`. O runner continua escolhendo a tentativa, o codificador e quando a publicação pode começar.

**Compatibilidade:** mantidos lista de partes relativa à pasta temporária, streams H.264 compatíveis, mixagem/recuperação de áudio, sondagem por pacotes com fallback de quadros, validação de resolução/FPS/duração/áudio e campos de relatório mesmo quando a validação falha. Nenhuma alteração em IPC, schema, argumentos ou publicação.

**Verificação:** 6 testes Node sintéticos cobrem compatibilidade das partes, concatenação, sondagem por pacotes/fallback por quadros, emendas, recuperação de áudio, áudio irrecuperável e preservação da sonda em falha. Mais 4 testes Node de planejamento/filtros de áudio e 26 testes Vitest do runner/IPC passaram. `npm run typecheck`, `npm run audit:architecture` (737 arquivos), `npm run build` e `git diff --check` passaram. Nenhum MP4 foi gerado.

### Ciclo 25 — barra de ferramentas do workspace (implementado e verificado)

**Objetivo:** extrair a barra lateral de ações para `EditorV6ToolRail.tsx`. O componente recebe estados e callbacks da página; criação de comandos, persistência, playback e seleção continuam na `EditorV6Page`.

**Compatibilidade:** mantidos classes e rótulos, ação de voltar/salvar, atalhos de histórico, seleção de ferramenta, disponibilidade de fala/pensamento, condição de exportação, indicadores e ocultação em tela cheia. Os callbacks continuam ligados aos comandos e estados originais da página.

**Verificação:** 3 testes Vitest da barra e 4 da biblioteca de projetos passaram, cobrindo modo de tela cheia, personagem selecionado, ferramenta ativa, estados e mensagens. `npm run typecheck`, `npm run audit:architecture` (738 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 26 — estrutura visual do inspector (implementado e verificado)

**Objetivo:** extrair o contêiner das abas do inspector para `EditorV6Inspector.tsx`. O componente só organiza as abas Editor, Custom e Presets e recebe os painéis como conteúdo; seleção atual, persistência da aba, presets e ações continuam sob responsabilidade da página.

**Compatibilidade:** mantidos posicionamento adaptativo, prevenção de propagação do ponteiro para o canvas, estado ativo das abas, seleção da categoria de expressão ao abrir Presets e restauração da visualização personalizada do personagem.

**Verificação:** 3 novos testes do inspector e 7 testes de regressão da barra e biblioteca de projetos passaram. `npm run typecheck`, `npm run audit:architecture` (739 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 27 — controles de trilha sonora na exportação (implementado e verificado)

**Objetivo:** extrair para `EditorV6ExportAudioSettings.tsx` os controles de seleção, corte, posição, volume e silenciamento das trilhas exportadas. A `EditorV6ExportPanel` segue dona da gravação no documento, vínculo com a Biblioteca V6 e abertura do seletor de áudio. As conversões de segundos/quadros foram reunidas em `editorV6ExportTime.ts`.

**Compatibilidade:** mantidos FPS 30, arredondamento e limites numéricos, edição por ID, `updatedAt`, remoção, limite de 32 clipes, bloqueio durante exportação e referência do áudio pela biblioteca. Nenhuma mudança em IPC, schema, documento salvo ou mixagem.

**Verificação:** 4 testes novos cobrem o painel, limite e conversões; 16 testes existentes de exportação e presets passaram (20 no total). `npm run typecheck`, `npm run audit:architecture` (741 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 28 — consulta do status de exportação (implementado e verificado)

**Objetivo:** isolar o polling de status do job em `editorV6ExportStatusPolling.ts`, mantendo o painel responsável pelo estado visual, mensagem de erro e integração com o preload.

**Compatibilidade:** a consulta continua imediata e depois a cada 500 ms; falhas são mostradas e tentadas novamente; resultados de chamadas em andamento são ignorados após desmontagem; estados terminais continuam sendo `completed`, `cancelled` e `failed`. Canais IPC, payload, job lembrado e sequência de exportação permanecem iguais.

**Verificação:** 4 testes novos exercitam repetição, erro, cancelamento e estados; 22 testes de exportação e presets passaram (26 no total), mais os 18 testes do ciclo de vida IPC. `npm run typecheck`, `npm run audit:architecture` (742 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 29 — codificação e sondagem de mídia FFmpeg (implementado e verificado)

**Objetivo:** mover a montagem dos argumentos H.264 para `exportEncoding.ts` e a sondagem FFprobe para `exportMediaProbe.ts`. `exportMediaIpc` agora depende diretamente da sondagem, sem carregar o runner de exportação como módulo auxiliar.

**Compatibilidade:** `exportRunner` mantém reexports de `encodingArgs`, `probeExportMedia` e do tipo `MediaProbe`; preservados preset de CPU restrito ao harness, perfis H.264, metadados BT.709, flags de contagem de quadros/pacotes, sinal de cancelamento e parsing JSON. Canais e payloads IPC não mudaram.

**Verificação:** 4 testes sintéticos de sondagem, 9 de codificação/publicação/reexportação e 18 testes do ciclo IPC passaram (31 no total). `npm run typecheck`, `npm run audit:architecture` (744 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 30 — transporte dos quadros renderizados (implementado e verificado)

**Objetivo:** retirar do runner o laço que solicita cada quadro do worker, reutiliza o último bitmap válido, grava no pipe do FFmpeg e agrega métricas/tempos em `exportFramePipeline.ts`. O runner continua dono da preparação da parte, processo FFmpeg e limpeza de worker.

**Compatibilidade:** preservados reuso do último bitmap, erro para bitmap ausente, contagem de quadros escritos, progresso global, limites de timeout/cancelamento no writer, métricas por quadro e atualização dos relatórios parciais. Sem mudanças no protocolo do worker, conteúdo de quadros, FFmpeg ou relatório.

**Verificação:** 3 testes novos cobrem escrita/reuso, falhas e cancelamento; 9 testes existentes de compatibilidade e 18 de ciclo IPC passaram (30 no total). `npm run typecheck`, `npm run audit:architecture` (745 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 31 — ciclo de vida de cada trecho de exportação (implementado e verificado)

**Objetivo:** extrair do `exportRunner.ts` a preparação de loops de boca, composição FFmpeg, criação do worker, streaming dos quadros, sondagem e encerramento de recursos para `exportPartRenderer.ts`. O runner continua responsável por agrupar trechos, atualizar o relatório global e agregar as métricas de boca.

**Compatibilidade:** preservados o nome e caminho dos MP4 temporários, argumentos de codificação, associação de mídias, paralelismo, progresso global, contadores, métricas parciais, validação da quantidade de quadros, cancelamento, abortamento em falha e limpeza do worker/processo. O progresso da preparação de boca mantém a contagem global de quadros já concluídos. Nenhuma mudança em IPC, schema, documento ou formato do relatório.

**Verificação:** 4 testes novos cobrem sucesso, preparação de boca, erro de preparação e falha do worker; junto com 30 regressões do pipeline, runner e lifecycle IPC, 34 testes passaram. `npm run typecheck`, `npm run audit:architecture` (746 arquivos), `npm run build` e `git diff --check` passaram. Nenhum MP4 real foi gerado.

### Ciclo 32 — preparação de movimentos e diagnóstico de cache (implementado e verificado)

**Objetivo:** mover a coordenação de `prepareExportMotions`, seleção de concorrência, progresso e amostras/deltas do cache para `exportMotionPreparation.ts`. O runner continua controlando o tempo da fase, atualizando o relatório de execução, conferindo se todas as transições ficaram disponíveis e decidindo se a exportação prossegue.

**Compatibilidade:** preservados o escopo temporário de cache por export, os limites de três personagens distintos nas amostras, os hashes registrados, a diferença entre contadores antes/depois, a concorrência escolhida pelos modos de teste, o ciclo de boca e as mensagens de progresso. A leitura inicial do cache continua fora do bloco temporizado, e nenhuma alteração foi feita em bake, cache persistente, IPC ou formatos.

**Verificação:** 3 testes novos cobrem configuração/progresso, diferença e limite de amostras do cache e propagação de falha; junto com os testes de motions, renderer por trecho, pipeline, runner e lifecycle IPC, 61 testes passaram. `npm run typecheck`, `npm run audit:architecture` (747 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação real foi executada.

### Ciclo 33 — planejamento do intervalo de exportação (implementado e verificado)

**Objetivo:** extrair para `exportPlanning.ts` a aplicação de opções padrão, detecção de fala ativa no intervalo, divisão em trechos, validação do override do harness isolado e restrição de plataforma. O runner continua usando o plano para agendar as tentativas e decidir o fallback Turbo/CPU.

**Compatibilidade:** preservados `mouthLoop: true`, teste de sobreposição da fala com o intervalo e exclusão de faixa oculta/silenciada ou bloco sem personagem, divisão padrão de 300 quadros e de 150 quadros apenas para quatro workers quando o harness está ativo. A divisão de fallback continua em 300 quadros; a ordem de validação e as mensagens de erro também foram mantidas.

**Verificação:** 9 testes novos cobrem normalização, Turbo sem fala, divisão de fala, filtros, override do harness e plataforma. Junto com as regressões de preparação de movimentos, renderer por trecho, pipeline, runner e lifecycle IPC, 46 testes passaram. `npm run typecheck`, `npm run audit:architecture` (748 arquivos), `npm run build` e `git diff --check` passaram. Nenhum benchmark ou MP4 foi executado.

### Ciclo 34 — contrato e inicialização do relatório de exportação (implementado e verificado)

**Objetivo:** mover o tipo do relatório, os metadados da build/runtime, as métricas RSS iniciais e o contexto de vídeo para `exportReport.ts`. `exportRunner.ts` continua reexportando `EditorV6ExportReport`, preservando os importadores atuais de `main` e IPC.

**Compatibilidade:** mantidos os campos, valores iniciais, SHA/estado dirty da build, FPS, janela de quadros, saída e frequência de amostragem RSS. O plano de overlays agora é calculado uma vez e alimenta tanto `layeredVideo` quanto a contagem de nomes de arquivo distintos no relatório; o planejamento compartilhado é puro e não altera o documento.

**Verificação:** 2 testes novos cobrem a forma inicial do relatório, contagem única de vídeos, contexto com/sem camada e metadados runtime. Junto com as regressões de planejamento, preparação de movimentos, renderer por trecho, pipeline, runner e lifecycle IPC, 48 testes passaram. `npm run typecheck`, `npm run audit:architecture` (749 arquivos), `npm run build` e `git diff --check` passaram. Nenhum benchmark ou MP4 foi executado.

### Ciclo 35 — sondagem e seleção de codificadores (implementado e verificado)

**Objetivo:** extrair a sonda de capacidade FFmpeg e a seleção dos codificadores preferidos/de fallback para `exportEncoderSelection.ts`. O runner segue decidindo quando sondar inicialmente e quando tentar o fallback depois de uma falha Turbo.

**Compatibilidade:** preservados argumentos da sonda, registro do sucesso/erro por codificador, tempo da fase, propagação do cancelamento, ordem Automática (NVENC, QSV, AMF, Media Foundation, x264 e OpenH264), ordem CPU (x264 e OpenH264) e preferência pelos codificadores CPU já selecionados no fallback. Nenhuma mudança em FFmpeg, IPC, relatório ou formato do MP4.

**Verificação:** 6 testes novos cobrem argumentos, registro, cancelamento, ordem das preferências e seleção de fallback. Junto com regressões de relatório, planejamento, preparação de movimentos, renderer por trecho, pipeline, runner e lifecycle IPC, 54 testes passaram. `npm run typecheck`, `npm run audit:architecture` (750 arquivos), `npm run build` e `git diff --check` passaram. Nenhum benchmark ou MP4 foi executado.

### Ciclo 36 — agendamento das tentativas de renderização (implementado e verificado)

**Objetivo:** mover do `exportRunner.ts` para `exportAttemptRenderer.ts` o ciclo de uma tentativa: limite de concorrência por grupos de trechos, atualização de progresso, salvamento dos relatórios parciais, agregação dos diagnósticos de animação da boca e limpeza do listener de cancelamento. O runner continua escolhendo o encoder, criando o plano e decidindo quando iniciar fallback ou finalização.

**Compatibilidade:** preservados o número de tentativas, a ordem e o conteúdo dos relatórios por trecho, o salvamento após cada grupo concluído, a contagem global de quadros, o limite de detalhes da animação da boca, os erros/fallbacks, a propagação do cancelamento e os tempos de renderização. O listener agora também é removido se a atualização inicial de progresso lançar erro. Sem alterações em FFmpeg, workers, IPC, documento, schema ou arquivos exportados.

**Verificação:** 4 testes sintéticos novos cobrem limite/ordenação dos grupos, agregação das métricas da boca, preservação do relatório parcial em falha de renderização e liberação do listener quando o próprio callback de progresso falha. Junto com as regressões de encoder, relatório, planejamento, motions, renderer por trecho, pipeline, runner e lifecycle IPC, 58 testes passaram; `npm run typecheck` passou. Nenhum benchmark ou MP4 real foi executado.

### Ciclo 37 — política de fallback da exportação (implementado e verificado)

**Objetivo:** mover para `exportFallbackStrategy.ts` a regra de paralelismo Turbo, elegibilidade do retry em CPU, divisão da faixa de fala em blocos de 300 quadros e mensagens de fallback. `exportRunner.ts` continua montando as dependências da execução e registrando o resultado da validação no relatório.

**Compatibilidade:** preservados overrides do harness isolado, bloqueio de fallback para CPU, projetos de uma parte e Turbo obrigatório, propagação imediata do cancelamento, seleção de encoder CPU e o fato de que falhas na renderização/finalização entram no mesmo fluxo de recuperação existente. Sem alterações em workers, FFmpeg, IPC, documento, schema ou publicação do MP4.

**Verificação:** 4 testes sintéticos novos cobrem paralelismo do harness, retry com CPU e divisão de fala, cenários sem retry e cancelamento. Junto com as regressões do agendamento, encoder, relatório, planejamento, motions, renderer por trecho, pipeline, runner e lifecycle IPC, 62 testes passaram; `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram. Nenhum benchmark ou MP4 real foi executado.

### Ciclo 38 — encerramento e limpeza do job de exportação (implementado e verificado)

**Objetivo:** mover para `exportRunCleanup.ts` a liberação do escopo do cache de movimento, parada do sampler de memória, atualização de tempo/RSS e a limpeza do candidato e pasta temporária. `exportRunner.ts` continua sendo dono da publicação e informa ao cleanup se o MP4 já foi publicado.

**Compatibilidade:** preservados a ordem da liberação/medição/gravação/remoção, o relatório final para jobs não publicados, a agregação das falhas secundárias sem perder o erro principal e o comportamento de não invalidar o MP4 publicado quando a limpeza falha; nesse caso, permanece o aviso salvo no relatório e no log. Os caminhos de remoção continuam usando os guardas de `exportArtifacts.ts`. Nenhuma mudança em FFmpeg, IPC ou formatos.

**Verificação:** 4 testes sintéticos cobrem ordem da limpeza, agregação de erros, aviso após publicação e sucesso sem falhas; junto com as regressões da estratégia de fallback, agendamento, encoder, relatório, planejamento, motions, renderer por trecho, pipeline, runner e lifecycle IPC, 66 testes Vitest passaram. Mais 5 testes Node de criação/limpeza e proteção de caminhos de artefatos passaram. `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram. Nenhum benchmark ou MP4 real foi executado.

### Ciclo 39 — prontidão de personagens e movimentos para exportação (implementado e verificado)

**Objetivo:** mover para `exportReadiness.ts` o carregamento dos snapshots de personagens, chamada de preparação dos movimentos, publicação de progresso/contadores, preenchimento das métricas/cache no relatório e a barreira que impede continuar com transições faltantes. O runner segue cuidando de encoder, renderização, fallback, finalização e publicação.

**Compatibilidade:** preservados o cancelamento antes do carregamento, as medições separadas de carregamento e preparação, a amostra anterior do cache, parâmetros de concorrência/bake, mensagens de progresso, relatório parcial de falha e gravação do relatório após preparar a cena. Nenhuma mudança no bake, cache, documento, schema, IPC ou MP4.

**Verificação:** 3 testes sintéticos cobrem carregamento/preparo/progresso, bloqueio por movimento ausente e cancelamento antecipado. Junto com as regressões de cleanup, fallback, agendamento, encoder, relatório, planejamento, motions, renderer por trecho, pipeline, runner e lifecycle IPC, 69 testes Vitest passaram; os 5 testes Node de proteção dos artefatos também passaram. `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram. Nenhum benchmark ou MP4 real foi executado.

### Ciclo 40 — view model da prévia e do Inspector (implementado e verificado)

**Objetivo:** reunir em `editorV6SceneViewModel.ts` a resolução da cena no playhead, fundo padrão, itens visíveis e seleção do Inspector, junto com os dados do personagem selecionado usados pelos controles de pose/rosto. `EditorV6Page` continua compondo hooks, comandos e componentes da tela.

**Compatibilidade:** preservados `includeMotion: false` na prévia, prioridade do bloco selecionado sobre o estado no playhead, ator visível para ações na cena, fundo padrão sem projeto, fallback de pose/aparência para os valores do personagem e prioridade de valores explícitos salvos no estado da cena. Nenhum renderer, estado persistido ou contrato IPC foi alterado.

**Verificação:** 3 testes novos cobrem projeto ausente, bloco selecionado com playhead em outro estado e overrides explícitos de face/pose. Junto com as regressões de seleção, timeline e face, 39 testes passaram em 4 arquivos. `npm run typecheck`, `npm run audit:architecture`, `npm run build` e `git diff --check` passaram.

### Ciclo 41 — regra de movimento do palco separada do hook (implementado e verificado)

**Objetivo:** mover o tipo do rascunho, a conversão de pixels para posição percentual e a aplicação do destino para `editorV6StageDrag.ts`. `useEditorV6StageInteraction.ts` continua dono dos eventos de ponteiro, seleção, captura, publicação transitória, rollback e histórico.

**Compatibilidade:** preservados o limiar de 2 pixels, a transformação baseada no tamanho do palco, edição por período para personagens, gravação do fundo e atualização do layout do vídeo. Os símbolos continuam reexportados pelo caminho antigo do hook para manter os importadores existentes.

**Verificação:** 36 testes de arraste/timeline e regressões de seleção passaram em 4 arquivos. `npm run typecheck`, `npm run audit:architecture`, `npm run build` e `git diff --check` passaram. Nenhum benchmark foi executado.

### Ciclo 42 — preparação de início do arraste do palco (implementado e verificado)

**Objetivo:** mover para `editorV6StageDrag.ts` a preparação do rascunho do gesto: identificar o bloco editável, preparar o estado do quadro, calcular o ponto inicial e resolver o layout de vídeo. O hook de interação continua dono da seleção da interface, pausa, eventos de ponteiro, captura, movimento transitório, rollback e histórico.

**Compatibilidade:** preservados seleção antes das validações de bloqueio, quadro calculado sem motion, bloqueios de faixa e personagem, layout salvo/default do vídeo, coordenadas percentuais, alvo e bloco editados, cancelamento e publicação do histórico. Se um estado de fundo inconsistente não produzir bloco editável, o gesto agora simplesmente não começa em vez de falhar durante o clique. Nenhum dado persistido, IPC, renderer ou exportação foi alterado.

**Verificação:** 42 testes relacionados a arraste, timeline e seleção passaram em 4 arquivos; `npm run typecheck`, `npm run audit:architecture` (756 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou medição de velocidade foi executada.

### Ciclo 43 — inclusão de objetos compartilhados (implementado e verificado)

**Objetivo:** retirar da página a criação do elemento imagem ao selecionar um objeto da biblioteca. O comando passa a ser dono da validação da faixa, da criação do elemento/bloco no playhead e do foco no Inspector; a página só injeta estado e callbacks.

**Compatibilidade:** preservados o limite de faixa Objetos, mensagem de erro, geração de IDs, tamanho/posição padrão, ordem Z, quadro atual, atualização de `updatedAt`, vínculo ao asset da biblioteca e seleção do bloco/elemento. Nenhum asset é duplicado e o projeto salvo mantém o mesmo formato.

**Verificação:** os testes sintéticos do novo comando e regressões de texto/remoção passaram (14 no total); `npm run typecheck`, `npm run audit:architecture` (757 arquivos), `npm run build` e `git diff --check` passaram. A asserção da regressão de texto foi atualizada para acompanhar a divisão atual entre `EditorV6Page` e `EditorV6ToolRail`.

### Ciclo 44 — rollback e confirmação do arraste do palco (implementado e verificado)

**Objetivo:** retirar do hook as decisões de finalização do gesto. `editorV6StageDragLifecycle.ts` passa a executar rollback de cancelamento e confirmação com histórico, mantendo o hook responsável por reconhecer os eventos e liberar o estado transitório.

**Compatibilidade:** no cancelamento, restaura apenas se o mesmo projeto continua ativo, repõe a seleção de bloco correta por alvo e não cria histórico. Na conclusão, preserva a última posição transitória, registra o snapshot anterior antes da atualização de `updatedAt` e marca como não salvo. Cliques sem movimento continuam sem escrita nem histórico. Nenhum schema, canal IPC ou arquivo de projeto foi alterado.

**Verificação:** 47 testes de arraste, timeline, seleção e lifecycle passaram em 5 arquivos; `npm run typecheck`, `npm run audit:architecture` (758 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou medição de velocidade foi executada.

### Ciclo 45 — atalhos globais da página (implementado e verificado)

**Objetivo:** mover a política de Escape, desfazer e refazer para `editorV6KeyboardShortcuts.ts`, deixando a página fornecer o estado do editor e os comandos atuais.

**Compatibilidade:** preservada a prioridade do cancelamento de arraste, o bloqueio em campos/modal, fechamento do seletor e da visualização, e os atalhos Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z e Ctrl/Cmd+Y.

**Verificação:** 4 testes sintéticos de atalhos passaram; `npm run typecheck`, `npm run audit:architecture` (759 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 46 — reset da sessão de projeto (implementado e verificado)

**Objetivo:** separar a limpeza de histórico, playhead e seleções ao ativar projeto para `editorV6ProjectSession.ts`, mantendo a página como ponto de coordenação do efeito de ciclo de vida.

**Compatibilidade:** mantém a mesma sequência e só executa para um ID de projeto ativo; sem alteração de persistência, histórico salvo, documento, IPC ou biblioteca.

**Verificação:** 2 testes sintéticos passaram; `npm run typecheck`, `npm run audit:architecture` (760 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 47 — navegação para projeto ativo (implementado e verificado)

**Objetivo:** centralizar a transição que sincroniza o projeto destacado na biblioteca com o ID ativo do editor, usada ao abrir projeto existente e após importar.

**Compatibilidade:** a ordem permanece selecionar e depois ativar; criação/duplicação seguem apenas destacando o projeto na biblioteca, sem abri-lo automaticamente. A ref do ID ativo continua sendo atualizada pelo setter existente; carregamento stale-safe e persistência não mudam.

**Verificação:** 3 testes de navegação/sessão passaram; `npm run typecheck`, `npm run audit:architecture` (761 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 48 — leitura stale-safe do projeto ativo (implementado e verificado)

**Objetivo:** mover a coordenação assíncrona de abertura e a barreira de geração para `editorV6ActiveProjectLoad.ts`, cobrindo troca rápida, desmontagem e estados ausentes.

**Compatibilidade:** preservados carregamento do documento mais recente selecionado, limpeza e playhead zero sem projeto, mensagens de erro, estado salvo limpo após leitura e descarte de resposta supersedida. Nenhum contrato IPC ou dado persistido mudou.

**Verificação:** 6 testes de carregamento, navegação e sessão passaram em 3 arquivos; `npm run typecheck`, `npm run audit:architecture` (762 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 49 — bootstrap cancelável do catálogo (implementado e verificado)

**Objetivo:** tirar do hook a publicação do catálogo inicial, a limpeza do loading e o cancelamento após desmontagem; manter o serviço de migração como dono da leitura e gravação dos documentos legados.

**Compatibilidade:** preservados a ordem de publicação, a limpeza do `localStorage` somente após sucesso, a mensagem de falha e a conclusão do estado loading. Respostas de um efeito cancelado não alteram estado nem removem dados legados.

**Verificação:** 9 testes de bootstrap e lifecycle passaram em 4 arquivos; `npm run typecheck`, `npm run audit:architecture` (763 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 50 — conclusão da importação React JSON (implementado e verificado)

**Objetivo:** retirar do JSX da página a publicação e ativação do projeto após a importação React JSON, centralizando a sequência em `editorV6ProjectImportCompletion.ts`.

**Compatibilidade:** o diálogo continua aguardando a gravação (`onSave`) antes de chamar o callback de conclusão. A sequência permanece resumo no catálogo, seleção, ativação, estado salvo, fechamento do diálogo e limpeza do erro. Nenhum documento, formato JSON, persistência ou contrato IPC foi alterado.

**Verificação:** teste novo cobre a ordem dos efeitos da conclusão; junto com a regressão da navegação, 2 testes passaram em 2 arquivos. `npm run typecheck`, `npm run audit:architecture` (764 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 51 — comandos de seleção do palco e timeline (implementado e verificado)

**Objetivo:** mover a coordenação de abrir o seletor de elenco, travar posições, selecionar personagem no palco e selecionar bloco na timeline para `editorV6StageSelection.ts`. A página segue fornecendo estado, callbacks e componentes.

**Compatibilidade:** preservados os IDs de personagem usados para iniciar o seletor, o bloqueio aplicado a todos os elementos de personagem, a seleção do bloco do playhead, a pausa antes da seleção no palco e o tratamento distinto de personagem/fundo na timeline. A edição da trava continua passando por `changeScene`, mantendo histórico e autosave; nenhum documento ou contrato IPC foi alterado.

**Verificação:** 5 testes novos cobrem abertura do elenco, trava, seleção de personagem e fundo, e ausência de projeto/personagens. Com as regressões próximas de elenco, seleção, timeline e arraste, 68 testes passaram em 9 arquivos. `npm run typecheck`, `npm run audit:architecture` (765 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 52 — undo e redo do documento (implementado e verificado)

**Objetivo:** separar os comandos de undo e redo de `editorV6DocumentCommands.ts` para `editorV6HistoryCommands.ts`; o comando de documento fornece o patch e os setters da interface.

**Compatibilidade:** mantidos o projeto ativo como contexto do histórico, a leitura do histórico após cada operação, os flags de disponibilidade, a atualização da versão e o patch com `editSelection: false`, que evita reescrever snapshots selecionados da timeline. O histórico continua no mesmo store e não muda a persistência do projeto.

**Verificação:** 2 testes novos cobrem undo/redo, estado sem histórico e ausência de projeto ativo. Com regressões de atalhos, sessão e lifecycle do palco, 13 testes passaram em 4 arquivos. `npm run typecheck`, `npm run audit:architecture` (766 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 53 — persistência de importações de cena (implementado e verificado)

**Objetivo:** extrair de `editorV6DocumentCommands.ts` a leitura do documento mais recente e a persistência ordenada de alterações importadas para `editorV6DocumentImportPersistence.ts`.

**Compatibilidade:** mantém a leitura em memória quando o ID ativo corresponde e o fallback ao bridge do Electron; só altera o documento ativo quando fonte e sessão ainda correspondem. A gravação continua antes da publicação do resumo; falhas são propagadas, e respostas obsoletas não limpam estado salvo/erro de outra sessão. Nenhum formato persistido ou canal IPC mudou.

**Verificação:** 5 testes novos cobrem fallback/cache, sequência de gravação, resposta obsoleta antes e durante a gravação e erro de persistência. Com regressões de histórico e conclusão de importação, 8 testes passaram em 3 arquivos. `npm run typecheck`, `npm run audit:architecture` (767 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 54 — mutações do documento de cena (implementado e verificado)

**Objetivo:** extrair de `editorV6DocumentCommands.ts` as mutações de elementos, cor do nome, escala/posição dos balões, blocos de vídeo e fundo para `editorV6SceneDocumentCommands.ts`.

**Compatibilidade:** edições registradas continuam usando `changeScene`; ajustes diretos seguem usando `patchDocument`; valores de fundo continuam aplicados no playhead e blocos de vídeo continuam normalizados. Ao remover personagem, só se elimina asset sem referência, preservando imagens ainda usadas por outro elemento. Sem mudança no formato persistido ou IPC.

**Verificação:** 6 testes novos cobrem remoção e retenção de assets, histórico vs. patch, propriedades de balão/nome, normalização de vídeo e fundo no playhead. Com regressões de cena, timeline, seleção, arraste, histórico e importação, 79 testes passaram em 12 arquivos. `npm run typecheck`, `npm run audit:architecture` (768 arquivos), `npm run build` e `git diff --check` passaram.
