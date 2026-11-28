# Plano da Rodada 1.4 do Editor V6

## Papel e regras

Você é o engenheiro do Native-gacha, branch `Dev-V2`. Siga o `AGENTS.md` e as regras das rodadas anteriores: investigar antes de alterar, fixtures sintéticas, nada apagado sem backup verificável, uma mudança por comparação, commits locais pequenos, **sem push**, **cada arquivo Markdown ≤ 300 linhas** (a regra é **por arquivo**, não um limite para o conteúdo: se o relatório precisar de 3.000 linhas, escreva 10 arquivos numerados com um índice; nunca corte conteúdo para caber), diagnóstico sempre desligado por padrão, benchmarks alternados (A,B,A,B,A,B) com 60 s de descanso, rótulos **\[Executado] / \[Lido] / \[Não feito] / \[Suposição]**, números exatos com unidade e `N/D` quando não medido.

**Correções de método desta rodada (leia antes de começar):**

1. **Um gate fechado bloqueia só as fases que dependem dele.** Na rodada 1.3 a parada em D3 deixou E, F e G sem execução, embora fossem independentes. Registre o bloqueio e **continue com as fases livres**.
2. **O critério "qualquer diferença de pixel reprova" era meu e estava mal calibrado.** A captura mostrou não determinismo entre os próprios controles. Passa a valer o **piso de determinismo** (Fase D): o candidato é comparado com o ruído do caminho atual, não com zero.
3. **CPU normalizada por 12 threads engana numa CPU com SMT (6 núcleos / 12 threads).** Em todo A/B registre **tempo de parede e CPU-segundos**, e reporte também "threads lógicas ocupadas em média".
4. **Dados brutos grandes não entram no Git** (ver Fase A).

## Como operar no Codex (Windows)

* **Memória durável.** O contexto pode ser compactado e a sessão pode reiniciar. Este plano, `EXECUCAO-1.4.md` e `EXPERIMENTOS.md` são a sua memória. Ao fim de **cada marco**, atualize `EXECUCAO-1.4.md` (status, decisões, comandos exatos, resultados) e `EXPERIMENTOS.md`. Se perceber que retomou sem contexto, releia o plano, o `EXECUCAO-1.4.md`, o `EXPERIMENTOS.md` e o `AGENTS.md` **antes** de agir.
* **Marcos com validação.** Use a tabela abaixo. Se a validação de um marco falhar, **repare antes de avançar** (regra "consertar antes de seguir").
* **Diffs escopados.** Não expanda o escopo. Um assunto por commit. Formatação em commit separado.
* **Autonomia.** Não pare para perguntar. Se faltar decisão do dono, escolha a opção **reversível e menos arriscada**, registre em "Perguntas para o dono" e continue. Só pare nas "Condições de parada".
* **Sem medições simultâneas.** Nunca rode dois benchmarks ao mesmo tempo (contaminam a CPU). `git worktree` serve para comparar commits (A5), não para paralelizar medição.
* **Sandbox do Windows.** Se um comando falhar por permissão, **não contorne** (não altere ACLs nem desligue o sandbox). Para ler pastas fora do workspace (ex.: Downloads), o dono pode usar `/sandbox-add-read-dir <caminho>`. Há relatos de que o sandbox elevado bloqueia escrita em `.git`, `.codex` e `.agents`: se `git commit` falhar com "Access is denied", registre, deixe as alterações prontas e peça ao dono para commitar. Não amplie permissões por conta própria.
* **Suspensão do PC.** Antes de cada bateria longa, confirme que o Windows não vai suspender nem hibernar (plano de energia). Suspensão invalida a medição.
* **AGENTS.md.** As instruções carregadas têm limite combinado (32 KiB por padrão); o `AGENTS.md` atual tem \~7,4 KB. Não cole este plano nele.

**Marcos e validações** (rode `npm run typecheck` e o vitest do V6 sempre que o marco alterar código):

|Marco|Fases|Pronto quando|
|-|-|-|
|M0|A|baseline verde (typecheck, `audit:architecture`, vitest V6, `test:refactor`); `EXECUCAO-1.4.md` e `EXPERIMENTOS.md` criados; checklist de ambiente registrado|
|M1|B, P|tabelas B1 (parede), B2 (CPU-s e RSS), B3 e B4 no `EXECUCAO-1.4.md`, com 3 repetições alternadas|
|M2|C|variantes v0–v4 com 3 repetições; C3 aponta o estágio dominante; C4 com recomendação|
|M3|D0, F|piso de determinismo medido; teste dourado com limiar registrado, chamável por script npm|
|M4|D1, D2|replay CFR × NUT com critério pré-registrado; se passou, A/B de 40 s e 200 s nos 3 perfis|
|M5|E|microbenchmark com CPU-s; decisão do gate E registrada|
|M6|G|checker de IPC no `audit:architecture` com fixture negativa verde|
|M7|H|(opcional) probe e harness, só se sobrar tempo|
|M8|Z|relatório de retorno (índice + partes) e `AGENTS-PROPOSTA.md`|

## O que a rodada 1.3 estabeleceu (não refazer)

* A/B `cc9d02b0` × `HEAD`, 200 s: **168.706 ms × 168.224 ms** (−0,29%); sem regressão. A diferença histórica 163,76 s → \~169 s continua **sem explicação**.
* Pipe: 5 exports diagnósticos, **`write UNKNOWN` não reproduzido**; contexto opt-in de falha adicionado.
* CPU acumulada (3 cortes): **915,6 / 909,6 / 911,0 CPU-s**, \~5,4 threads lógicas ocupadas em média (44,8% de 12). A tabela por processo ficou só no diário.
* **Teto do consumidor** (FFmpeg com quadros do disco, 150 quadros, mediana): sem vídeo conc. 1 = 135,1 fps, conc. 4 = 230,1 fps agregados (1,70×); **com vídeo conc. 1 = 81,2 fps, conc. 4 = 105,6 fps (1,30×)**. Projeção 6.000 quadros: 44,4 / 26,1 / 73,9 / **56,8 s**.
* **Teto do produtor** (4 workers, `writeFrame` descartando): **61,65 s** (mín. 60,47; máx. 62,94).
* **AMF** (mudando só o encoder): apenas **1,035% mais rápido**, SSIM 0,9879, PSNR 43,7 dB; `h264\_mf` falhou (exit −22). O encoder de produção observado é **`libopenh264`**.
* **NUT** (writer isolado, `860b8da6`): equivalência sintética byte a byte OK. A/B de 40 s: **−7,58% (mediana)** e **−5,40% (mínimo)**; seis MP4 válidos (1.200 quadros, 30 FPS, áudio). Amostras BGRA: A2 difere de A1/A3 em **39.926 bytes**; A3 × B3 diferem em **500 bytes** (quadro de índice 7, timeline **599**, máx. 3 por canal). Integração removida; gate de 200 s não rodou.
* IPC: AST de `electron/\*\*/\*.ts` achou **132** `.handle()`; o denominador 180 anterior incluía outros escopos. **\~48 handlers (provavelmente `.cjs`, como a camada de dados) não foram classificados.**
* Não feitos: E (WebCodecs), F (UI), checker de IPC.
* Verificações finais verdes sob Node 24.22.3 (vitest 904/905, `test:refactor` 50/50, build).

**Hipótese de trabalho minha \[Suposição, a testar na Fase B]:** os tetos isolados (56,8 s + 61,7 s = 118,5 s) somados a um preparo global de \~36,8 s (número do relatório 1.1, não remedido) e a \~14 s de finalização dão \~169 s. Se for isso, produtor e consumidor **quase não se sobrepõem** porque ambos disputam a mesma CPU, e o caminho para 90 s é **reduzir CPU-segundos totais**, não só bytes no pipe.

\---

## Fase A — Peso do repositório e proveniência (curta)

**A1. Peso do Git.** Os commits `62bffe9c` (+493.027 linhas), `7b5fd6cd` (+278.821), `7e544796` (+41.197) e `d287bf94` (+22.923) guardaram dados brutos. Registre: `git count-objects -vH`, tamanho de `docs/editor-v6/atual/dados/` e os 10 maiores blobs (`git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)'`). **Não reescreva histórico.** Proponha ao dono, com os comandos exatos (sem executar), como reduzir antes do primeiro push. Regra daqui em diante: dado bruto > 1 MB fica em `out/` (ignorado) com SHA-256 e resumo no repositório (cada arquivo ≤ 300 linhas).

**A2. Proveniência do FFmpeg.** A rodada 1.2 registrou `8.1.2-full\_build-www.gyan.dev` (com `libx264`); a 1.3 registrou `n8.1.3-27-g8dca1586f4-20261031` (com `libopenh264`, sem `libx264` na lista). Registre: **qual binário o export usa de fato** (caminho, versão, `-buildconf` resumido) e qual está no PATH. Se o binário antigo ainda existir, rode **um** controle de 200 s com ele para testar se explica 163,76 s → 169 s. Se não existir, `\[Não feito]` com o motivo.

**A3. Controle do ambiente de medição.** A diferença 163,76 s → \~169 s não vem do código (o A/B `cc9d02b0` × `HEAD` empatou), então suspeite da máquina. Antes de **cada bateria** de benchmark, registre um checklist (`\[Executado]` ou `\[Não feito]` por item):

* plano de energia e modo de desempenho do Windows, e **suspensão/hibernação desativadas** durante a bateria;
* processos em segundo plano relevantes (lista dos 10 maiores por CPU);
* **varredura em tempo real do Windows Defender** sobre `out/` e a pasta temporária do export (estado e exclusões configuradas);
* frequência e temperatura da CPU amostradas a cada 5 s durante o export (para detectar *throttling*);
* espaço livre e tipo do disco de trabalho.
**Não altere** configurações do Windows nem do Defender sozinho: registre o estado e proponha ao dono. Se ele autorizar, repita **um** controle de 200 s com a mudança (ex.: exclusão do Defender em `out/`) e reporte a diferença.

**A4. Registro único de experimentos.** Crie `docs/editor-v6/atual/EXPERIMENTOS.md` (cada arquivo ≤ 300 linhas; se crescer, continue em `EXPERIMENTOS-2.md`, `-3.md`... com índice): uma linha por experimento, de todas as rodadas que você conseguir recuperar dos relatórios (1.1, 1.2, 1.3), com `id | hipótese | resultado (números) | decisão (promovido/removido/inconclusivo) | commit ou relatório`. Daqui em diante, **toda medição nova** entra aqui antes de você declarar a fase concluída. Antes de iniciar qualquer experimento, consulte o arquivo para não repetir um já descartado.

**A5.** Crie `docs/editor-v6/atual/EXECUCAO-1.4.md` e ligue no README. Registre o ambiente (máquina, Node, Electron, FFmpeg).

\---

## Fase B — Para onde vão os \~169 s

Sem alterar o produto; marcadores só opt-in.

**B0. Defina o cronômetro.** A meta de 90 s é "do clique até o MP4 validado". Separe duas medidas e diga em qual das duas cada número histórico foi medido:

* **tempo percebido pelo usuário:** do clique até o arquivo final disponível, **sem** a validação do harness;
* **tempo do harness:** o anterior mais a validação (ffprobe, decodificação, amostras de qualidade).
Se a validação do harness for relevante (mais de 2 s), os 169 s estão inflados e a meta real de produto é outra. Reporte as duas medidas nas 3 repetições do B1.

**B1. Linha do tempo de parede** do export completo (3 repetições): clique → preparo global → render das 10 partes (início/fim por worker) → concatenação/mux de áudio → validação → limpeza. Tabela com tempo de parede de cada etapa. Use os marcadores existentes; adicione opt-in só onde faltar.

**B2. CPU-s por tipo de processo**, na íntegra no relatório (não só no diário): FFmpeg (4), renderers de export (4), main, GPU, utility/rede, outros. CPU-s, % do total e **threads lógicas ocupadas em média por etapa** (preparo × render × finalização). Inclua o **pico de RSS por tipo de processo e por etapa** (relevante para o `write UNKNOWN`: 16 GB de RAM, 4 workers, quadros de até 16,6 MB).

**B3. Eficiência de sobreposição** da etapa de render: `E = (T\_produtor + T\_consumidor) / T\_render\_real`, com 61,65 s e 56,83 s dos tetos. E ≈ 1 → sem sobreposição útil (CPU-bound). E ≈ 2 → sobreposição perfeita. Reporte e interprete.

**B4. Orçamento para 90 s.** Com a tabela B1, diga quanto cada etapa teria que cair para fechar 90 s (preparo, render, finalização). Se o preparo sozinho já passar de 30 s, a meta depende de atacá-lo; diga isso com números.

\---

## Fase P — Preparo global (condicional ao B1: roda se o preparo passar de 30 s ou de 15% da parede)

O relatório 1.1 citava \~36,8 s de preparo global (não remedido desde então). Se isso se confirmar, é a maior fatia que ainda não foi atacada por nenhuma rodada.

**P1. Anatomia.** Por sub-etapa, em parede e CPU-s (3 repetições): preparo de cabelo, rigs/poses, decodificação e normalização de assets, carga de projeto e fontes, criação dos workers, e qualquer espera por I/O. Se faltar marcador, adicione opt-in.

**P2. Reaproveitamento.** Quanto desse trabalho é **idêntico entre dois exports seguidos do mesmo projeto**? Compare as entradas (hash dos insumos de cada sub-etapa) de duas execuções consecutivas e reporte a fração repetida. Respeite a decisão anterior do projeto de **não recriar cache de reexportação**: aqui você só **mede** o potencial; não implemente cache.

**P3. Paralelismo.** Das sub-etapas, quais são seriais e poderiam rodar enquanto os workers já renderizam as primeiras partes? Reporte dependências reais (arquivo:linha) e o ganho máximo teórico em parede, sem implementar.

**Gate P:** só proponha implementação se o ganho teórico em parede for ≥ 10 s. Registre em `EXPERIMENTOS.md`.

\---

## Fase C — Anatomia do FFmpeg (consumidor)

O AMF quase não ajudou, o que sugere que o custo **não está no encoder** e sim em conversão de pixel, overlay, cor ou decodificação do vídeo de fundo. Medir antes de supor.

**C1.** Recrie o dump (150 quadros sem vídeo + 150 com vídeo), exatamente como escritos no pipe, em pasta temporária ignorada. Confira o espaço livre.

**C2. Variantes**, cada uma com 3 repetições alternadas, registrando **parede e CPU-s** (`-benchmark` + tempos do processo):

* v0: argumentos de produção.
* v1: mesmo grafo de filtros, saída `-f null -` (sem encode).
* v2: entrada já no formato de entrada do encoder, sem filtros, só encode.
* v3: `-threads`, `-filter\_threads`, `-filter\_complex\_threads` ∈ {1, 2, 4}.
* v4: `-sws\_flags` alternativos; para cada um, SSIM/PSNR contra v0.

**C3.** Conclua **qual estágio custa mais** (filtros/conversão, overlay, cor BT.709, decodificação do vídeo, encode `libopenh264`, leitura da entrada) em CPU-s por 600 quadros, com e sem vídeo. Responda por que o AMF só deu 1,035%.

**C4. Varredura de concorrência** (medição, sem mudar padrão): corte de **100 s** (5 partes), workers ∈ {2, 3, 4}, 3 repetições alternadas por configuração, parede e CPU-s. Depois confirme a melhor contra 4 workers no corte de 200 s, 3 × 3 alternado.

**Gate C:** nada vira padrão sem autorização do dono. Entregue a recomendação com os números.

\---

## Fase F — Teste dourado de qualidade e perfis adicionais

Hoje não existe um critério de qualidade **anterior** ao experimento, e isso travou a rodada 1.3. Esta fase cria o critério e evita otimizar para um único corte.

**F1. Teste dourado.** Fixture sintética pequena (2 a 3 s, 30 FPS) em `tests/` (ou `scripts/`, se o export exigir Electron), cobrindo: trecho sem vídeo, trecho com vídeo, boca, cabelo, uma transição e uma emenda entre partes. Gere os quadros de referência **uma vez**, em cópia verificada, e guarde só hashes e uma amostra pequena (≤ 5 MB no repositório; o resto em `out/` com SHA-256).

* Comparador por quadro: diferença máxima por canal, número de pixels diferentes e bounding box.
* **Limiar pré-registrado:** derive-o do **piso de determinismo medido no D0**, não de zero. Registre o valor e a justificativa antes de usar.
* Deve rodar em < 60 s e ser chamável por um script npm (`test:editor-v6:golden-export`), fora do `test:refactor` por depender de Electron/FFmpeg.

**F2. Perfis adicionais** (todos com parede e CPU-s, 3 repetições alternadas, mesmas regras de medição):

* **sem vídeo**, \~200 s (só fundo, personagens, boca e cabelo): mostra quanto do custo vem da camada de vídeo;
* **longo**, \~10 min (30 partes): confirma escala linear, memória e se o `write UNKNOWN` aparece com mais tempo de execução;
* o corte atual de 200 s com vídeo, como controle.
Para cada um, reporte número de corridas de quadros idênticos e bytes evitáveis (como na rodada 1.2). Se faltar um projeto sintético equivalente, gere-o em cópia, sem tocar no original.

**F3.** Em todo candidato futuro (NUT, workers, filtros), reporte o resultado **nos três perfis**. Um ganho que só aparece em um perfil é registrado como tal.

\---

## Fase D — NUT: determinismo e prova por replay

**D0. Piso de determinismo da captura.** No caminho CFR atual, capture a **mesma parte de 20 s (600 quadros) 3 vezes**. Compare quadro a quadro (hash BGRA completo): quantos quadros diferem, bounding box da diferença, máximo por canal e a camada responsável (cabelo, boca, vídeo, fundo, texto). Tente identificar a causa (ordem de workers, decodificação assíncrona de imagem, física do cabelo, heurística de reaproveitamento). **Se a captura não é determinística, isso é um achado de produto** e entra no relatório com severidade.

**D1. Replay com os mesmos bytes.** Grave num job de 40 s os quadros únicos efetivamente escritos **e o mapa de corridas**. Reproduza **duas vezes pelo caminho CFR e duas pelo NUT**, com os argumentos de produção, e decodifique os quatro MP4 para raw. Compare por quadro:

* **CFR↔CFR** (piso do encoder);
* **NUT↔CFR**.

Destaque os quadros de borda: primeiro/último de cada parte, e o quadro de timeline **599**.

**Critério pré-registrado (não mude depois de ver os dados):**

* NUT↔CFR **idêntico** ao piso CFR↔CFR (zero, se o encoder for determinístico) → **transporte neutro**.
* Piso zero e NUT↔CFR ≠ 0 → **bug de transporte**: investigar PTS, `fps` e `-frames:v` no quadro de borda.
* Piso > 0 → NUT passa se o máximo e a distribuição da diferença não excederem o piso.

**D2. Só se D1 passar:** reintegre atrás de `GACHA\_EDITOR\_V6\_NUT\_UNIQUE\_FRAMES` (desligada por padrão), partindo do histórico/notas, não do zero. A/B alternado de 40 s × 3, depois 200 s × 3, com **parede e CPU-s**. Valide A/V (drift em ms), nove emendas, endpoints, memória de pico, cancelamento, limpeza e um teste curto a 24 FPS. Rode o **teste dourado (F1)** nos dois braços e reporte o resultado também nos **três perfis (F2)**.
Promova a **opt-in** se: ganho ≥ 5% repetível (mediana e mínimo) no perfil de referência **e** D1 limpo **e** teste dourado dentro do limiar **e** validações completas. Se o ganho só aparecer em um perfil, registre exatamente isso. Caso contrário, remova e registre.

**D3.** Decomponha o −7,58% do A/B curto: o ganho veio de menos CPU-s ou de menos espera? Se a parede caiu e os CPU-s não, qual recurso foi liberado?

\---

## Fase E — Microbenchmark de encode no renderer (independente de D)

Como a máquina parece limitada por CPU, a moeda de comparação é **CPU-s por quadro**, além de fps.

1. Registre `app.getGPUFeatureStatus()` e `app.getGPUInfo('complete')` (estado de `video\_encode`).
2. Em Electron isolado: `OffscreenCanvas` 1920×1080 com um quadro representativo → `VideoFrame` → `VideoEncoder` H.264, `prefer-hardware` e `prefer-software`. 600 quadros, 3 repetições alternadas: fps sustentado, **CPU-s por 600 quadros** (renderer + GPU), memória, fila do encoder, bytes de saída. O que não puder ser provado (backend real) fica `N/D`.
3. Compare com a v0 da Fase C (FFmpeg de produção) em fps e em CPU-s por 600 quadros.

**Gate E:** avance a um spike completo (cor BT.709, AAC, emendas, camada de vídeo) se o WebCodecs tiver **fps ≥ 2× o teto do consumidor com concorrência 4 *ou* CPU-s por quadro ≤ 50% do caminho FFmpeg**. Os valores são sugestões minhas; justifique outro limiar com os dados.

\---

## Fase G — Guarda de IPC, completa

1. **Reconcilie 132 × 180.** Rode a AST também em `.cjs`, `.mjs` e `.js` (camada de dados, `dataPlatform.cjs` etc.). Liste os \~48 handlers que faltaram, com `arquivo:linha`.
2. Classifique cada handler sem `assertTrustedSender` direto: wrapper confiável, guard próprio (workers) ou **omissão real**.
3. Tabela **canal → registrar → preload → validação de origem → validação de dados (schema/nenhuma)** para o domínio `editorV6` e para a camada de dados.
4. Crie `scripts/architecture/check-ipc-validation.cjs` ligado ao `audit:architecture`: falha em handler novo sem validação e sem entrada numa allowlist versionada e justificada. Inclua fixture negativa.
5. Omissão real: descreva o risco e o patch; corrija só se for trivial e coberto por teste.

\---

## Fase H — UI e índices (só se sobrar tempo)

1. Probe `useRenderCauseProbe` (dev, desligado por padrão): renders próprios/s e % com props shallow-iguais, por filho direto da Page.
2. Harness com `data-testid` e eventos reais de UI (pose, fundo, mover bloco). Play 60 s, drag 30 s, 10 edições reais.
3. `memo`/seletores só onde ≥ 30% dos renders forem desperdiçados. Do contrário, não mexa.
4. Estenda o teste de índices a balão vinculado e índice de movimento.
5. A Page tem mudança semântica identificada na auditoria A3 da rodada 1.3: se o crescimento (760 → 1.132 linhas) for lógica e não formatação, extraia **um** hook (`useEditorV6Libraries`) como piloto, sem mudar comportamento.

\---

## Fase Z — Retrospectiva (sempre por último)

Quando um agente repete o mesmo erro, o certo é transformar isso em regra permanente. Faça uma retrospectiva das rodadas 1.1–1.4: quais erros ou perdas de tempo se repetiram (ex.: critério absoluto de pixel, medição com 1 amostra, dado bruto no Git, parada total por um gate, formatação misturada com lógica, número de ambiente sem registro)?
Escreva `docs/editor-v6/atual/AGENTS-PROPOSTA.md` (cada arquivo ≤ 300 linhas) com regras **curtas e acionáveis** que valeriam para qualquer rodada futura: protocolo de medição, dado bruto fora do Git, formatação em commit separado, "gate bloqueia só dependentes", piso de determinismo, memória durável em `EXECUCAO` e `EXPERIMENTOS`. Mantenha o total do `AGENTS.md` bem abaixo de 32 KiB. **Não edite o `AGENTS.md`:** entregue o diff proposto ao dono.

\---

## Registro por fase (em `EXECUCAO-1.4.md`)

```text
## Fase X — título (data)
- Hipótese:
- Método e comando:
- Controle (3 alternadas: parede mediana/mín/máx; CPU-s):
- Candidato (idem):
- Diferença % e limiar definido antes:
- Qualidade / sincronismo / emendas / memória / limpeza:
- Decisão: promovido (opt-in) | removido | inconclusivo (próxima hipótese)
- Arquivos e commit:
- Verificações executadas e pendentes (com motivo):
```

## Condições de parada

Pare e explique, sem ação destrutiva, se houver: risco de perda de dados, falta de backup verificável, disco insuficiente para dumps, regressão repetível > 2% contra a referência, divergência de sincronismo A/V inexplicada, ou bloqueio de permissão do sandbox que exija ampliar acesso (inclui `git commit` negado). **Parada em um gate não cancela as fases independentes.**

## Entrega final

O relatório pode ter o tamanho que for necessário. O arquivo principal `docs/editor-v6/atual/RELATORIO-RETORNO-RODADA-1.4.md` (≤ 300 linhas) é o **índice e o resumo executivo** (status das fases, decisões, perguntas ao dono, links). O conteúdo completo vai em `RELATORIO-RETORNO-RODADA-1.4-PARTE-1.md`, `-PARTE-2.md`, ... (cada um ≤ 300 linhas, todos ligados no índice). Use a estrutura do relatório 1.3 e **estas tabelas dentro do corpo**, não só no diário:

1. linha do tempo de parede do export (B1);
2. CPU-s por tipo de processo (B2) e threads ocupadas por etapa;
3. custo por estágio do FFmpeg em CPU-s por 600 quadros (C3);
4. resultado do piso de determinismo e do replay (D0/D1), por quadro de borda;
5. varredura de workers (C4);
6. cronômetro: tempo percebido pelo usuário × tempo do harness (B0);
7. anatomia do preparo global, se a Fase P rodou (P1/P2);
8. resultado nos três perfis (F2) e checklist de ambiente das baterias (A3);
9. `EXPERIMENTOS.md` resumido: nº de experimentos registrados e os adicionados nesta rodada.

Inclua também uma seção **"Perguntas para o dono do produto"** (decisões que dependem dele: exclusão do Defender, tornar algo padrão, destino do ZIP histórico, redução do peso do Git) e as seções de sempre: identificação (HEAD, commits desde `860b8da6`, máquina, FFmpeg usado pelo export), quadro de status das fases, verificações finais reexecutadas, descobertas não previstas, desvios, pendências e as três maiores incertezas. Dados brutos grandes ficam em `out/` com SHA-256; no repositório só resumos. **Sem mudanças de código depois de escrever o relatório.**
