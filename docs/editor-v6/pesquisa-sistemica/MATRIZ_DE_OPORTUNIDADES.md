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
| EXP-FFM-001 | Qual encoder/backend entrega o MP4 correto mais rápido a frio? | Preset x264 `ultrafast` 3+3 ON/OFF; SSIM integral ≥0,99784, PSNR ≥52,76dB; PCM idêntico. AMF `speed`: 24,45s/600f vs x264 22,70–22,91s, sem A/B visual | Manter libx264/12Mbps com preset ultrafast; AMF `speed` não foi promovido | P0 | X264 PROMOVIDO NO LAB; AMF SPEED PERDEU |
| EXP-RAS-001 | DrawPlan nativo pode renderizar subconjunto com paridade? | Protótipo possui `unsupported` | Cenas reais com bloqueadores explícitos | P2 | HIPÓTESE |
| EXP-UI-001 | Clock/timeline re-renderizam desnecessariamente? | RAF e virtualização já presentes | Trace de scrub/scroll/drag real | P1 | HIPÓTESE |
| EXP-DATA-001 | Cache/salvamento atravessam ownership? | JSON, CAS, SQLite, refs | Mapear chaves de revisão e recuperação | P1 | HIPÓTESE |
| EXP-IMG-001 | Sharp/libvips vs Canvas em preparação estática? | [Pesquisa 17](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md) | A/B de atlas/ROI frio incluindo IPC, alpha e CPU | P1 | PESQUISADA / NÃO MEDIDA |
| EXP-STATE-001 | Selectors e snapshots React estão causando commits extras? | [Pesquisa 18](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md) | Perf de scrub/face/seek + identidade props | P1 | PESQUISADA / NÃO MEDIDA |
| EXP-NODE-001 | Raw BGRA e IPC fazem cópias evitáveis? | Microbenchmark sintético 1080p: mediana de 3 processos novos, captura 18,60ms; readback TypedArray + swizzle BGRA 18,31ms; MessagePort clone 20,02ms; hashes idênticos | Manter captura atual; só reabrir com readback que remova trabalho, não o mova | P0 | MEDIDO; GANHO DIRETO INCERTO (<2%) E NÃO PROMOVIDO |
| EXP-WC-001 | WebCodecs pode melhorar encoder completo? | Electron 45.1.0/Chromium 156 codificou e remuxou 150 quadros Canvas sintéticos em 1,57s; sem cena, áudio ou comparação equivalente | Integrar saída da nova superfície após golden RGBA; medir projeto frio completo + áudio/mux/ffprobe | P1 | CAPACIDADE SINTÉTICA CONFIRMADA; GANHO/QUALIDADE DA CENA PENDENTES |
| EXP-ENGINE-001 | Como separar estado da cena, desenho e exportação da UI? | Plano imutável + contrato desacoplado; golden sintético aprovado; A/B UI frio integral Canvas2D 90,87s vs SVG 90,38s; render +4,66s e hash de foreground diferente | Manter Canvas2D fora da produção; reconsiderar somente se eliminar captura intermediária e passar golden RGBA | P0 | CONTRATO/COMPILADOR MANTIDOS; Canvas2D NÃO PROMOVIDO |
| EXP-ENGINE-002 | O renderer pode entregar BGRA direto ao FFmpeg sem `capturePage`/`NativeImage`? | 3 processos Electron novos, 7 pares por processo, 1920×1080, token dinâmico, zero divergência em 21 quadros; direto 18,31ms vs captura 18,60ms; MessagePort clone 20,02ms | Não integrar a conversão TypedArray; shared texture continua exigindo prova nativa end-to-end | P0 | MEDIDO; SEM GANHO ROBUSTO, CAPTUREPAGE MANTIDO |
| EXP-ENGINE-003 | A alocação de threads do x264 afeta o wall total? | Projeto: piloto 6→8 caiu 3,2%; cruzado 8→6 caiu 5,1%; SSIM 0,999226/PSNR 57,27dB; full 8 threads em 76,34s. Triagem 10/8: 26,09/27,74s, e piloto 4 threads: 26,61s contra referências 8 de 22,70–22,91s; Motion/render variaram. | Padrão segue 8. Override 1–12 só no harness; 4/10 não provaram ganho e não tiveram avaliação visual pareada. Evitar varreduras sem janela de host controlada. | P0 | PROMOVIDO ATÉ 8; 4/8/10 SEM GANHO CAUSAL |
| EXP-ENGINE-004 | O compilador novo pode reutilizar cenas estáveis sem perder semântica? | Índice esparso por blocos, transições, fala, mídia e blink; 7 testes com comparação quadro a quadro e fallback limitado a 50.000 eventos; export frio integral validado | Manter o plano compartilhado no worker; medir custo do resolver separado do compositor antes de atribuir ganho | P0 | IMPLEMENTADO; PARIDADE SINTÉTICA + EXPORT REAL PASSARAM; SEM GANHO PONTA A PONTA DECLARADO |
| EXP-ENGINE-005 | Captura dinâmica em lacunas evita o segundo readback? | Projeto tem 219f sem overlay; smoke de transição passou, mas full experimental 76,96s vs 76,34s de referência, com apenas uma amostra por condição | Manter implementação revertida; retomar somente com trace de quadros efetivamente recapturados e candidato de maior retorno | P1 | MEDIDO; SEM GANHO ROBUSTO; REVERTIDO |
| EXP-BUILD-001 | Startup/packaging/contratos limitam experimentos? | [Pesquisa 21](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md) | Build portátil+ABI+CSP/IPC regressão | P1 | PESQUISADA / NÃO MEDIDA |
| CHROM-AUD-001 | Em qual etapa Chromium/cabelo se perde o tempo? | [Pesquisa 02, seções 7–21](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md) | A/B pré-job+worker com 0/1/múltiplas reações | P0 | PESQUISADA / SEM MEDIÇÃO |
| CHROM-AUD-002 | Paint/raster/GPU são dominantes? | Chromium RenderingNG + código de captura | Trace Perfetto restrito após baseline | P1 | PESQUISADA / TRACE PENDENTE |
| CHROM-SPIKE-001 | Boca pode mudar sem recompôr cabelo em repouso? | Canvas full-rig, visual keys e face patch | PoC de camada independente e golden RGBA | P0 | HIPÓTESE |
| CHROM-SPIKE-003 | paint/dirtyRect reduz capturePage sem stale? | API Electron + token real | PoC frameId/dirtyRect 150/300 frames | P1 | HIPÓTESE CONDICIONAL |
| ELE-AUD-001 | Qual custo de Electron offscreen versus pre-job? | [Pesquisa 03 aprofundada](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | 3+3 A/B ON/OFF, workerStart, IPC, capture, bitmap, write, total | P0 | PESQUISADA / NÃO MEDIDA |
| ELE-AUD-002 | ColorSpace sRGB + BGRA/alpha são preservados? | [Pesquisa 03, seção 7](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | Golden RGBA; Electron >=43, DPI, token por layer | P0 | PESQUISADA / TESTE PENDENTE |
| ELE-SPIKE-001 | paint/dirtyRect substitui capturePage com frameId? | [Pesquisa 03, seção 10](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | PoC de paint, 150/300 frames, 2 layers, cancelamento | P1 | HIPÓTESE CONDICIONAL |
| ELE-SPIKE-002 | setFrameRate/stayHidden reduz espera/capturas? | Pilotos UI frios a 60/90/120Hz: 22,70–22,91s no controle 600f; 26,41s a 90 e 25,48s a 120; render 14,00–14,40s vs 11,64–11,96s no controle | Manter produto em 60Hz; não subir cadência sem trace que explique a regressão de render | P2 | 90/120 REJEITADOS; `stayHidden` NÃO MEDIDO |
| ELE-SPIKE-003 | Textura GPU compartilhada elimina readback real? | [Pesquisa 03, seção 11](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | PoC driver/encoder hardware, release/VRAM/fallback | P2 | PESQUISADA / PROTÓTIPO PENDENTE |
| REF-001 | Qual arquitetura implementar? | Adaptador Zod no Main; compilador de cena em `src/shared`; plano esparso no export worker. Superfície SVG/capturePage e FFmpeg ainda são o caminho compatível | Extrair componentes do motor por contrato, com oráculo, golden e fallback; priorizar render/encoder que dominam os 79,49s Main observados | P0 | DIREÇÃO ESCOLHIDA; ENG-01/04 EM CURSO |
| LAB-001 | Branch do laboratório pode validar sem trocar para Dev-V2? | Integração completa passou na branch LAB; doctor exige Dev-V2; 2 fixtures da suíte refactor estão desatualizadas | Corrigir doctor para permitir apenas branch LAB ou Dev-V2; atualizar fixtures contra fluxo real de picker/importação | P0 | HANDOFF 06/11: APP BUILD/INTEGRAÇÃO OK; SUÍTE AMPLA COM 2 TESTES PENDENTES |

**Critério de prioridade:** custo total evitável no **mesmo projeto**, probabilidade de preservar paridade, tamanho da mudança, risco de memória/dados/driver e manutenção. Não usar ranking como prova de ganho.

**Observação importante:** no modo `hairPoseReactionOnly`, `selectEditorV6HairlessTransitionBakes` já evita um segundo bake das transições; priorizar outras formas de duplicidade antes de culpar essa operação (ver `motion/hairBakeBatch.ts`).

## Novo alvo: 30 segundos — triagem fria de 10/11/2026

O alvo aplica-se à exportação completa de 2.394 quadros do projeto atual e exige áudio, vídeos, qualidade e MP4 validado. [Pesquisa 23](pesquisas/23-PERFIL-ALVO-30S.md) registra todos os pilotos desta rodada.

| ID | Evidência atualizada | Decisão |
|---|---|---|
| EXP-ELE-001 | Piloto 600f: `capturePage` 22,83s vs `paint-event` 23,85s; paint baixou 1,66s de capturePage, mas render total aumentou. Uma amostra por caminho. | `capturePage` permanece padrão; a captura paint não reduz o wall validado. |
| EXP-CAB-001 | Preparo integral sem encoder: 2 grupos 8,54s; 4 grupos 7,88s; 140 rigs e zero transições preparadas nesta etapa; amostras únicas. | Não alterar padrão 2; ~0,65s não comprovados no MP4, RAM GPU aumentou ~77MiB. |
| EXP-ENGINE-005 | Piloto 600f com 4 lanes 22,83s; 6 e 8 lanes anteriores 24,98s/25,66s; export integral arquivada sem ganho de 4 lanes. | Não elevar paralelismo global; só investigar quando teste curto reproduzir ganho com carga completa de mídia. |
| META-30S | Melhor export integral desta rodada: 76,34s Main 67,85s; 2.394f, 8 threads, render 48,43s e motion 16,33s. | Ainda 2,5× acima da meta. Threads x264 promovidas com qualidade pareada; transporte/produção de quadros segue P0. |
| EXP-ENGINE-006 | Pré-busca limitada a 1 quadro: 22,83s referência vs 24,21s; Main RSS ~896 vs ~701MiB. | Revertida; a cópia adicional e a contenção anularam possível sobreposição de render/write. Um caminho sem cópia exige nova prova. |

[Plano detalhado](PLANO_EXECUTAVEL.md) · [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

O teste de alocação de threads está documentado em [Pesquisa 22](pesquisas/22-X264-THREADS-ALOCACAO.md); a amostra sintética é somente um gate de triagem, não um benchmark do projeto.

### Atualização de 10/11 — hipóteses de encoder e superfície GPU

| ID | Evidência medida | Decisão |
|---|---|---|
| EXP-FFM-002 | [Pesquisa 24](pesquisas/24-AMF-E-SUPERFICIES-GPU.md): host RX 7600, auto selecionou `h264_amf`; 2 pilotos frios 600f em 26,12/27,33s vs x264 8t 22,91s. Ambos passaram 600f+áudio, sem A/B de qualidade. | AMF/auto não promovidos; custo global maior e encoder não pareado por qualidade. Continuar com x264 8t; não selecionar encoder por GPU detectada. |
| EXP-ELE-003 | [Pesquisa 24](pesquisas/24-AMF-E-SUPERFICIES-GPU.md): Shared Texture→VideoFrame→WebCodecs passou 150 quadros sintéticos 1080p em 4,45s/33,69fps a `setFrameRate(60)`; alvo exige 79,8fps. Export worker já usa 60. | Sem ganho novo de produto. Não integrar até golden, projeto real, overlays/áudio, mux e fallback; limitar foco no caminho de captura/GPU. |
| EXP-MOTION-001 | Pilotos Motion 600f: concorrência 2 em 22,91/23,99s e 3 em 23,16s; Motion ~4,18–4,74s. Pares com variação. | Sinal misto/abaixo de ruído de parede; manter concorrência normal 2. Override restrito ao harness. |

## Atualização de resultado — 06/11/2026

| ID | Evidência atualizada | Decisão |
|---|---|---|
| AUD-002 | OFF via comando UI/IPC 70,55/73,53/75,90s; cabelo ON ultrafast 79,63/81,43/80,11s; 2.394 frames + áudio. | Equivalência UI corrigida; a diferença mediana (~10,74s) inclui preparo/composição hair, não é só custo do warp. |
| EXP-CAB-001 | Com cabelo, preparo ~8,20s mediano; draw de hair no export soma <1s nos relatórios, sem contar lanes como parede. | CPU concentrada no pré-preparo facial/renderer e composição geral, não no warp de hair medido; ROI sem prova ainda. |
| EXP-CHAR-001 | `measureFaceModeCrop` 4,38s mediana pré-candidato; medida mais recente 3,997s. | Mantido: ~8,7% menos tempo agregado dessa etapa, crop/pixels preservados; sem ganho global isolado comprovado. |
| EXP-DATA-001 | Cache persistente escrevia cerca de 70MB por cold export; serviço agora usa `cacheScope` único, sem I/O de atlas em disco e limpa memória ao final da preparação. | Mantido por requisito de segurança/frieza; zero leitura/gravação em 3 exports finais. |
| EXP-ELE-001 | `capturePage` permanece padrão; paint 14,20s vs 13,63s em smoke e hash de foreground difere. | Paint opt-in até paridade integral. |
