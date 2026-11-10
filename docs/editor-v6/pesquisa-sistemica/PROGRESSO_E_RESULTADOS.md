# Progresso e resultados — trilha auditável

**Data:** 06/11/2026 · **Branch do laboratório:** `refactor/editor-v6-cold-lab` · documentação de referência herdada da revisão `c636ff03c80274eabed7892dc9d5fa0e8ad025c5`.

## Concluído nesta rodada

- [x] Leitura de `AGENTS.md`, `package.json`, organização da árvore GitHub e caminhos-chave do aplicativo.
- [x] Mapeamento estático dos domínios de Fabricador, Customizador, Studio, Editor V6, Roteiros, Base de Vídeos, bibliotecas e persistência.
- [x] Leitura dos contratos principais de prévia/timeline/exportação, do preparo do cabelo e dos workers.
- [x] Consulta à documentação oficial de processos e segurança do Electron, offscreen rendering, RenderingNG e SQLite.
- [x] Criação da estrutura de documentação, índice, matriz e plano com gates.
- [x] Pesquisa 01 redigida com conclusões de código, limitações e agenda de experimentos.

## Não executado / não comprovado

- [ ] `npm run build`, typecheck, audit de fronteiras e testes Node/Vitest/Electron.
- [ ] Benchmark Windows 11/AMD ou medição de memória/GPU/IPC em execução.
- [ ] Execução no projeto vigente **Teste de Importação — Personagens do Pacote**: ainda não executada por esta auditoria GitHub (dados estão no Windows do usuário).
- [ ] Inspeção completa de todas as implementações do repositório; foi feita árvore inteira e leitura dirigida.
- [x] Grupo A: 15 estudos de código + documentação oficial publicados (02–05, 09–11, 13, 15–21), com experimentos ainda pendentes.
- [ ] Pesquisas de domínio/alternativas 06, 07, 08, 12 e 14: roteiros abertos, aprofundamento ainda não realizado.
- [ ] Refatoração de componentes, contrato persistido, renderizador ou FFmpeg.

## Rodada 2 — Grupo A: tecnologias utilizadas, 06/11/2026

- [x] Pesquisas [02 Chromium](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md), [03 Electron](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md), [04 Canvas/SVG](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md), [05 WebGL](pesquisas/05-GPU-WEBGL-WEBGPU-NATIVO.md) e [10 cabelo](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md).
- [x] Pesquisas [09 Timeline/React](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md), [11 FFmpeg](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md), [13 SQLite/CAS](pesquisas/13-PERSISTENCIA-SQLITE-CAS-CACHE.md), [15 Profiling](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md) e [16 Segurança/build](pesquisas/16-SEGURANCA-BUILD-E-DISTRIBUICAO.md).
- [x] Novas pesquisas [17 Sharp/libvips](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md), [18 React/Zustand/Immer](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md), [19 Node/streams](pesquisas/19-NODE-IPC-STREAMS-BUFFERS.md), [20 WebCodecs](pesquisas/20-WEBCODECS-VIDEODECODER-VIDEOENCODER.md) e [21 Vite/TS/Zod](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md).
- [x] Fontes oficiais pesquisadas no site foram confrontadas com código real do GitHub, com status de compatibilidade runtime pendente.
- [ ] Nenhum benchmark, teste de render, APK/EXE, FFmpeg Windows ou código do aplicativo foi executado/alterado por esta rodada.
- [ ] Atualizar capabilities do EXE real, medir 3+3 A/B do cabelo em cópia autorizada e fechar os bloqueios por evidência.
- [ ] Prosseguir nas pesquisas de áreas compartilhadas 06/07/08, e em seguida avaliar 12 Windows AMD e 14 motores alternativos.

**Consolidação:** o grande gargalo a explicar é `hair ON ~50s` contra `hair OFF ~9s` para 10s de vídeo, [RELATO]. O perfil padrão já dispensa segundo bake de transições hairless; as suspeitas de material/face/Canvas/Bitmap continuam [HIPÓTESE]. Não culpar automaticamente 120Hz ou FFmpeg.

## Rodada 3 — Pesquisa 02 aprofundada (06/11/2026)

- [x] Investigação específica do Chromium/Blink/cc/Viz, RenderingNG (12 fases, property trees, tiles), Skia, VideoNG, SVG/foreignObject, Canvas e APIs do Electron.
- [x] Leitura dirigida de `SceneSurface.tsx`, `exportWorker.tsx`, `exportWorkers.ts`, `exportHairMeshRenderer.ts`, `editorV6HairMotionPreparation.ts`, `exportCaptureBitmap.ts` e `exportRunner.ts`.
- [x] Protocolo CHROM-AUD-001/002 e spikes condicionais de ROI, `paint`, GPU; referências oficiais linkadas no estudo.
- [x] Nota de atualização: Electron 45+ grava traces `contentTracing` em Perfetto protobuf, **não** no JSON legado.
- [ ] A/B experimental Windows/cópia autorizada, DevTools e trace Perfetto real: **NÃO EXECUTADO**.
- [ ] Prototipagem, alteração de renderer e qualquer benchmark: **NÃO EXECUTADOS**.

**Resultado:** estudo concluído na dimensão código+documentação, sem alegar que conhecemos o estágio causal dos 41s.

## Rodada 4 — Pesquisa 03 aprofundada — Electron (06/11/2026)

- [x] Mapeados UI BrowserWindow, motion workers, export workers, preloads, sessões, IPC, protocolo de mídia e ciclo de vida.
- [x] Auditado o fluxo frame→executeJavaScript→rAF→token→capturePage→toBitmap→BGRA→FFmpeg, incluindo duas layers e reuso de buffers.
- [x] Documentadas APIs oficiais Electron: offscreen GPU bitmap, paint/dirtyRect, shared texture experimental e sharedTexture/VideoFrame, setFrameRate, stayHidden, session, IPC e segurança.
- [x] Identificada mudança oficial de NativeImage.toBitmap para sRGB padrão desde Electron 43, **ainda sem teste de paridade de cor**.
- [x] Catalogados testes existentes e roteiro ELE-T0 até ELE-T11; atualizados plano e matriz.
- [ ] **Não executados:** benchmark do Windows, testes unitários, experimentos paint/shared texture, smoke do EXE, RGBA golden e qualquer alteração de código do app.
- [ ] Próxima ação autorizada apenas em ambiente de laboratório: ELE-AUD-001/002 e, se captura dominar, ELE-SPIKE-001.

**Status:** pesquisa estática e documental aprofundada; gargalo real dos 41s ainda não atribuído causalmente.

## Atualização de baseline e escopo autorizado — 06/11/2026

- **[RELATO ATUAL]** Projeto **Teste de Importação — Personagens do Pacote**, exportado **com animação de cabelo em 1min31s (91s)**. **OFF atual não medido**; duração/frame count não fornecidos.
- **[RELATO HISTÓRICO]** ~50s ON/9s OFF foram de outro projeto/experimento. **Não comparar com 91s** nem supor tempo OFF atual.
- [x] Publicado [protocolo de LAB](LABORATORIO_CODEX_EXPORTACAO_FRIA.md), com isolamento de app-data/SQLite/CAS/asset, branch nova, BAT exclusivo, porta 5199, execução fria e limpeza limitada a saídas temporárias de teste.
- [x] [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md) retificado para a baseline vigente e condições frias.
- [x] Laboratório Windows independente criado e hash-verificado. Ver rodada local abaixo.

## Observação histórica relevante

**[RELATO HISTÓRICO — OUTRO PROJETO]** Vídeo antigo de 10s: cerca de 50s ON e 9s OFF. Não é comparável com o projeto vigente de **91s ON** e não sabemos seu tempo OFF. Não atribuir 41s à simulação 120Hz nem somar tempos paralelos.

## Publicação e privacidade

Somente Markdown, sem credenciais, dados pessoais, screenshots ou assets. GitHub branch verificada antes de publicar; alterações locais do usuário não são visíveis por esta conexão. Uma nova sessão deve comparar HEAD e a cópia de trabalho real antes de propor código.

## Rodada local Codex — laboratório frio e captura paint — 06/11/2026

- [x] Confirmados branch/status/commit/espaço antes da criação. LAB irmão `GACHA EM C++-V6-LAB`, branch `refactor/editor-v6-cold-lab`; clone independente sem hardlinks. Alterações locais/untracked da origem foram copiadas para a branch, preservadas fora do commit desta tarefa. Binários/saídas temporárias não entram no Git.
- [x] Copiados projeto e dependências de Fabricador, Customizador, biblioteca, SQLite/CAS e perfil mínimo. Inventário de 3.044 arquivos (~0,722 GB) comparado por SHA-256; referências de vídeos da timeline resolvidas. `app-data` independente; manifest de integridade local ignorado pelo Git.
- [x] `ABRIR_REFATORACAO_V6_LAB.bat`: branch estrita, porta 5199, `127.0.0.1`, `strictPort`; sem checkout automático de `Dev-V2` e com ferramentas locais do LAB. Launcher validado após alterações finais.
- Ambiente: Electron 45.1.0; Node 24.18.0; FFmpeg/ffprobe 8.1.2; projeto autorizado 2394 frames, 30fps, 79,8s, preset 1, 1920×1080, Turbo, AMF. Processo/sessão novos e cache de movimento vazio por corrida. Não foi possível reproduzir literalmente os 91s relatados; preset original desconhecido.
- Baseline hair ON `capturePage` (clique→MP4 validado): **120,72 / 116,32 / 114,62s**, mediana **116,32s**. Controle sem cabelo (2 amostras): **68,04 / 68,01s**; amostragem OFF ainda não é 3.
- Candidato `paint-event` hair ON: **108,91 / 119,58 / 110,47s**, mediana **110,47s** (~5,0% menor que baseline). Uma amostra candidata foi mais lenta que a mediana baseline. Captura somada por workers mediana 105,81→95,53s (~9,7%); tempos concorrentes não equivalem a parede. Preparo de cabelo pré-job foi mediana ~8,46s; composição de cabelo ~5,76s somada por partes, sem prova de causa dominante.
- Paridade: hashes RGBA em frames 0/29/30/149 coincidiram em 4/4 amostras esparsas. Export paint curto validou 150 quadros, 1080p30, áudio e transições; sem golden integral. MP4s e perfis isolados foram removidos após ffprobe; permanecem relatórios JSON leves em `out/editor-v6-stress/runs`.
- Mudança LAB (revisada nesta rodada): `beginFrameSubscription(false, callback)` mantém somente a imagem mais recente, confirma token do quadro pedido e rejeita imagem obsoleta; reutiliza conversão BGRA/buffer. `capturePage` é o padrão da cópia LAB; paint é opt-in, pois o smoke UI encontrou diferença hash na camada frontal e não trouxe ganho.
- Proteções: recusa sessão reutilizada, exige cache vazio em exportações cold, limita saída a 2 GiB e exige 3 GiB livres; limpa apenas a pasta isolada da execução após validação.
- Testes: typecheck; audit:architecture; build; `test:editor-v6:quick` (59 Vitest + 6 Node); bootstrap (7); captura (13); stress/saída/ferramentas de vídeo (8). Export curto final passou após adição da guarda.
- Limites: ganho modesto/variável; ampliar amostras e golden RGBA integral, validar cancelamento/resize e build empacotado. Próxima prioridade: medir preparo de personagens/cabelo posterior; não iniciar ROI sem provar repetição e paridade.

## Diretriz de resultado final atualizada — 06/11/2026

- [x] Usuário confirmou que **CPU, GPU, AMF, NVIDIA, Intel ou qualquer outro encoder são intercambiáveis**: só importam o primeiro MP4 frio, qualidade, integridade, compatibilidade e fallback. Registrado em [DIRETRIZ_CODEX_RESULTADO_FINAL.md](DIRETRIZ_CODEX_RESULTADO_FINAL.md).
- [x] Plano e matriz passaram a autorizar comparações entre backends diferentes **explicitamente identificadas**, mantendo A/B do mesmo backend para atribuição causal.
- [x] Confirmada divergência de perfil: na UI o padrão é `encoder:'cpu'`, preset 2, `hairPoseReactionOnly:true`, `hairPosteriorOnly:true`; no benchmark LAB foi selecionado `encoder:'auto'`, preset 1, resultando em AMF. **O relato de 91s não pode ser usado para anunciar ganho sem alinhar o perfil.**
- [ ] Ainda faltam golden integral de `paint-event`, layered video, stress de erro/cancelamento, replicação do fluxo UI e benchmarking de encoders/backends melhores disponíveis.
- [ ] **Esta revisão só mudou a política e documentos**; nenhuma alteração no renderizador, encoder ou testes foi executada aqui.

## Rodada atual — equivalência UI, encoders e decisão da captura (06/11/2026)

- [x] Benchmark corrigido para executar `runEditorV6ExportCommand` e o IPC real de start/status. O painel usa preset 2 posterior-only, 1080p30 Turbo; só o destino humano foi substituído por uma pasta temporária fixa. Relatórios agora incluem encoder real selecionado e perfil UI.
- [x] Projeto inteiro: 2.394 frames/79,8s, duas lanes, um clipe de áudio, processo/sessão novos e motion cache vazio. Hash de `editorV6.json` da cópia verificada: `20b00d71a123e42bb967a2acde6a6fb528628290220daee22192e530724cb96b`.
- Perfil de máquina medido: Ryzen 5 4600G, Radeon RX 7600 driver 32.0.32015.7029, Electron 45.1.0, Node 24.18.0, FFmpeg/ffprobe 8.1.2. `auto` selecionou h264_amf.
- A/B final frio 3+3: AMF 83,18 / 90,12 / 84,83s, mediana 84,83s; CPU/libx264 veryfast 85,20 / 82,44 / 81,47s, mediana 82,44s (2,8% menor nesta máquina/projeto). Todos validaram 2.394 frames 1080p30 e áudio. A sequência não foi intercalada e a margem é pequena; não extrapolar para outros projetos.
- Perfil CPU reparado: FFmpeg continha libx264, mas o código CPU só tentava libopenh264 que não estava presente. CPU agora testa libx264 primeiro, com OpenH264 como alternativa; auto conserva backends hardware e fallback software. UI permanece em CPU/libx264 pela mediana 3+3 deste projeto; Auto está disponível.
- Amostra decodificada CPU↔AMF (150 frames): SSIM 0,996750, PSNR 50,710dB. AAC 48kHz estéreo decodificou para 962.560 bytes idênticos. MP4 temporários removidos após comparação.
- Paint 150 frames: ambos os modos passaram validação estrutural. Smoke capturePage 13,63s vs paint 14,20s; hash de background igual, foreground diferente. `capturePage` continua padrão, paint opt-in. Adicionado `paintWaitMs`; `capturePageMs=0` não é mais interpretável como captura grátis.
- Rejeitada sobreposição de um write ao FFmpeg com render do próximo frame: aumentou round-trip/escrita no smoke e exige cópia BGRA; revertida antes de benchmark completo. Guarda de tamanho tolera ENOENT benigno quando arquivos isolados são renomeados durante medição.
- Estado dos temporários: dois MP4 da comparação removidos com caminho e marcador conferidos; cópias de sessão e uma tentativa sem marcador também removidas sob a raiz descartável do LAB. Permanecem diagnósticos JSON/TXT pequenos. Nada foi removido do app-data original.
- Verificações executadas nesta rodada: typecheck, build, audit:architecture, testes Vitest de captura/worker (13), bootstrap (7), três exports frios completos por encoder. Suite geral rápida/integration e testes finais ainda pendentes nesta atualização.

### Próxima rodada causal

Os relatórios integrais colocam preparação Motion no Main em aproximadamente 17–18s, renderização em 52–59s e finalização em 3,1–3,4s. Somatórios de lanes para IPC/captura/pipe se sobrepõem e não equivalem à parede. Medir preparação de personagens/transições e comportamento em projectos sem cabelo com o perfil UI antes de refatorar o compositor.

## Rodada 5 — cache frio e alfa de crop — 06/11/2026

- **Problema de método/armazenamento:** o serviço `motionIpc` usava cache de disco `<userData>/cache/editor-v6-motion-v2`, limitado a 768MiB/512 itens. Em corridas frias anteriores, chegou a gravar ~70MB de atlas por exportação. Isso contrariava o requisito de não guardar atlas entre exports.
- **Mudança:** cada export cria escopo UUID nas solicitações IPC de bake de transição **e boca**. A chave de memória inclui o escopo para não reutilizar preparo anterior; entradas continuam deduplicáveis durante o mesmo job e são removidas no encerramento completo, mesmo em falha/cancelamento. Removido o uso do cache de disco pelo serviço de motion (cache helper isolado permanece testável, mas não é conectado ao app). Bakes de preview mantêm cache em memória limitado; não persistem atlases em disco.
- **Validação cache-only:** 3 exports completos, cache disk read/write 0/0 bytes, 2.394 frames, áudio em todos.
- **Otimização mensurada:** profiling mostrou `measureFaceModeCrop` acumulando 4,38s mediana (três exports) na rotina de hair-preparation. Leitura de pixels passou a examinar palavras RGBA alinhadas e extrair alpha conforme endianness. Limiar >8 e caixa de pixels permanecem inalterados; testes de transparência/vazio/alpha baixo e Electron offscreen passaram.
- **Antes/depois local:** mediana da etapa de crop 4,38→3,72s (~15%). Hair preparation 8,92→8,20s entre grupos medianos. Wall clique→MP4 validado 86,54→82,13s (−5,1%) em grupos sequenciais não intercalados; porém a baseline CPU anterior ao cache isolation era 82,44s, então não há evidência de ganho global robusto. Conservar apenas a melhoria local medida e executar um próximo grupo intercalado se o ganho ponta a ponta for importante.
- **Novas corridas frias:** 80,94 / 87,85 / 82,13s; mediana 82,13s. Motion 17,32–18,99s; render 54,13–55,57s; finalização 3,33–3,51s. Pico RSS Main 846,7–971,2MiB.
- **Hair OFF 3×:** 74,76 / 74,29 / 76,88s, mediana 74,76s; 2.394 frames, 4 clips de áudio, saída de áudio válida. Controle é runner direto enquanto ON usa command+IPC UI; diferença ON/OFF de 7,37s mediana é indicativa, não estritamente equivalente. Não comparar ao relato de 91s sem os flags originais.
- **Visual e saída:** nenhuma alteração de composição/render/codificador nesta rodada. Todos os seis exports ON dos últimos dois grupos e controles OFF passaram ffprobe/contagem e áudio; amostra visual/áudio de CPU↔AMF anterior: SSIM 0,996750, PSNR 50,710dB e PCM AAC decodificado idêntico em 150 frames. Isso não equivale a golden visual integral do projeto.
- **Verificações:** testes de `faceAlphaBounds` 4/4; motion/cache e workers 31/31; integração 25 arquivos/115 testes, native compositor 4, Electron hair/scene, full Vitest 361 + 1 skip, typecheck, arquitetura e build aprovados.
- **Disco/privacidade:** não há MP4/PNG de benchmark remanescente na área `runs`; um perfil isolado incompleto de 773MB foi removido arquivo a arquivo após validar marcador/raiz. C: ficou com 8,15GB livres. Nenhum caminho, cache, mídia ou dado do perfil original foi alterado.

**Próximo:** CPU do FFmpeg alcança ~6 cores e consome até ~600%; o render/pipeline geral ainda domina (~54s). Fazer smokes compatíveis de encoder H.264 Windows (`h264_mf`, D3D12VA) e depois A/B frio completo apenas para encoder que iniciar com parâmetros comparáveis. Em paralelo instrumentar leitura de face crop e estabilidade UI/timeline; `paint-event` continua opt-in por hash diferente de foreground.

## Equivalência UI e encoder mais rápido — 06/11/2026

- **Método corrigido:** o controle OFF carrega renderer isolado e chama `runEditorV6ExportCommand`, IPC de start/status e validação do MP4; cada amostra teve novo Electron, sessão e `userData`, cache-fonte vazio e destino descartável.
- Projeto `Teste de Importação — Personagens do Pacote`, timeline completa (2.394 frames), 1920×1080/30fps, CPU/libx264 12Mbps, Turbo, duas lanes, 4 clipes de áudio. ON perfil 2 posterior-only; OFF mesmo projeto sem pacote de cabelo.
- **Preset `veryfast`, 3 execuções:** ON 83,634/84,266/85,117s (mediana 84,266); OFF 70,546/73,530/75,904s (mediana 73,530). A diferença inclui preparo/composição do cabelo.
- **Novo preset, três exports frios por condição:** ON `ultrafast` 79,630/81,432/80,105s (mediana 80,105; −4,9%); OFF 71,132/68,678/68,833s (mediana 68,833; −6,4%). Todas as saídas passaram validação e registraram 0 bytes escritos no cache.
- Fases ON medianas: preparo hair ~8,17s, motion ~17,10s, render ~51,20s, finalização ~2,98s; pico RSS ~929MiB (intervalo 914–1.171MiB).
- **Qualidade integral:** ON SSIM 0,997842/PSNR 52,763dB; OFF 0,997868/52,827dB ao comparar os 2.394 quadros decodificados. As três saídas de cada condição deram métricas iguais; PCM estéreo teve SHA idêntico. MP4s temporários foram removidos após a comparação.
- **Decisão:** `ultrafast` a 12Mbps vira padrão de libx264 no LAB; Auto/hardware e fallback permanecem. Override do benchmark é allowlist e só funciona no processo offscreen.
- Integração Windows após o ajuste: 25 arquivos/115 testes direcionados, compositor nativo, Electron hair/scene, 361 Vitest + 1 skip, typecheck e build passaram. Auditoria de arquitetura: 713 arquivos, zero imports ausentes e zero violações; teste de preset `encodingArgs` 4/4.
- **Próximo gargalo:** render comum ~51s e Motion ~17s. Medir os 42 bakes por request/renderer/memória antes de alterar concorrência ou representação. `paint-event` continua experimental até golden RGBA integral, layered video, timeout/resize e cancelamento.

### Teste de concorrência pós-preset

- Motion: relatório detalhado encontrou 39 transições/37 bakes únicos, 2 reusos, 53 rigs/24 reusados, zero reconstruções; 16,43s em duas lanes. As requisições são estáveis por personagem.
- Concorrência 3 no projeto inteiro: 80,68s, Motion 18,22s, pico simultâneo 2 e RSS Main 862MiB. O terceiro lane ficou sem trabalho independente por haver apenas dois personagens; rejeitada para este projeto, mantida como opção experimental do harness para cenas com mais personagens.
- Render 4-worker: 80,18s (2.394 quadros), fase render 50,92s, RSS Main 1.060MiB; contra duas lanes, mediana 80,11s e render 51,20s. Ganho de fase de 0,28s não se converteu em ganho de parede; rejeitado, padrão 2 workers mantido.
- Ambos validaram áudio, MP4 e 0 bytes de cache. Continuação: revisar reaproveitamento de poses/asset preparation por personagem e scrub/timeline; nenhum cache entre exportações será reintroduzido.

## Handoff de estabilidade — 06/11/2026

- `HEAD` no início desta pausa: `c8e7785e` na branch `refactor/editor-v6-cold-lab`; `git fetch origin` confirmou remoto sem commits divergentes. O laboratório segue numa pasta irmã isolada, com launcher dedicado em porta 5199 e `app-data` independente. Não houve escrita intencional na instalação/pasta canônica.
- A validação integrada completa (`npm run test:editor-v6:integration -- --scope=all`) passou: testes direcionados 115/115, Electron hair/scene offscreen, typecheck, arquitetura, Vitest completo 362 passed/1 skipped e build. Nenhum benchmark frio novo foi iniciado nesta pausa.
- O teste de persistência da biblioteca de áudio estava preso ao nome antigo `importEditorV6ExportAudio`; foi atualizado para o fluxo atual `linkEditorV6LibraryExportAudio`, que vincula o asset da biblioteca ao projeto.
- A suíte ampla `npm run test:refactor` executou 687 testes, com 685 aprovados e 2 falhas em `tests/editor-v6-data-sources.test.mjs`. Uma asserção de áudio da suíte foi alinhada e sua bateria específica passou 16/16. Resta reproduzir e corrigir a fixture de mídia: imagem usa `mediaLibrary.import`/refresh atuais; `importTimelineMedia('audio')` abre o picker e a inclusão persistida é feita em `linkAudioLibraryItem`. O fluxo atualizado exige a seleção de mídia no harness antes de usar a suíte ampla como gate verde.
- Testes direcionados das alterações locais executados: `npm run test:model-source` 23/23; `tests/wardrobe-glue-and-placement.test.mjs` 15/15; `tests/renderer-pending-persistence.test.mjs` 16/16.
- `npm run test:editor-v6:doctor` ainda aborta por exigir checkout na `Dev-V2`, conflito com o uso seguro do laboratório. O comando não alterou branch nem arquivos; integração foi validada diretamente na branch correta. Corrigir o critério do doctor e seu teste para aceitar explicitamente `refactor/editor-v6-cold-lab`, sem checkout automático.
- O `paint-event` fica experimental/opt-in: continua sem golden RGBA equivalente para a camada frontal. `capturePage` segue padrão. Para retomar a investigação, capturar ambos os caminhos no mesmo worker e mesmo estado desenhado, comparar pixels/alpha antes do encode; não comparar exports independentes como prova de paridade.
- **Alterações locais preexistentes do usuário permanecem sem commit** em Fabricador, Customizador, Editor V6, `src/shared`, testes e diagnósticos HTML. Revisar primeiro; não descartar, resetar, limpar ou incluir automaticamente em commit. A cópia canônica deve continuar intocada.
- Não declarar a refatoração global concluída. Próxima retomada: reparar testes de fixture, verificar testes direcionados das mudanças locais, corrigir doctor, depois voltar ao ciclo causal de preparação/render e captura fria com documentação e commits pequenos apenas dos arquivos deliberadamente alterados.

## Auditoria de transferência para a pasta canônica — 06/11/2026

- `refactor/editor-v6-cold-lab` parte exatamente do `origin/Dev-V2` em `bf7da662`. A `Dev-V2` local está quatro commits à frente de `origin/Dev-V2`; esses commits são de Fabricador/Customizador. Não há sobreposição de caminhos entre esses quatro commits e os 35 arquivos versionados alterados pelo LAB.
- Os 15 arquivos modificados localmente (e diagnósticos HTML não rastreados) têm o mesmo patch SHA-256 nos dois diretórios: são alterações locais já existentes, não conteúdo exclusivo do LAB para copiar. Não copiar esse grupo novamente nem sobrescrevê-lo.
- O diff commitado do LAB contém código, testes, documentação e o launcher `ABRIR_REFATORACAO_V6_LAB.bat`; nenhuma base SQLite, `app-data`, CAS ou mídia aparece no diff. O launcher é estrito à branch/porta 5199 e deve permanecer exclusivo do laboratório.
- A integração/build passaram no próprio commit do LAB, mas não foi executada validação da combinação com os quatro commits locais mais novos da `Dev-V2`. Para levar o trabalho adiante, preferir merge/port seletivo do Git sobre cópia manual; executar gates depois da integração e revisar as duas falhas conhecidas da suíte `test:refactor`.
- Corrigida a narrativa de `paint-event`: o primeiro benchmark sugeriu habilitá-lo, mas a decisão foi revogada após a revalidação que encontrou foreground diferente e smoke mais lento. `capturePage` é o padrão atual.

## Reconstrução do motor de cena — Fase 1, 06/11/2026

- **Objetivo atualizado pelo usuário:** reconstruir por trás do Editor V6 o motor isolado de cena/exportação (interface React → adaptador validado → plano determinístico → renderizador → encoder H.264 → MP4 com áudio/fallback). O trabalho permanece somente na branch `refactor/editor-v6-cold-lab`.
- `electron/domains/editorV6/exportIpc.ts` já valida o documento com `parseEditorV6ExportDocument` antes do worker. Foi criado `src/renderer/src/features/editorV6/engine/compileEditorV6RenderPlan.ts`: assume a cópia IPC do job, congela recursivamente objetos/arrays do snapshot sem copiar os payloads Base64, monta o índice de assets por ID, compila cronogramas de movimento e oferece avaliação por quadro inteiro limitado ao intervalo.
- `exportWorker.tsx` agora usa o plano no caminho verdadeiro de export; a cena é comparada com `resolveEditorV6SceneAtFrame`, e a implementação visual continua `SceneSurface` SVG + `capturePage`/BGRA + FFmpeg. Nenhuma troca visual/encoder está ativa. **Não há ganho de desempenho medido ou alegado.**
- Testes adicionados para ownership/imutabilidade, referência de asset por ID sem cópia de payload, dimensões/quadros inválidos, determinismo e paridade em torno de mudança de pose. Uma assinatura do helper de atlas facial agora aceita amostras somente-leitura; a lista derivada do hair transition recebe cópias leves de seus poucos offsets.
- A primeira execução do teste de exportação passou pelo build e parou antes de render por fixture de cor que exigia `libopenh264`, ausente no FFmpeg instalado. O fixture de codec foi atualizado para `libx264` (mantido disponível e já usado no produto); a segunda execução passou: 81 quadros, emenda Turbo/áudio, frame final, cancelamento sem sobrescrever destino, movimento através da emenda e fallback.
- O harness `scripts/editor-v6/check-export.cjs` agora apaga seu scratch Electron/MP4 em `finally`, preserva apenas resumo JSON sem paths nem mídia pesada e não copia o stress MP4 para `out/`. Uma execução revelou que o acumulador escondia observações `0 ms` por rejeitá-las; passou a contar zeros no histograma (p50 pode ser `0.0 ms`), para distinguir fase abaixo da resolução do relógio de fase sem amostra. O teste Electron voltou a passar e o diretório scratch terminou ausente.
- **WebCodecs sintético frio:** Electron 45.1.0 / Chromium 156; Canvas de desenho sintético 1920×1080, H.264 `avc1.640029`, 30fps, 12Mb/s, `prefer-hardware`; 150 quadros; encode+flush 1.569,8ms; primeiro chunk 453,3ms; 101.237 bytes H.264; fila máxima 5. FFmpeg fez remux por stream copy; FFprobe confirmou H.264, 1920×1080, 150 quadros, `30/1`, 5 s. Cada rodada usa processo e perfil temporários novos e remove o scratch.
- O perfil pediu `prefer-hardware`, mas o encoder não identifica no relatório se o driver escolheu GPU ou software. O smoke também não renderizou personagem/cabelo, não levou áudio e não foi comparado à qualidade do FFmpeg. Ele prova capacidade H.264 nesta instalação, **não** prova uma exportação mais rápida.
- **Verificações desta rodada:** `npm run typecheck` aprovado; `npm run audit:architecture` aprovado (714 arquivos TS/TSX, zero imports ausentes e zero violações); Vitest direcionado aprovado (13 testes entre plano e módulos de worker/assets); `npm run test:editor-v6:export` aprovado, incluindo build e Electron; integração completa `--scope=all` aprovada (25 arquivos/115 testes direcionados, native compositor unit 4/4, Electron hair/scene offscreen, TypeScript, arquitetura, 66 arquivos/366 testes + 1 skip, build).

### Próximo ciclo do motor

1. Repetir integração completa e teste de exportação após o Canvas2D. Ampliar goldens de cabelo com personagem real/movimento e avaliar composição/fallback de vídeo.
2. Fazer microbenchmark em processos/perfis novos e depois A/Bs de exportação fria completa no projeto alvo; medir preparação, render/readback, encode, qualidade decodificada, áudio e pico RSS. Não comparar amostras da mesma sessão como cold exports.
3. Se o candidato preservar o projeto real e provar ganho total, integrar com fallback explícito para vídeo/contexto; sem ganho, manter apenas o contrato. Depois medir VideoEncoder com fila limitada e mux FFmpeg.
4. Aplicar a mesma fronteira a preview/timeline e conexões de personagens/Fabricador/Customizador/Studio via IDs/contratos, sem cache pesado entre sessões.

## Reconstrução — Fase 2, contrato da superfície e prova de Canvas, 06/11/2026

- Criado `engine/frameSurface.ts`, contrato sem dependência de React, e `adapters/reactSvgFrameSurface.tsx`, adaptador que possui React root, imagem SVG, token contra captura obsoleta e sincronização de apresentação. `exportWorker` continua dono da preparação da cena e só entrega um quadro já pronto à interface; a lógica de captura do main/FFmpeg não mudou.
- Criado `adapters/canvas2dFrameSurface.ts` como candidato isolado e ainda não selecionado por produção. Compõe imagem/personagem/cabelo, atlas, boca, flip/rotação, narrador, fala e pensamento numa única saída Canvas. Carrega apenas assets referenciados no quadro/camada e atualiza entrada de cache quando o objeto do asset muda. SVG rasterizado preserva texto vetorial e ordem das camadas; o bitmap de diálogo é reutilizado quando o layout não muda. Scratch de máscara é por ator/job; `dispose` encolhe superfícies para 1×1 e libera caches. Background/foreground preservam alpha; o asset de fundo usa o mesmo esticamento do SVG (`preserveAspectRatio="none"`). `scene.mediaVideo` é rejeitado explicitamente e exige fallback. `sceneTextLayout.ts` permanece puro e sem dependência de React.
- No Electron 45.1.0/Chromium 156, um canvas RGBA sintético inserido como raster de personagem em `foreignObject` foi capturado em cor exata por `capturePage` (`17,221,103,255`). Ao serializar a mesma SVG para imagem, `getImageData` falhou porque a superfície ficou tainted. Não usar conversão SVG→Canvas ingênua.
- Golden expandido Canvas2D vs capturePage/SVG: personagem com motionSprite/atlas, flip e rotação, imagem letterboxed, narrador, fala e pensamento com nomes e fundo com asset; 6.750 canais divergentes de 2.073.600 (<0,33%), erro máximo 90/255 e médio 0,14072. Fundo foi pixel-exato nos pontos de controle. Na fixture simples, 7.524 canais, máximo 75 e média 0,12531. Cabelo RGBA transparente + máscara de boca + flip + rotação: 6.860 canais, zero fora do ator, máximo 35 e média 0,00563. O foreground preservou alpha 0 fora da arte.
- `check-scene-surface.cjs` agora compara em memória e remove em `finally` bundle, PNG, perfil e scratch; nenhum MP4/perfil de exportação foi salvo pelo teste de superfície. Um erro inicial de teste amostrou o meio do painel, fora do personagem deslocado; corrigimos a coordenada ao centro da fixture e o rerun passou.
- Verificação desta etapa: `npm run test:editor-v6:surface`, `npm run typecheck`, `npm run test:editor-v6:export` e `npm run test:editor-v6:integration -- --scope=all` passaram. Export sintético: 81 quadros/78 reutilizados, áudio contínuo, full HD, fallback e cancelamento; mouth stress de 301 quadros em 1,646 s (render 1,446 s, RSS pico 167,8 MB). Integração: 115 direcionados, compositor nativo 4/4, 718 TS/TSX, 0 violações, 366 testes + 1 skip, build aprovado. São gates de regressão; nenhum benchmark frio do projeto nem ganho real foi medido.
- Há um candidato que compõe RGBA diretamente, mas não mede ganho real; o worker de produção permanece em SVG + `capturePage`/BGRA + FFmpeg.

## Reconstrução — Fase 3, A/B frio da superfície e próximo gargalo, 06/11/2026

- O benchmark foi alinhado ao comando real da UI: projeto verificado **Teste de Importação — Personagens do Pacote**, 2.394 quadros/79,8s, Preset 2 posterior-only, `cpu`→`libx264 ultrafast`, duas lanes, 1920×1080/30fps, `capturePage`, 4 vídeos, 4 áudios e cache Motion vazio. Cada condição teve processo Electron, perfil e `app-data` temporários novos; a única fonte foi o backup imutável verificado. O cache do sistema operacional não foi limpo.
- **SVG:** 90,38s clique→MP4/ffprobe validado (78,01s Main export); preparo de cabelo 11,80s, Motion 19,59s, render 54,38s, finalização 3,77s; áudio presente e 0 bytes no cache persistente.
- **Canvas2D híbrido:** 90,87s clique→validação (81,63s Main export); fase render 59,04s; Motion 19,02s; preparo de cabelo 8,83s. Uma amostra por caminho não mede variância pequena; a mudança ficou 0,49s mais lenta no clique→validado e 4,66s mais longa no render, portanto não há ganho a promover.
- Ambas as rodadas validaram as mesmas dimensões, 2.394 quadros, 4 faixas de áudio e MP4 com áudio; encoder selecionado `libx264`, sem I/O no cache Motion. Nos hashes RGBA dos quadros 0 e 300, a camada de fundo teve SHA-256 igual e a camada frontal teve SHA diferente. A tolerância sintética é pequena, mas paridade exata continua sem prova.
- Canvas2D compôs 464 apresentações; fallback SVG reportou zero porque a cena entregue à surface não traz `mediaVideo`: os quatro overlays externos são aplicados depois pelo filter graph FFmpeg. O fallback direto foi testado com fixture sintética. A métrica foi renomeada para `surfaceRenderMs` (desenho ou commit conforme adaptador) e contagens para `*Presentations`, refletindo a semântica real.
- No SVG, as parts acumularam 18,08s em `capturePage`, 4,83s em cópia/conversão BGRA, 17,36s em desenho IPC, 43,06s no round-trip completo e 43,74s aguardando callbacks do stdin FFmpeg. São somas de parts concorrentes, não durações de parede. O Canvas manteve a captura e adicionou ~9,25s agregados de render da superfície (antes aparecia incorretamente sob `reactCommitMs`).
- **Decisão:** Canvas2D permanece experimental/opt-in no benchmark; SVG/capturePage segue no produto. Os MP4s e app-data foram removidos após validação; relatórios JSON leves preservados. A tentativa abortada na porta 5188 falhou antes de iniciar Electron e foi repetida com porta livre 52871.
- **Próximo gargalo:** medir superfície→main→FFmpeg sem `capturePage`/`NativeImage`, primeiro com TypedArray/ArrayBuffer a 1080p. O eventual transporte deve preservar token/fence, BGRA, alpha/sRGB, backpressure, vídeo, áudio e fallback. Shared texture/WebCodecs só depois de comprovar custo, compatibilidade e qualidade neste pipeline.
- Verificações: `npm run typecheck`; `npm run test:editor-v6:surface` (Canvas estático, fallback SVG, descarte); `npm run test:editor-v6:integration -- --scope=all` (115 direcionados, compositor 4/4, Electron hair/scene, arquitetura, Vitest 366 passou + 1 skip e build); duas exportações frias completas, 2.394f, áudio e ffprobe aprovados. Nenhum ganho foi declarado.

## Reconstrução — Fase 4, readback e transporte de quadros, 06/11/2026

- Harness `scripts/editor-v6/benchmark-frame-transfer.cjs` e comando `npm run bench:editor-v6:frame-transfer` usam Electron/perfil `userData` temporários novos, 1920×1080 sintético, gradiente sRGB opaco, token de paint variável, descarte de warm-up e remoção do scratch sob `os.tmpdir()` com validação de caminho.
- Em cada processo foram medidos 7 quadros: `executeJavaScript` retornando `Uint8ClampedArray` RGBA e swizzle para BGRA; `MessagePort` carregando a cópia tipada; e `capturePage` → `NativeImage.toBitmap` → validação do token → cópia/crop BGRA. Cada screenshot validou o token do quadro corrente.
- Três processos Electron/Chromium 45.1.0/156, cada qual com sete amostras: (1) direto total 19,05ms / captura 19,06ms / MessagePort 19,61ms; (2) 18,31 / 17,25 / 20,02ms; (3) 18,05 / 18,60 / 20,65ms. Medianas entre as três medianas por processo: direto 18,31ms (15,14ms readback+transfer e 3,17ms RGBA→BGRA), captura 18,60ms, MessagePort+conversão 20,02ms.
- Hashes por par coincidiram nos 21 quadros; 24 validações de token (7 amostras + warm-up por processo) passaram. Teste só cobre pixels opacos sRGB sintéticos e não mede personagem, transparência, vídeo, áudio, FFmpeg ou parede da exportação completa. Relatório detalhado: [Pesquisa 19](pesquisas/19-TRANSFERENCIA-DE-QUADROS-ELECTRON.md).
- Tentativa de transferir o `ArrayBuffer` na lista transferível do MessagePort recebeu objeto vazio no main e atingiu timeout nesta configuração; não é prova de que toda implementação Electron seja incapaz de transferir buffers. A variante clone tipado funcional não foi mais rápida.
- **Decisão:** diferença de 0,29ms (1,6%) da rota direta contra a captura, com captura vencendo uma execução, não justifica trocar o caminho real nem introduzir um swizzle extra. `capturePage` + `NativeImage` + BGRA/FFmpeg permanece em produção; Canvas2D, paint e MessagePort não foram promovidos.
- Perfil adicional do projeto Canvas2D (não candidato de produção): 81,63s Main, 59,04s render, 19,02s motion, 8,83s hair preparation; FFmpeg atingiu pico de 502% CPU. A surface Canvas2D segue mais lenta que SVG/capturePage e seu uso aqui serve apenas ao diagnóstico. A próxima experiência é medir alocação de threads x264 e pressão concorrente em smoke + exporte frio equivalente; conservar o caminho se o ganho não superar ruído.
- Verificações: `node --check scripts/editor-v6/benchmark-frame-transfer.cjs` aprovado; três execuções sequenciais do harness para o comparativo e uma execução extra via `npm run bench:editor-v6:frame-transfer` passaram; a extra repetiu o empate (19,94ms direto total vs 20,34ms captura) e não entrou na tabela principal. Nenhuma mídia/MP4 ou perfil ficou salvo; nenhuma aplicação, banco ou `app-data` canônico foi alterado.

## Reconstrução — ENG-04, índice esparso e cena estável, 06/11/2026

- O compilador passou de `src/renderer/src/features/editorV6/engine/compileEditorV6RenderPlan.ts` para `src/shared/editorV6ScenePlan.ts`; `exportWorker.tsx` agora importa o contrato compartilhado. Isso retira a regra de compilação da feature React e deixa o caminho pronto para o motor e ferramentas de cena sem dependência da página.
- O compilador assume a cópia IPC validada do worker e a congela, sem duplicar os conteúdos Base64. Indexa asset por ID, motion plans e fronteiras esparsas de timeline, fundo, vídeo, fala, amostras de atlas e blink determinístico. Reutiliza apenas um template lógico por segmento no job atual; nunca materializa frames/bitmaps por export nem persiste cache entre jobs.
- Índice limitado a 50.000 fronteiras: acima disso, `frameIndex.exact=false` e o plano chama `resolveEditorV6SceneAtFrame` diretamente em cada pedido, evitando memória sem limite. A animação/raster de cabelo continua recebendo o frame absoluto e renderizando como antes.
- Testes focados: 7/7 passaram. Comparam cada um dos 300 quadros de fixture com o resolver canônico, incluindo troca de pose, atlas, fala e balão vinculado, blink, fundo e vídeo; verificam referências imutáveis, reutilização dentro do segmento, rejeição de índices inválidos e fallback de timeline de 1.000.000 de quadros.
- Verificações: `npm run typecheck` passou; `npm run audit:architecture` passou (719 arquivos TS/TSX, 0 imports ausentes, 0 violações); `npm run test:editor-v6:export` passou (build Electron, 81 quadros, áudio/emenda, cancelamento, fallback e movimento); teste focado 7/7 passou após ampliar a fixture.
- Integração Windows após a alteração: 25 arquivos/115 testes direcionados, compositor nativo 4/4, Electron hair/scene offscreen, typecheck, sintaxe/imports/fronteiras (719 TS/TSX, zero erros/violações), suite Vitest 369 passou + 1 skip e build Electron aprovados.
- Uma execução fria integral separada, com processo/perfil recém-criados, projeto autorizado `Teste de Importação — Personagens do Pacote`, cabelo Preset 2 posterior-only, libx264 ultrafast, 2 workers, 1920×1080/30, 2.394 quadros, 4 vídeos e 4 faixas de áudio, validou MP4/ffprobe em **88,51s clique→validado** (**79,49s Main export**). Motion 18,22s; render 58,00s; scene-resolution agregado dos workers 1,438s (não é parede); pico RSS Main 1.120,8 MiB; pico CPU FFmpeg amostrado 498%; cache Motion 0 bytes escritos. A saída de encoder e áudio passaram. O MP4 e o `isolated-app-data` foram limpos pelo harness; somente JSON leve foi mantido em `out/editor-v6-stress/runs/scene-engine-shared-plan-2026-11-06-cold-02/`.
- Não declarar ganho: foi uma única corrida e o tempo excedeu as medianas anteriores. A variação entre relatórios é relevante, e o teste não reteve um MP4 anterior para comparação decodificada pixel/SSIM. A cena lógica tem paridade quadro a quadro na fixture; uma golden do projeto real ainda está pendente.
- Primeiro bind da tentativa ocupou a porta 5188 e abortou antes de abrir Electron; a corrida válida usou porta dinâmica livre e pasta nova. Não houve export parcial do primeiro intento; o harness limpou o perfil gerado.
- **Próximo gargalo:** FFmpeg atingiu 498% CPU amostrados; medir a alocação de threads x264 em smoke e cold exports de processos/sessões separados. Render (~58s) e Motion (~18s) continuam dominantes; resolver (~1,44s agregado) não deve ser prioridade. Depois extrair o frame engine/compositor por contrato sem reintroduzir cópias de quadros.

## Reconstrução — ENG-05, instrumentação de threads x264, 06/11/2026

- O caminho normal calcula threads por CPU disponível dividido pelas lanes (limite atual 1–8). No host de medição, 12 CPUs e 2 lanes produzem 6 threads por processo FFmpeg.
- O harness ganhou `--x264-threads=1..8`, aceito apenas com `--encoder=cpu`. O `exportRunner` respeita essa variável somente com `GACHA_VIDEO_STRESS_OFFSCREEN=1` e encoder `libx264`; se o argumento não for informado, o harness apaga a variável herdada. Perfil normal da UI permanece automático e sem mudança.
- Relatórios agora incluem o número efetivo de threads por tentativa. Rodadas com override aparecem como `stress-custom`.
- Smoke usando o FFmpeg de `resources/video-tools`: `testsrc2`, 1920×1080, 300f, libx264 ultrafast/12Mbps; um processo novo por valor; 2 threads 0,966s, 4 threads 0,777s, 6 threads 0,684s. É apenas triagem sintética: sem Renderer, cabelo, vídeos, áudio, MP4 ou métrica de qualidade.
- Gates do checkpoint: teste focal 5/5; typecheck, build e sintaxe do harness aprovados. A primeira checagem de typecheck encontrou referências incorretas no agregador do relatório; corrigimos e o rerun passou.
- **Pendente:** piloto frio integral 6 vs 8 no mesmo projeto autorizado, seguido de ao menos 3 processos/sessões novos por condição se houver sinal. Comparar click→MP4 validado, áudio/ffprobe, qualidade decodificada e memória. Nenhum ganho real ou mudança de padrão alegados.
- Continuação recomendada: verificar `git status` e branch `refactor/editor-v6-cold-lab`; executar um benchmark com `--x264-threads=8` e seu par sem esse argumento, sempre `--repeat=1`, pasta de saída e perfil isolados distintos e porta livre. Para qualidade decodificada, reter somente um MP4 de cada condição, comparar e remover esses dois MP4 após a validação. Em seguida, manter/reverter a hipótese e atualizar matriz/plano/progresso antes de avançar ao maior custo remanescente.

## Meta operacional 30 s — perfil e triagem (10/11/2026)

- O usuário definiu o alvo: exportar em até 30 s o projeto completo `Teste de Importação — Personagens do Pacote` (2.394 quadros 1080p30), com áudio, overlays de vídeo, animações e MP4 validado. A referência atual fica em ~89 s; a última execução integral arquivada ficou em 88,51 s clique→validado/79,49 s Main.
- Leia [Pesquisa 23](pesquisas/23-PERFIL-ALVO-30S.md) para os relatórios e limites das amostras.
- Piloto frio de 600 quadros: `capturePage`/4 lanes 22,83 s; `paint-event`/4 lanes 23,85 s. O segundo removeu 1,66 s de `capturePage` mas perdeu 1,02 s no total; não promover.
- Preparo isolado do projeto: 2 grupos 8,54 s; 4 grupos 7,88 s. Reportou 140 rigs e zero transições preparadas nesse estágio; memória GPU maior com 4. Manter produto em duas lanes/grupos.
- 4 lanes venceu a amostra de 600f; 6/8 lanes perderam e uma execução integral anterior não obteve benefício em 4 lanes. Sem alteração no paralelismo de produção.
- Testei pré-busca limitada a um quadro para sobrepor render e escrita: 24,21s vs 22,83s de referência, RSS Main ~896MiB vs ~701MiB. MP4/áudio passaram, mas a tentativa foi revertida por regressão de wall/memória; relatório em `out/editor-v6-stress/runs/target30-pipeline-prefetch-20s-w4/`.
- **Próxima ação:** instrumentar quadro→Renderer→captura→BGRA→stdin sob a carga completa de áudio/vídeos, depois fazer um protótipo de transporte de superfície sem cópia. Só pedir um benchmark integral quando o smoke mostrar melhoria relevante. Conservar SVG/capturePage/FFmpeg como caminho de referência e usar o fallback existente.

## Promoção conservadora x264 — 10/11/2026

- Par curto frio 6→8 threads: clique→MP4 23,94→23,17s (~3,2%); par cruzado 8→6: 22,70→23,92s (~5,1%). Todos passaram com 600/600 quadros e áudio. No MP4 retido de cada lado, FFmpeg mediu SSIM 0,999226/PSNR 57,27dB. Os dois MP4 (~30MB cada) foram retidos temporariamente só para o A/B de qualidade.
- Uma exportação integral fria com 8 threads passou em 76,34s clique→validado e 67,85s Main, com 2.394 quadros, 4 vídeos, 4 faixas de áudio e zero gravações no cache de movimento. Export integral arquivada anterior a 6 threads: 88,51s/79,49s Main. Diferença observada = 13,7%, sem atribuir toda a melhora às threads (execuções em dias/condições diferentes).
- Fórmula normal `libx264` mudou para `floor(availableParallelism / renderLanes × 4/3)`, limitada a 1–8. No host atual (12 processadores lógicos, 2 lanes) escolhe 8; em CPUs menores escala proporcionalmente. Outros encoders conservam o cálculo anterior. Override continua só no harness.
- Um piloto sem override confirmou que o perfil padrão da UI escolhe 8 threads: 600 quadros, áudio, 22,91s clique→validado. Não repeti full integral após remover o override porque o full já usou exatamente a mesma configuração de 8 threads; o teste final ainda deve acompanhar um export normal completo.
- **Gates do código:** teste `tests/editor-v6/exportRunner.test.ts` será repetido no checkpoint final, além de typecheck/build/export Electron. Pesquisar/implementar o próximo ganho agora no render comum/transporte, já que 30s continua em aberto.
- Gates executados após a alteração: `exportRunner.test.ts` 5/5, typecheck, build, `test:editor-v6:export` (81 quadros, emenda/áudio/fallback/cancelamento/full HD), `audit:architecture` (722 arquivos, zero violações) e `git diff --check` passaram. O piloto sem override escolheu 8 threads e validou 600 quadros + áudio em 22,91s.
- Os dois MP4 retidos do A/B SSIM/PSNR (~60MB total) estão nas pastas `out/editor-v6-stress/runs/quality-x264-threads6-20s/` e `.../quality-x264-threads8-20s/`. A execução bloqueou a remoção explícita desses arquivos; nenhum MP4 foi parar em dados canônicos, e os diretórios não incluem perfil isolado após o cleanup do harness.

## Continuação — encoder AMD e concorrência Motion (10/11/2026)

- Host confirmado: Ryzen 5 4600G (12 processadores lógicos), Radeon RX 7600. FFmpeg do LAB lista AMF e x264.
- Dois pilotos frios equivalentes de 600 quadros, Preset 2 posterior-only, 1080p30, 2 lanes, captura padrão, 2 vídeos + 2 áudios, sessão/perfil/cache novos: auto→`h264_amf` em 27,33s e 26,12s clique→MP4 validado. Ambos passaram áudio e contagem. O x264 8 threads de referência validou em 22,91s. AMF perdeu 14–19% e não teve teste SSIM; não promovido.
- Triagem fria de threads x264 acima de 8: 10 threads passou 600f+áudio em 26,09s (Main 20,85), controle posterior de 8 em 27,74s (Main 22,62); uma referência 8 threads anterior ficou em 22,91s. Motion/render variaram significativamente e `ffmpegWriteMs` somado quase empatou (14,42 vs14,76s). Amostras insuficientes para atribuir causalidade. O padrão continua 8; nenhum MP4 retido e nenhuma alteração na qualidade.
- O override de thread do harness aceita 1–12, restrito a `GACHA_VIDEO_STRESS_OFFSCREEN=1`; produto segue clamp8. Uma tentativa antes de reconstruir `out/main` foi rejeitada porque relatório indicou8 em vez de10; após `npm run build` e novo processo/perfil, foi validado corretamente como10. Isso evita falso positivo por build desatualizado.
- Corrigi o harness para exigir o campo de preset somente no encoder CPU. O primeiro AMF produziu relatório completo (`passed: true`, 600/600 + áudio), mas o script dava falso negativo porque `x264Preset` não existe para AMF. `node --check` passou e a segunda execução terminou com “Comparação completa”.
- Resumos leves em `out/editor-v6-stress/runs/target30-amf-auto-pilot-20s/` e `.../target30-amf-auto-pilot2-20s/`. O cleanup próprio removeu MP4 e `isolated-app-data`; nenhum frame/cache pesado foi mantido.
- Pilotos Motion frios de 600f: concorrência 2 em 22,91s/23,99s; 3 em 23,16s. Motion baixou ~0,5s com 3, mas render/wall oscilou; não há ganho robusto. Normal continua em 2. Seletor existe apenas sob `GACHA_VIDEO_STRESS_OFFSCREEN=1`, com teste de limite.
- Electron 45.1.0: smoke `paint`/Shared Texture → VideoFrame → WebCodecs H.264 passou 150f 1080p em 4,45s/33,69fps a `setFrameRate(60)`. Dois pilotos 30fps: 6,74/7,08s (22,26/21,18fps). Export worker já fixa 60; não é ganho novo de produção. Janela reportou 1922×1081 e o VideoFrame recortou para 1920×1080; sem golden. `prefer-hardware` não comprova encoder físico. JSON em `.../1920x1080-150f-30fps` e `.../1920x1080-150f-60fps`; nenhum MP4/frame ficou salvo.
- Quatro perfis auxiliares da depuração manual ficaram em `C:\Temp\editor-v6-shared-debug*` (28.757.315 bytes, ~27,4 MiB, sem mídia). A remoção explícita foi bloqueada pelo executor e não foi tentada por outra via. Os perfis temporários do smoke automatizado foram removidos normalmente.
- A API é experimental; ainda faltam golden pixel, seleção/benefício de encoder hardware e integração do mix de 4 vídeos + 4 áudios. O smoke a 60fps não chega ao throughput mínimo de 79,8fps para 30s. Não foi integrado na produção.
- **Decisão:** permanecer em x264 8 threads e captura padrão. A melhor exportação integral segue 76,34s clique→validado (67,85s Main); meta de 30s está aberta. Shared Texture não melhorou o limite já configurado a 60fps. Próximo ciclo deve otimizar preparação de personagens e composição real; só retomar o protótipo de cena após solução de vídeo/áudio e golden.
- Duas saídas de qualidade x264 (~60MB) seguem nas pastas descritas na seção anterior porque o executor bloqueou sua remoção explícita. São as únicas mídias pesadas identificadas; o espaço livre agora é ~79,2GB.

### Triagem de alocação e cadência offscreen — 10/11/2026

- O primeiro piloto x264 4 threads não chegou a exportar: faltava abrir o perfil UI com o preset 2 salvo. O harness encerrou antes dos quadros e limpou a saída parcial; a execução corrigida validou 600/600 + áudio em 26,61s, 21,48s Main, 5,33s Motion e 14,46s render. Os controles frios de 8 threads em ultrafast ficaram em 22,70 e 22,91s; não promover 4.
- Testei 90 e 120Hz com 8 threads e o mesmo perfil de UI. Ambas validaram 600/600+áudio, mas deram 26,41 e 25,48s, contra 22,70–22,91s em 60Hz. Motion ficou próximo (5,12/4,87s vs 4,83/4,65s); render piorou para 14,40/14,00s vs 11,64/11,96s. Reverti o seletor experimental; workers de produção continuam em 60Hz.
- Os relatórios em `target30-offscreen-{90hz,120hz}-20s-triage` e `target30-x264-threads4-20s-triage-ui` são JSON leves, sem MP4, perfis isolados, frames ou cache de exportação.
- Auditoria local do armazenamento: `out/editor-v6-stress` soma 791,24 MiB (729,97 MiB de backups verificados, 61,28 MiB em resultados); perfis auxiliares compartilhados somam 27,43 MiB; espaço livre em C: 74,21 GiB. Os backups e MP4s de qualidade previamente retidos foram preservados.
- Decisão: manter x264 8 threads, 60Hz e duas lanes. Próximo ciclo precisa mirar o custo de render/captura de ~48s no export integral; cadência e alocação de threads não resolveram o gargalo.

### Camadas de vídeo em intervalos sem overlay — 10/11/2026

- Código identificou quatro clipes cobrindo 2.175 dos 2.394 quadros; restam 219 quadros sem vídeo ativo. Uma variante temporária desenhou/capturou a cena completa nesses intervalos e manteve a camada de primeiro plano transparente para o FFmpeg. A mudança exigiu separar chave de reuso por modo.
- Teste rápido do worker 14/14, `npm run typecheck`, build e `npm run test:editor-v6:export` passaram com a variante; smoke frio de 30 quadros na lacuna 1120–1150 passou contagem, 2 vídeos e áudio.
- Full frio da variante passou 2.394/2.394, 4 vídeos/4 áudios e cache Motion com zero gravações em 76,96s clique→MP4 validado (68,57s Main), Motion 16,34s, render 49,20s. Referência integral 8-thread arquivada: 76,34s (67,85s Main), Motion 16,33s, render 48,43s.
- `captureMs` agregado caiu 24,676→24,190s, mas suas amostras subiram 456→464 e atravessam workers paralelos. Uma execução por condição não permite atribuição causal; o wall e o render da variante ficaram maiores. **A implementação foi revertida** e o teste de exportação Electron foi executado com ela; o caminho final de produção volta ao comportamento original.
- Relatórios: `target30-video-gap-transition-smoke/` e `target30-video-gap-full-candidate/`, JSON leves. O harness removeu o MP4 e `isolated-app-data`; nenhum frame/cache foi retido.
- Próximo passo: instrumentar recaptura/reuso por modo e estágio sob o projeto inteiro. Sem um sinal que supere o ruído, priorizar outro gargalo medido em vez de iterar essa hipótese.
