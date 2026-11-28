# Relatório de retorno — rodada 1.2

[Executado] Data/hora das verificações finais: 2026-11-21, de 20:31:49 a 20:33:32 (America/Sao_Paulo, UTC−03:00). Este relatório descreve o estado observado nesse intervalo.

## 1. Identificação

- [Executado] Raiz: `C:\TRABALHO 2\OUTROS\GACHA EM C++`; branch `Dev-V2`; HEAD `2e92895606153f4c0fd2b41bc747cd6259aef461`.
- [Executado] `git status --short` antes de criar este relatório estava vazio. Depois da criação, há apenas os arquivos de relatório/dados novos ainda não commitados.
- [Executado] Commits `cc9d02b0..HEAD` (hash, mensagem, arquivos, linhas +/−):

| Commit | Mensagem | Arquivos | +/− |
|---|---|---:|---:|
| [Executado] `5944df5c` | test(editor-v6): audit cc9d02b0 coverage | 5 | +43/−4 |
| [Executado] `204401ff` | chore(editor-v6): export and UI measurement instrumentation | 11 | +3713/−980 |
| [Executado] `e80e604f` | perf(editor-v6): stabilize tool rail during edits | 4 | +803/−264 |
| [Executado] `991d1e9d` | chore(editor-v6): add isolated WebCodecs spike | 1 | +64/−0 |
| [Executado] `1cdcd3f3` | test(editor-v6): use portable temp paths in IPC fixtures | 1 | +212/−70 |
| [Executado] `5dc486e1` | chore(repo): format touched files and inventory docs | 9 | +240/−10 |
| [Executado] `43d67a1a` | docs(architecture): map process and domain boundaries | 5 | +149/−0 |
| [Executado] `ee9089db` | docs(editor-v6): close phased execution report | 1 | +1/−1 |
| [Executado] `8911cdce` | docs(editor-v6): record verified archive proposal | 1 | +2/−1 |
| [Executado] `d3d86f3f` | docs(editor-v6): record archive verification and gate | 1 | +1/−1 |
| [Executado] `82cb09b9` | chore(docs): archive historical Editor V6 notes | 125 | +2/−16088 |
| [Executado] `2e928956` | docs(editor-v6): close archive and lab cleanup | 1 | +2/−3 |

- [Executado] Máquina: Windows 11 Pro, build `10.0.26300`; AMD Ryzen 5 4600G with Radeon Graphics; RAM `16,526,802,944 bytes`; GPU AMD Radeon RX 7600, driver `32.0.32029.2010`; Node `v24.22.3`; Electron `45.3.1`.
- [Executado] FFmpeg primeira linha: `ffmpeg version 8.1.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers`. `ffmpeg -encoders | findstr 264`: `libx264`, `libx264rgb`, `h264_amf`, `h264_d3d12va`, `h264_mf`, `h264_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_vulkan`. Disponibilidade listada não prova qual encoder foi usado num job.

## 2. Quadro de status por fase

| Fase | Status | Commit(s) | Verificações executadas | Motivo se parcial ou não feita |
|---|---|---|---|---|
| [Executado] 0 | concluída | `5944df5c` | preflight, typecheck, auditoria, V6, grupos | — |
| [Executado] 1 | concluída | `5944df5c` | comparação dos 126 testes; runner; busca; binária | — |
| [Executado] 2 | parcial | `204401ff` | corte 6.000 quadros, pipe, Profiler, índices, 3 controles | atribuição por worker, commits desperdiçados e drag de edição incompletos |
| [Executado] 3 | parcial | `204401ff` | laboratório sintético NUT com 3 quadros | sem writer integrado e sem A/B de áudio/vídeo completo |
| [Executado] 4 | parcial | `991d1e9d` | spike WebCodecs isolado, 60 quadros por preferência | sem paridade visual/AAC/memória/benchmarks comparáveis |
| [Executado] 5 | parcial | `e80e604f` | Profiler pareado do tool rail, testes e medições sintéticas | alteração limitada; página/IDs não foram amplamente reestruturados |
| [Executado] 6 | concluída | `5dc486e1`, `82cb09b9`, `2e928956` | formatter/inventário, ZIP conferido, originais removidos pelo usuário | nenhum arquivo foi movido/apagado sem autorização; ZIP local ignorado |
| [Executado] 7 | concluída | `43d67a1a` | cinco relatórios de arquitetura lidos | IPC não teve classificação individual completa de validação de dados |

## 3. Verificações finais [Executado]

[Executado] Reexecutadas em 2026-11-21; todas terminaram com código 0. Resumo de saída real:

- [Executado] `npm run typecheck` 20:31:49–20:31:52: `tsc --noEmit`, sem erros.
- [Executado] `npm run audit:architecture` 20:31:49–20:31:57: 891 arquivos TS/TSX, 0 erros de sintaxe, 0 imports ausentes, 0 imports runtime entre features, 0 violações estritas.
- [Executado] `npm exec -- vitest run --config vitest.editor-v6.config.ts` 20:32:01–20:32:16: 186 arquivos passaram, 1 ignorado; 892 testes passaram, 1 ignorado, 893 total; duração Vitest `12.76 s`.
- [Executado] `npm run test:refactor` 20:32:36–20:33:22: 50/50 comandos, nenhum falhou; último grupo 6 passaram, 0 falharam, 0 ignorados.
- [Executado] `npm run build` 20:33:28–20:33:32: sucesso; renderer nativo CMake e bundles Electron main/preload/renderer (239/22/864 módulos). Nenhum teste C++ executado.
- [Executado] `git diff --check` 20:31:49: código 0, sem saída.
- [Executado] Não houve falha nessas execuções; portanto não há primeiras linhas de erro a reproduzir.

## 4. Fase 1 — auditoria de `cc9d02b0`

- [Executado] `tests/groups.json`: 126 arquivos de teste antes e 126 agora; ausentes: nenhum; adicionados: nenhum. A comparação foi por nome, não apenas contagem.
- [Lido] Os quatro testes de arquitetura são `base-videos-architecture.test.mjs`, `renderer-pending-persistence.test.mjs`, `studio-cast-panel.test.mjs`, `studio-concurrent-assets.test.mjs`. Classificação dos quatro: renomeação/realocação legítima. O diff move as expectativas para novos nomes/canais/owners e mantém verificações adicionais; não foi encontrada asserção relaxada ou removida. Resumo do diff e evidência estão no intervalo `cc9d02b0^..cc9d02b0`. [Lido] Evidência curta do diff `cc9d02b0^..cc9d02b0`: `base-videos-architecture.test.mjs` adiciona `base-videos:download-editor-v6-guide`; `renderer-pending-persistence.test.mjs` passa a ler `editorV6TimelineMediaCommands.ts` e `useEditorV6ExportPanelController.ts`; `studio-cast-panel.test.mjs` verifica `<SceneCastManagerModal>` e a composição `<SceneCastPanel>`; `studio-concurrent-assets.test.mjs` verifica `mapConcurrentItems(assets)` no novo normalizador de recorte. As expectativas continuam verificando o comportamento delegado.
- [Lido] `scripts/testing/run-group.mjs` executa grupos em sequência, identifica primeira saída não-zero e propaga o código. [Lido] `EXECUCAO-1.2.md` registra fixture `node -e "process.exit(7)"`, saída “FALHOU (código 7)” e retorno 7; não repeti a fixture nesta coleta.
- [Executado] Busca atual de literais `30`, `1600`, `48000` nos diretórios de produção `electron/domains/editorV6`, `src/shared` e `src/renderer/src/features/editorV6`: 23 ocorrências de `30`, 0 de `1600`, 0 de `48000`. O literal 30 ainda aparece em `electron/domains/editorV6/exportEncoderSelection.ts:20`, `exportQualitySamples.ts:2`, `exportReport.ts:34`, `src/renderer/src/features/editorV6/editorV6PlaybackModel.ts:3`, `editorV6ReactImportCompiler.ts:170`, `editorV6TimelineViewModel.ts:23`, `speechBalloonPath.ts:46`, `stress/offscreenCharacterCapture.ts:76`, `src/shared/editorV6Export.ts:13,18,54 (2),60,72 (4)`, `editorV6Schema.ts:239`, `editorV6Timing.ts:2`, `editorV7.ts:129`, `hairMotionEngine.ts:30,230`, `sceneHistory.ts:2`. Nem todas são FPS; essa busca literal não é classificador semântico.
- [Lido] Busca binária tem casos para lista vazia, singleton, duplicatas, antes do primeiro, correspondência, intervalo entre chaves e depois do último, cobrindo limites inferior e superior.

## 5. Fase 2 — medição

### 5A. Anatomia dos quadros `[0, 6000)`

[Lido] A tabela completa por trecho está em `dados/RODADA-1.2-BRUTOS.md`. [Executado] Total: 6.000 quadros, 1.654 corridas/capturas renderizadas, 4.346 quadros elegíveis a reutilização, 6.000 gravações. Bytes escritos `94,556,160,000`; bytes evitáveis estimados `68,520,038,400`. Percentual: `68,520,038,400 / 94,556,160,000 × 100` (estimativa de bitmap por corrida, não economia implementada). Com vídeo: 5.400 quadros, 1.485 corridas, 3.915 quadros elegíveis, `89,579,520,000` escritos, `64,945,152,000` evitáveis. Sem vídeo: 600 quadros, 169 corridas, 431 elegíveis, `4,976,640,000` escritos, `3,574,886,400` evitáveis.

### 5B. Tempo de parede no pipe

- [Executado] Parede total `172725.1939 ms`; união global de espera do pipe `79154.87859999976 ms`; união por quadros repetidos `69453.4143999998 ms`. Percentual do tempo total = `69453.4143999998 / 172725.1939 × 100`. Método: união de intervalos monotônicos sobre workers concorrentes; valor de parede, não soma.
- [Não feito] Parede bloqueada discriminada por worker, tempo de FFmpeg ocupado e tempo de renderer ocupado: N/D; o arquivo não persistiu essa decomposição. [Executado] Picos amostrados de CPU: FFmpeg `557.1075883575884%`, renderer export `207.07831325301206%`, main `142.68602029312288%`; são picos percentuais, não duração/ocupação acumulada. [Lido] EXECUCAO-1.2 cita também pico FFmpeg `815.9%`; coleta/método correspondente não foi localizado. Mantido como divergência sem consolidação.

### 5C. Perfil de UI

- [Executado] Playback por 60 s: medição `60042.2 ms`, RAF 60, DOM `29.98`, p95 frame `16.8 ms`, sem gaps. Profiler: Page 3.611 callbacks, Scene 3.603, Timeline 1.811, Surface 1.803, playback-audio 1.803, tool rail 3, export panel 3. Médias por rota: `.83`, `.29`, `1.06`, `.33`, `.02`, `1.9`, `.2 ms`, respectivamente.
- [Executado] Drag: `30079 ms`, 548 movimentos; tool rail depois: 554 notificações, `.02 ms`; antes: 534, `1.05 ms` (registro da execução 1.2). [Não feito] Contagem de commits/s do componente pai e cada filho direto durante play, drag e edição real de timeline: N/D. [Não feito] Lista/percentual de commits comprovadamente sem mudança nos dados: N/D; Profiler inclui commits descendentes e não permite atribuição segura. O harness não editou pose/fundo pela UI.
- [Executado] A edição sintética de timeline seek/duplicação levou 819 ms e passou; não substitui edição visual de pose/fundo.

### 5D. Índices por identidade

| [Executado] Comando na fixture | Edições | Reconstruções background-clips | Reconstruções video-clips |
|---|---:|---:|---:|
| mover bloco | 1 | 1 | 1 |
| mudar pose | 1 | 1 | 1 |
| editar fundo | 1 | 1 | 1 |
| adicionar clipe de áudio | 1 | 1 | 1 |

[Executado] Hipótese “≤ N” confirmada para esses dois índices e esses quatro comandos (`4` reconstruções em `4` edições). [Não feito] Generalização para índice de personagem/balão vinculado e índice de movimento; fixture não os exercitou.

### 5E. Linha de base repetida

[Executado] Corte 200 s, 6.000 quadros: `169370.14030000038 ms`, `169435.01230000038 ms`, `170353.00549999927 ms`. Mediana `169435.01230000038 ms`, mínimo `169370.14030000038 ms`; amplitude `982.86519999889 ms`; variação amplitude/mediana × 100 = `982.86519999889 / 169435.01230000038 × 100`. Os três MP4s foram validados. Harness usou destino preselecionado: tempo de interação humana com diálogo não medido.

### Gate 2

- [Executado] Fase 3 liberada para laboratório: bytes evitáveis estimados `68,520,038,400` de `94,556,160,000`; espera repetida unida `69453.4143999998 ms` de `172725.1939 ms`, superior aos gates documentados de 50% e 8%, respectivamente.
- [Não feito] Fase 5 não passou por gate quantitativo de “≥30% de commits desnecessários” nem por refutação da hipótese dos índices. A execução anterior a chamou “liberada de forma limitada” por redução de duração do tool rail; isso foi decisão de escopo/benefício, não resultado do gate de commits. A mudança foi limitada a essa evidência.

## 6. Fase 3 — quadros repetidos

- [Executado] Abordagem de laboratório: NUT com PTS; usado para validar FFmpeg com 3 quadros BGRA em PTS 0, 1 e 4 s. Resultado a 30 FPS: 121 quadros decodificados e as três cores nas posições esperadas. [Não feito] Divergência numérica de pixels contra compositor V6: N/D; duração final, A/V sync, emendas e 24 FPS do MP4 de produto: N/D.
- [Não feito] A/B curto e 6.000 quadros com 3 repetições por braço; tempos, memória máxima e validação completa de emendas não medidos. Temporários do laboratório foram apagados após a execução; não houve dado do usuário usado.
- [Executado] Decisão: inconclusivo/não promovido. Gate abriu o laboratório por `69,453.4143999998 ms` de espera repetida; teste sintético isolado não satisfaz o contrato do export. [Lido] A execução encerrou após observar que não havia writer NUT Node integrado; não tentou a alternativa de corridas no caminho do produto. Foi decisão/escopo técnico, não limitação do ambiente.

## 7. Fase 4 — spike WebCodecs

| [Executado] Item | Resultado |
|---|---|
| 1. Encoder | [Executado] Electron 45.3.1 aceitou `avc1.64001f` com `prefer-hardware` e `prefer-software`; encoder efetivo/hardware: N/D. |
| 2. Cor | [Não feito] Diferença média/máxima por canal versus compositor V6: N/D. |
| 3. Qualidade | [Não feito] Bitrate e artefatos visuais medidos: N/D. Spike gerou 249,997 e 38,045 bytes em entradas sintéticas distintas; tamanhos não são comparação de qualidade. |
| 4. Áudio/sync | [Não feito] AAC/drift em ms: N/D. |
| 5. Emendas/GOP | [Não feito] N/D. |
| 6. Memória/backpressure | [Não feito] N/D. |
| 7. Parede/A-B | [Não feito] 3 repetições e diferença percentual: N/D. |

[Executado] Decisão: no-go para produto/inconclusivo como substituto; spike isolado em `scripts/editor-v6/webcodecs-capability-spike.cjs`, não conectado ao app e desligado por padrão. A preferência de hardware não identifica backend real.

## 8. Fase 5 — página e estado

- [Lido] `EditorV6Page.tsx:89` lê `activeProject` do store; linhas 127–132 mantêm `activeEditorV6Id` e ref; linhas 176–177 separam seleção de navegador (`selectedId`) do projeto ativo e do snapshot carregado; linhas 199, 207, 213 e 430 passam a identidade aos serviços/hooks; abertura seleciona e ativa separadamente em 1115 e 1122. São conceitos relacionados mas distintos: seleção, sessão ativa e documento carregado.
- [Executado] Tool rail: handlers estabilizados por refs/callbacks, props estáveis e componente memoizado; perfil pareado baixou duração média reportada de `1.05 ms` para `.02 ms` por notificação (antes/depois: 534/554 notificações). Commit `e80e604f`; testes V6, typecheck, auditoria, build e 50 grupos passaram na rodada.
- [Executado] `EditorV6Page.tsx`: 1.132 linhas atuais / 67 imports; em `cc9d02b0^`, 760 linhas / 67 imports.
- [Lido] Não foram extraídos hooks de biblioteca, elenco ou sessão: perfil não atribuiu custo relevante; não foram alterados IDs, schema, persistência ou canais IPC. A página continua longa e é dívida de organização ainda visível.

## 9. Fase 6 — higiene

- [Lido] Formatter Prettier; razão: formatter uniforme e script limitado a arquivos tocados. Config: largura 120, 2 espaços, sem ponto e vírgula, aspas simples, trailing comma none. Script `scripts/format-changed.cjs`, comando `format:changed`; ADR `docs/architecture/ADR-001-prettier-touched-files.md`.
- [Lido] Índice histórico foi criado com 126 linhas para 122 documentos. [Executado] ZIP conferido por conteúdo antes da remoção autorizada; inclui 123 entradas (índice + 122 documentos), SHA-256 `B9A5D49F9447C46FC86CAD297F89718FF6B8D95F39D539D5B6A629EB9224CC2F`. [Executado] Os originais foram removidos pelo usuário e registrados em `82cb09b9`; nenhum foi movido/apagado pelo agente sem essa autorização. ZIP está em `out/...`, ignorado local e não versionado.
- [Executado] Scripts npm: 140 antes e 141 agora. 34 não tinham referência literal fora de `package.json`; não removidos nem agrupados porque referência estática não prova equivalência. Candidatos: `test:editor-v6:native-renderer`, `prepreview`, `test:fabricator:body-joint-bridge`, `test:fabricator:expression-layer-transform-edits`, `test:editor-v6:doctor`, `test:editor-v6:quick-offscreen`, `test:editor-v6:integration`, `editor-v6:stress-projects`, `test:editor-v6:stress-trace`, `test:editor-v6:stress-ab-memo`, `editor-v6:analyze-memo-ab`, `editor-v6:analyze-trace`, `diagnose:editor-v6:motion-preparation`, `test:editor-v6:combined-hair-mouth-memory`, `package:win:portable`, `test:fabricator:face-storage`, `test:fabricator:hair-storage`, `test:fabricator:hair-catalog`, `test:concurrency-limiter`, `bench:editor-v6:compare-runs`, `test:editor-v6:compare-runs`, `lab:editor-v6:plan-b`, `summary:editor-v6:plan-b-lab`, `diagnose:editor-v6:export`, `spike:editor-v6:native-composite`, `test:fabricator-catalog`, `test:asset-flow`, `test:fabricator:contracts`, `test:fabricator:assets`, `test:fabricator:chaos`, `test:fabricator:crash`, `test:fabricator:fixture`, `test:fabricator:full-golden`, `format:changed`.
- [Lido] Alteração relevante de `.gitignore` nesta rodada: `/video-studio-diagnostico-interrompido.zip` em `cc9d02b0`. O relatório de higiene lista também regras preexistentes de `out/`, `app-data/`, recursos locais, bancos e ZIP de diagnóstico.
- [Lido] A instalação do Prettier reportou 6 vulnerabilidades moderadas; não foi executada correção automática.

## 10. Fase 7 — investigações

| [Lido] Área / relatório | 3 riscos principais com evidência | Proposta de maior valor |
|---|---|---|
| processo principal — `docs/architecture/main-process-responsibilities.md` | `electron/main.ts:180–348,623–1210`: ordem de inicialização/serviços globais; mover handler pode perder `assertTrustedSender`/medição; `main.ts:2586–2626`: shutdown depende de drenar gravações/jobs/janelas | extrair bootstrap de diagnósticos e registro por domínio com dependências explícitas |
| dados/SQLite — `docs/architecture/data-layer-audit.md` | `electron/dataPlatform.cjs:137–193`: migração/schema; `:456–471,534–546`: referências compartilhadas; `electron/dataBackups.cjs:149–212,221–290`: recuperação/restore | tipar DTOs por adapters, com testes de contrato e crash recovery em fixture |
| IPC/preload — `docs/architecture/ipc-preload-validation-audit.md` | `electron/domains/editorV6/exportWorkerRegistry.ts` e `exportWorkerWindow.ts`: canal privado/ownership; registrars editorV6 e fabricator: validação heterogênea; 13 de 180 handlers sem chamada textual explícita não classificados um a um | inventário automático canal→registrar→preload→validação e testes negativos |
| Fabricador — `docs/architecture/fabricator-extraction-map.md` | documento, riscos 1–3: transação separada do UI; drafts/callbacks de undo/cancel/save; IDs persistidos e referências aos consumidores | extrair apresentação sem efeitos, manter catálogo e comandos no dono |
| Editor V7 × V6 — `docs/architecture/editor-v7-scene-contract-decision.md` | V7 tem tempo racional/ticks; schema/documento de cena próprios; importar resolvedor V6 acoplaria legado e export | manter separado; compartilhar apenas primitives puras se dois consumidores tiverem contrato idêntico |

- [Executado] IPC: 180 registros `.handle`, 167 chamadas textuais `assertTrustedSender` em 40 registrars. [Não feito] Número exato de handlers sem validação efetiva de origem e de dados: N/D; 13 sem chamada explícita não equivalem automaticamente a falha, pois incluem wrapper e workers com guard próprio. Nenhuma omissão pública foi confirmada na revisão limitada.
- [Lido] Cinco relatórios existem e ficam abaixo de 300 linhas cada; não houve alteração de schema, migração ou contratos de V7 nessa investigação.

## 11. Descobertas não previstas

- [Executado] Média — `tests/editor-v6/exportFramePipeline.test.ts`: arquivo de teste foi clobberado durante trabalho anterior, restaurado de HEAD e então ampliado; a suíte final passou. Incidente corrigido na rodada, mas indica risco de edição por redirecionamento.
- [Executado] Baixa — duas tentativas do harness de UI falharam por seletores DOM antigos e foram corrigidas; não entram nas métricas finais (`EXECUCAO-1.2.md`).
- [Executado] Média — export diagnóstico teve `write UNKNOWN` no quadro 2.756; retentativa terminou sem captura de hash. Causa permanece desconhecida.
- [Lido] Média — formatação elevou `electron/main.ts` a 2.627 linhas (diff de formatação dificulta revisão); `EditorV6Page.tsx` está em 1.132 linhas contra 760 na base, sem redução de imports (67).
- [Lido] Média — ZIP de docs históricos é ignorado e local; outra máquina não terá o arquivo pelo Git. Hash e caminho estão na seção 9; não é backup versionado.

## 12. Desvios do plano

- [Executado] Fase 3 usou um laboratório NUT mínimo e encerrou sem implementar writer nem alternativa de corridas, embora o gate quantitativo tenha sido ultrapassado. Motivo registrado foi escopo/rigor: faltava validar A/V, cortes e memória; teria sido incorreto promover com evidência parcial.
- [Executado] Fase 5 foi promovida em escopo limitado pelo custo observável do tool rail. A regra de liberação por 30% de commits desnecessários não foi medida; não declarar o gate aprovado. Os gates de 8% e 50% foram excedidos pelas métricas de pipe; não há evidência que justifique trocar esses limiares.
- [Não feito] Sem dado para sugerir novo limiar numérico para 8%, 50%, 30% ou 5%; não proponho números alternativos.
- [Lido] Busca literal atual encontrou `30` remanescentes, mas a maioria pode representar FPS, valores de schema, tamanho/zoom ou comentário. A hipótese de que todos deveriam virar constante é inadequada sem classificação semântica por ocorrência.

## 13. Pendências e riscos

1. [Não feito] Repetir diagnóstico de pipe com tempos por worker e uso de CPU/parede por processo/etapa e reconciliação da divergência de pico `815.9%` versus `557.1075883575884%`.
2. [Não feito] Projetar e validar transmissão de quadros repetidos preservando PTS, formato, áudio, cancelamento, falha/retry, emendas e 24/30 FPS; comparar controle/candidato por 3 repetições curtas e corte de 6.000 quadros.
3. [Não feito] Ligar compositor V6 ao WebCodecs spike e medir pixels, faixa de cor, bitrate/artefatos, AAC/drift, GOP/emendas, memória/backpressure e A/B 3×.
4. [Não feito] Medir commits próprios e inúteis da página/filhos em play, drag e edição real de pose/fundo; só então decidir extrações e refatoração de IDs.
5. [Não feito] Revisão canal a canal para validação de origem e dados; avaliar os 34 scripts órfãos por execução/alias antes de agrupar/remover.
6. [Não feito] Dono do produto decide se quer manter cópia durável/compartilhada do ZIP histórico; hoje só existe em `out/` local ignorado. Decisão sobre protocolo do pipe e adoção do WebCodecs deve aguardar gates acima.
7. [Suposição] Maior risco técnico da próxima etapa é economizar bytes mas alterar sequência temporal ou sincronismo; o primeiro experimento deve produzir MP4 comparável e relatório A/V antes de buscar velocidade.

## 14. Dados brutos para análise

- [Executado] As três execuções baseline, diagnóstico por trecho, espera do pipe, perfis UI e resultados do spike estão em `docs/editor-v6/atual/dados/RODADA-1.2-BRUTOS.md` (SHA-256 `38CB5884BE2F315F1360B458DF7AC14D68316B1ECAC4F2CA637A044723E35D59`).
- [Executado] `git diff --stat cc9d02b0..HEAD`, 155 arquivos, 5.098 inserções, 17.288 remoções: `docs/editor-v6/atual/dados/RODADA-1.2-GIT-DIFF-STAT.txt` (SHA-256 `47584AEBBE837886CF7697BDF582370FFA7929B3F5457761F55223D8992F66B7`).
- [Executado] Trechos de até 40 linhas dos três arquivos de produção com mais adições: `RODADA-1.2-TRECHO-exportFramePipeline.txt`, `RODADA-1.2-TRECHO-exportPartRenderer.txt`, `RODADA-1.2-TRECHO-EditorV6Page.txt`, em `docs/editor-v6/atual/dados/`.
- [Lido] Relatórios integrais de jobs continuam no diretório ignorado `out/editor-v6-stress/runs/`; não foram copiados em massa para evitar duplicar artefatos extensos. Hashes dos arquivos de dados acima permitem conferir os anexos desta entrega.
