# Rodada 1.5 — reduzir o tempo de exportação do Editor V6

## Resultado esperado

Entregar uma redução reproduzível no tempo de clique até a publicação do MP4 validado. A meta permanece **até 90 s no corte autorizado de 6.000 quadros**. Primeiro confirme o conjunto de limites de threads do FFmpeg no export integral. Em seguida, implemente um candidato estrutural escolhido pelos dados. Cada trabalho termina com uma decisão de adoção, descarte ou inconclusão fundamentada. Um resultado negativo no primeiro deixa o segundo em andamento.

## O que a rodada 1.4 já respondeu

| Evidência | Decisão para a 1.5 |
| --- | --- |
| O corte de 200 s levou mediana de **168,797 s**. As medianas por etapa foram **46,844 s** no preparo, **119,472 s** no render e **3,551 s** na finalização. | Faltam **78,797 s** até a meta. Trabalhe no render e no preparo. Use cada execução completa para medir o ganho real, pois as medianas por etapa foram calculadas separadamente. |
| FFmpeg respondeu por cerca de **57% do CPU-s** observado. Os tempos isolados de produtor e consumidor são compatíveis com pouca sobreposição útil. | CPU-s mede trabalho acumulado. Use a parede e as fases do mesmo export para decidir. A causa da espera e o grau de saturação de cada recurso seguem em aberto. |
| No C2, o pacote de threads reduziu parede em **8,30%** e CPU-s em **6,46%** no laboratório com vídeo. | Use o harness para verificar se o efeito chega à interface. O ganho de laboratório ainda carece de validação integral. |
| No C3, retirar decode/scale poupa **19,830 CPU-s por 600 quadros** no ensaio. O ensaio mudou o caminho do conteúdo. | Use o dado para priorizar trabalho redundante no grafo de vídeo. A economia máxima nesse ensaio não é uma previsão de ganho preservando imagem. |
| NUT em 40 s ganhou **3,28%** de parede, aumentou RSS nos três pares e mostrou diferença visual. A integração foi removida em `812e0c2b` pelos gates antigos. | A autorização de 24/11 reabriu a hipótese. O corte integral combinado com threads=2 decide adoção; ver [Execução 1.5](EXECUCAO-1.5.md). |

Referências de desempenho, qualidade e decisões anteriores. [Parede e preparo](RELATORIO-RETORNO-RODADA-1.4-PARTE-3.md) · [FFmpeg e workers](RELATORIO-RETORNO-RODADA-1.4-PARTE-4.md) · [Golden](RELATORIO-RETORNO-RODADA-1.4-PARTE-5.md) · [NUT](RELATORIO-RETORNO-RODADA-1.4-PARTE-6.md) · [Experimentos](EXPERIMENTOS.md).

## 1. Verificar o candidato de threads no export integral

O rótulo `threads=2` do C2 fixou `-filter_threads 2` e `-filter_complex_threads 2` nas opções globais de cada FFmpeg de parte e `-threads 2` na saída de vídeo. Confira a montagem em `out/editor-v6-stress/round14-monitor/c-lab-runner.cjs` (`productionArgs`) e o resumo em `out/editor-v6-stress/round14-c-lab/round14-c2-summary.json` se as evidências locais estiverem disponíveis. O controle C2 tinha 6 threads de encoder. O JSON integral `out/editor-v6-stress/runs/round14-r1-off/stress-export-validation.json` registra **3** com quatro workers na máquina de referência. No produto, o valor automático deriva de `availableParallelism() / parallelism`, limitado a 1–8. Confirme os valores efetivos nos novos jobs.

1. **A** usa encoder automático e threads de filtros no padrão do FFmpeg. **B** fixa os filtros e o encoder em duas threads nas partes, conforme o conjunto C2 medido. Mantenha FFmpeg, encoder, bit rate, composição, áudio, captura, workers de render e concorrência de movimento iguais. Mux, sondas de capacidade e validação conservam os argumentos atuais.
2. O harness aceita `--encoder-threads=2`. Esse argumento controla a saída do encoder; o limite dos filtros pertence à montagem do comando em `exportPartRenderer.ts`. Em fixture pequena com e sem vídeo, confira argumentos e escopo. Salve o argv efetivo das partes. O teste integral combinado com NUT repetiu esses argumentos antes da promoção.
3. No corte autorizado, execute **A/B e B/A** em sequência, sempre um job por vez. Pare o candidato se, nos dois pares válidos, o ganho total ficar abaixo de 1 s **e** o ganho de render também ficar abaixo de 1 s. Se houver sinal ou resultados mistos, faça o terceiro par em ordem A/B. O usuário autorizou, em 24/11/2026, maior consumo de recursos e pequenas diferenças visuais discretas em reprodução normal para priorizar velocidade. OOM, travamentos, pressão que impeça o fluxo, dessincronização, diferença visual perceptível ou falha de limpeza encerram o candidato. RSS acima do controle, por si só, deixa de bloquear adoção. Se a ordem ou a carga invalidarem um par, permita uma repetição corretiva documentada na rodada e preserve a amostra original.
4. Após três pares, aceite o candidato se **todos** favorecerem B e a mediana das diferenças pareadas atingir **ao menos 2% e 3 s** de redução clique→MP4, com qualidade visual imperceptível em reprodução normal e sem OOM ou instabilidade que impeça o uso. O maior RSS é registrado para dimensionar o custo, mas não é gate de rejeição isolado. Um ganho só no render entra no diagnóstico. Qualquer explicação sobre qual das três opções causou o ganho exige um ensaio que isole essa opção. Só faça esse ensaio se ele reduzir o escopo da mudança a adotar.
5. Caso aprovado, use a política mais estreita suportada pela evidência no caminho normal do export. Teste o efeito da política em uma fixture sem vídeo para decidir seu escopo. Confirme o caminho normal sem configuração de experimento e mantenha o ponto de decisão no dono dos argumentos. Se a política final gerar argv diferente do braço B no corte de referência, valide novamente a configuração que será adotada antes de divulgar o ganho. Caso reprovado, mantenha o padrão atual e encerre a varredura de threads.

Arquivos de referência. [Comando por parte](../../../electron/domains/editorV6/exportPartRenderer.ts) · [Encoder](../../../electron/domains/editorV6/exportEncoding.ts) · [Harness](../../../scripts/editor-v6/benchmark-project-export.cjs) · [Teste dos argumentos](../../../tests/editor-v6/exportRunner.test.ts).

## 2. Implementar uma redução estrutural

**Aditivo de 24/11:** o usuário autorizou diferenças visuais pequenas, imperceptíveis em reprodução normal, e uso adicional de CPU/RAM para priorizar velocidade. Assim, o NUT voltou como candidato estrutural: seu writer/agrupador de quadros repetidos remove payload BGRA redundante do pipe. Ele só é promovido se mantiver composição, sincronismo e áudio, passar os três pares completos e não provocar OOM ou instabilidade. O teste combinado com o conjunto de threads mede a configuração exata para adoção.

Use como controle o padrão vigente após a etapa 1. Faça uma triagem curta das hipóteses abaixo e leve **um** candidato à implementação. Priorize o caminho com maior economia de parede sustentada por dados e com equivalência mais fácil de testar. Comece pelas transições, que já têm uma barreira global e medidas por etapa. Use dados existentes e no máximo um diagnóstico curto por caminho se faltar uma informação que mude a escolha.

| Ordem | Hipótese e primeiro trabalho |
| --- | --- |
| 1. Preparo de movimento | `exportReadiness.ts` aguarda todo o bake antes do render. Em `motionBakeSchedule.ts`, as filas são balanceadas por quantidade de grupos e mantêm cada personagem no mesmo renderer para reaproveitar os endpoints. Verifique se as filas terminam em momentos diferentes por terem transições de custo desigual. Use as métricas existentes ou acrescente só início/fim por fila em modo diagnóstico. Estime quanto da cauda uma redistribuição pode remover mantendo inteira a sequência mais cara de um personagem. Se houver economia, teste um peso barato derivado do trabalho planejado, com desempate determinístico, preservando afinidade, ordem lógica dos resultados, concorrência e limpeza. Se a cauda for pequena, confira se os misses de geometria repetem entradas comprovadamente iguais dentro do job antes de alterar o reaproveitamento que já existe. |
| 2. Composição com vídeo | Se o preparo não mostrar espaço mensurável, use o custo identificado no C3 para localizar trabalho redundante em `exportVideoComposition.ts`. Comece por um caso de identidade verificável, como uma rotação zero em que a retirada do filtro produza exatamente o mesmo quadro composto na fixture. Valide primeiro o grafo com mídia sintética, incluindo recorte de origem, sobreposição e borda de parte. Só amplie a hipótese se o custo observado justificar. Preserve seek, timestamps, escalonamento, alpha, BT.709, ordem de camadas e seleção de quadros. |

1. Antes do patch, explique qual trabalho desaparece ou qual espera encurta e como estimou a contribuição para a parede. Contadores somados de workers não podem ser convertidos diretamente em segundos de export. O alvo para levar o candidato ao corte integral é um caminho plausível para poupar **ao menos 5 s** ponta a ponta. Faça o menor patch no dono da regra e teste a regressão específica. O reaproveitamento de preparação termina com o job.
2. Use uma fixture ou um corte curto representativo para validar a causa. Se não couber um candidato seguro com sinal suficiente, encerre a etapa com o limite medido e indique a próxima intervenção concreta. Se couber, valide o corte de 6.000 quadros pelo mesmo protocolo de pares e critérios técnicos. Para esta mudança estrutural, exija **ao menos 5 s e 3%** na mediana pareada, com todos os pares favoráveis. É possível reaproveitar um controle recente somente se binário, perfil, ambiente, método e janela de pareamento forem equivalentes. Registre essa decisão.
3. Verifique a contribuição marginal da etapa 2 sobre a etapa 1 quando ambas passarem. Informe o melhor tempo no caminho normal, a configuração medida e quanto ainda falta para 90 s. Se o resultado atingir a meta, confirme em uma segunda execução fria comparável. Se a meta seguir aberta, identifique o próximo ponto no caminho crítico e que evidência favorece sua implementação.

Arquivos de referência. [Barreira de preparo](../../../electron/domains/editorV6/exportReadiness.ts) · [Agendamento das transições](../../../electron/domains/editorV6/motionBakeSchedule.ts) · [Geometria de endpoints](../../../src/renderer/src/features/editorV6/motion/motionBakeEndpointGeometry.ts) · [Composição FFmpeg](../../../electron/domains/editorV6/exportVideoComposition.ts) · [Plano temporal de vídeo](../../../src/shared/editorV6VideoComposition.ts).

## Protocolo compartilhado

- **Perfil e relógio.** Trabalhe na `Dev-V2`. Use a cópia autorizada e verificada, intervalo `[0,6000)`, 1920×1080, 30 FPS, Turbo, captura serial em partes com vídeo, quatro workers, lote de boca 600, preset 2, transições, piscadas, cabelo e áudio ativos. Mantenha o preparo frio por job. A métrica primária é `clickToValidatedWallMs`, do início da preparação do comando até o MP4 validado publicado. Registre o tempo do job no main e o da análise pós-export separadamente. Compile antes da série e use o mesmo build em A/B sempre que possível.
- **Rastreabilidade.** Salve revisão e diff experimental, argv do runner, opções efetivas por parte, caminho/versão/SHA-256 do FFmpeg, datas UTC e duração monotônica, hash da cópia/preset, exit code e condições que invalidem pares. Iguale a coleta nos dois braços e reserve os diagnósticos de custo alto para jobs separados. Use 60 s de descanso após o término de cada job antes de iniciar o próximo e execute as comparações de mídia fora do lote cronometrado. Registre a ordem, todos os tempos e os ganhos por par, mediana, mínimo e máximo, parede por etapa, CPU-s e pico simultâneo de RSS amostrado da árvore com o mesmo coletor. O RSS somado pode contar páginas compartilhadas.
- **Espaço e dados.** Verifique espaço no volume antes do lote e entre jobs, considerando o limite do harness e a retenção dos MP4s. Use `--retain-mp4-for-quality` para guardar os finais do benchmark e mantenha os JSONs. Compare MP4s por decodificação em fluxo e hashes por quadro. Gere recortes só para localizar uma diferença. A regra de limpeza se aplica apenas aos temporários criados pelo próprio job. Mantenha a cópia autorizada, as evidências anteriores e os dados do usuário preservados.
- **Integridade.** Em cada MP4 confirme 6.000 quadros, 1920×1080, 30 FPS, duração de 200 s, H.264/AAC, nove emendas, monotonicidade e alinhamento de timestamps, áudio e sincronismo dentro do contrato atual e limpeza sem erros. Como as duas hipóteses preservam o áudio, compare também o hash do PCM decodificado. Exercite cancelamento e falha em fixture para a lógica que alterou. Use 24 FPS em fixture se mexer no grafo de vídeo, no agendamento de quadros ou em limites de partes.
- **Qualidade visual.** Mantenha o limiar do golden F1 versionado. Ele verifica BGRA da captura e a estrutura do MP4. Para o H.264 final, alinhe A/B por índice e PTS, compare hashes dos quadros decodificados e destaque primeiro/último quadro, as nove emendas, vídeo ativo, boca, olhos, cabelo e transições. Se os hashes divergirem, compare pixels por quadro (contagem, delta máximo e região) e reproduza as diferenças relevantes com entrada fixa. Registre o piso A↔A antes de julgar B; use a variação do mesmo perfil no mesmo domínio (BGRA ou MP4). O piso D0 de BGRA não pode ser transposto para H.264. A autorização de 24/11/2026 permite diferenças pequenas e discretas durante reprodução normal; artefatos perceptíveis, sistemáticos ou que afetem leitura, sincronismo ou composição impedem adoção. Médias de SSIM/PSNR podem complementar esse diagnóstico.
- **Memória e cobertura.** RSS de pico repetidamente acima dos controles deve ser medido e informado, mas não bloqueia sozinho a adoção sob a autorização de 24/11/2026. OOM, travamentos ou pressão que impeça o fluxo bloqueiam adoção. Cubra com fixture sintética os trechos com e sem vídeo. Use a matriz longa de F2 somente se um risco concreto de escala ou memória depender dela e houver espaço para artefatos. Nenhuma implementação desta rodada depende de preencher F2 por completo.

Protocolo e escopo da autorização. [Execução 1.1](EXECUCAO-1.1.md) · [Testes 1.1](TESTES-1.1.md) · [Teste dourado](../../../tests/editor-v6/goldenExport.electron.ts) · [Comparador de relatórios](../../../scripts/editor-v6/compare-run-reports.cjs).

### Comando base para cada job integral

O comando abaixo usa um build já concluído. Preencha as variáveis com caminhos da cópia autorizada e use uma pasta de saída nova dentro de `out/editor-v6-stress/runs` em cada execução. Use o preset verificado dentro de `out/editor-v6-stress/preferences`. Registre os argumentos adicionais efetivamente usados no braço candidato. O harness exige pelo menos 3 GiB livres e um diretório fonte de cache vazio.

```powershell
$benchmarkArgs = @(
  '--authorized-project-id=408a77d1-d964-4c04-a66b-f4e9fcfeee46'
  "--project=$verifiedProject"
  "--library=$verifiedVideoLibrary"
  "--background-library=$verifiedBackgroundLibrary"
  "--characters=$verifiedCharactersFile"
  "--fabricator=$verifiedFabricator"
  "--motion-cache=$emptyMotionCache"
  "--hair-preset-file=$verifiedPreset"
  "--output=$uniqueRunFolder"
  '--ui-export-profile'
  '--hair-preset-slot=2'
  '--start-frame=0'
  '--duration-seconds=200'
  '--render-workers=4'
  '--motion-bake-concurrency=2'
  '--encoder=cpu'
  '--retain-mp4-for-quality'
)
node scripts/editor-v6/benchmark-project-export.cjs @benchmarkArgs
```

Para comparar os relatórios, use `compare-run-reports.cjs` com os dois JSONs e `--allow-encoder-thread-change` na etapa 1. Valide o argv de filtros separadamente. A comparação de pixels usa os MP4s retidos.

## Encerramento

- Termine após decidir o conjunto de threads e um candidato estrutural; a integração NUT retomada no aditivo satisfaz este segundo candidato. Reaproveite os controles e relatórios equivalentes. AMF permanece fora: os três pares da 1.4 tiveram sinais mistos, arquivo 1,615× maior e SSIM 0,985803; a tolerância de pequenas diferenças não torna seu ganho de velocidade repetível. WebCodecs, troca de workers, UI, auditoria nova de IPC e retrospectiva geral ficam fora da rodada.
- Em mudanças de código, execute os testes focados, `npm run test:editor-v6`, integração ou golden pertinente (confira que o candidato foi exercitado), `npm run typecheck`, `npm run audit:architecture` e build. Reaproveite o build que o teste integrado já executar quando for do mesmo snapshot. Revise o diff integral, rode `git diff --check` e faça commits locais pequenos apenas dos arquivos da tarefa. A referência autorizada usa Electron/FFmpeg em todas as medições.
- Entregue `EXECUCAO-1.5.md` com resultado, tabela dos pares, validação, decisão, melhor tempo e gap até 90 s. Atualize [o índice de experimentos](EXPERIMENTOS.md) e [o documento mestre](README.md). Mantenha até 300 linhas físicas por Markdown. Registre local e SHA-256 dos artefatos em `out/`, verificações executadas, limitações reais e commits. Se o corte autorizado estiver bloqueado, conclua o trabalho sintético independente e marque o tempo integral como pendente, com a causa precisa. O prompt usado na rodada foi arquivado localmente em `pasta do lixo/Prompts encerrados/PROMPT-AGENTE-RODADA-1.5.md` na Rodada 1.6.
