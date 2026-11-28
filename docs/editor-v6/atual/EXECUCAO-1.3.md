# Execução 1.3 — investigação e gates

[Executado] Início: 2026-11-21. Raiz `C:\TRABALHO 2\OUTROS\GACHA EM C++`, branch `Dev-V2`. Commit base desta rodada após registro da 1.2: `ce28d7fccfb11cbdbcee74210b9d84b10bb532dd`. CPU/GPU/OS conforme identificação em `RELATORIO-RETORNO-RODADA-1.2.md`.

## Fase A — rastreabilidade e neutralidade (21/11/2026)

### A1. Registro da rodada anterior

- [Executado] Commit `ce28d7fc` registrou `RELATORIO-RETORNO-RODADA-1.2.md`, o resumo dos dados brutos, o diff-stat e três trechos de produção. O diff do commit contém somente documentação/evidências.
- [Executado] Este diário foi ligado no índice `README.md`. Markdown ativo: diário com menos de 300 linhas.

### A2. Node

- [Lido] `.nvmrc` e workflows atuais fixam Node `22.23.5`, não `22.22.0` (o valor citado no objetivo não corresponde ao checkout).
- [Executado] Baixei o ZIP oficial Node `v22.23.5` para `out/`, conferi SHA-256 com `SHASUMS256.txt`; hash do ZIP `4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3`.
- [Executado] Com Node `v22.23.5`: `npm run typecheck` passou (21:33:26–21:33:31, exit 0); `npm exec -- vitest run --config vitest.editor-v6.config.ts` passou (21:33:31–21:33:57, 186 arquivos passaram, 1 ignorado; 892 testes passaram, 1 ignorado; duração `14.58 s`).
- [Executado] Não mudei `.nvmrc` nem CI. O binário foi mantido em `out/` para as próximas fases e será removido ao concluir a rodada.

### A3–A5

- [Executado] A3 — transpile/AST e diff de formatação realizados; resultado detalhado abaixo. Nenhum commit 100% de formatação foi encontrado.
- [Executado] A4 — coleta diagnóstica opt-in, teste desligado e seis exports de 40 s válidos; medianas lig./desl. e raw data em `dados/RODADA-1.3-CHECKPOINT.json`.
- [Executado] A5 foi retomada e concluída em 22/11/2026: 3 exports por revisão em ordem A/B/A/B/A/B, com descanso de 60 s; HEAD passou no gate de 2%. Dados completos e hashes em `dados/RODADA-1.3-A5/`.

## Fases B–H

- [Executado] B — captura permanente opt-in implementada e exercitada em até 5 cortes. `write UNKNOWN` não reproduzido; causa permanece inconclusiva.
- [Executado] C — C1, C2 e C3 medidos. Gate C aponta sincronização/acoplamento; D foi liberada.
- [Executado] Parcial D — D1 writer NUT isolado e equivalência sintética concluídos. D2 foi testada atrás de flag, mas removida após D3 não provar identidade das amostras; não rodei o corte de 200 s.
- [Não feito] E — teto WebCodecs no renderer e comparação com consumidor.
- [Não feito] F — probe opt-in de causa de render, ações reais de UI e índices adicionais.
- [Executado] Parcial G — 12 handlers de produto classificados estaticamente; guarda automática e fixture negativa pendentes.
- [Executado] Parcial H — audits de dependências e inventário/categorias dos scripts revisados; decisão de armazenamento do ZIP segue proposta, sem mover arquivo.

### G. IPC — leitura estática parcial (22/11/2026)

- [Executado] AST de `electron/**/*.ts`: encontrei 132 chamadas `.handle()`; 13 sem chamada textual direta a `assertTrustedSender`. O prompt cita 180; esse total não bate com o escopo TypeScript de produção examinado e precisa de reconciliação antes de ser usado como denominador.
- [Lido] Classificação das 13 ocorrências sem chamada textual:
  - `electron/application/measuredIpcMain.ts:28` — wrapper de medição, não é um canal da aplicação nem um guard de origem; a validação cabe ao handler registrado por ele.
  - `electron/domains/editorV6/exportIpc.ts:232` — guard indireto `findJob` → `deps.assertTrustedSender`; também restringe propriedade do job ao `sender.id`.
  - `electron/domains/editorV6/exportIpc.ts:233` — guard indireto `findJob` → `deps.assertTrustedSender` e propriedade do job.
  - `electron/domains/editorV6/exportIpc.ts:234` — guard indireto `findJob` → `deps.assertTrustedSender` e propriedade do job antes de revelar caminho.
  - `electron/domains/editorV6/exportWorkerRegistry.ts:21` — guard próprio `entry`: renderer registrado pelo `sender.id` e quadro principal.
  - `electron/domains/editorV6/exportWorkerRegistry.ts:22` — guard próprio `entry`; trabalhador aposentado também é rejeitado/ignorado.
  - `electron/domains/editorV6/motionIpc.ts:41` — guard próprio `worker`: lane registrada pelo `sender.id` e quadro principal; confere trabalhador aposentado.
  - `electron/domains/editorV6/motionIpc.ts:48` — mesma validação própria de worker/lane e estado aposentado.
  - `electron/domains/editorV6/motionIpc.ts:193` — guard indireto `bakeOwned` em `motionIpc.ts:173` chama `deps.assertTrustedSender` antes de validar request e iniciar job.
  - `electron/domains/editorV6/motionIpc.ts:194` — mesmo guard `bakeOwned`.
  - `electron/domains/editorV7/exportIpc.ts:62` — guard indireto `owned` em `exportIpc.ts:18` chama `deps.assertTrustedSender`, valida ID e propriedade.
  - `electron/domains/editorV7/exportIpc.ts:63` — guard indireto `owned` e propriedade do job antes de cancelar.
  - `electron/domains/editorV7/exportIpc.ts:67` — guard indireto `owned` e estado concluído antes de revelar caminho.
- [Não feito] Não encontrei omissão de origem entre os 12 handlers de produto acima. Não criei `check-ipc-validation.cjs` nem fixture negativa porque o usuário pediu para não executar novos testes/cálculos; a guarda automática permanece pendente. A revisão acima não substitui a inspeção dos 180 alegados nem validação dinâmica.

### B. `write UNKNOWN` — leitura sem reprodução (22/11/2026)

- [Lido] `exportProcess.ts:24` retém apenas os últimos 64.000 caracteres de stderr; `:30` trata `close` com código, mas não registra sinal nem instante. Em código diferente de zero, o erro expõe os últimos 4.000 caracteres; stderr de processo encerrado com código zero não é ligado a uma falha de escrita.
- [Lido] `exportProcess.ts:33` engole o evento `stdin.error` sem guardar objeto, horário ou estado do processo. `exportPartRenderer.ts:330` observa o callback de `stdin.write`; se houver erro, espera `process.done` e então rejeita. O caminho de diagnóstico em `:402–459` rejeita erro de callback e registra backpressure somente quando a escrita completa.
- [Lido] `exportFramePipeline.ts:143` aguarda uma escrita por vez e propaga erro; o chamador anota `failedOutputFrame` quando a etapa é streaming. Não encontrei captura de `writableLength`, tempo desde o quadro anterior, eventos `close`/`drain` no caminho de falha nem associação explícita do erro com PID/parte.
- [Suposição] EPIPE/pipe fechado pelo FFmpeg permanece uma hipótese compatível, não causa confirmada. A execução 1.2 registra um incidente no quadro 2.756 sem stderr/código/sinal suficientes para distinguir encerramento do encoder, erro da stream ou outra causa.
- [Não feito] Não rodei reproduções nem alterei o writer porque o usuário pediu para encerrar os cálculos. A causa do incidente, a ordem temporal FFmpeg→pipe e a integridade da retentativa seguem sem verificação.

### H. Auditoria de dependências e scripts (22/11/2026)

- [Executado] Com Node `v22.23.5` / npm `10.9.9`, `npm audit --omit=dev` retornou `found 0 vulnerabilities` (exit 0). `npm audit` retornou 6 vulnerabilidades moderadas (exit 1): cadeia transitiva `minimatch` → `@electron/universal` / `app-builder-lib` / `electron-builder`. A correção sugerida pelo npm exige `--force` e uma mudança breaking para `electron-builder@25.1.0`; não rodei `audit fix`.
- [Lido] O achado atual é dependência de desenvolvimento: removendo `dev` do grafo, o audit reporta zero. A suspeita antiga de que os 6 avisos eram do Prettier não é confirmada pelo relatório atual; o pacote apontado é `minimatch`.
- [Lido] O inventário conta 141 scripts; dos 34 candidatos listados, `prepreview` é hook automático de lifecycle e `editor-v6:analyze-memo-ab` tem chamada direta em `scripts/editor-v6/run-memo-ab.ps1:41`. Os outros 32 não têm chamada literal externa identificada na lista existente; `test:editor-v6:stress-ab-memo` é um entrypoint manual que executa esse PowerShell. Detalhes/categorias e recomendação de manter comandos especializados estão em [npm-scripts-reference-inventory.md](../../architecture/npm-scripts-reference-inventory.md).
- [Lido] Não encontrei pares de comandos com a mesma execução e os mesmos argumentos; não proponho agrupamento destrutivo. Modos de gate, stress com/sem trace e análises distintas devem continuar separados até equivalência ser provada.
- [Suposição] Para durabilidade, proponho guardar o ZIP histórico em armazenamento de artefatos privado da equipe, com versão imutável, retenção e hash no README; não dentro do repositório Git, para não inflar o histórico binário. A localização precisa de escolha do dono do produto; não movi o ZIP local `out/editor-v6-stress/runs/proposals/docs-lixo-archive-proposal-2026-11-21.zip` (SHA-256 `B9A5D49F9447C46FC86CAD297F89718FF6B8D95F39D539D5B6A629EB9224CC2F`).
- [Não feito] Não atualizei dependências, não rodei `audit fix` e não movi o arquivo histórico.

[Executado] O checkpoint anterior foi retomado em 22/11/2026. D3 parou após detectar divergência de pixels não explicada na amostra A3/B3; o corte de 200 s permanece bloqueado pelo critério de qualidade.
### A3. Prova de neutralidade da formatação (21/11/2026)

- [Executado] Comparei `cc9d02b0^` e HEAD com `typescript.transpileModule`, mesmo alvo ES2022; comparei a AST JS reimpressa sem comentários para ignorar quebras/espaços. As 12 fontes TS/TSX/CJS/MJS com baseline nos commits `204401ff` e `e80e604f` tiveram AST transpile diferente. Logo, nenhum desses commits é 100% formatação.
- [Executado] A coluna “só formatação” conta linhas que desaparecem de `git diff --numstat` ao aplicar `--ignore-all-space --ignore-blank-lines`; são pares de inserção/remoção equivalentes, não prova de que o restante seja exclusivamente lógica.

| Arquivo | Alteradas brutas (+/−) | Só formatação (+/−) | Blocos com mudança semântica na AST normalizada |
|---|---:|---:|---|
| [Executado] `exportFramePipeline.ts` | 125/7 | 0/0 | `renderAndWriteEditorV6Frames`: coleta opcional de corridas/escritas e métricas de tempo |
| [Executado] `exportPartRenderer.ts` | 298/81 | 42/42 | `renderEditorV6ExportPart`: flags de export, tempos, amostras e escrita diagnóstica |
| [Executado] `electron/main.ts` | 1468/424 | 103/103 | métricas IPC/processos, modos de estresse e execução de benchmarks; blocos `registerFabricatorHandlers`, `createMainWindow`, preparação/relatório de export e helpers de resumo |
| [Executado] `EditorV6Page.tsx` | 591/219 | 95/95 | `EditorV6Page`: props/ações do tool rail estabilizadas, rotas de profiling e composição de painel/seleção |
| [Executado] `EditorV6ToolRail.tsx` | 150/29 | 3/3 | `EditorV6ToolRail`, `ToolGroup`: memoização e contrato de props/ações |
| [Executado] `applicationRoutes.ts` | 7/1 | 0/0 | `UI_PERFORMANCE_ROUTES`: rotas instrumentadas |
| [Executado] `editorV6TimelineScene.ts` | 199/61 | 12/12 | índices por identidade e observer de construção de cache para teste |
| [Executado] `editorV6Scene.test.ts` | 148/12 | 0/0 | fixture e teste de reconstrução de índices |
| [Executado] `exportFramePipeline.test.ts` | 197/76 | 25/25 | casos de timeline de escrita/backpressure e diagnóstico de corridas |
| [Executado] `benchmark-project-export.cjs` | 438/157 | 12/12 | métricas e controle de execução de benchmark |
| [Executado] `test-stress-offscreen.cjs` | 678/166 | 36/36 | harness/telemetria de stress e export de UI |
| [Executado] `editor-v6-text-element-command.test.mjs` | 55/15 | 0/0 | cobertura de comandos de texto alterada |
| [Lido] `verify-authorized-project-backup.cjs` | novo | N/A | adicionado no commit `204401ff`; sem versão anterior para comparar |

- [Executado] O crescimento líquido da Page é `372 linhas` (`591−219`); diff whitespace-insensitive mantém `372` linhas líquidas sem equivalência estrutural provada. O crescimento líquido de `electron/main.ts` é `1.044 linhas` (`1468−424`), também preservado no diff whitespace-insensitive. Não se pode atribuir esse crescimento à formatação. A parte da Page semanticamente mudou em actions/composição/profiling; main recebeu instrumentação/test harness além de reorganizações.
- [Executado] Não criei `.git-blame-ignore-revs`: não encontrei commit 100% de formatação entre `cc9d02b0^` e HEAD; os commits formatados são mistos.
- [Não feito] O detalhamento semântico por responsabilidade em `main.ts` ainda requer separar cada bloco do profiling dos registrars/serviços que também aparecem no diff. A AST prova diferença semântica, mas não determina risco de comportamento por si só.

### A4. Instrumentação opt-in (21/11/2026)

- [Lido] `exportPartRenderer.ts` ativa `frameWriteTimeline`, tempos de fase e métricas de quadro somente com `GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS=1`; sem a flag, passa `collectDiagnostics: false`. `exportFramePipeline.ts` mantém contagens operacionais e saída de frames, mas não chama o coletor nem `performance.now()` para diagnóstico quando desligado.
- [Executado] Teste focado: 12/12 passaram. Build e typecheck passaram na validação anterior à comparação. Três A/B alternados de 40 s por braço passaram: desligado 47.578,7393 / 45.837,6952 / 44.272,6501 ms; ligado 45.627,2084 / 47.572,4176 / 45.717,2104 ms. Medianas: 45.837,6952 ms desligado e 45.717,2104 ms ligado; delta −0,26285091227712%. A amostra não mede overhead positivo consistente.
- [Executado] Cada saída validou 1.200 quadros 1920×1080/30, áudio, H.264 `libopenh264`, uma emenda e zero erros de limpeza. Os relatórios em `out/` registraram coleta ausente quando desligada e habilitada quando ligada. As execuções foram controladas e alternadas, mas os relatórios anotaram `workingTreeDirty=true`; considerar esse limite ao reutilizar o resultado.

### A5. Comparação de revisão (21/11/2026; interrompida)

- [Executado] Criei e compilei worktrees detached em `cc9d02b0` e `049e1e65`; usei o mesmo backup verificado do projeto, FFmpeg e preset, 4 workers, 3 threads H.264, 6.000 quadros, 200 s, 1080p/30 e perfil padrão com animações e áudio.
- [Executado] Depois que o usuário fechou o jogo, controle `cc9d02b0`: 174.901,8766 ms, 6.000 quadros, 200,000 s, nove emendas, seis clipes de áudio, `libopenh264`, limpeza sem erros. O job relatou revisão `cc9d02b0` e `workingTreeDirty=false`.
- [Executado] Antes de o jogo ser fechado houve um controle de 200.321,9834 ms válido e um candidato HEAD iniciado; excluí ambos da comparação final por condição de máquina contaminada e interrupção a pedido do usuário.
- [Não feito] Não iniciei o segundo controle/candidato após o usuário pedir para parar os cálculos. Com somente um braço A, o limiar A5 de 2% não pode ser julgado; nenhuma regressão foi confirmada nem descartada. Dados preservados em `dados/RODADA-1.3-CHECKPOINT.json` e nos diretórios isolados `out/`.
- [Executado] Verificação de disponibilidade após interrupção em 21/11: nenhum processo Electron ou FFmpeg iniciado pelo benchmark permaneceu ativo; os processos Node listados pertenciam ao Codex. Não lancei outra instância do app.

### A5 — retomada, conclusão (22/11/2026)

- [Executado] Recriei e verifiquei duas cópias do mesmo backup: projeto `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, 3.687 arquivos, 966.335.489 bytes. A origem em `app-data` permaneceu somente leitura. Worktrees compilados: `cc9d02b0` e HEAD `663b59be`.
- [Executado] A/B/A/B/A/B, com descanso de 60 s entre execuções. Mesmo preset 2 (fingerprint `2a0f0859cffe0f64477b98f71aa06eaec21bad1f6d5c32e41067ce761c2abba9`), mesmos executáveis FFmpeg/FFprobe, 4 workers, `libopenh264`, 3 threads, quadro inicial 0, 6.000 quadros, 200 s, 1920×1080/30 e áudio ativo.
- [Executado] Clique→MP4 validado (ms): A1 `178322.8826`, B1 `173394.4631`, A2 `167079.4618`, B2 `167143.5909`, A3 `168706.4502`, B3 `168224.7421`. Cada job validou 6.000 quadros, 200,000000 s, 9 emendas, 6 clipes de áudio, áudio presente, `libopenh264` e zero erros de limpeza.
- [Executado] Controle A: mínimo `167079.4618 ms`, mediana `168706.4502 ms`, máximo `178322.8826 ms`, amplitude/mediana `6.66448780510225%`. HEAD B: mínimo `167143.5909 ms`, mediana `168224.7421 ms`, máximo `173394.4631 ms`, amplitude/mediana `3.71578646634762%`. Diferença das medianas `(B−A)/A` = `−0.285530339491458%`.
- [Executado] Gate A5 passou: HEAD não ficou mais de 2% lento e nenhum dos 3 pares mostrou regressão acima de 2% repetível. A amplitude observada supera a diferença das medianas. A variação entre execuções é compatível com ruído, mas não prova a causa dos `163.760 s` antigos; a diferença de `163.760 s` para `169.435 s` continua sem causa confirmada.
- [Executado] Relatórios completos e SHA-256: `dados/RODADA-1.3-A5/round13-a5-{A1,B1,A2,B2,A3,B3}.json` e `dados/RODADA-1.3-A5/SHA256SUMS.txt`. Nenhum MP4 foi retido; o harness validou cada arquivo antes da limpeza.

### B. Captura do erro de escrita do pipe (22/11/2026)

- [Lido] Causa ainda não confirmada. Antes da mudança, `exportProcess.ts` engolia `stdin.error`, e o harness descartava os campos extras de cada parte ao escrever `stress-export-validation.json`; por isso, um erro não permitia ordenar stderr, saída do FFmpeg e estado do pipe.
- [Executado] Adicionei captura sob `GACHA_EDITOR_V6_PIPE_FAILURE_DIAGNOSTICS=1`: stderr, PID, exit/signal, estado/buffer da stdin, contagens e últimos 64 eventos por processo; em caso de callback de escrita, salva quadro/parte, bytes, relógio, estado antes/depois e snapshots do processo. O harness inclui esses campos apenas quando a flag está ligada. No caminho padrão não cria listeners, amostras, snapshots ou Promises assíncronas extras por quadro.
- [Executado] Typecheck passou; testes focados passaram `26/26` em 3 arquivos; `git diff --check` e build passaram. Testes sintéticos cobrem caminho padrão sem snapshot, `write UNKNOWN` no callback, evento `stdin.error`, exit/signal e caminho opt-in concluído.
- [Executado] Revalidei o backup antes dos exports: ID `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, `3.687` arquivos, `966.335.489` bytes, SHA-256 por arquivo conferido. Saídas foram isoladas em `out/`; o preset de slot 2 é sintético e repetível, fingerprint `2a0f0859cffe0f64477b98f71aa06eaec21bad1f6d5c32e41067ce761c2abba9`. Não li nem alterei o projeto original.
- [Executado] Foram iniciados 5 exports de `6.000` quadros, `[0,6000)`, `200 s`, `1920×1080/30`, `4` workers, `3` threads, perfil UI, cabelo/boca/áudio ativos, encoder `libopenh264`. B1 validou o MP4 em `171.641,211 ms`, mas o harness não serializou as amostras do pipe; não conta como captura diagnóstica. B2–B5 validaram MP4 e capturaram `10/10` partes cada: `171.422,6776`, `168.053,4324`, `169.306,1124`, `169.701,3231 ms`. Mediana `169.503,7178 ms`, mínimo `168.053,4324 ms`, máximo `171.422,6776 ms`, amplitude `3.369,2452 ms` (`1,9877116825066394%` da mediana).
- [Executado] Nas quatro capturas B2–B5: `0` eventos `stdin.error`, `0` `process.error`, stderr vazio, `10/10` FFmpeg por execução terminaram com código `0` sem sinal, `6.000/6.000` quadros, limpeza sem erros. Cada parte contou `600` `drain` events e reteve `64` amostras recentes; cada execução capturou `640` amostras, `6.000` drains no total. Eventos finais observados: `stdin.close` antes de `process.exit` e `process.close`. Nenhuma execução reproduziu `write UNKNOWN`.
- [Executado] B2 expôs um defeito no coletor: `Writable.errored === null` foi serializado como `Error("null")`. Não houve evento `stdin.error`, stderr permaneceu vazio e o FFmpeg fechou com `0`; corrigi null/undefined e acrescentei teste. B3–B5 não têm essa falsa propriedade.
- [Executado] Picos de RSS amostrados nas quatro capturas (bytes; máximo por papel entre B2–B5): main `4.418.629.632`; GPU `1.296.408.576`; renderers de benchmark `1.837.260.800`; renderer de export `2.123.392.064`; FFmpeg `375.963.648`; utility `69.218.304`; Electron Tab `1.750.183.936`. Picos são máximos independentes e não simultâneos; [Não feito] não medi commit/pressão global de memória no instante de uma falha, pois nenhuma ocorreu.
- [Suposição] Como não houve falha, a evidência não distingue `EPIPE`/encerramento raro de outra causa do incidente histórico do quadro `2.756`. O processo não morreu antes de escrita nos quatro exports observados. [Não feito] Não exercitei retentativa de produção; não houve falha que a acionasse. A causa permanece inconclusiva.
- [Executado] Dados brutos B1–B5 e hashes: `dados/RODADA-1.3-B/round13-b-write-{1..5}.json`, `dados/RODADA-1.3-B/SHA256SUMS.txt`. B1 fica incluído para evidenciar a falha de agregação do harness; somente B2–B5 sustentam os números instrumentados.

### C1. CPU acumulada por processo (22/11/2026)

- [Lido] `app.getAppMetrics()` expõe `cpu.cumulativeCPUUsage` em segundos desde o início do processo. A leitura `cpu.percentCPUUsage` é uma média intervalar, então não a tratei como CPU acumulada.
- [Executado] Para tornar o corte auditável, `--phase2-diagnostics` passou a salvar PID, papel, CPU acumulada e fonte por amostra. Electron (main, GPU, renderers, Utility/Tab): `app.getAppMetrics()`; FFmpeg: `Get-Process.CPU` em segundos. Janela: primeira à última amostra (~170 s), cerca de 1 amostra/s. Por PID, subtraí a primeira leitura se existia na primeira amostra; para PIDs surgidos depois, usei CPU desde a criação. Agrupei por papel; percentual médio = CPU-s / parede amostrada / 12 threads.
- [Executado] Três exports frios, mesmo backup/preset/encoder/4 workers/3 threads/corte 6.000: clique→MP4 `168.191,2301`, `170.967,2683`, `168.467,0020 ms`; todos passaram `6.000/6.000` quadros e MP4/áudio.

| Repetição | Parede amostrada (s) | Main CPU-s | GPU CPU-s | Renderer benchmark CPU-s | Renderer export CPU-s | FFmpeg soma CPU-s | Outros Electron CPU-s | Total CPU-s | Uso médio de 12 threads |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Executado] C1-1 | 169,211 | 135,038920 | 85,181159 | 71,761474 | 81,960893 | 540,875000 | 0,750535 | 915,567981 | 45,090054% |
| [Executado] C1-2 | 171,978 | 130,198788 | 85,908470 | 72,926328 | 74,824706 | 537,203125 | 8,548681 | 909,610098 | 44,075894% |
| [Executado] C1-3 | 169,473 | 130,871871 | 85,132620 | 71,759297 | 74,289906 | 540,984375 | 7,939098 | 910,977167 | 44,794607% |

- [Executado] Picos individuais amostrados: FFmpeg `531,344601%`, `533,496300%`, `568,756319%`; main `138,742072%`, `141,425845%`, `144,255705%`; renderer de export `193,331643%`, `183,093347%`, `199,764618%`. Soma máxima no mesmo instante: todos os papéis `988,588110%`, `1017,197987%`, `1020,855832%`; somente FFmpeg concorrentes `780,475719%`, `851,160515%`, `809,935205%`.
- [Suposição] O `557,107588%` antigo é compatível com pico de um FFmpeg individual: os três novos individuais variam de `531,344601%` a `568,756319%`. O `815,9%` antigo pode ser uma soma de FFmpeg concorrentes: os máximos novos dessa soma variaram de `780,475719%` a `851,160515%`; sem o método original, não afirmo equivalência.
- [Não feito] O sampler cobre processos do app e FFmpeg, não todo processo de fundo do Windows. “Outros Electron” soma Utility/Tab; CPU de processos do sistema fora do app = N/D. C1 não separa “tempo FFmpeg ocupado” de render ativo; isso depende de C2/C3.
- [Executado] Dados brutos e hashes: `dados/RODADA-1.3-C1/round13-c1-{1,2,3}.json`, `dados/RODADA-1.3-C1/SHA256SUMS.txt`. Build contém instrumentação local e os reports declaram `workingTreeDirty=true`; cada medição é descritiva, não A/B.

### C2. Teto do consumidor — checkpoint para retomada (22/11/2026)

- [Executado] Capturei os quadros reais do pipe da exportação `[0,1200)`, 40 s, validada em `43.956,448 ms` com 2 workers. Um primeiro harness com 4 workers foi corretamente recusado porque o plano tinha apenas 2 partes; outra tentativa com 2 workers revelou concorrência na validação de diretório da captura. Corrigi isso usando nomes exclusivos e criação sem sobrescrita; a captura final passou.
- [Executado] Os dumps estão em `out/editor-v6-stress/dumps/round13-c2-03/`: sem vídeo `150` quadros, `1.244.160.000` bytes, `1920×1080 BGRA`; com vídeo `150` quadros, `2.488.320.000` bytes, `1920×2160 BGRA`; vídeo de entrada `1.043.264` bytes. Metadados preservam os argumentos exatos do FFmpeg, e a mídia de vídeo foi copiada da cópia verificada do projeto.
- [Executado] Completei A/B/A/B/A/B por separado para cada amostra, com 60 s de descanso. Cada processo decodificou 150 quadros, produziu MP4 validado em 30 FPS, 1920×1080, e stderr `0` bytes. O candidato de 4 processos rodou quatro arquivos simultâneos; fps é agregado.

| Amostra | Concorrência | Mediana parede | Mín.–máx. | FPS agregado mediano | Projeção mediana 6.000 quadros |
|---|---:|---:|---:|---:|---:|
| [Executado] sem vídeo | 1 | `1.109,9428 ms` | `1.090,9187–1.246,7721 ms` | `135,142099` | `44,397712 s` |
| [Executado] sem vídeo | 4 | `2.607,8871 ms` | `2.545,9269–2.651,994 ms` | `230,071310` | `26,078871 s` |
| [Executado] com vídeo | 1 | `1.846,9565 ms` | `1.834,8399–1.926,2219 ms` | `81,214690` | `73,878260 s` |
| [Executado] com vídeo | 4 | `5.683,1574 ms` | `5.666,3123–5.771,5315 ms` | `105,575116` | `56,831574 s` |

- [Lido] A projeção é `6.000 / fps agregado`, não mede o export completo. O sample de vídeo inclui composição/encode, enquanto o sem vídeo não; os limites superiores do consumidor ficam abaixo do baseline total de `169.435 ms` (`169,435 s`), mas não isolam o custo de escrita/buffer do pipe.
- [Executado] `ffmpeg -encoders` lista `libopenh264` (atual), `h264_amf`, `h264_d3d12va`, `h264_mf`, `h264_nvenc`, `h264_qsv`, `h264_vaapi` e `h264_vulkan`. `libx264` não está compilado nesta cópia. As saídas completas e os logs A/B/A/B/A/B, junto de checksums, estão em `dados/RODADA-1.3-C2/round13-c2-{no-video,with-video}-complete.{json,log}`.
- [Executado] Encoder alternativo AMD AMF, no sample com vídeo: controle `libopenh264` A/B/A/B/A/B com 60 s de descanso, um processo por braço; os dois braços validaram 150 quadros, 30 FPS e zero bytes de stderr. Mediana de parede: controle `1.825,8725 ms`, AMF `1.806,9712 ms` (−1,035%); mediana projetada por 6.000 quadros: `73,034900 s` vs. `72,278848 s` (−1,035%). Não é repetição do export completo.
- [Executado] Qualidade AMF vs controle, em cada um dos três pares: SSIM All `0,987858`; PSNR média `43,705003 dB`. Tamanho dos MP4s: controle `726.421 bytes`; AMF `1.878.442 bytes` (`2,585×`). O candidato não é pixel-idêntico e não foi promovido. Dados/logs em `dados/RODADA-1.3-C2/round13-c2-encoder-amf.{json,log}`.
- [Executado] Encoder `h264_mf` com o comando de produção inalterado exceto `-c:v`: falhou antes de codificar (exit `−22`), pois `profile=high` não é aceito pela opção de perfil do Media Foundation. Não adaptei perfil/argumentos, porque isso quebraria a comparação “mudar só encoder”. Evidência em `dados/RODADA-1.3-C2/round13-c2-mf-probe.log`. [Lido] `libx264` não existe no binário atual; NVENC/QSV não correspondem à GPU AMD da máquina; VAAPI é específico de outros ambientes. Não testei esses encoders nem `d3d12va`/`vulkan`.
- [Executado] C2 foi concluída e registrada; dumps brutos permanecem temporários até validar hashes e iniciar D1.

### C3. Teto do produtor e Gate C (22/11/2026)

- [Executado] Adicionei `GACHA_EDITOR_V6_PRODUCER_ONLY=1`, permitido somente no harness offscreen e com 4 workers. Reutiliza `renderEditorV6ExportAttempt` e os workers reais; o `Writable` descarta cada quadro após a captura. Não inicia FFmpeg, não roda ffprobe, não publica arquivo e o relatório marca `mp4Validated=false`. Dois testes sintéticos cobrem o sink e o bloqueio fora do harness.
- [Executado] Três execuções frias da mesma cópia verificada, Preset 2, movimento/cabelo e boca ativos, 6.000 quadros, 4 workers, 10 partes de 600 quadros. Todas entregaram 6.000/6.000 quadros, prepararam `130/130` transições, encontraram `6` vídeos na timeline e confirmaram `0` processo FFmpeg.

| Repetição | Render + captura (parede) | Export API total (parede) | Quadros/s de render/captura |
|---|---:|---:|---:|
| [Executado] C3-1 | `62.944,18 ms` | `95.708,5122 ms` | `95,321` |
| [Executado] C3-2 | `60.465,07 ms` | `92.859,1146 ms` | `99,231` |
| [Executado] C3-3 | `61.651,28 ms` | `95.858,5941 ms` | `97,322` |

- [Executado] C3: mediana `61.651,28 ms`; mínimo `60.465,07 ms`; máximo `62.944,18 ms`; amplitude `2.479,11 ms` (`4,021%` da mediana). `renderingWallMs` é tempo de parede da tentativa inteira, incluindo preparação dos workers e 10 partes concorrentes; não é soma dos tempos individuais das partes. O total API também inclui preparação de cabelo/movimento, limpeza e gravação do relatório.
- [Executado] Gate C contra baseline 1.2 de `169.435 ms` (`169,435 s`): teto consumidor C2 com vídeo, 4 processos, projeção mediana `56,831574 s` = `33,541815%` do baseline; teto produtor C3 mediano `61,65128 s` = `36,386390%`; CPU média normalizada C1 mediana `44,794607%` de 12 threads. Ambos tetos `<60%` e CPU `<70%` → a tabela aponta para acoplamento/sincronização. Além disso, a referência 1.2 estimou `72,5%` de bytes do pipe evitáveis em quadros repetidos. **Gate C libera D**, sem provar antecipadamente que NUT reduzirá o tempo final.
- [Executado] JSONs completos e logs das três execuções, com hashes, em `dados/RODADA-1.3-C3/`. Os resultados validam a contagem/renderização, não qualidade de MP4 ou sincronismo A/V (não houve MP4).

### D1. Writer NUT isolado (22/11/2026)

- [Lido] O Gate C liberou D por dois tetos abaixo de 60% da parede, CPU abaixo de 70% e 72,5% de bytes repetidos evitáveis. O caminho de exportação atual permaneceu intocado nesta etapa.
- [Executado] Criei `electron/domains/editorV6/nutRawVideoWriter.ts`: NUT v3 estável, rawvideo BGRA, CRC dos pacotes/cabeçalhos, syncpoint por quadro único, PTS crescente e backpressure em cada segmento escrito. O padrão usa time base `1/30`; para fps configurável o time base segue `1/fps`, mantendo o relógio do fluxo de saída coerente.
- [Executado] Fixture FFmpeg usou somente quadros sintéticos em memória e decodificação `-f nut -i pipe:0 -vf fps=<fps> -fps_mode cfr -frames:v N -f rawvideo -pix_fmt bgra -`. SHA-256 e comprimento do fluxo CFR foram comparados sem gravar dumps.
- [Executado] Cinco testes passaram: corridas com 1, 2 e 54 quadros, salto de PTS até `300`, endpoints via `-frames:v`, fps 24 com timeline `floor(index*30/24)`, quadros `1920×1080` e `1920×2160`, backpressure real (`drain`), falha sintética de escrita e cancelamento com fechamento do sink. Hashes CFR iguais em todos os casos; saída FFmpeg sem stderr.
- [Executado] A tentativa inicial de 24 fps com tempo-base fixo `1/30` reamostrou quadros (24 esperados, 23 antes do marcador terminal, e seleção diferente com marcador). Ajustei a API para `1/fps`: em 24 fps, timestamps do fluxo são índices de saída, e os bitmaps seguem os quadros de timeline calculados pelo renderer. Essa evidência mostra que usar o PTS de timeline como PTS de saída não é equivalente.
- [Executado] `npm run typecheck` passou; a suíte focada D1 passou `5/5` após a última alteração. [Não feito] Auditoria, suíte V6 inteira e build ainda não foram rodados após o writer.
- [Executado] D2 foi integrada temporariamente apenas com `GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES=1`, flag desligada por padrão. Os testes focados, typecheck e build passaram antes do A/B; após o gate de qualidade, removi a integração, flag e seus testes. O commit contém apenas D1.

### D3. A/B de 40 s — gate de qualidade (22/11/2026)

- [Executado] A/B/A/B/A/B em cópia verificada, mesmos preset 2, encoder `libopenh264`, 1.200 quadros, 1920×1080, áudio ativo e 2 workers. Quatro workers foram recusados pelo harness porque o trecho curto produz apenas 2 partes; a comparação ficou com 2 workers em ambos os braços. Houve descanso de pelo menos 60 s entre execuções.
- [Executado] Controles A1/A2/A3: `40.117,957 ms`, `39.999,8273 ms`, `39.004,0316 ms`; mediana `39.999,8273 ms`, mínimo `39.004,0316 ms`, máximo `40.117,957 ms`. Candidatos B1/B2/B3: `36.966,8374 ms`, `37.733,4918 ms`, `36.898,8465 ms`; mediana `36.966,8374 ms`, mínimo `36.898,8465 ms`, máximo `37.733,4918 ms`. Diferença de mediana `−7,582507%`; diferença entre mínimos `−5,397353%`.
- [Executado] As seis saídas passaram validação, cada uma com `1.200` quadros, 30 FPS, áudio presente e encoder `libopenh264`. A comparação do resultado não promove o candidato sem identidade de pixels.
- [Executado] Referências BGRA A1/B1 coincidiram. A2/B2 diferiram em `28.154` bytes na amostra de 8 quadros; A2 também diferiu de A1/A3 em `39.926` bytes, indicando variação entre capturas. A3/B3 diferiram em `500` bytes no quadro de amostra índice `7` (timeline frame `599`), máximo por canal `3`; as outras 7 amostras coincidiram.
- [Suposição] A diferença pequena pode vir de arredondamento/resampling do filtro `fps` ou de variação de captura; não determinei a causa. Como a prova de identidade falhou e a origem não está isolada, não executei o gate de 200 s e não promovi NUT.
- [Executado] Removi a integração D2 e suas alterações de testes; mantive D1 isolada. Os relatórios completos, hashes dos MP4s/referências e comparação por amostra estão em `dados/RODADA-1.3-D3-40s/round13-d3-40s-summary.json` (SHA-256 `BFD181A412ED06EADEEDD6FA34E9EABA14323F1145106A4B4FCA5415C1BF270C`) e nos seis JSONs `*-stress-export-validation.json` da pasta (hashes listados pelo comando `Get-FileHash`).
- [Não feito] D3 de 200 s: bloqueada pela divergência inexplicada; duração, nove emendas, sincronismo A/V no corte longo, pico de memória e limpeza após um export de 6.000 quadros não foram medidos. D2 permanece removida, portanto nenhum quadro único é enviado no produto.

