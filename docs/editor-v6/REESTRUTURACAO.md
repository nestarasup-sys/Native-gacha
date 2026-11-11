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

### Ciclo 55 — transações de edição do documento (implementado e verificado)

**Objetivo:** extrair o registro de histórico, os patches no documento ou snapshot selecionado, a prévia facial stale-safe e a sincronização de alterações de cena para `editorV6DocumentEditing.ts`.

**Compatibilidade:** mantém a prioridade do bloco selecionado e o fallback ao clip no playhead, a edição global quando não há seleção aplicável, a normalização/reparo/limpeza de snapshots após o patch e o registro de histórico antes da sincronização de cena. A prévia facial continua protegida pelo ID ativo e não grava snapshot de outro projeto. Nenhum contrato salvo ou IPC mudou.

**Verificação:** 6 testes novos cobrem edição do bloco selecionado, fallback do playhead, edição base sem seleção, descarte de prévia stale, sincronização de faixas e ausência de projeto ativo. Com regressões de documento, timeline, motions e arraste, 103 testes passaram em 9 arquivos. `npm run typecheck`, `npm run audit:architecture` (769 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 56 — ciclo de ponteiro da timeline (implementado e verificado)

**Objetivo:** retirar de `EditorV6Timeline.tsx` a captura de ponteiro, o scrubbing da régua, o preview transitório de arraste, a confirmação e o cancelamento para `editorV6TimelinePointerCommands.ts`.

**Compatibilidade:** preservados cálculo de quadros pela escala atual, snapping/Alt, preview sem mutação da timeline persistida, commit somente ao soltar depois de movimento, cancelamento sem gravação, seek/seleção no pointer down e captura por ID de ponteiro. A renderização continua no componente e usa o mesmo estado transitório.

**Verificação:** 4 testes novos cobrem captura/preview/commit, cancelamento, scrubbing e bloqueios de botão/faixa. Com regressões de timeline, seleção e edição do documento, 50 testes passaram em 6 arquivos. `npm run typecheck`, `npm run audit:architecture` (770 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 57 — resolução de atalhos da timeline (implementado e verificado)

**Objetivo:** retirar do efeito de teclado em `EditorV6Timeline.tsx` o mapeamento de teclas para ações e quadros, mantendo a execução das ações conectada ao estado atual do componente.

**Compatibilidade:** preservados Ctrl/Cmd+K e D apenas com bloco selecionado; prioridade de Ctrl/Cmd sobre outras teclas; Escape sem `preventDefault`; bloqueio em campos editáveis, diálogos e eventos já tratados; passos de 1/5 quadros limitados pela duração; e teclas de snap, zoom, fit, play e exclusão.

**Verificação:** 4 testes novos cobrem mapeamentos, ausência de seleção, limites do playhead, Escape e bloqueios de evento. Com regressões dos atalhos globais, pointer, timeline e faixas, 47 testes passaram em 6 arquivos. `npm run typecheck`, `npm run audit:architecture` (771 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 58 — cálculos de viewport da timeline (implementado e verificado)

**Objetivo:** extrair para `editorV6TimelineViewport.ts` os cálculos puros de limite de zoom, preservação do centro ao mudar escala, zoom de encaixe e acompanhamento do playhead. O componente continua dono dos refs, estado React, agendamento do frame e escrita de `scrollLeft`.

**Compatibilidade:** mantidos os limites de escala (0,25–960 px/s), centralização durante zoom, fórmula de fit, limiares de 80%/início visível para autoscroll e retorno para a esquerda ao restaurar o encaixe. Nenhuma preferência, documento, persistência ou contrato IPC foi alterado.

**Verificação:** 3 testes novos cobrem zoom/centralização, fit e autoscroll; com regressões de teclado e ponteiro, 11 testes passaram em 3 arquivos. `npm run typecheck`, `npm run audit:architecture` (772 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 59 — modelo de apresentação da timeline (implementado e verificado)

**Objetivo:** mover para `editorV6TimelineViewModel.ts` a derivação da largura do conteúdo, faixa de quadros visível, intervalo dos ticks e lista de marcas da régua. A timeline segue responsável por compor esses dados com os componentes visuais.

**Compatibilidade:** preservados o espaço extra de 160 px para renderização nas bordas, a faixa inferior em zero, as regras atuais de densidade dos ticks e o corte na duração do documento. Nenhum dado persistido ou contrato entre áreas mudou.

**Verificação:** 3 testes novos cobrem conteúdo menor/maior que o viewport, faixa visível, limites de densidade e ticks dentro da duração. Com regressões de viewport, teclado e ponteiro, 14 testes passaram em 4 arquivos. `npm run typecheck`, `npm run audit:architecture` (773 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 60 — medição do viewport da timeline (implementado e verificado)

**Objetivo:** encapsular em `useEditorV6TimelineViewport.ts` o estado de scroll/largura visível, o listener de scroll e a observação de redimensionamento; a tela mantém o ref do elemento porque outras interações da timeline precisam rolar e medir o mesmo nó.

**Compatibilidade:** preservados o viewport inicial de 800 px, o `ResizeObserver` ligado ao elemento de scroll, atualização de `scrollLeft`/`clientWidth` em scroll e resize e a limpeza do observer ao desmontar. Sem mudanças de persistência, documento ou IPC.

**Verificação:** teste unitário valida o mapeamento das métricas DOM para o estado consumido pelo modelo visual. Com regressões de view model, zoom, teclado e ponteiro, 15 testes passaram em 5 arquivos. `npm run typecheck`, `npm run audit:architecture` (774 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 61 — acompanhamento do playhead no hook de viewport (implementado e verificado)

**Objetivo:** concentrar em `useEditorV6TimelineViewport.ts` também o efeito de acompanhamento automático do playhead. O ref do elemento permanece compartilhado pela tela porque ações de ponteiro, zoom e medição usam o mesmo nó.

**Compatibilidade:** a reprodução continua rolando somente quando o playhead ultrapassa 80% da área ou retorna antes do início visível; o destino permanece centralizado na viewport e limitado a zero. A regra matemática existente segue em `editorV6TimelineViewport.ts` e seus testes continuam cobrindo os limites; observer e listener de scroll permanecem conectados ao mesmo elemento.

**Verificação:** 15 testes passaram em 5 arquivos, cobrindo métricas, decisão de follow, view model, atalhos e interações de ponteiro. `npm run typecheck`, `npm run audit:architecture` (774 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 62 — comandos de zoom da timeline (implementado e verificado)

**Objetivo:** mover o zoom manual, o toggle de Fit e a restauração da escala anterior para `editorV6TimelineZoomCommands.ts`. O componente fornece getters atuais, o setter React e o agendador de frames; não carrega mais o estado interno do toggle.

**Compatibilidade:** preservados os limites de 0,25 a 960 px/s, o centro durante zoom, os fatores manuais de 1,25, a centralização do Fit em zero, a alternância para a escala anterior e o cancelamento do estado Fit após zoom manual. O ref permanece compartilhado com viewport e arraste. Nenhum formato de projeto, persistência ou contrato IPC mudou.

**Verificação:** 2 testes novos cobrem zoom centralizado, Fit/restauração, limites e novo Fit após ajuste manual. Com regressões de viewport, view model, teclado e ponteiro, 17 testes passaram em 6 arquivos. `npm run typecheck`, `npm run audit:architecture` (775 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 63 — comandos de edição de blocos da timeline (implementado e verificado)

**Objetivo:** mover exclusão, divisão e duplicação de blocos de `EditorV6Timeline.tsx` para `editorV6TimelineBlockCommands.ts`, deixando a tela ligar os comandos ao menu, atalhos e callback de gravação.

**Compatibilidade:** exclusão segue bloqueada para faixas travadas e remove também blocos filhos referenciados por `parentBlockId`; divisão continua usando o frame atual e as regras de duração/normalização já existentes; duplicação mantém a função compartilhada e fecha o menu após executar. Cada mutação continua passando por `changeTimeline`, portanto mantém o fluxo de snapshots, normalização e histórico/autosave.

**Verificação:** 3 testes novos cobrem exclusão com bloqueio e filhos, divisão e duplicação. Com regressões de zoom, viewport, view model, teclado e ponteiro, 20 testes passaram em 7 arquivos. `npm run typecheck`, `npm run audit:architecture` (776 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 64 — transação de atualização da timeline (implementado e verificado)

**Objetivo:** centralizar em `editorV6TimelineDocumentUpdate.ts` a aplicação de uma transformação à timeline do documento, sua normalização, atualização de `updatedAt` e remoção de snapshots não mais referenciados. O componente permanece responsável por entregar a transformação ao callback de edição do projeto.

**Compatibilidade:** mantida a ordem `update → normalize → timestamp → prune`, incluindo a retenção de snapshots ainda referenciados por blocos. A alteração continua usando o mesmo `onChange` do projeto e não muda schema, IPC, IDs nem armazenamento.

**Verificação:** 2 testes novos cobrem normalização/immutabilidade, timestamp, remoção de snapshot órfão e retenção de referência viva. Com regressões de comandos de bloco, zoom, viewport, view model, teclado e ponteiro, 22 testes passaram em 8 arquivos. `npm run typecheck`, `npm run audit:architecture` (777 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 65 — menu contextual de blocos (implementado e verificado)

**Objetivo:** extrair a renderização do menu contextual para `EditorV6TimelineContextMenu.tsx` e separar em `editorV6TimelineContextMenuModel.ts` o posicionamento e a disponibilidade das ações.

**Compatibilidade:** preservados as classes/ARIA do menu, os deslocamentos e limites de posicionamento, fechar ao clicar fora, seek no início/fim e regras de desabilitação por faixa travada ou cursor fora do bloco. Os handlers seguem usando os comandos de bloco já conectados a `changeTimeline`.

**Verificação:** 3 testes novos cobrem posições nos limites da janela, ações em faixa travada e fronteiras de divisão. Com regressões da transação do documento, comandos de bloco, zoom, viewport, view model, teclado e ponteiro, 25 testes passaram em 9 arquivos. `npm run typecheck`, `npm run audit:architecture` (779 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 66 — execução dos atalhos da timeline (implementado e verificado)

**Objetivo:** separar o despacho de ações de teclado de `EditorV6Timeline.tsx` para `editorV6TimelineKeyboardActions.ts`. O componente mantém o listener de janela, a resolução da tecla e o tratamento de `preventDefault`.

**Compatibilidade:** preservados todos os destinos do switch, o cancelamento conjunto de arraste/menu, os IDs da seleção para divisão/duplicação, o bloqueio dessas ações sem seleção e os callbacks atuais de snap, zoom, fit, seek, play e remoção. Os filtros de campo editável, diálogo e evento já tratado continuam no resolvedor.

**Verificação:** 2 testes novos cobrem roteamento de ações e ausência de seleção; com testes do resolvedor, menu, documento, blocos, zoom, viewport, view model e ponteiro, 27 testes passaram em 10 arquivos. `npm run typecheck`, `npm run audit:architecture` (780 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 67 — modelo de apresentação das faixas (implementado e verificado)

**Objetivo:** extrair para `editorV6TimelineRowsModel.ts` a montagem das linhas de timeline, separação da faixa de fundo, ordenação dos blocos, seleção de blocos visíveis, cálculo de pixels e regra de movimentação entre faixas.

**Compatibilidade:** preservados a ordenação oficial das faixas, a linha de fundo sintética quando não há faixa de vídeo, a exclusão de estados de fundo da linha normal, os limites inclusivos de visibilidade, a largura mínima de 3 px e grupos/faixas fixas usados nos botões de reordenação. O cálculo de transições continua usando `editorV6VisibleMotionPlans` e o mesmo range do viewport.

**Verificação:** 4 testes novos cobrem linhas e faixa de fundo, política de movimento, visibilidade/ordenação e geometria; junto com regressões de planos de movimento (incluindo benchmark unitário), 10 testes passaram em 3 arquivos. `npm run typecheck`, `npm run audit:architecture` (781 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 68 — cabeçalho das faixas da timeline (implementado e verificado)

**Objetivo:** extrair para `EditorV6TimelineTrackHeader.tsx` a interface por faixa: nome/renomeação, recolher, adicionar bloco, visibilidade, trava, animação e controles para reordenar.

**Compatibilidade:** preservados os textos, títulos, estados/ARIA, condição de faixa de fundo, bloqueios de edição e política de movimentação por grupo/faixas fixas. O estado de renomeação segue único na lista e a gravação continua pelo comando `onTrack`.

**Verificação:** com regressões do modelo de linhas, comandos de faixa, blocos e ponteiro, 18 testes passaram em 4 arquivos. `npm run typecheck`, `npm run audit:architecture` (782 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 69 — renderização das faixas e blocos (implementado e verificado)

**Objetivo:** extrair o conteúdo visual/interativo de cada faixa para `EditorV6TimelineLane.tsx`: overlays de transição, blocos visíveis, foco/seleção, arraste, resize e menu contextual. `EditorV6TimelineRows.tsx` fica responsável por compor cabeçalho e faixa.

**Compatibilidade:** mantidos classes, estilos, limites e rótulos dos blocos; eventos continuam encaminhados aos mesmos comandos de ponteiro, seleção, menu e scrubbing. A cor do personagem, visibilidade por range e fade de transição usam o mesmo modelo e dados.

**Verificação:** com regressões do modelo de linhas, planos de movimento, comandos de faixa/bloco e ponteiro, 23 testes passaram em 5 arquivos. `npm run typecheck`, `npm run audit:architecture` (783 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 70 — toolbar e régua da timeline (implementado e verificado)

**Objetivo:** extrair o cabeçalho com controles para `EditorV6TimelineToolbar.tsx` e a régua/ticks para `EditorV6TimelineRuler.tsx`, reduzindo a composição visual em `EditorV6Timeline.tsx`.

**Compatibilidade:** preservados títulos, classes, ARIA, ordem e callbacks dos controles; a régua usa os mesmos intervalos e offsets. A disponibilidade da divisão foi centralizada em `canSplitEditorV6TimelineBlock` e compartilhada entre o botão da toolbar e o menu contextual, mantendo limites estritos no início/fim e bloqueio de faixa.

**Verificação:** regressões de menu/divisão, linhas, faixa, ponteiro e teclado passaram: 27 testes em 7 arquivos. `npm run typecheck`, `npm run audit:architecture` (785 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 71 — composição da prévia e posição do inspetor (implementado e verificado)

**Objetivo:** mover a composição do canvas, cena, título, modo de tela cheia e inspetor flutuante para `EditorV6StageSurface.tsx`. A regra que escolhe o lado do inspetor foi isolada em `editorV6InspectorPlacement.ts`.

**Compatibilidade:** mantidos a limpeza das seleções ao clicar no canvas, o bloqueio da interação da cena em tela cheia, a posição padrão à direita e o deslocamento à esquerda quando a seleção encosta no limite direito. O estado de edição e os callbacks continuam pertencendo a `EditorV6Page`; nenhum contrato, persistência ou dado de projeto mudou.

**Verificação:** 4 testes cobrem o posicionamento do inspetor; com regressões do menu contextual e modelo de faixas, 11 testes passaram em 3 arquivos. `npm run typecheck`, `npm run audit:architecture` (787 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 72 — coordenação da criação de projetos (implementado e verificado)

**Objetivo:** retirar de `EditorV6Page.tsx` o estado de criação e a proteção contra cliques simultâneos, reunindo-os em `useEditorV6ProjectCreation.ts`. O hook conecta o ciclo de vida da interface aos comandos existentes de criação e duplicação; a guarda testável fica em `editorV6ProjectCreationGuard.ts`.

**Compatibilidade:** mantidos o mesmo fluxo de criação/duplicação, mensagens e gravação dos documentos; chamadas repetidas enquanto uma criação está pendente continuam ignoradas e a guarda é liberada também em caso de erro. IDs, formato do projeto, persistência e IPC não mudaram. O teste estrutural de persistência agora verifica exclusão e impressão nos módulos de comando que já são donos desses fluxos.

**Verificação:** 2 testes da guarda passaram; 16 regressões de persistência passaram. `npm run typecheck`, `npm run audit:architecture` (789 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 73 — autosave da projeção de personagem (implementado e verificado)

**Objetivo:** extrair de `EditorV6Page.tsx` o efeito de autosave da projeção do elenco para `useEditorV6ProjectionAutosave.ts`, com as decisões de reset, baseline, skip durante arraste, salvamento imediato e debounce em `editorV6ProjectionAutosaveModel.ts`.

**Compatibilidade:** preservados o baseline ao abrir/trocar de projeto, a suspensão enquanto o ref de arraste está ativo, o salvamento imediato quando a assinatura muda e o debounce de 650 ms para atualizações do mesmo projeto. O hook compartilha o timer usado pelo flush em `useEditorV6DocumentPersistence`; não altera formato, IDs, persistência ou IPC.

**Verificação:** 5 testes cobrem as decisões do autosave; com 2 testes da guarda de criação e 16 regressões de persistência, 23 testes passaram. `npm run typecheck`, `npm run audit:architecture` (791 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 74 — coordenação da aparência de personagem (implementado e verificado)

**Objetivo:** agrupar em `useEditorV6CharacterAppearance.ts` a ligação do preview de rosto, preparação de aparência/pose e comandos de transformação. `EditorV6Page.tsx` fornece a seleção atual, as referências do canvas e os comandos de documento.

**Compatibilidade:** o preview mantém sua cache e validação de trabalho obsoleto; aplicação de aparência e pose continua usando as mesmas preparações, renderizador carregado sob demanda e callbacks de cena/documento. Transformações seguem usando o mesmo ref, frame, atualização do elemento e agendamento/flush do preview. Sem alterações no formato ou persistência do projeto e sem mudanças nos contratos entre áreas.

**Verificação:** 21 testes passaram em 5 arquivos, cobrindo comandos de aparência, preparo de rosto/pose, preview e transformações. `npm run typecheck`, `npm run audit:architecture` (792 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação de vídeo foi executada.

### Ciclo 75 — superfície de renderização da exportação (implementado e verificado)

**Objetivo:** mover de `exportWorker.tsx` para `exportWorkerSurface.tsx` a criação da superfície de captura e do token de composição, além da espera por imagens SVG carregadas.

**Compatibilidade:** preservados tamanho/corte da superfície, codificação do token em 24 bits menos significativos primeiro, validação do intervalo do token, cache de origem carregada, espera pela origem SVG esperada e erros/timeout de imagem. O worker continua renderizando as mesmas cenas e enviando os mesmos quadros ao capturador; nenhuma mídia foi exportada.

**Verificação:** 17 testes passaram em 3 arquivos, incluindo os novos casos de codificação do token e sincronização SVG, além das regressões do capturador/worker. `npm run typecheck`, `npm run audit:architecture` (793 arquivos), `npm run build` e `git diff --check` passaram.

### Ciclo 76 — índices de planos de movimento do cabelo na exportação (implementado e verificado)

**Objetivo:** mover de `exportWorker.tsx` para `exportHairMotionPlanIndex.ts` a indexação dos rigs por asset/pose, transições preparadas, planos de expressão facial e finais de reação de pose.

**Compatibilidade:** mantidos o primeiro rig por pose, a preferência pela pose com fallback para asset direto, a seleção de transições com atlas preparado, a separação de planos só faciais e o uso dos planos de timeline para reações sem atlas. O worker continua consumindo os mesmos mapas e chaves; nenhum dado persistido ou formato de exportação mudou.

**Verificação:** 31 testes passaram em 4 arquivos, incluindo modelo de movimento, índice de transição e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (794 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo foi exportado.

### Ciclo 77 — histórico do caminho da cabeça no movimento de cabelo (implementado e verificado)

**Objetivo:** extrair para `exportHairHeadPathTimeline.ts` os buffers incrementais por quadro, a acumulação do deslocamento da cabeça e o índice binário das mudanças de espelhamento por camada.

**Compatibilidade:** o worker injeta os mesmos resolvedores de cena, rig e amostra de transição. Mantidos o reaproveitamento da cena bruta do quadro exportado, o fallback para transformações do personagem sem rig, a continuidade do último deslocamento quando o personagem some e o uso da geometria física durante transições, sem derivar movimento do recorte visual do atlas.

**Verificação:** 35 testes passaram em 5 arquivos, incluindo os novos casos de acumulação de caminho, personagem ausente, interpolação de geometria física, busca de mudanças de espelhamento e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (795 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 78 — resolução das amostras de boca na exportação (implementado e verificado)

**Objetivo:** extrair para `exportMouthLoop.ts` o índice das amostras de boca por bloco, os aliases entre assets faciais sem boca e o compositor de amostras faladas.

**Compatibilidade:** mantidos o vínculo por ID do personagem e bloco ativo, a seleção entre fala e fala com piscada, o mapeamento do asset base sem boca, o desvio para transições já preparadas e os erros quando falta geometria facial necessária. A função continua recebendo a cena resolvida e devolvendo uma cena imutável.

**Verificação:** 51 testes passaram em 8 arquivos, cobrindo aliases, troca da amostra falada, personagem fora da fala, transição sem patch facial, preparo de amostras, regressões do caminho/rig de cabelo e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (796 arquivos), `npm run build` e `git diff --check` passaram. Nenhuma exportação ou benchmark de mídia foi executado.

### Ciclo 79 — composição raster das camadas de cabelo (implementado e verificado)

**Objetivo:** mover para `exportHairFrameComposer.ts` a montagem das superfícies normais e dos atlas de transição em canvases reutilizáveis. O worker conserva o desenho/warp de cada fio e injeta essa operação no compositor.

**Compatibilidade:** mantidos a ordem posterior/base/rosto/cabelo posterior/olhos sobre cabelo posterior/franja/overlay, a composição e geometria dos atlas, as chaves e o reaproveitamento dos canvases, os erros de superfície ausente e as métricas de quadros/pixels. Nenhum dado de projeto, contrato de exportação ou persistência foi alterado.

**Verificação:** 51 testes passaram em 8 arquivos, incluindo os novos casos de ordem das camadas, reutilização/redimensionamento dos canvases, métricas e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (797 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 80 — avanço do estado físico por fio de cabelo (implementado e verificado)

**Objetivo:** extrair para `exportHairPieceMotionState.ts` a simulação determinística de cada fio: reação pontual após pose, amostragem de ciclo e avanço quadro a quadro, incluindo configurações por lado, identidade da camada posterior, impulso de movimento da cabeça e contadores de tempo.

**Compatibilidade:** o worker mantém a propriedade dos mapas de estado por exportação e injeta presets, fase, caminho da cabeça e relógio. A deformação gráfica e composição de pixels continuam separadas. `hairMotionStateMs` mantém o mesmo intervalo medido, desde a consulta da textura até o fim da simulação.

**Verificação:** 55 testes passaram em 9 arquivos, cobrindo avanço e busca para trás, cache de ciclo, reação apenas em `rearHair:`, regra posterior-only, deformação/composição de cabelo e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (798 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 81 — deformação estática e animada de texturas de cabelo (implementado e verificado)

**Objetivo:** extrair para `exportHairTextureWarper.ts` a escolha entre o canvas estático acolchoado e a deformação WebGL, seus caches e o recorte/blit da viewport para o tamanho original da textura.

**Compatibilidade:** o renderizador WebGL permanece propriedade do worker e é injetado no warper. Preservados dimensões, offsets da textura estática, qualidade de suavização, reutilização separada dos dois canvases, contadores de tempo, recorte do buffer WebGL e mensagens de falha de contexto.

**Verificação:** 58 testes passaram em 10 arquivos, cobrindo cache estático, recorte exato da saída WebGL, acumulação dos tempos, falha de contexto, simulação física, composição raster e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (799 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 82 — resolução do rig de cabelo no quadro de exportação (implementado e verificado)

**Objetivo:** extrair para `exportHairRigAtFrame.ts` a escolha de geometria do cabelo por personagem/quadro, isolando rig direto, rig físico da pose facial em andamento e rig interpolado de transição.

**Compatibilidade:** a função consome os mesmos índices criados pelo planejador de exportação. Mantidos os limites estritos dos planos de expressão, a prioridade da transição preparada, o fallback asset/pose para expressão e a combinação do rig interpolado com a geometria do atlas.

**Verificação:** 61 testes passaram em 11 arquivos, cobrindo rig direto, expressão em andamento e limite do plano, transição com atlas, índices de movimento, física, deformação/composição de cabelo e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (800 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 83 — carregamento e cache de imagens da cena de exportação (implementado e verificado)

**Objetivo:** extrair para `exportFrameAssetImageLoader.ts` a criação e decodificação das imagens necessárias à camada/quadro atual, com cache de promises limitado a 32 entradas.

**Compatibilidade:** o worker mantém a mesma seleção de assets antes do carregamento e o loader preserva a ordem, a deduplicação por ID, a remoção da entrada mais antiga e as mensagens distintas de erro para falha de carga ou decodificação.

**Verificação:** 64 testes passaram em 12 arquivos, cobrindo reuso, limite de cache, falhas de carga/decodificação, seleção de assets, rig e composição de cabelo e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (801 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 84 — decisões de reuso de quadro na exportação (implementado e verificado)

**Objetivo:** extrair para `exportFrameReuse.ts` o estado que compara a chave do quadro completo com as chaves de fundo e primeiro plano em capturas separadas.

**Compatibilidade:** preservadas a ordem das verificações, as decisões de camada reaproveitada e o momento em que cada chave avança após renderização ou reuso do primeiro plano. As chaves visuais e o formato de `EditorV6RenderFrameResult` não mudam.

**Verificação:** 67 testes passaram em 13 arquivos, cobrindo reuso integral, commits independentes de cada camada, atualização da chave completa em captura foreground reaproveitada e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (802 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.

### Ciclo 85 — plano de atividade e identidade visual do quadro (implementado e verificado)

**Objetivo:** extrair para `exportFramePlan.ts` a seleção da camada, a detecção de cabelo animado, a janela de reação após pose e a montagem de chaves de reuso por quadro.

**Compatibilidade:** o worker continua resolvendo a cena e o loop de boca como antes. A regra preserva a exclusão do vídeo de fundo da chave do cenário, a assinatura integral dos elementos quando a reação está em repouso e a inclusão do quadro nas chaves durante animação ativa.

**Verificação:** 70 testes passaram em 14 arquivos, cobrindo capturas em camadas, cabelo ativo/inativo, reação após pose, chaves com/sem vídeo e paridade de exportação. `npm run typecheck`, `npm run audit:architecture` (803 arquivos), `npm run build` e `git diff --check` passaram. Nenhum vídeo ou benchmark de mídia foi executado.
