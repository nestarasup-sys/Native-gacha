# Matriz de oportunidades — hipóteses rastreáveis

**Status:** atualizada após pesquisa do Grupo A e primeiro A/B dinâmico frio no LAB. **A solução final é tecnologicamente livre (CPU/GPU/AMF/NVENC/QSV/FFmpeg etc.), sujeita a resultado frio, qualidade e fallback** conforme [diretriz](DIRETRIZ_CODEX_RESULTADO_FINAL.md). Medições registradas abaixo; não extrapolar para outros projetos/hardware.

| ID | Problema/pergunta | Evidência disponível | Hipótese / experimento | Prioridade | Estado |
|---|---|---|---|---|---|
| AUD-001 | Mapa completo de dependências? | Pesquisa 01 e árvore do repo | Confirmar links restantes, runtime e decisões de ownership | P0 | PESQUISADO EM CÓDIGO / RUNTIME PENDENTE |
| AUD-002 | Por que cabelo ON demora? | OFF ultrafast mediana 68,83s; ON 80,11s; Motion 16,43–18,22s e render ~51s | Próximo: reduzir custo do bake sem quebrar reuso por personagem; analisar UI/timeline comum | P0 | PERFIL E 3+3 UI COMPLETOS; CANDIDATOS 3/4 LANES REJEITADOS |
| EXP-CAB-001 | Personagem redesenhado apesar de cabelo em repouso? | `composeHairFrame` + preparação dupla do hair | Instrumentar 0 / 1 / múltiplas reações | P0 | HIPÓTESE |
| EXP-CAB-002 | RGBA ROI/camada posterior substitui full canvas? | Código WebGL→Canvas→SVG e reação 29 frames | Spike ROI com alpha + oclusão | P0 | HIPÓTESE |
| EXP-CHAR-001 | Preparações/representações repetidas entre módulos? | Crop alfa alinhado 4,38→3,997s mediana local; sem ganho total robusto isolado | Rever preparação/render por revisão/identidade; preservar vínculo vivo de personagens | P1 | SCAN MANTIDO; GANHO LOCAL ~8,7%; GLOBAL NÃO CONCLUSIVO |
| EXP-ELE-001 | `capturePage` é gargalo residual? | Smoke UI frio 5s: capturePage 13,63s vs paint-event 14,20s; fundo hash igual, camada frontal difere | Localizar divergência; manter capturePage padrão | P1 | PAINT OPT-IN; SEM EQUIVALÊNCIA RGBA |
| EXP-ELE-002 | Shared texture D3D evita readback? | Disponível na API Electron, não ativo | PoC nativo isolado (após EXP-ELE-001) | P2 | HIPÓTESE |
| EXP-FFM-001 | Qual encoder/backend entrega o MP4 correto mais rápido a frio? | Preset x264 `ultrafast` 3+3 ON/OFF; SSIM integral ≥0,99784, PSNR ≥52,76dB; PCM idêntico | Manter libx264/12Mbps com preset ultrafast; Auto/AMF e fallback ficam disponíveis | P0 | PROMOVIDO NO LAB; A/B INTEGRAL PASSOU |
| EXP-RAS-001 | DrawPlan nativo pode renderizar subconjunto com paridade? | Protótipo possui `unsupported` | Cenas reais com bloqueadores explícitos | P2 | HIPÓTESE |
| EXP-UI-001 | Clock/timeline re-renderizam desnecessariamente? | RAF e virtualização já presentes | Trace de scrub/scroll/drag real | P1 | HIPÓTESE |
| EXP-DATA-001 | Cache/salvamento atravessam ownership? | JSON, CAS, SQLite, refs | Mapear chaves de revisão e recuperação | P1 | HIPÓTESE |
| EXP-IMG-001 | Sharp/libvips vs Canvas em preparação estática? | [Pesquisa 17](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md) | A/B de atlas/ROI frio incluindo IPC, alpha e CPU | P1 | PESQUISADA / NÃO MEDIDA |
| EXP-STATE-001 | Selectors e snapshots React estão causando commits extras? | [Pesquisa 18](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md) | Perf de scrub/face/seek + identidade props | P1 | PESQUISADA / NÃO MEDIDA |
| EXP-NODE-001 | Raw BGRA e IPC fazem cópias evitáveis? | [Pesquisa 19](pesquisas/19-NODE-IPC-STREAMS-BUFFERS.md) | Contar bytes/pipe/capture; manter backpressure | P1 | PESQUISADA / NÃO MEDIDA |
| EXP-WC-001 | WebCodecs pode melhorar encoder completo? | [Pesquisa 20](pesquisas/20-WEBCODECS-VIDEODECODER-VIDEOENCODER.md) | PoC VideoEncoder+MP4 mux+áudio+ffprobe | P2 | PESQUISADA / NÃO MEDIDA |
| EXP-BUILD-001 | Startup/packaging/contratos limitam experimentos? | [Pesquisa 21](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md) | Build portátil+ABI+CSP/IPC regressão | P1 | PESQUISADA / NÃO MEDIDA |
| CHROM-AUD-001 | Em qual etapa Chromium/cabelo se perde o tempo? | [Pesquisa 02, seções 7–21](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md) | A/B pré-job+worker com 0/1/múltiplas reações | P0 | PESQUISADA / SEM MEDIÇÃO |
| CHROM-AUD-002 | Paint/raster/GPU são dominantes? | Chromium RenderingNG + código de captura | Trace Perfetto restrito após baseline | P1 | PESQUISADA / TRACE PENDENTE |
| CHROM-SPIKE-001 | Boca pode mudar sem recompôr cabelo em repouso? | Canvas full-rig, visual keys e face patch | PoC de camada independente e golden RGBA | P0 | HIPÓTESE |
| CHROM-SPIKE-003 | paint/dirtyRect reduz capturePage sem stale? | API Electron + token real | PoC frameId/dirtyRect 150/300 frames | P1 | HIPÓTESE CONDICIONAL |
| ELE-AUD-001 | Qual custo de Electron offscreen versus pre-job? | [Pesquisa 03 aprofundada](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | 3+3 A/B ON/OFF, workerStart, IPC, capture, bitmap, write, total | P0 | PESQUISADA / NÃO MEDIDA |
| ELE-AUD-002 | ColorSpace sRGB + BGRA/alpha são preservados? | [Pesquisa 03, seção 7](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | Golden RGBA; Electron >=43, DPI, token por layer | P0 | PESQUISADA / TESTE PENDENTE |
| ELE-SPIKE-001 | paint/dirtyRect substitui capturePage com frameId? | [Pesquisa 03, seção 10](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | PoC de paint, 150/300 frames, 2 layers, cancelamento | P1 | HIPÓTESE CONDICIONAL |
| ELE-SPIKE-002 | setFrameRate/stayHidden reduz espera/capturas? | [Pesquisa 03, seção 12](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | A/B cadência 30/60/90, stayHidden, cor e token | P2 | HIPÓTESE CONDICIONAL |
| ELE-SPIKE-003 | Textura GPU compartilhada elimina readback real? | [Pesquisa 03, seção 11](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | PoC driver/encoder hardware, release/VRAM/fallback | P2 | PESQUISADA / PROTÓTIPO PENDENTE |
| REF-001 | Qual arquitetura implementar? | Depende dos experimentos anteriores | ADR comparando opções com benchmark frio, qualidade e riscos, sem preferência por CPU/AMF | P1 | BLOQUEADO |

**Critério de prioridade:** custo total evitável no **mesmo projeto**, probabilidade de preservar paridade, tamanho da mudança, risco de memória/dados/driver e manutenção. Não usar ranking como prova de ganho.

**Observação importante:** no modo `hairPoseReactionOnly`, `selectEditorV6HairlessTransitionBakes` já evita um segundo bake das transições; priorizar outras formas de duplicidade antes de culpar essa operação (ver `motion/hairBakeBatch.ts`).

[Plano detalhado](PLANO_EXECUTAVEL.md) · [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

## Atualização de resultado — 06/11/2026

| ID | Evidência atualizada | Decisão |
|---|---|---|
| AUD-002 | OFF via comando UI/IPC 70,55/73,53/75,90s; cabelo ON ultrafast 79,63/81,43/80,11s; 2.394 frames + áudio. | Equivalência UI corrigida; a diferença mediana (~10,74s) inclui preparo/composição hair, não é só custo do warp. |
| EXP-CAB-001 | Com cabelo, preparo ~8,20s mediano; draw de hair no export soma <1s nos relatórios, sem contar lanes como parede. | CPU concentrada no pré-preparo facial/renderer e composição geral, não no warp de hair medido; ROI sem prova ainda. |
| EXP-CHAR-001 | `measureFaceModeCrop` 4,38s mediana pré-candidato; medida mais recente 3,997s. | Mantido: ~8,7% menos tempo agregado dessa etapa, crop/pixels preservados; sem ganho global isolado comprovado. |
| EXP-DATA-001 | Cache persistente escrevia cerca de 70MB por cold export; serviço agora usa `cacheScope` único, sem I/O de atlas em disco e limpa memória ao final da preparação. | Mantido por requisito de segurança/frieza; zero leitura/gravação em 3 exports finais. |
| EXP-ELE-001 | `capturePage` permanece padrão; paint 14,20s vs 13,63s em smoke e hash de foreground difere. | Paint opt-in até paridade integral. |
