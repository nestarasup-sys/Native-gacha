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
- Mudança LAB: `beginFrameSubscription(false, callback)` mantém somente a imagem mais recente, confirma token do quadro pedido e rejeita imagem obsoleta; reutiliza conversão BGRA/buffer e mantém fallback selecionável `capturePage`. Paint passa a ser modo normal apenas na cópia LAB.
- Proteções: recusa sessão reutilizada, exige cache vazio em exportações cold, limita saída a 2 GiB e exige 3 GiB livres; limpa apenas a pasta isolada da execução após validação.
- Testes: typecheck; audit:architecture; build; `test:editor-v6:quick` (59 Vitest + 6 Node); bootstrap (7); captura (13); stress/saída/ferramentas de vídeo (8). Export curto final passou após adição da guarda.
- Limites: ganho modesto/variável; ampliar amostras e golden RGBA integral, validar cancelamento/resize e build empacotado. Próxima prioridade: medir preparo de personagens/cabelo posterior; não iniciar ROI sem provar repetição e paridade.

## Diretriz de resultado final atualizada — 06/11/2026

- [x] Usuário confirmou que **CPU, GPU, AMF, NVIDIA, Intel ou qualquer outro encoder são intercambiáveis**: só importam o primeiro MP4 frio, qualidade, integridade, compatibilidade e fallback. Registrado em [DIRETRIZ_CODEX_RESULTADO_FINAL.md](DIRETRIZ_CODEX_RESULTADO_FINAL.md).
- [x] Plano e matriz passaram a autorizar comparações entre backends diferentes **explicitamente identificadas**, mantendo A/B do mesmo backend para atribuição causal.
- [x] Confirmada divergência de perfil: na UI o padrão é `encoder:'cpu'`, preset 2, `hairPoseReactionOnly:true`, `hairPosteriorOnly:true`; no benchmark LAB foi selecionado `encoder:'auto'`, preset 1, resultando em AMF. **O relato de 91s não pode ser usado para anunciar ganho sem alinhar o perfil.**
- [ ] Ainda faltam golden integral de `paint-event`, layered video, stress de erro/cancelamento, replicação do fluxo UI e benchmarking de encoders/backends melhores disponíveis.
- [ ] **Esta revisão só mudou a política e documentos**; nenhuma alteração no renderizador, encoder ou testes foi executada aqui.
