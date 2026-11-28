# Relatório de retorno — rodada 1.3

[Executado] Registro atualizado em 22/11/2026. A rodada foi interrompida no gate de qualidade D3: uma diferença de pixels nas amostras ficou sem causa isolada. Por essa regra de parada, não rodei o corte de 200 s nem as fases seguintes.

## 1. Identificação

- [Executado] Raiz `C:\TRABALHO 2\OUTROS\GACHA EM C++`; branch `Dev-V2`; HEAD da coleta `860b8da68fd3b20a8a9d121860319a43c82d81e4`. Antes deste relatório, `git status --short`: `M docs/editor-v6/atual/EXECUCAO-1.3.md` e `?? docs/editor-v6/atual/dados/RODADA-1.3-D3-40s/`; nenhum arquivo de produção pendente.
- [Executado] Máquina registrada: Windows 11 Pro build `10.0.26300`; AMD Ryzen 5 4600G, `6` núcleos / `12` processadores lógicos; RAM `16.526.802.944 bytes`; GPU AMD Radeon RX 7600, driver `32.0.32029.2010`. Nesta retomada: Node `v24.22.3`; Electron `45.3.1`.
- [Executado] FFmpeg registrado: `n8.1.3-27-g8dca1586f4-20261031`. Encoders H.264 listados: `libopenh264`, `h264_amf`, `h264_d3d12va`, `h264_mf`, `h264_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_vulkan`. O encoder observado nos seis MP4 de D3 foi `libopenh264`.
- [Executado] Commits desde `2e928956` (hash curto; arquivos; linhas adicionadas/removidas; mensagem):

| Commit | Arquivos | +/− | Mensagem |
|---|---:|---:|---|
| [Executado] `ce28d7fc` | 6 | 522/0 | adiciona relatório 1.2 e dados |
| [Executado] `d1500823` | 3 | 37/5 | inicia diário 1.3 e liga README |
| [Executado] `20a9e2fb` | 1 | 25/0 | registra auditoria AST |
| [Executado] `a0dd33b9` | 3 | 72/36 | torna diagnóstico de quadros opt-in |
| [Executado] `049e1e65` | 1 | 6/4 | aceita diagnóstico desligado no harness |
| [Executado] `23476aea` | 2 | 212/4 | salva checkpoint A4/A5 |
| [Executado] `61ea3305` | 1 | 19/0 | registra revisão estática IPC |
| [Executado] `a41f855c` | 1 | 8/0 | registra caminho do erro do pipe |
| [Executado] `121a3b54` | 1 | 2/1 | corrige referência de linhas |
| [Executado] `9c11ba81` | 2 | 26/3 | registra auditorias H |
| [Executado] `02fe003f` | 2 | 89/4 | salva relatório parcial 1.3 |
| [Executado] `663b59be` | 1 | 0/1 | limpa final do relatório |
| [Executado] `7e544796` | 8 | 41.197/2 | conclui gate A5 |
| [Executado] `62bffe9c` | 13 | 493.027/34 | captura contexto de falha do pipe |
| [Executado] `7b5fd6cd` | 6 | 278.821/10 | mede CPU acumulada |
| [Executado] `d287bf94` | 8 | 22.923/3 | captura teto consumidor |
| [Executado] `036471d8` | 7 | 601/4 | registra medições consumidor |
| [Executado] `4bfa76c8` | 6 | 359/1 | compara encoder AMF |
| [Executado] `ac8d1abd` | 13 | 1.442/24 | mede teto produtor |
| [Executado] `860b8da6` | 3 | 377/2 | adiciona writer NUT isolado |

## 2. Quadro de status por fase

| Fase | Status | Verificação / motivo |
|---|---|---|
| [Executado] A — rastreabilidade, neutralidade e gate A5 | concluída | A1–A5 registrados; HEAD ficou `0,285530339491458%` mais rápido pela mediana, sem regressão repetível acima de `2%`. |
| [Executado] B — falha `write UNKNOWN` | concluída com resultado inconclusivo | 5 tentativas; não reproduzida. Captura opt-in de contexto foi adicionada. |
| [Executado] C — orçamento de CPU | concluída | C1–C3 medidos; C4 liberou D por sincronização/acoplamento e bytes repetidos evitáveis. |
| [Executado] D — quadros únicos/NUT | parcial; candidato removido | D1 sintético passou; D2 foi testada opt-in e removida após amostra diferente em A3/B3; D3 de 200 s bloqueada. |
| [Não feito] E — WebCodecs no renderer | não iniciada | Parei na regra de parada D3; backend, cor e desempenho seguem N/D nesta rodada. |
| [Não feito] F — perfil de UI e índices adicionais | não iniciada | Parei na regra de parada D3; probe e ações UI não foram executados. |
| [Executado] G — guarda automática IPC | parcial | revisão estática feita; checker e teste negativo não foram criados. |
| [Executado] H — auditorias e propostas | parcial | audit e scripts revisados; decisão de armazenamento do ZIP depende do dono do produto. |

## 3. Verificações finais [Executado]

[Executado] Reexecutadas nesta retomada sob Node `v24.22.3`; vitest iniciou às `17:16:34` (America/Sao_Paulo). Os demais horários individuais são N/D porque não foram capturados pelo terminal.

- [Executado] `npm run typecheck`: exit `0`; `tsc --noEmit -p tsconfig.json`, sem erros.
- [Executado] `npm run audit:architecture`: exit `0`; `892` arquivos inspecionados, `0` erros sintáticos, `0` imports locais ausentes, `0` imports runtime entre features, `0` violações estritas.
- [Executado] `npm exec -- vitest run --config vitest.editor-v6.config.ts`: exit `0`; `187` arquivos passaram, `1` ignorado; `904` testes passaram, `1` ignorado; duração `11,41 s`.
- [Executado] `npm run test:refactor`: exit `0`; `50/50` comandos, nenhum falhou.
- [Executado] `npm run build`: exit `0`; renderer CMake nativo e builds Electron main/preload/renderer passaram (`239`, `22` e `864` módulos transformados).
- [Executado] `git diff --check`: exit `0`, sem saída. Será repetido após gravar este relatório.

## 4. Fase A — auditoria e medições

- [Executado] A1: relatório/dados 1.2 e diário 1.3 registrados; README aponta para execução 1.3. A3: `12` fontes com baseline comparadas por AST transpilada; todas tiveram alguma mudança semântica, portanto nenhum commit foi provado como somente formatação. Sem `.git-blame-ignore-revs`.
- [Executado] A2: `.nvmrc`/CI usam Node `22.23.5`; ZIP oficial teve SHA-256 conferido. Sob Node 22.23.5, typecheck e V6 passaram em execução anterior. [Executado] Nesta retomada, o binário portátil não estava mais em `out/`; as verificações atuais rodaram com Node `24.22.3`.
- [Executado] A4: `GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS=1` liga diagnósticos; desligado, teste confirmou ausência de chamada ao coletor. Três tempos desligado `47.578,7393`, `45.837,6952`, `44.272,6501 ms`; ligados `45.627,2084`, `47.572,4176`, `45.717,2104 ms`. Medianas `45.837,6952` e `45.717,2104 ms`; delta `−0,26285091227712%`, sem evidência de overhead positivo repetível.
- [Executado] A5, corte `200 s`/`6.000` quadros, A/B/A/B/A/B com descanso de `60 s`: controles `174.901,8766`, `167.079,4618`, `168.706,4502 ms`; HEAD `168.224,7421`, `167.143,5909`, `173.394,4631 ms`. Medianas `168.706,4502` e `168.224,7421 ms`; diferença `−0,285530339491458%`. Gate de regressão de `2%` passou. Isso não explica a diferença histórica de `163,760 s` para `169,435 s`.
- [Executado] A4/A5 detalhados em `EXECUCAO-1.3.md`; A5 bruto e SHA-256 em `dados/RODADA-1.3-A5/`.

## 5. Fase B — falha no pipe

- [Executado] Cinco exports diagnósticos de `6.000` quadros foram tentados; o primeiro não persistiu as amostras, os quatro seguintes validaram MP4 e registraram `10/10` partes. Tempos: `171.641,211`, `171.422,6776`, `168.053,4324`, `169.306,1124`, `169.701,3231 ms`.
- [Executado] Nenhum reproduziu `write UNKNOWN`. Foram adicionados stderr limitado, código/sinal/estado de processo, PID, evento/tempo de escrita e contexto opt-in; existe teste sintético de falha de pipe.
- [Suposição] EPIPE/FFmpeg encerrado segue hipótese, sem prova. RSS exato no momento de qualquer falha e causa do incidente antigo continuam N/D.
- [Executado] Os cinco reports e checksums estão em `dados/RODADA-1.3-B/`.

## 6. Fase C — tetos e Gate C

- [Executado] C1: três cortes de `6.000` quadros. Paredes amostradas `169,211`, `171,978`, `169,473 s`; CPU-s total `915,567981`, `909,610098`, `910,977167`; média normalizada de `12` threads `45,090054%`, `44,075894%`, `44,794607%` (mediana `44,794607%`). A tabela por processo está no diário e nos JSONs C1. Picos são amostras, não CPU acumulada.
- [Executado] C2 consumidor, `150` quadros por amostra e A/B/A/B/A/B com `60 s` de descanso: sem vídeo, concorrência `1` mediana `1.109,9428 ms` / `135,142099 fps`; concorrência `4` `2.607,8871 ms` / `230,071310 fps` agregados. Com vídeo: concorrência `1` `1.846,9565 ms` / `81,214690 fps`; concorrência `4` `5.683,1574 ms` / `105,575116 fps` agregados. Projeções medianas de `6.000` quadros: `44,397712`, `26,078871`, `73,878260`, `56,831574 s`, na mesma ordem.
- [Executado] AMF, mudando somente encoder, foi `1,035%` mais rápido na mediana projetada e teve SSIM `0,987858`, PSNR `43,705003 dB`; não foi promovido. `h264_mf` falhou com exit `−22` usando os argumentos de produção. `libopenh264` foi o encoder do export observado.
- [Executado] C3 produtor, `6.000` quadros, `4` workers: render/captura `62.944,18`, `60.465,07`, `61.651,28 ms`; mediana `61.651,28 ms`, mínimo `60.465,07 ms`, máximo `62.944,18 ms`.
- [Executado] Gate C: consumidor com vídeo `56,831574 s` (`33,541815%` do baseline de `169,435 s`), produtor `61,65128 s` (`36,386390%`) e CPU normalizada mediana `44,794607%`. Ambos tetos `<60%`, CPU `<70%`; encaminhei investigação para sincronização e liberei D. A estimativa 1.2 de bytes repetidos evitáveis é `72,5%`.
- [Executado] Dados C1/C2/C3 e hashes em `dados/RODADA-1.3-C{1,2,3}/`; tabela completa e método em `EXECUCAO-1.3.md`.

## 7. Fase D — NUT e quadros repetidos

- [Executado] D1 adicionou writer NUT isolado, commit `860b8da6`. Testes sintéticos com FFmpeg passaram para corridas de `1`, `2` e `54` quadros, salto PTS até `300`, resoluções `1920×1080` e `1920×2160`, backpressure, falha e cancelamento. Hashes CFR iguais; D1 não altera o caminho do produto.
- [Executado] D2 foi temporariamente ligada apenas pela flag opt-in `GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES=1`. Testes focados, typecheck e build passaram durante o spike. Após D3, removi a integração/flag e os testes associados; o código de produto atual não usa NUT.
- [Executado] D3 curto: três controles `A1/A2/A3` = `40.117,957`, `39.999,8273`, `39.004,0316 ms`; candidatos `B1/B2/B3` = `36.966,8374`, `37.733,4918`, `36.898,8465 ms`. Medianas `39.999,8273` e `36.966,8374 ms`, diferença `−7,582507%`; mínimos `39.004,0316` e `36.898,8465 ms`, diferença `−5,397353%`.
- [Executado] Todos os seis MP4 validaram `1.200` quadros, 30 FPS e áudio. A1/B1 amostras coincidiram; A2/B2 diferiram em `28.154` bytes de amostra; A2 também diferiu de A1/A3 em `39.926` bytes. A3/B3 diferiram em `500` bytes do quadro amostrado de índice `7` (timeline `599`), máximo por canal `3`; as outras `7` amostras coincidiram.
- [Executado] Decisão: não promover; removi D2 e parei antes do corte de `200 s`, por divergência de pixel não explicada. Não medi sincronismo A/V longo, emendas, memória de pico, cancelamento ou limpeza de um export de `6.000` quadros sob NUT.
- [Executado] Resumo bruto D3: `dados/RODADA-1.3-D3-40s/round13-d3-40s-summary.json`, SHA-256 `BFD181A412ED06EADEEDD6FA34E9EABA14323F1145106A4B4FCA5415C1BF270C`; seis reports e seus hashes estão na mesma pasta. MP4s e BGRA temporários foram removidos depois de registrar hashes; os originais do projeto foram preservados.

## 8. Fase E — WebCodecs

- [Não feito] Não iniciei o microbenchmark de `600` quadros WebCodecs, GPU feature status ou comparação com o teto consumidor. A regra de parada D3 foi acionada primeiro; fps, backend real, memória e bytes são N/D nesta rodada.
- [Lido] Spike de capacidade da rodada anterior não identifica backend hardware/software real e não satisfaz o gate de `2×`.

## 9. Fase F — UI e índices

- [Não feito] Não criei `useRenderCauseProbe`, não corrigi o harness com `data-testid`, não executei play `60 s`, drag `30 s`, nem `10` edições reais. Percentual de renders desperdiçados é N/D.
- [Não feito] Não estendi índices de balão vinculado e movimento. A medição de índices da rodada 1.2 permanece limitada a background e video clips.
- [Não feito] Não extraí `useEditorV6Libraries`; a Page tinha mudança semântica identificada em A3, mas o piloto foi suspenso pela parada D3.

## 10. Fase G — validação IPC

- [Executado] AST de `electron/**/*.ts`: `132` chamadas `.handle()`; `13` sem chamada textual direta a `assertTrustedSender`. `12` handlers de produto têm guard indireto/próprio; um é decorator de medição.
- [Lido] O denominador `180` do prompt não bate com o escopo examinado. Classificação individual e referências `arquivo:linha` estão no diário `EXECUCAO-1.3.md`.
- [Não feito] Não criei `scripts/architecture/check-ipc-validation.cjs`, allowlist versionada ou fixture negativa. Validação de dados por handler permanece fora desta classificação de origem.

## 11. Fase H — auditorias e propostas

- [Executado] `npm audit --omit=dev`: `0` vulnerabilidades, exit `0`. `npm audit`: `6` moderadas transitivas pela cadeia `minimatch` / `@electron/universal` / `app-builder-lib` / `electron-builder`, exit `1`. Não rodei `audit fix`.
- [Executado] Inventário registra `141` scripts e `34` candidatos anteriores. `prepreview` é hook lifecycle; `editor-v6:analyze-memo-ab` tem chamada em PowerShell; nenhum agrupamento/remoção foi provado seguro.
- [Suposição] Proposta para o ZIP histórico: armazenamento privado de artefatos, imutável e com retenção. Local depende do dono do produto; nada foi movido.

## 12. Descobertas e desvios

- [Executado] Desvio principal: embora D3 tenha ganho de tempo acima de `5%` nos agregados, a divergência nas referências impediu comprovar qualidade; não segui para o corte longo nem E/F.
- [Executado] Amostras BGRA variaram também entre controles (A2 vs A1/A3), logo uma parte da diferença pode ser não determinismo da captura. Isso não explica A3/B3 nem prova equivalência; gate mantido fechado.
- [Executado] Um primeiro setup do corte curto com `4` workers foi recusado pelo harness pois havia `2` partes. O ensaio válido foi reiniciado com `2` workers iguais nos dois braços.
- [Executado] Nenhum dado original do projeto foi alterado; a exportação usou backup verificado e destinos em `out/editor-v6-stress/runs/`.

## 13. Pendências e riscos

- [Executado] Ordem: explicar A3/B3 com comparação determinística de amostras; depois repetir D3 de `40 s`; somente com pixels idênticos avançar a `200 s` e validar A/V, `9` emendas, endpoints, memória e limpeza.
- [Não feito] Se a causa for `fps`/PTS ou filtro de camada, corrigir a composição no candidato, retestar sintético e comparar novamente antes de reintegrar D2. Não habilitar por padrão sem autorização do dono do produto.
- [Não feito] Depois do gate D: executar E/F, completar checker G e resolver a localização durável do ZIP H.
- [Suposição] Maior risco técnico imediato é a conversão NUT→CFR de um quadro de borda; pode haver arredondamento de PTS ou captura variável. Evidência e hipótese não são causa confirmada.

## 14. Dados brutos e incertezas

- [Executado] D3 bruto e hashes: `dados/RODADA-1.3-D3-40s/`; resumo traz tempos, validação, SHA-256 de MP4/referências e diferença por amostra. Evidências anteriores: `dados/RODADA-1.3-A5/`, `dados/RODADA-1.3-B/`, `dados/RODADA-1.3-C1/`, `dados/RODADA-1.3-C2/`, `dados/RODADA-1.3-C3/`, cada uma com checksums.
- [Lido] Diário detalhado e método: [EXECUCAO-1.3.md](EXECUCAO-1.3.md). Arquivos Markdown ativos mantidos abaixo de `300` linhas.
- [Suposição] Três maiores incertezas: (1) se o quadro `599` divergiu pelo filtro `fps`/PTS ou por variação da captura; (2) quanto do ganho curto NUT se conserva em `6.000` quadros com áudio e emendas; (3) qual etapa limita a parede restante quando produtor e consumidor medidos isoladamente ficam abaixo do total.
