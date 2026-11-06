# Progresso e resultados — trilha auditável

**Data:** 06/11/2026 · **Branch:** `Dev-V2` · **Revisão de base da pesquisa:** `c636ff03c80274eabed7892dc9d5fa0e8ad025c5`. O commit que introduz a estrutura estará no log Git posterior.

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
- [ ] Execução no `editor v6 06`; não há acesso a cópia autorizada neste ambiente.
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

## Observação histórica relevante

**[RELATO]** Mesmos 10 segundos do mesmo projeto: export com animação capilar cerca de 50s e sem animação cerca de 9s. Isto equivale a diferença aproximada de 82%; **não** temos os relatórios brutos do A/B nessa rodada. Não tomar os 41s como tempo da física 120Hz, nem somar custos paralelos.

## Publicação e privacidade

Somente Markdown, sem credenciais, dados pessoais, screenshots ou assets. GitHub branch verificada antes de publicar; alterações locais do usuário não são visíveis por esta conexão. Uma nova sessão deve comparar HEAD e a cópia de trabalho real antes de propor código.
