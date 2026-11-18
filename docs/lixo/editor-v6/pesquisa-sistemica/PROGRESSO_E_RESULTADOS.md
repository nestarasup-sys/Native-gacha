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
