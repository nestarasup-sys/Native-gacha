# Video Studio G-V5 — pesquisa aprofundada e plano de reconstrução resiliente

**Atualização:** 23/10/2026 · **Pesquisa ampliada:** 6 investigações técnicas priorizadas (seções 12–17) · **Estado:** documentação/planejamento, **não** implementação nem decisão irrevogável de engine.  
**Código auditado:** `nestarasup-sys/Native-gacha` · `feature/model-source-editor` · HEAD de referência `26803164a8b9370f9f1e13228054b2fa1c422292`.  
**Motivação prioritária:** um teste real de projeto pesado já provocou travamento/fechamento do aplicativo relatado pelo criador. O objetivo **não é só refatorar arquivos**, mas manter um editor Gacha útil e recuperável sob carga severa. **O teste não foi reproduzido nesta pesquisa**; mecanismos causais abaixo são hipóteses até medição.  
**Escopo:** somente Video Studio e seus contratos/infra relacionados. Preservar Fabricador, Customizador, Studio, biblioteca, PNGs, modelos, poses, expressões, roupas, vídeos, áudios e documentos do usuário.

> **Proposta executiva (substitui a preferência automática por MLT/Skia):** conservar **Electron + React** como editor; separar **semântica autoral Gacha** de **decode/mix/render/encode**; colocar trabalhos pesados em processos supervisionados; aplicar **orçamento global de memória, filas limitadas, proxies e preview adaptativo**. Comparar, em etapas independentes, **FFmpeg/libav***, **MLT**, **GStreamer/GES** e outras opções; para composição Gacha, comparar **Canvas atual**, **PixiJS/WebGL**, **Skia** e, se for necessário, alternativas 2D CPU. **MLT, C++ e Skia não são obrigatórios.** Só escolher uma combinação após testes reproduzíveis no Windows com animações *de verdade* e leitura de memória de *todos* os processos.

## 0. Como interpretar este documento

- É a **revisão ativa** do estudo iniciado neste arquivo. Substitui sua recomendação anterior de pôr MLT como primeiro candidato obrigatório ou privilegiado. Uma prova de conceito isolada pode usar MLT, mas a baseline do FFmpeg atual e a melhoria estrutural sem nova biblioteca também competem.
- Complementa `00_PLANO_DIRETOR.md`, `01_ESTUDO_DE_MOTORES.md`, `02_ARQUITETURA_CANONICA.md`, `03_MIGRACAO_E_DADOS.md`, `04_LAB_E_GATES.md`, `05_DECISOES_ADR.md`, `08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md` e `11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md`. Esses textos contêm histórico útil, mas **não são medição do HEAD atual**.
- Alguns documentos antigos citam `G-V5/master-desenvolvimento`. Esse endereço é **histórico**. O único destino de escrita desta rodada foi `Native-gacha/feature/model-source-editor`. `main` intocável sem autorização expressa; PR existente permanece draft.
- **Legendas das tabelas:** `CONFIRMADO` = observado diretamente no código/documentação primária; `HISTÓRICO` = medido em commit anterior; `HIPÓTESE` = precisa ser testado; `PROPOSTA` = desenho futuro, ainda não executado.

## 1. O que o Video Studio realmente faz (mapa de responsabilidades)

| Função | Evidência de implementação atual | Quem deve ser dono disso na arquitetura nova? |
| --- | --- | --- |
| Blocos de personagem na timeline | `src/shared/studio.ts`, `VideoTimeline.tsx` e `videoTimelineIndex.ts`: keys de personagem, estado base, track ends, gaps e posição/transformação global | **Modelo autoral Gacha + editor**, não playlist genérica MLT. |
| Mudança de pose e expressão | `videoCharacterTransitions.ts`: interpolação automática de até **15 frames** antes da boundary, desde que estados mudem e não haja gap; `videoCharacterInterpolation.ts` interpola pose/rosto/efeitos | **SceneCompiler Gacha**; renderiza estado absoluto do frame N. |
| Balões de fala/pensamento | `VideoTimelineDocument.textClips` com `startFrame/endFrame`, speaker e estado do elemento | **SceneCompiler Gacha**; texto pode ter renderizador tipográfico próprio. |
| Falando/piscando | `VideoStudioEditor.tsx` e `videoSceneIR.ts`: balão `speech` aciona boca; blink automático determinístico; boca possui seis variações no preview com fases fixas | **Gacha SceneEvaluator** + renderer facial compartilhado. |
| Vídeo visível na cena | `VideoClipPreview.tsx` cria um `HTMLVideoElement` por clipe ativo; `videoMediaPlayback.ts` sincroniza `currentTime`/`play()` com playhead calculado por `requestAnimationFrame` | **MediaDecoder + relógio A/V**; não depender de múltiplos relógios independentes em projeto pesado. |
| Mídias importadas e áudio | `VideoMediaClip` + `VideoAudioSettings`, `videoStudioAudioPlan.ts` monta `atrim`, `adelay`, `amix` e AAC via FFmpeg | **Media engine**: FFmpeg/libav ou MLT/GES aprovados por benchmarks. |
| Prévia e manipulação | DOM de personagem e balões em `VideoStudioDomElement.tsx`; elementos `<video>` na cena e handlers React | **React UI/stage**, alimentado por frames/estados solicitados ao motor; overlay de seleção continua interativo. |
| Exportação | `videoSceneIR.ts` compila quadros; `VideoExportSurfacePage.tsx` usa Canvas 2D + HTMLVideoElement + `getImageData`; `videoExportCoordinator.ts` envia RGBA ao FFmpeg | **Processo de render/encode separado**, com snapshot e validação. |
| Modos de export | `RenderVariant`: `animated` e `static-characters` | **Contrato existente**, não remover nem alterar sem pedido. |

O projeto autoral é `StudioDocument schemaVersion: 1`, com `VideoTimelineDocument.frameRate: 60`. **Não trocar esse arquivo por XML do MLT, timeline de GES ou JSON interno de qualquer biblioteca**. Plugins e engines recebem uma projeção de execução temporária e versionada.

### Particularidades que não cabem numa playlist comum

- Um bloco de personagem pode implicar **pose, expressão, transformação facial, escala de palco e estado de animação**, não apenas um pedaço de vídeo.
- Lacunas têm efeito na presença do personagem e transições. O frame da fronteira pertence ao novo estado.
- Balões controlam a boca do *speaker*; olho, pupila e roupa dependem dos contratos compartilhados com o Fabricador/Customizador.
- Presets **PT** têm deslocamento/rotação própria por pupila sobre a expressão normal, com fallback para presets legados; **o normal não pode receber deslocamentos artificiais**.
- O vídeo de fundo atualmente tem z-order próprio (`videoSceneIR.ts` com layer `zOrder:1`); mudanças para layering livre são **mudanças de produto**, não detalhe transparente da engine.
- O media clock nativo de cada `<video>` e o playhead de `requestAnimationFrame` já são diferentes; o preview futuro precisa resolver autoridade temporal e tolerância de A/V.

## 2. Auditoria de riscos de travamento/memória

**Não foi possível concluir qual recurso derrubou o projeto real sem o fixture/log.** Há, porém, pontos que tornam plausível pressão de memória mesmo quando os testes unitários estão verdes:

| Achado observado no código | Consequência possível (hipótese, não causa provada) | Teste apropriado |
| --- | --- | --- |
| `VideoStudioEditor.tsx` tem ~2.517 linhas, lista `studios` de documentos abertos e guarda `availableCharacters`/assets no estado React. | Grandes strings `dataUrl` e árvores de objetos podem permanecer referenciadas após navegação; diffs e renderizações custam CPU/heap. | Abrir/fechar/reabrir muitos projetos, heap snapshots de objetos retidos, monitorar RSS e Blink. |
| `captureVideoCharacter()` incorpora `imageDataUrl` ao estado de cada key; `createVideoExportSnapshot()` faz `structuredClone` do documento. | Snapshot, duplicação e export podem criar picos transitórios e conteúdo raster duplicado em strings/bytes; é preciso medir o que o runtime deduplica. | Medir `dataUrl` bytes distintos/repetidos por projeto, custo de clone/serialização e heap/RSS antes/depois. |
| `EditHistory<StudioSnapshot>` armazena até **1.000 snapshots**; compartilha assets por referência em vários casos. | O compartilhamento protege em edições triviais, **não garante** pouca memória se alterações substituem array/PNG ou clonam estados; limitador conta snapshots, não bytes. | Repetir 1.000 edições incluindo pose/expressão/imagem; heap retained size e undo fidelity. |
| Fala no preview cria até **seis PNGs** de variação facial por personagem/alvo; cache por **duas assinaturas**; blink prepara outro PNG por alvo. | Muitos personagens/estados rapidamente trocados podem manter raster em JS, memória Blink e texturas decodificadas. | 12/24/48 personagens, 2/10/30 mudanças de expressão por segundo, `Image` decode/evictions e p95. |
| `useCharacterTransitions.ts` tem cache `128 MiB` estimados por comprimento de `dataUrl` e no máximo 240 frames; faz `Image.decode()`. | Teto não equivale a teto de memória decodificada GPU/Blink; cache pode não representar buffers transitórios. | Contadores de PNG codificado **versus** bitmaps/texturas decodificados, picos GPU. |
| `videoCanvasCompositor.ts` mantém `MAX_IMAGE_CACHE=256` por quantidade de imagens (sem limite explícito de bytes); `videoCanvasLayerCache.ts` usa **96 MiB por surface** para canvas 1920×1080. | 256 imagens podem consumir valores muito diferentes de RAM; limite de cada surface não é orçamento do app. | Cache calor/frio em várias resoluções; residentes Canvas e texturas, GPU RAM. |
| `VideoExportMediaFramePool` admite **96 MiB de `ImageBitmap` por surface** e um `HTMLVideoElement` por asset; fecha os bitmaps ao expulsar. | Cada surface/decoder pode consumir memória privada além desse mapa; dois workers dobram certos recursos. | Serial vs Turbo, contadores de decoders, working set de todas as surfaces. |
| `VideoSemanticFrameCache` permite **96 MiB RAM por job**; `VideoPersistentFrameCache` permite **512 MiB em DISCO**, não RAM. Encoder e writer admitem até 2 buffers em voo. | Tetos individuais ajudam, mas **não significam soma global controlada** de caches + FFmpeg + Chromium + GPU. | Orçamento unificado com contadores por categoria e processo; RAM total árvore. |
| Preview usa `<video>`/decoders Chromium por clipe ativo e playhead React; export usa surface/Canvas/media pool separados. | Decodificação e composição podem divergir entre preview e export; fontes concorrentes podem agravar RAM e seek. | 1/2/4 vídeos simultâneos, reverse seek A→B→A, fps variável, áudio e vídeo importado. |
| `videoSerialChunkEncoder.ts` pré-busca com limite e `videoRawFrameWriter.ts` impõe 2 frames no pipe. | **Já existe backpressure no encode**, portanto não atribuir tudo a um suposto “buffer infinito”; investigar antes de reescrever. | Medir peakInFlight e waitMs, confirmar no stress real. |

### Histórico de medições: cuidado ao interpretar

`LOCAL_HARDWARE_REPORT_2026-10-20.md` corresponde a **outro commit** (`845761c...`, branch histórica `master-desenvolvimento`), em Windows 11 com Ryzen 5 4600G, ~15,4 GiB RAM física e RX 7600 reportada. Na amostra sintética **5 s**, o relatório mediu ~**1,11 GiB** serial e ~**1,52 GiB** Turbo na árvore Electron, **sem somar confiavelmente FFmpeg**. O soak de **15 minutos** escreveu 54.000 frames corretamente, **mas após o frame 301 reutilizava frame estático**: validou encode/chunks/concat, **não** 15 minutos de composição Gacha pesada. Experimentos de GPU/WebGL reportaram `supported:false` na sessão usada; são **inconclusivos**, não prova de GPU inadequada.

**Não repetir como fato:** “o editor aguenta 15 minutos de animação complexa”, “a RX 7600 não suporta WebGL”, “o MLT economiza N GB”, “o fechamento foi um leak específico”, “FFmpeg é incapaz de NLE”, “Skia é sempre mais rápido”.

### Telemetria diagnóstica local proposta

Coletar em intervalos moderados e ao mudar de estado: `app.getAppMetrics()` (main/renderer/GPU/utility), `process.getProcessMemoryInfo()`/`getBlinkMemoryInfo()` (onde disponíveis), working set/commit de `ffmpeg.exe`/sidecar e **total efetivo da árvore**, VRAM/uso GPU via ferramenta Windows apropriada, contadores de caches, URLs de imagem, decoders, canvas, frames em voo, tempo `decode/render/readback/IPC/encode`, `FPS` real, `seek p95`, GC, autosaves e revisão da cena. Crash events `render-process-gone`, `child-process-gone`, status `oom/crashed`. Logs sanitizados por `jobId`, sem paths pessoais e sem frames de projetos privados.

As API de Electron **não** medem automaticamente todo o consumo de todas as dependências nativas; complementar com métricas Windows e correlacionar por PID. Perf counters devem ser opcionais para uso comum e sempre com baixa sobrecarga.

## 3. Pesquisa de **engines audiovisuais**, separadas da interface

**Pergunta correta:** qual biblioteca resolve *decode, seek, áudio, time mapping, composição de vídeo e encode* do nosso **SceneIR Gacha** ao menor custo total, com memória controlável e preview/export corretos?

| Tecnologia / aplicação de referência | O que vem pronto e é útil | O que não entrega ao G-V5 | Custos, licença e situação |
| --- | --- | --- | --- |
| **FFmpeg CLI + ffprobe (atual)** | Containers, codecs, filtros/overlay, `atrim`/`amix`/`adelay`, encode/mux, verificação e subprocess isolado; arquitetura existente já testada | Timeline editorial interativa e caracter Gacha; cada frame ainda precisa vir do nosso renderer | **BASELINE REUTILIZÁVEL**; build LGPL/GPL variável, configurá-lo e distribuí-lo. |
| **libavcodec/libavformat/libavfilter/libswresample** | A mesma pilha FFmpeg via API C, controle de demux/decode/seek/filter e filas | Não oferece UI/NLE de alto nível, complexidade de lifecycle/PTS/thread | **Candidata nativa se CLI/Chromium decoders forem gargalo mensurado**; não port por preferência. |
| **MLT Framework + MLT++** | Producers, playlists, tractors, filters, transitions, consumers, FFmpeg avformat, frame pull/lazy; atual **7.42.0 (03/10/2026)** adicionou módulo placebo e mix de ducking | Renderizador/semântica Gacha, UI, licença homogênea entre plugins, orçamento global de RAM | **Candidato forte de PoC NLE**, não obrigação. Core/MLT++ LGPLv2.1, módulos variáveis (qimage GPLv2). |
| **GStreamer + Editing Services (GES)** | Pipelines, codecs, scheduling, timeline/layers/tracks para aplicativo editor, Windows | Caracter Gacha; exige bridge/semântica, seleção de plugins e empacotamento privado | **Concorrente de MLT se precisar NLE maior**; GES LGPL, plugins devem ser auditados. |
| **libopenshot** | Biblioteca C++ de vídeo/áudio, layers, keyframes, time remapping, FFmpeg, bindings e Qt player | Não interpreta StudioDocument, faces e props Gacha; pode carregar mais dependências | **Alternativa secundária**; LGPLv3+ ou comercial, dependências como JUCE/FFmpeg com termos próprios. |
| **libmpv / mpv** | Playback, seek, cache de leitura, GPU, render API | Não é pipeline NLE/engine export + timelines + personagens | **Referência ou candidato a player isolado**, somente se resolver decode/preview medido. |
| **libobs / OBS Studio** | Fontes, cenas, filtros, outputs, encoders, mixer e desenho em tempo real | Focado em captura/transmissão; editor NLE de busca arbitrária/frames exatos não vem pronto | **Aprender modularidade de fontes e isolamento**, não escolher como NLE sem PoC excepcional. |
| **Remotion** | React declarativo por frame, render paralelo por Chrome tabs, áudio/mídia e encoder integrado | UI do editor, Gacha e solução automática para OOM; browser tabs paralelas podem pressionar RAM | **Aprender snapshot/pipeline**, não importar por padrão. **Licença própria** com elegibilidade/limitações comerciais e proibição de certas derivações; não tratar como MIT. |
| **Mediabunny + WebCodecs** | Demux/mux e API TS de mídia, decode/encode WebCodecs e integração com UI | Cobertura varia por navegador/hardware/codec, fila/frame lifecycle, gestão de áudio, NLE Gacha | **Spike leve de preview/decodificação**, caso Chromium no Windows suporte as features. **MPL-2.0**. |
| **OpenTimelineIO** | Intercâmbio de edição/cortes e convenções de tempo | **Não renderiza vídeo**, não substitui media engine | **Interoperabilidade futura**, fora do núcleo de estabilidade. |

### O que copiar *como ideias*, não código

- **Kdenlive + Shotcut** (MLT): pipeline visual separado da timeline, proxies dos originais, thumbnails/waveform, preview render de trechos com efeitos, jobs e fallback. Kdenlive explicita que **proxy não resolve tudo**: efeitos caros podem exigir pré-renderização.
- **OpenShot** (libopenshot): time mapping por curvas, frame readers/writers, cache e controle de concorrência.
- **OBS** (libobs): `source / scene / filter / output / encoder` como módulos, CPU/GPU e hot swap; não confundir tempo real de streaming com seek aleatório de uma NLE.
- **mpv**: decode/readahead/adaptação a seeks, separação de fontes e render, limites configuráveis.
- **Blender VSE, Natron e Olive**: grafos/cache/preview por contexto; *Olive declara-se alpha/instável*, não base de produção. Natron/Blender têm licenças copyleft relevantes; extrair ideias, não código por atalho.
- **LosslessCut** (Electron/FFmpeg): bom exemplo de manter GUI no Electron e codec no processo de mídia; seu foco é trim/corte sem recodificação, **não** animação Gacha.
- **Remotion**: concorrência limitada (a documentação alerta que paralelismo excessivo causa crash) e frames por chamada; licença precisa ser tratada antes de inclusão.

**Conclusão de mídia:** FFmpeg atual **já oferece grande parte da infraestrutura que precisamos**. Uma engine NLE como MLT/GES só deve vencer se **simplificar o produto e melhorar estabilidade/perf sob stress**, incluindo empacotamento/licença. A aposta não é “MLT vs construir vídeo inteiro”; é **MLT/GES vs adaptar nosso FFmpeg + SceneIR**, com protótipos equivalentes.

## 4. Pesquisa de **renderizadores 2D e GPU** para personagens Gacha

| Tecnologia | Pontos fortes comprovados nas fontes | Dificuldade para o Native Gacha | Recomendação de laboratório |
| --- | --- | --- | --- |
| **Canvas 2D/Chromium atual** | Render e geometria Gacha já existem; tipografia CSS/Canvas próxima dos previews; nenhum runtime extra | Decoded images e readback, CPU e recursos do Chromium, inconsistências entre DOM/Canvas | **Oráculo de comportamento; baseline** |
| **PixiJS v8 WebGL/WebGL2** | Sprite batching, render groups, texturas, GPU; **WebGL é recomendação oficial de produção** | Port de máscaras/texto/layout, GC de texturas, readback para encoder; aceler. não foi comprovada no teste anterior | **Primeiro candidato visual alternativo** quando GPU real estiver funcional |
| **PixiJS WebGPU** | API moderna GPU; pode ser eficiente em algumas placas | Compatibilidade e diferenças por browser; Pixi o trata como menos maduro | **Somente PoC e fallback WebGL/Canvas** |
| **Skia nativo (C++ CPU/GPU)** | Desenho 2D maduro em Chromium/Flutter; imagem, texto, clipping, blending, transformações; BSD-3-Clause | Port integral de personagem/renderer/typography, build GN/Ninja, codecs/fontes, bridge com Electron | **Candidato nativo; não pré-requisito de mídia** |
| **Blend2D (C++ CPU)** | Rasterizador 2D otimizado/JIT com multithread, suporte a imagem e texto; licença zlib | Sem compositor audiovisual/decoder; comparar qualidade de máscaras/fontes, custo SIMD/JIT | **PoC alternativa CPU de menor escopo** se GPU indisponível |
| **ThorVG** | Vetor SVG/Lottie rápido e leve, MIT | Assets majoritariamente PNG e regras Gacha; não compõe vídeos | **Opção futura para efeitos vetoriais**, não engine principal |
| **Dawn / wgpu** | APIs GPU nativas portáveis (D3D12/Vulkan/Metal) | Abstrações de baixo nível exigem *construir nosso próprio raster 2D*, tipografia e pipelines | **Não priorizar**; fundamento técnico, não editor pronto |
| **Qt Quick/QRhi** | Scene graph e render backends Windows, Qt RHI | Troca de UI ou runtime Qt pesado sem necessidade; licença/ABI/Qrhi Private | **Não adotar** sem requisito técnico novo |
| **libplacebo** | Render/pixel conversion, scaling, HDR/tone map, shaders e GPU; **MLT 7.42 integra placebo** | Não monta personagem/fala/pose e não é NLE completo | **Possível estágio de pós-processamento**, não renderer Gacha |

**Não cometer falso atalho:** Skia ser usado pelo Chromium **não significa** que chamar Skia em C++ reproduz automaticamente o DOM, fontes e SVG do Native Gacha. Do mesmo modo, PixiJS **não garante** superioridade em leitura de pixels para FFmpeg. A comparação precisa incluir upload/readback, GPU/CPU fallback, alpha premultiplicado, máscara, CSS/texto e manutenção.

## 5. Matriz de opções **independentes** — não amarrar quatro tecnologias

Separar **três eixos**:

1. **Editor e contratos:** Electron + React + `StudioDocument` + `SceneCompiler` existente (preferência estável).
2. **Mídia/tempo/áudio:** (M0) FFmpeg subprocess/CLI e decode atual modernizado; (M1) libav* com acesso nativo; (M2) MLT; (M3) GES; (M4) libopenshot.
3. **Render Gacha/compositor:** (R0) renderer atual/Canvas 2D/DOM; (R1) PixiJS WebGL; (R2) Skia CPU/GPU; (R3) Blend2D CPU; (R4) renderer próprio GPU baixo nível **somente se exigido por provas**.
4. **Local de execução:** (E0) processo auxiliar Node/Electron `utilityProcess` ou renderer isolado; (E1) sidecar externo nativo supervisionado. **E1 não pressupõe R2 nem M2**.

Combinações a medir primeiro:

| Pipeline | Combinação | Benefício que provaria sua adoção | Preocupação |
| --- | --- | --- | --- |
| **P0 — baseline** | UI React + SceneIR TS + Canvas/DOM + FFmpeg CLI + surfaces isoladas atuais | Referência de paridade, custo e regressões | Não resolve sozinho memória se projeto inteiro fica no React |
| **P1 — JS isolado e orçado** | UI React + SceneIR TS + render em processo dedicado com caches orçados + FFmpeg atual | Menor esforço para **conter pressão de memória**, manter semântica | Processo separado não torna GPU/OS ilimitados |
| **P2 — compositor WebGL** | P1 + PixiJS (fallback Canvas) | Redução de CPU e custo de sprites no Windows | GPU pode falhar/indisponível; readback pode anular ganho |
| **P3 — NLE híbrido MLT/GES** | UI/SceneIR TS + backend MLT **ou** GES para mídia/áudio, renderer Gacha separado | Mixer/seek multitrack/formatos mais simples e robustos | Tradução Gacha→NLE e DLLs, duas pipelines |
| **P4 — renderer nativo sem MLT** | UI/SceneIR + sidecar C++ com Skia/Blend2D e libav*/FFmpeg | Reduz dependencia Chromium no raster; controle de buffers | Port caro, sincronização e manutenção C++ |
| **P5 — nativo completo** | UI/SceneIR + sidecar C++ + MLT + Skia | Integração ampla NLE + Gacha caso P3/P4 tenham vencido | Integrações e licenças máximas, **última opção, não default** |

**Recomendação de sequência:** **P0 diagnóstico → P1 limites/processos/proxy → P2 visual e P3 audiovisual em laboratório independentes → P4/P5 apenas se benchmarks justificarem.** Essa ordem ataca o relato de OOM antes de investir meses numa porta C++ sem benefício demonstrado.

## 6. Arquitetura de produção proposta: projeto leve, demanda de quadros, processos recuperáveis

`StudioDocument v1 + arquivos originais (imutáveis)`  
→ `ProjectRepository: validação, backup, migração apenas em cópias`  
→ `SceneCompiler TS: evaluate(frameIndex), eventos Gacha, z-order, tempo racional`  
→ `SceneIR serializável e versionado + AssetManifest (ID/hash/versão)`  
→ `FrameService: getFrame(frame, revision, quality, deadline)`  
→ `MediaService: decode/seek/audio clock; FFmpeg/MLT/GES intercambiáveis`  
→ `GachaRenderer: Canvas/Pixi/Skia por adaptadores; sprites e textos por IDs`  
→ `Preview frames/transporte (sem JSON gigante) **ou** Export snapshot imutável + jobs`  
→ `FFprobe, decode completo, publish atômico e registro recuperável`

### Contratos internos obrigatórios

- **Tempo:** índice inteiro absoluto do projeto a 60 FPS hoje, base racional `num/den` ao importar VFR e ao formar PTS. Um relógio mestre A/V; nunca derivar posição final apenas de `requestAnimationFrame` quando o áudio real governa o playback.
- **SceneIR:** uma chamada para o frame N retorna *exatamente* estado de personagem, boca, blink, pose, face normal/PT, balloon, vídeo ativo, ordem e transformações. Sem aplicação cumulativa de transforms a cada tick.
- **AssetManifest:** `id` opaco, hash SHA-256, tipo, dimensão e versão de renderer. PNGs/media no disco; não transportar strings `dataUrl` a cada quadro nem copiar bytes de asset para cada key.
- **Render leases:** cada frame tem `frameId`, `revision`, `timestamp`, `quality`, `byteLength`, `pixelFormat`, `colorSpace`, `stride`, owner e ACK/release. Recurso sem proprietário/expiração não entra no pipeline.
- **Preview:** request mais recente prevalece; cancelar lógico e descartar resposta de revisão antiga. **Máximo de frames e bytes em voo configurado**. Canvas de seleção/control handles é camada leve no React, não obrigatório copiar pixels a cada drag.
- **Export:** snapshot/pins v1, cache derivado, jobs/chunks/checksum e fallback serial já existentes; não usar estado mutável do playhead como fonte durante encode.
- **Integridade:** áudio do mesmo frame/tempo; alpha correto; preview 540p/720p quando necessário e export 1080p/60 **sem usar proxy na qualidade final**.
- **IPC:** comandos pequenos em canal autenticado por sessão/revision; frames em buffers de memória compartilhada ou transferíveis medidos; validar tipo, ID, tamanho, CRC/hash se necessário e caminhos permitidos.
- **Falhas:** watchdog distingue crash, timeout, OOM e cancel. Se renderer de preview morrer, editor tenta recuperar sessão sem apagar dados; export falha/reinicia com job recuperável.

### Memória: o que “limitada” precisa significar

Full HD RGBA = **8.294.400 bytes (~7,91 MiB) por frame**. 4K UHD RGBA = **33.177.600 bytes (~31,64 MiB)**. Uma cópia a 60 FPS tem tráfego teórico de ~**498 MB/s (1080p)** ou **1,99 GB/s (4K)** *antes* de outras cópias e GPU readback. Esses números são aritméticos, **não** benchmark.

- **Orçamento GLOBAL por sessão** para RAM e VRAM: agregador conta cache PNG comprimido, decodificado, atlas de textura, video decoder frames, imagem pré-render, surfaces, buffer IPC, job encode e cache semântico. Caches de disco têm orçamento distinto.
- **Orçamentos por categoria e por PID**, não apenas 128 MiB aqui e 96 MiB ali. Dois workers significam dois grupos de recursos; reduzir workers dinamicamente sob pressão.
- **Admissão e eviction por bytes e relevância temporal:** LRU de sprites/proxies, limite por resolução e visibilidade; frame fora do playhead e fora do horizonte não é mantido por padrão.
- **Qualidade adaptativa:** diminuir preview para 540p/720p, usar proxy, congelar visual pesado temporariamente em drag, limitar prefetch, reduzir de 2 workers para 1, alertar usuário e preservar trabalho.
- **Backpressure completo:** decode → render → compose → IPC → encode com filas finitas; a fase seguinte precisa liberar recursos antes de receber novos. `VideoFrame.close()` / `ImageBitmap.close()`/destroy de texturas e buffer ownership obrigatórios quando a API for usada.
- **Disco:** caching comprimido e pré-render de trechos (ex.: mudanças de pose/efeitos) com hash da revisão; invalidar segmentos afetados e manter originals imutáveis. Evitar dezenas de MP4 enormes com resave por segundo de drag.
- **Processos:** preferir isolamento de render/decoder do renderer UI. No Windows, avaliar `Job Objects` para limites/monitoramento do sidecar e árvore de subprocessos; **limitar memória pode causar falha controlada, não garante prevenção de toda falha do sistema**.
- **Desempenho previsível:** orçamento adaptado à RAM/VRAM livre do PC, com limites mínimos e máximos em MiB definidos *após profiling*, não fixar orçamento “seguro para todos” sem dados.

## 7. Contrato de paridade que **nenhuma engine pode quebrar**

Preservar, em projeto antigo e novo:

- Cabeça/corpo/pose/roupas/cabelo/acessórios, ocultações, juntas, flip, pivôs, escala/crop, transparência, layer order e efeitos.
- Face/expressões base do Customizador sem sobreposição dupla; normal sem deslocar pupilas; **PT independente esquerda/direita X/Y/rotação** herdando outros elementos faciais, fallback legado e persistência.
- Mudança de pose/expressão por blocos; transição de 15 frames, gap e borda; personagem desaparece/volta sem dar salto.
- Balões/Unicode/fontes, ligações ao speaker, boca durante `speech`, seis fases de talk e blink determinístico.
- Z-index de imagem e vídeo, fundo, quadro da mídia original no tempo correto e áudio com mute/volume por clip.
- `animated` e `static-characters` idênticos semanticamente entre preview e MP4.
- Save/load v1, undo/redo, autosave, preview fullscreen, import/export e reconciliação de assets. Links ausentes devem gerar aviso restaurável, não substituir mídia silenciosamente.

Oráculo por camadas: comparar estado semântico estruturado (ID, pose, expressão, PT, mouth/blink, geometry); depois máscara/alpha pixel por ROI e fontes; depois MP4 inteiro e áudio (PTS, frame count, drift). **SSIM alto não desculpa erro de pupila, balão ou frame.**

## 8. Plano experimental Windows por etapas, sem dependências no produto até aprovação

### G0 — Reproduzir a falha antes de substituir motor

1. Criar no PC uma **cópia não destrutiva do projeto que travou**, ou fixture sintético equivalente, perfil isolado; nunca subir mídia pessoal.
2. Repetir: abrir → inserir muitos blocos → trocar expressões/poses → Play longo → seek repetido → export, com marcador temporal por evento. Saber em qual ação o app fecha.
3. Coletar logs sanitizados de `render-process-gone/child-process-gone`, heap Blink/V8, RAM árvore (inclusive FFmpeg), VRAM, contadores de cache e timing de cada etapa. Identificar se é memory leak (cresce sem plateau), pico transitório, GPU crash, deadlock ou decoder thrash.
4. Medir com **um** worker de export e GPU real habilitada quando possível; separar bug de driver de arquitetura.
5. Criar `GOLDEN_SCENE_MANIFEST` sintético, hashes de assets e frames, testes A→B→A e save/load. A reprodução de falha nunca edita original.

**Gate G0:** relatório com hipótese mais provável sustentada por contadores/trace e baseline real; se irreproduzível, documentar limite e executar perfil sintético pesado de qualquer modo.

### G1 — Proteger o atual sem trocar engine (spike de custo baixo)

- Orçar memória por categoria/processo, corrigir retenções específicas, carregar só projeto aberto, reduzir `dataUrl` em estados/histórico, colocar assets em cache de conteúdo, limitar caches por bytes **inclusive bitmaps GPU**.
- Separar tarefas pesadas em worker/processo supervisionado e medir preview at 540/720p; usar proxies já existentes, sem degradar export.
- Filas finitas, latest-only requests e cancelamento; tratar crash de renderer com recuperação de projeto/autosave. Testar 1000 edições undo/redo e previews de 4 vídeos.
- **Gate:** projeto pesado estabiliza e UI não morre; se G1 resolver, **não há motivo automático para C++/MLT**.

### G2 — Comparar motores de mídia com **o mesmo Gacha pré-renderizado**

**Cena de controle:** 1920×1080, 60 FPS, 10–30 s sintéticos. Fundo, 2 personagens de modelos diferentes, mudanças de pose e normal/PT, fala/blink, balão, 2 vídeos sobrepostos + trilhas de áudio, gap, hold e transformação; fonte 24/25/29,97/60 e VFR em casos separados. Mesmas imagens RGBA/PNG de Gacha fornecidas para *cada* pipeline, isolando o custo audiovisual.

- **M0:** FFmpeg CLI e melhorias no reader/scheduler atual.
- **M1:** libav* em sidecar **só se** custo CLI/decoder for gargalo.
- **M2:** MLT/MLT++ headless + custom producer/raster, módulo mínimo, consumer avformat.
- **M3:** GStreamer/GES se MLT não atender e necessidade de timeline/multi-stream justificar; não fazer quatro portas nativas completas por obrigação.
- **M4:** libopenshot sob demanda se um requisito de efeitos/time mapping a favoreça.

**Métrica:** decode seek p50/p95, frame correctness e AV sync, áudio mix, intervalos com blank frame, memória agregada e pico, resize/color/alpha, CPU/GPU/threads, montagem do grafo e custo de edição incremental, crash/restart, DLL/plugin BOM e instalador Windows totalmente offline. Validar pacote sem `ffmpeg.exe` global.

**Gate:** promover biblioteca somente se ganhar em requisitos/perf/manutenção com qualidade e licença aceitáveis. Se MLT demandar converter todos os blocos Gacha em vídeo intermediário só para reproduzi-los, medir volume, invalidation e latência; pode invalidar a escolha.

### G3 — Comparar raster Gacha com motor de mídia congelado

**R0 Canvas vs R1 PixiJS WebGL vs R2 Skia CPU/GPU**, `Blend2D` como alternativa CPU se houver gargalo de raster; não comparar ao mesmo tempo com mudanças de decoder. Testar PNG sheets, alpha premultiplied, clipping, olhos/pupila PT, pose/roupa, 15 frames de interpolação, 6 fases de boca, balões Unicode, textos e 2 personagens sobrepostos. Incluir GPU desabilitada e GPU habilitada real, sem assumir que a RX 7600 falhou no teste anterior.

**Gate:** paridade visual e memória. Ganho de draw calls não basta se GPU readback/IPC para MP4 for pior. Skia só entra na produção depois de provar **um personagem completo com todos os atributos**, e uma porta incremental de catálogo/asset.

### G4 — Teste pesado **animado** e não só encode de frame estático

| Perfil | Conteúdo sintético editável | O que estressa |
| --- | --- | --- |
| **F0 — controle** | 2 atores, um balão, 1 mídia 1080p, 60 FPS, 30 s | Golden por frame, timebase e paridade |
| **F1 — personagens** | 12 atores, 200+ keys de expressão/pose, vários balões e blink/talk, 3–5 min | CPU de interpolação, imagens, undo, memória |
| **F2 — mídia** | 4 vídeos simultâneos com áudio, formatos mistos 24/30/60/VFR, 3–5 min | Decoders/seek, áudio, cache e VRAM |
| **F3 — extremo** | 24–48 atores + 4 mídias, mudança facial frequente, playback/seek/edits contínuos, 15–30 min | Plateau RAM, GC, performance e tempo de resposta |
| **F4 — duração** | Ao menos 15 min de **composição efetivamente variável**, sem “repetir frame após 301”, e export final | Crescimento real de memória, recovery e áudio longo |
| **F5 — limites/crash** | Picos de cache, GPU loss, kill sidecar/FFmpeg, mídia ausente, projeto corrompido em cópia, falta de espaço | Editor permanece vivo, projeto íntegro, fallback |
| **F6 — compatibilidade** | Projeto v1 legado, normal/PT manual, renderer fallback CPU, instalador Windows sem software extra | Sem migração destrutiva, preview/export legíveis |

**Indicadores/objetivos iniciais (ajustáveis após baseline, não resultados medidos):** zero perda/corrupção dos dados de teste; zero encerramento do **editor principal** ao matar sidecar; memória agregada deve estabilizar ou degradar preview ordenadamente ao aproximar orçamento; nenhuma fila sem limite; nenhuma divergência semântica por frame; saída final decodificável; o MP4 usa todos os frames corretos e áudio no tempo. Reportar `p50/p95/p99`, GC, RAM/VRAM pico e base, pausas UI e duração de export. **Não aprovar** uma solução só porque roda 5 s ou porque 15 min de conteúdo majoritariamente estático passam.

Comparar mínimo de 3 execuções por perfil (aquecimento separado), registrar SHA, CPU/GPU/driver, encoder real, resolução, orçamento, timestamps e hashes de frames. A tolerância visual/áudio deve ser explícita na fixture; evitar promessas rígidas antes da medição.

### G5 — Critério de promoção de tecnologia / ADR

| Critério | Bloqueio obrigatório |
| --- | --- |
| Segurança e dados | Qualquer perda, auto-migração destrutiva, paths fora da raiz ou upload involuntário é veto |
| Robustez | Editor UI morre em crash controlado de subprocesso, filas ilimitadas, crescimento indefinido ou dados não recuperáveis = veto |
| Correção | Erro de pose/expressão/olho PT/fala/gap/z-order, frame missing, áudio sem sincronia = veto |
| Windows | Não roda offline num Windows limpo, não empacota todas as DLLs/codecs/CRT, quebra aceleração/fallback = veto |
| Licenças | Um plugin obrigatório incompatível com distribuição e política do projeto = veto |
| Desempenho/custo | Avanço em NLE/qualidade/perf/manutenção **mensurável** contra baseline; caso contrário continuar simples |

Toda adoção vira ADR com links para commits/CI, binários e configuração, números A/B, decisão de licenças, rollback e dívida de manutenção. Resultados faltantes significam **“não decidido”**.

## 9. O que manter, o que substituir e o que explicitamente descartar do plano antigo

| Item anterior | Revisão após pesquisa |
| --- | --- |
| `Electron + C++ + MLT + Skia` como arquitetura “completa” | **RETIRAR como destino pré-selecionado.** Combinação possível somente se G2 + G3 + G4 justificarem as duas bibliotecas e C++. |
| MLT como primeira escolha de motor | **REBAIXAR a candidato de NLE**, competindo com FFmpeg CLI/libav e GES. MLT 7.42 é atual, mas não tem semântica Gacha pronta. |
| “Migrar o renderizador Gacha definitivamente ao Skia” | **TORNAR CONDICIONAL.** Pode manter TypeScript/Canvas/Pixi por anos se paridade e memória forem melhores. |
| “Reescrever tudo do zero” | **NÃO.** Refazer orquestração/estado/infra onde necessário; manter formatos, testes, SceneIR, catálogo e algoritmos semânticos. |
| “Usar PNG da tela por frame no IPC” | **EVITAR**: recursos ID/hash + frames transferíveis e backpressure; render asset somente na mudança de estado. |
| “Mais workers é sempre melhor” | **DESCARTAR**: orçamento único, autotuning por pressão real e serial como fallback de correção. |
| “Soak 15 min comprova animação pesada” | **CORRIGIR**: fixture histórica reutilizava frame após 301; falta soak continuamente animado. |
| “Fazer o projeto MLT XML” | **DESCARTAR**: arquivo autoral `StudioDocument v1` preservado. |
| "Importar Shotcut/Kdenlive/Olive/OBS/Natron/Blender" | **NÃO**: grandes apps, contratos e licenças próprias; aprender padrões e escrever só o adaptador necessário. |
| “WebCodecs é solução universal” | **NÃO**: testar codec, hardware, gerenciamento de `VideoFrame.close` e fila do encoder; MDN alerta que menos de 100 frames vivos podem derrubar aplicativos. |

## 10. Segurança, distribuição e licenças (checagem por **binário real**)

- **MLT/MLT++:** framework LGPLv2.1 de acordo com política oficial; **plugins variam** (`qimage` listado GPLv2), `melt` GPL; módulos opcionais e libs transitivas podem mudar a análise. Preferir subset minimalista headless; licenciar **cada** DLL/plugin embarcado. `placebo` GPU é novidade de v7.42, não tratar “tem GPU” como benchmark positivo.
- **FFmpeg/libav:** LGPL/GPL depende de flags e bibliotecas ativadas; codecs/encoders e patentes são questões separadas. Fixar versão/hash e procurar suporte real a `h264_mf`/`amf`/`qsv` sem assumir que “listed” = utilizável.
- **GES/GStreamer:** GES LGPL, módulos/plugins variam; Windows exige runtime/plugins bem empacotados e paths controlados; não depender de instalação global.
- **libopenshot:** LGPLv3+ **ou licença comercial**, com dependências como FFmpeg/JUCE sob termos próprios.
- **Skia BSD-3-Clause**, **PixiJS MIT**, **Blend2D zlib**, **ThorVG MIT**, **Mediabunny MPL-2.0**, **Dawn Apache-2.0**: auditar dependências e notices, não presumir igualdade de todos os builds.
- **Remotion:** **licença própria**, não tratar como biblioteca permissiva geral para incorporar num editor distribuído sem verificar elegibilidade/uso. **Shotcut GPLv3, Natron GPLv2, Olive/Blender e outros copyleft**: não copiar código de aplicações completas sem análise legal.
- **IPC:** validação rigorosa; nunca abrir paths arbitrários do projeto em função nativa. Sem execução de shaders/plugins/scripts desconhecidos por padrão.
- **Windows:** builds reproduzíveis, arquitetura x64, símbolos para dump local, assinatura/fallback, serviço supervisee, binários no instalador. Testes em ambiente limpo sem FFmpeg/MLT/SDK/Visual Studio no PATH.
- **Telemetria:** opt-in para diagnóstico rico; não registrar path/título de projeto, PNG, texto, rosto ou vídeo por padrão.

Checklist de engenharia, não parecer jurídico. Versões e licenças podem mudar; conferir o artefato exato **antes de distribuir**.

## 11. Execução recomendada (backlog atualizado)

**Ampliação de pesquisa — seis prioridades:** a implementação deve seguir os estudos **12 (memória e OOM) → 13 (raster Gacha incremental) → 14 (proxies/prerender) → 15 (isolamento/recovery) → 16 (clock e PTS) → 17 (stress automatizado)**. O laboratório 17 começa instrumentalmente junto do 12, mas a abordagem de implementação segue as evidências, não uma obrigação de stack.

**R0 — Definição de produto**: confirmar o foco principal nas histórias/encenação Gacha, sem perder recursos de edição de mídia. Especificar separadamente tracks de personagem (estado/pose/expressão/movimento), balões e mídia tradicional; estabilizar semântica e UX.

**R1 — Capturar o crash real em ambiente isolado e estabelecer orçamento**: scripts de stress e logging local, reproduzir projeto grande *em cópia*; evidência de RAM/VRAM da árvore, GPU e processos, sem modificar assets de produção.

**R2 — Modernização mínima com maior valor**: store/editor + cache por bytes, desduplicar assets/snapshots, limitar decoders/pre-render, filtrar imagens carregadas, proxy, backpressure, watchdog e erro recuperável. O trabalho é isolado em fatias com rollback e screenshots Windows.

**R3 — Laboratório de media backend**: M0 FFmpeg atual vs M2 MLT, e só abrir M1 libav/M3 GES/M4 libopenshot se houver razão. Mesmo SceneIR/raster, resultados MP4+AAC e seek/PTS/falhas.

**R4 — Laboratório de compositor**: R0 Canvas vs R1 PixiJS WebGL com GPU comprovada. Se consumo/cor/paridade forem insuficientes, R2 Skia CPU/GPU e Blend2D CPU. Sem alterar o motor audiovisual ao mesmo tempo.

**R5 — Decisão ADR**: escolher os adaptadores aprovados pelos gates, inclusive a possibilidade de **ficar com FFmpeg, Canvas e uma arquitetura de processos melhor**; registrar custos, o que foi rejeitado e o que permanece aberto.

**R6 — Implantar por etapas e feature flags**: projeto v1 legível → oráculo de render → preview → áudio/seek → export → otimização e GPU; remover renderer anterior só depois de testes/rollback.

**R7 — Verificar aceite de produto com o criador**: abrir cópia local de cenas grandes reais, testar diálogo/olhos PT/blink/poses, memória e export; liberar somente após CI Windows, instalador offline, hardware real e autorização específica para merge/release.

**Não fazer nesta fase documental:** criar `native/` de produção, baixar DLLs, substituir framework, editar dados pessoais, reescrever `main` ou prometer benchmark que não foi executado.

## 12. INVESTIGAÇÃO PRIORITÁRIA 1/6 — Diagnóstico de RAM/VRAM, OOM e memória limitada

**Prioridade: P0 / bloqueadora de escolha de engine.** É um fato relatado pelo criador que um projeto pesado fechou o app; **a causa exata não foi identificada**. Um limite de cache JS **não é** um limite de RAM da árvore Electron. Antes de migrar bibliotecas, produzir evidência que separe quatro classes: **crescimento retido/leak**, **pico transitório de alocação**, **pressão de GPU/decoder** e **travamento por CPU/IO/lock**.

### 12.1 Fontes externas e conclusões técnicas

1. **Electron `app.getAppMetrics()`:** lista processos associados e métricas de memória/CPU, mas intervalos de CPU são compartilhados entre chamadas. Ter **um coletor central** e correlacionar PID/tipo, não deixar cada componente consultar por conta própria. Fonte: [Electron app](https://www.electronjs.org/docs/latest/api/app).
2. **Electron `process.getProcessMemoryInfo()` e `getBlinkMemoryInfo()`:** ajudam a isolar renderer/Blink e V8, com unidades **KiB?** A documentação especifica **kilobytes**, não bytes; rotular corretamente e normalizar para MiB. Não medem, por si, todos os buffers nativos e FFmpeg. Fonte: [Electron process](https://www.electronjs.org/docs/latest/api/process).
3. **Chromium MemoryInfra:** desmembra V8, malloc/PartitionAlloc, Skia, GPU, web cache e outras partes com contexto temporal. Coletar trace apenas em **sessão diagnóstica**; tracing muda o consumo medido. Fonte: [Chromium MemoryInfra](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md) e [GPU memory tracing](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/probe-gpu.md).
4. **Windows Performance Recorder/Analyzer:** usar WPR (VirtualAllocation/Heap) e WPA (Total Commit / Commit Stack) em laboratório. `working set` mede páginas residentes; **commit** mede compromisso de memória virtual e ambos podem divergir. Atribuir custos de alocação a processos/pilhas, inclusive os filhos. Fonte: [Microsoft Memory Footprint Optimization](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization) e [WPR resource profiles](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/recording-for-resource-based-analysis).
5. **Electron crash events:** `app.on('render-process-gone')`/`child-process-gone` expõem `reason` incluindo `oom`, `crashed`, `killed` e `memory-eviction` (conforme tipo). A janela “sumiu” não revela automaticamente quem morreu; registrar todos os processos. Fonte: [Electron app](https://www.electronjs.org/docs/latest/api/app), [Crash reporting](https://www.electronjs.org/docs/latest/tutorial/crash-reporting).
6. **ProcDump/WER:** `ProcDump -m` pode capturar pico de commit em laboratório; WER LocalDumps/`-e` capturam falhas. **Dumps podem conter frames/PNG/textos/paths do usuário**; só fixture sintético, armazenamento local restrito, descarte seguro, sem CI artefacts públicos. Fonte: [Sysinternals ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump), [WER LocalDumps](https://learn.microsoft.com/en-us/windows/win32/wer/wer-settings).

### 12.2 Inventário por processo/recurso exigido

| Categoria | Contador mínimo | Onde obter | Critério de interpretação |
| --- | --- | --- | --- |
| Main/renderer/GPU/utility Electron | PID, role, RSS/working set, private/commit quando disponível | `app.getAppMetrics()` + Windows | Não somar inadvertidamente memória compartilhada como “uso real exclusivo”; reportar **agregado observado** e limites. |
| FFmpeg/FFprobe/sidecar e filhos | PID/parent PID, peak working set, private bytes/commit, exit code | Perf counters/ETW/Process Explorer, eventos do supervisor | A ausência desses filhos falseia os números históricos de consumo. |
| Heap JS/Blink | heap used/limit, DOM nodes, retained size de `dataUrl` | DevTools heap snapshot, APIs Electron, MemoryInfra | Diferenciar pico coletável de retenção pós-GC. |
| Decoded PNG/sprites | número de assets únicos, pixels ativos, bytes estimados de raster, texturas residentes | instrumentação do `AssetResolver`/renderer e traces GPU | Contador por bytes/resolução, não apenas número de PNGs. |
| Vídeo/áudio | nº de decoders ativos, frames decodificados pinados, source refs, bitrate/fps/filtros | `MediaService`/Chromium traces | 1 `<video>` pode ter múltiplos buffers internos não controlados pelo LRU JS. |
| Frame/transporte/export | bytes de RGBA, ImageBitmap, IPC in-flight, surfaces, FFmpeg pipe in-flight | `FrameService` e `VideoExportCoordinator` | Uma cópia Full HD RGBA = 8.294.400 bytes, **~7,91 MiB**. |
| Disco/cache | pasta, bytes, entradas, hashes, evictions, free disk | cache L2 e storage de proxies/prerender | Cache persistente de **512 MiB** atual é **DISCO**, não RAM. |
| UX | p95 de seek, máximo bloqueio UI, FPS apresentado, dropped frames, tempo autosave | trace + monotonic clock | CPU alta e jank não significam vazamento; correlacionar timeline de eventos. |

### 12.3 Reprodução e diagnóstico diferencial

**Sessões controladas com o mesmo commit e projeto-cópia:**

- **Controle** — 2 personagens e nenhum vídeo; registrar 3 min idle, 3 min play, 200 seeks, 100 mudanças de expressão; abrir/fechar projeto repetidamente.
- **Atores** — 12/24/48 personagens com troca de pose/expressão e fala; sem importação de vídeos. Se escalar brutalmente aqui, investigar **composição facial/dataUrl/transition cache/history** antes de mídia.
- **Mídia** — 1/2/4 decoders de vídeo com áudio; atores estáticos. Se escalar aqui, investigar **decode/cache/PTS/seek**.
- **Export** — 1 vs 2 surfaces, cache frio/quente, renderer CPU/GPU. Se explodir só aqui, investigar **readback/IPC/workers/persistent writes**.
- **Navegação** — abrir A, B, C, fechar e reabrir; observar se `studios`/catalogs/meshes permanecem referenciados.
- **Soak** — variar conteúdo visual todo o tempo, não repetir um único frame após 301; registrar warmup/steady state/recovery.

**Procedimento WPR documentável de laboratório (não é comando para rodar no perfil pessoal por padrão):**

`wpr -start VirtualAllocation -filemode` → reproduzir fixture sintética → `wpr -stop Trace.etl` → abrir `wpa Trace.etl` e analisar `Memory > Total Commit` com pilhas e processos. Validar flags e permissão da versão WPR instalada. Manter ETL/dumps **fora** do repositório e limpar com autorização.

**Análise de tendência:** comparar baseline, pico, patamar após 2 min de inatividade e repetição em ciclos; avaliar regressão da tendência/deriva de bytes por minuto **após estabilização e GC natural**. Critério desejado: memória entra num patamar plausível sob o orçamento, ou a qualidade/concurrency diminui antes do OOM. **Não “forçar GC” para maquiar leak**, não confundir ausência de devolução imediata ao SO com retenção inevitável.

### 12.4 Entregáveis e gate

- `G1_MEMORY_BASELINE.md` com tabela por PID/tipo, gráfico RAM+commit+VRAM vs tempo, logs de `render-process-gone` e `child-process-gone`, pontos de ação correlacionados, variações serial/Turbo.
- ``G1_MEMORY_DIAGNOSTICS.json`` sintético com metadados de hardware, cenário, hashes, contadores e resumo **sem informação pessoal**.
- Lista **P0–P3** de problemas com evidências e estimativa de ganhos; **nenhuma reescrita aprovada** antes de separar causa demonstrada de suspeita.

**Gate de aceite:** reproduzir ou delimitar a falha; explicar a classe de pressão de recurso; relatório de processos/VRAM/decoders/surfaces e plano de proteção verificável. Se a reprodução não ocorrer, **não inventar causa**: prosseguir com cenário sintético e marcar “diagnóstico parcial”.

---

## 13. INVESTIGAÇÃO PRIORITÁRIA 2/6 — Compositor Gacha incremental (não recriar PNG inteiro)

**Prioridade: P0/P1; maior diferencial técnico específico do produto.** O `characterRenderer` compõe modelos/poses/face e o `transitionRenderer` gera estados intermediários com `renderSavedCharacter` + crop + `dataUrl` por frame. O preview fala/blink também mantém imagens renderizadas. A pesquisa indica que o caminho barato deve ser **reutilizar recursos estáveis e trocar somente o estado facial necessário**, *se* o renderer conseguir manter a paridade das transformações e máscaras.

### 13.1 Fontes externas e consequência real

- [PixiJS 8 Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips): spritesheets/atlases reduzem texturas e ajudam batching; grupos de texturas e visibilidade afetam custos; culling exige análise porque pode ter overhead de CPU.
- [PixiJS 8 Garbage Collection](https://pixijs.com/8.x/guides/concepts/garbage-collection): texturas inativas podem persistir milhares de frames e precisam de `texture.unload()`/`destroy()` bem coordenado. **GC automático não é orçamento de VRAM suficiente para projeto Gacha com dezenas de faces**.
- [PixiJS performance skill/open-source patterns](https://github.com/pixijs/pixijs/blob/dev/skills/pixijs-performance/SKILL.md): atlas, batching, culling, pooling, preparação de upload e tipografia dinâmica. **Usar como ideias e revisar contratos estáveis da versão adotada**, não copiar blindamente fragmentos de branch `dev`.
- [Skia docs](https://skia.org/docs/): qualidade nativa 2D e transformações são possíveis, mas a biblioteca **não interpreta nosso catálogo, partes nem os offsets PT**.
- [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen): transferir desenho a Worker pode aliviar o thread da interface; **não transforma Worker em processo isolado**, nem elimina memória GPU partilhada.

### 13.2 Arquitetura candidata de personagens

`ModelAssetDefinition` (poses, partes, folhas e máscaras imutáveis)  
→ `CharacterRig` (referências/offsets sem imagem duplicada)  
→ `ExpressionRig` (base facial, normal/PT, modo blink/talk, effects)  
→ `CharacterFrameState` (frame, pose interpolada, expressão, mouth phase, blink phase, escala, transformação)  
→ **compositor de partes/atlas** → textura/bitmap da personagem ou draw direto por camada → cena Gacha final.

**Renderização por responsabilidades:**

1. **Base relativamente estável**: corpo, roupa, cabelos e máscara podem ser cacheados por revisão do modelo + pose + tipo de personagem, **quando não interpolam**.
2. **Camadas faciais**: olhos e pupilas, sobrancelhas e boca atualizados por estado; apenas **componentes cujo estado mudou** ficam dirty.
3. **Transição de pose**: partes e juntas interpoladas em cada frame; sem raster inteiro estático em transição. Cachear **definição e imagens das partes**, não uma PNG nova por cada sample salvo.
4. **Transformação de palco**: posição/escala/rotação não invalidam o raster da personagem quando são apenas transformações externas; podem invalidar compositor da **cena**, não atlas de modelo.
5. **Roupas/mascaras/oclusão**: Dirty region deve respeitar efeitos dependentes e z-order; não usar crop local que corta sombras/transparência.
6. **Texto/balões**: manter independente do personagem, versionar fontes e layout; não recalcular glyph raster por frame sem alteração de texto.
7. **Preview vs export**: exigir evaluator semântico comum e **mesmas fórmulas de geometria**; renderizadores diferentes só se ROI/pixels aprovados.

**Chaves de cache propostas** (contrato lógico, não API já existente):

- ``BaseKey = sha(modelRevision, rigRevision, poseState, garmentRevision, maskRevision, rendererVersion, quality).``
- ``FaceKey = sha(modelRevision, baseFaceRevision, expressionId, ptOverridesLeftRightXYZ, blinkMode, talkMode, faceEffectsRevision, rendererVersion, quality).``
- ``LayerKey = sha(BaseKey, FaceKey, viewportScaleClass, colorProfile, alphaMode).``
- ``CompositeKey = sha(sceneRevision, frame, zOrder, bgRevision, videoFramePTS, textRevision, quality, rendererVersion).``

A chave **não deve** incluir o frame por obrigação para dados estáveis; **deve** incluir frame/phase e interpolação para estados realmente temporais. Hash dos **bytes de asset e versão** é mais seguro do que apenas `updatedAt`. No mesmo projeto, vários estados podem compartilhar **um único asset binário** content-addressed. Use reference count/leasing por sessão, TTL e eviction por bytes.

### 13.3 Alternativas de implementação, do menor risco ao maior

| Spike | Mudança única | Medir |
| --- | --- | --- |
| **C0** | Instrumentar pipeline Canvas atual, medir vezes que gera PNG, bytes de strings, decode e crop por frame | Onde custa tempo/memória efetivamente |
| **C1** | Desduplicar sprites/PNG por hash em memória/disco e separar `state metadata` de `imageDataUrl`; preservar Canvas como renderer | RAM retida, undo/save/load e paridade |
| **C2** | Em Canvas/OffscreenCanvas, separar base/camadas face/mouth/eye, dirty region e caching por camada com qualidade múltipla | Compor 24 atores e mudar só o olho sem reconstruir roupa |
| **C3** | PixiJS 8/WebGL com atlas e descarte explícito, mesmo evaluator; registrar VRAM e upload/readback | Fps/UI latency, GPU fallback, RAM total, pixel diff |
| **C4** | Skia ou Blend2D nativo apenas se C2/C3 falharem ou licença/backend justificar | Port completo por modelo, UTF-8/emoji, máscara/PT |

### 13.4 Oráculo de expressões, preservação obrigatória

- Preset normal: não forçar pupila “para esquerda”; Preset PT: **pupila esquerda e direita independentes (X/Y/rotação)**, herdando os demais ajustes normais.
- Transição expressiva de **15 frames** onde aplicável; fase blink/talk igual em frames amostrados; frame `boundary-1` e `boundary` devem ter donos diferentes conforme contrato atual.
- Diferenças de roupa/cabelo/corpo/pivôs e máscaras têm **tolerância semântica zero**: não trocar ordem, não cortar cabelo, não mover pupila por duplo offset. Pixel-level de tipografia tem tolerância pequena documentada, não esconder bug com SSIM alto.
- Fixtures: 1 ator leve, 12 atores, 24/48 pesados, troca **só da pupila**, troca **só da boca**, troca de pose, troca de roupa, blink, fala, 2 tamanhos de modelo, transparência parcial.
- Capturas ROI: centro de olho esquerdo/direito, cantos da boca, juntas corpo/cabelo, máscaras e bordas; golden frames em canvas, preview e export.

**Gate:** demonstrar com instrumentos que a troca de componente **não** re-renderiza partes imutáveis; paridade facial PT e geral; redução ou estabilidade de memória sem ocultar estado antigo. Se C2 for suficiente, **não reescrever em C++**.

---

## 14. INVESTIGAÇÃO PRIORITÁRIA 3/6 — Pré-render inteligente de trechos, proxies e invalidação seletiva

**Prioridade: P1; melhora playback/scrub sem comprometer edição e export.** Importante distinguir **proxy de vídeo original** (reduz custo de decodificação) de **preview render da composição Gacha** (reduz custo de efeitos/transições). Essas soluções são complementares, não iguais.

### 14.1 O que Kdenlive e Blender ensinam

- [Kdenlive Timeline Preview Rendering](https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html): o editor renderiza zonas em chunks; alterações nos trechos afetados invalidam esses chunks. O manual afirma explicitamente que isso **acelera playback, não a edição**; proxies sozinhos não eliminam efeitos pesados. Separar áudio pode impedir invalidar vídeo em mudança de volume.
- [Kdenlive Proxy Settings](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html): proxies são substituídos por mídia original no **render final**, e podem ser automáticos por limiar de largura.
- [Blender Sequencer Cache design](https://developer.blender.org/docs/features/sequencer/cache/): níveis RAW, PREPROCESSED, COMPOSITE e FINAL; cache em RAM e DISCO, invalidando dependências, com diferenças de prioridade por stage e distância temporal. **Não basta um único LRU de frames finais**.
- [Blender Sequencer cache manual](https://docs.blender.org/manual/en/3.3/editors/preferences/system.html): cache/limites em RAM/disco configuráveis, leitura de proxies e impactos de compressão.

### 14.2 Desenho proposto (Gacha-specific)

`Original media` → `proxy cache` (720p/540p H.264 intraframe ou codec medido)  
`SceneIR at frame` + `Gacha asset manifest` + `previewQuality` → `preview chunks` de composição (cache temporário de vídeo/RGBA comprimido)  
`FullQuality Export` → sempre `original media + full-resolution assets + evaluator`; preview cache só quando proveniência, alpha/codec/quality permitirem sem perda.

**Dois níveis de cache com funções diferentes:**

1. **L1 RAM por bytes e revisão**: 1–N frames mais prováveis (atual, próximo e anterior); texturas decodificadas e rasters curtos; liberação sob pressão.
2. **L2 DISCO por chunks**: limites em GiB configurados em função do espaço livre; arquivos cache-derived versionados e hashes; limpeza transacional; nenhum projeto original nesse local.

**Chunk e invalidação** (proposta, calibrar no laboratório):

- Separar a timeline em **janelas de 1–2 s** para preview — valor inicial *hipotético*, não obrigação; não reutilizar cegamente os **600 frames de chunk de export** em vídeo de edição interativa.
- Cada chunk tem `startFrame/endFrame`, `sceneRevision`, `quality`, `codecVersion`, `assetHashes`, `rendererVersion`, `manifestHash`, `dependencyRanges`.
- Mudança de expressão/pose em frame F invalida **o intervalo visual influenciado**, incluindo **janela de transição precedente de até 15 frames** e todos os frames onde o estado passa a valer; considerar blocos seguintes e modo de hold.
- Troca de posição global de personagem invalida as **composições** em que o personagem aparece; não invalida base de roupa/textura se transform externo.
- Mudança de balão/fala invalida **texto + boca do speaker** no intervalo do balão, e efeitos temporais relacionados; áudio altera seu próprio cache/mix, não força raster de imagem se não muda boca.
- Vídeo importado trim/seek/fps/transform invalida trechos onde entra no composite e A/V alinhamento, não imagens da base facial.
- Mudança de fundo, z-order, cor/escala/câmera ou perfil de render invalida a região/intervalos dependentes.
- Edição repetida por drag usa `revisionId`: chunks antigos ficam marcados obsoletos; **não** interromper/recomeçar encode pesado em todo pixel do mouse. Debounce + agrupar gesture; background worker de prioridade inferior ao preview.
- **Não criar cache infinito**: eviction por byte+último uso+distância do playhead+custo de recompilar; limiar de free disk e limpeza auditável. Chunks incompletos permanecem `.tmp` e nunca são usados como “green/cached”.

**Formato de preview chunk:** testar lossless/visualmente aceitável (incluindo alpha quando necessário) contra H.264 de visualização; medir decode seek ao começo/meio/fim do chunk, tamanho e RAM. Chunk contêiner sem keyframe no início pode ser difícil de buscar — configurar keyframes de limites ou usar formato de acesso aleatório. **Áudio continua temporalmente sincronizado** pelo mixer autoritativo e não reaproveita áudio comprimido inconsistente.

### 14.3 Tabela de estados e política de UI

| Estado cache | Cor UI sugerida | Regra |
| --- | --- | --- |
| ``missing`` | neutro | Render ao vivo com qualidade adaptativa. |
| ``rendering`` | progresso | Gerar no background, sem bloquear Play nem edição. |
| ``ready(version)`` | indicador discreto | Usar se revisão, hash, resolução e codec conferem. |
| ``stale`` | aviso local | Ignorar chunk e voltar a render ao vivo; reconstruir sob demanda. |
| ``failed`` | aviso recuperável | Erro no cache **não corrompe projeto** e não falha export original. |

**Gate:** editar frame F invalida só chunks dependentes; 1000 ciclos undo/redo não deixam cache sem chave válida; preview do trecho pesado melhora sem aumentar RAM indefinidamente; download/instalação de codec inexistente não é exigido. A qualidade final **nunca** usa proxy inferior acidentalmente.

---

## 15. INVESTIGAÇÃO PRIORITÁRIA 4/6 — Isolamento de processos, protocolos e recuperação de falhas

**Prioridade: P0/P1 para robustez; não depende de C++.** O usuário quer que o Native Gacha continue aberto mesmo se um decoder ou renderer falhar. Não é possível prometer isso ao OOM do **SO inteiro**; o desenho deve limitar trabalho antes do esgotamento e preservar dados do editor independentemente do render.

### 15.1 Opções de isolamento, baseadas em documentação

| Mecanismo | Força | Limite/risco | Uso recomendado |
| --- | --- | --- | --- |
| **Web Worker + OffscreenCanvas** | tira tarefas de desenho da thread da UI, transfer de `OffscreenCanvas` e `ArrayBuffer`; nenhuma dependência C++ | normalmente **mesmo processo/limites de memória**, não isola OOM total de renderer; compat de codecs/fontes GPU | **Spike barato de CPU/jank**, nunca chamar de supervisor de memória. |
| **Electron `utilityProcess`** | processo Node separado, comunica por MessagePort; Electron o documenta para CPU intenso e componentes crash-prone | não oferece automaticamente API DOM/HTMLVideoElement/WebGL; se renderer Gacha depende disso, precisa de surface/worker apropriado | **Candidato para orquestração/IO/compilação/snapshot**, não pressupor que substitui o render DOM. |
| **`BrowserWindow` oculta/offscreen isolada** | renderer Chromium com Canvas/video/WebGL e processo (se isolado) que pode morrer sem derrubar main | processo isolado deve ser **verificado por PID**; GPU shared resources, overhead de surface e IPC/bitmap | **Opção pragmática com contratos atuais**, avaliar se renderer de export já atende. |
| **Sidecar executável (Node ou C++)** | isolamento OS, supervisor e política de recursos próprios; integração com DLL/MLT/GES/libav | builds/packaging, pipes/shared memory, restart, font/asset path, licenças | **Somente se o teste exigir controle nativo ou processo de mídia especializado**. |
| **Windows Job Objects** | agrupa processos e permite limites, notificações e contabilização por job | associar processos/process-tree requer cuidado com processos próprios Electron; limites rígidos podem matar job inesperadamente | **Aplicar ao subtree de engine/FFmpeg em laboratório**, não ao app/UI inteiro. |

Fontes: [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [OffscreenCanvas transfer](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen), [MDN Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects), [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [Node worker resourceLimits](https://nodejs.org/api/worker_threads.html). **A documentação Node esclarece que `resourceLimits` restringe V8, não memória externa/ArrayBuffer: não usar como limite total de RAM.**

### 15.2 Protocolo tipado e supervisão (proposta)

Comandos pequenos sobre canal de controle (IPC/MessagePort/Named Pipe):

- ``hello(protocolVersion, rendererVersion, capabilities)`` → concordância e fallback se incompatível.
- ``openSession(studioId, manifestHash, assetRefs)``; jamais interpretar path arbitrário sem autorização e validação da raiz.
- ``updateScene({revision, semanticDiff})``; coalescer gestos e remover updates de revisão antiga.
- ``render({frame, revision, quality, requestId, deadlineMs})`` → frame lease com pixelFormat/colorSpace/stride/owner/release; **latest-only** para scrub.
- ``play({clockEpoch, projectFrame, rate}) / pause / seek(...)``; um único scheduler toma decisão sobre frame apresentado.
- ``startExport({immutableSnapshotHash, jobId, codecProfile})``; jobs idempotentes e **não** aceitam UI state mutável.
- ``releaseFrame(leaseId)``, ``heartbeat``, ``status``, ``cancel``, ``closeSession``, ``shutdown``.

**Fila/scheduler:** prioridade `uiInput > audioClock > requestFrame latest > previewPrefetch > exportBackground > thumbnails/cache`; **não** deixar export esgotar a GPU/decoder utilizado pela UI. Um export pode ter processo separado com share de recursos limitado, mas em cenário extremo o correto é reduzir worker/concurrency ou pausar prefetch.

**Orçamento global com admission control** (modelagem sugerida, não implementação atual):

`reserveBytes(category, bytes, priority)` só autoriza decode/raster/IPC quando há orçamento; se indisponível: expulsar caches não essenciais → cancelar prefetch → diminuir preview → baixar workers → oferecer pausa/erro amigável. **Só matar processo por política de proteção depois de autosave confirmado e preservar recovery.** Garantir explicitamente que recursos “in-flight” contam, ainda que fora do cache LRU.

**Leases e liberação:** imagem renderizada pode ser `ImageBitmap`/`VideoFrame` (ambos com `close()`) ou `ArrayBuffer` transferível; fechar/release após ACK no consumidor e jamais reusar texture antes de fence. [MDN transferables](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) mostra transferência com *detachment* no remetente; transferência de objeto não garante zero-cópia em toda implementação/caminho. Antes de construir SharedArrayBuffer/sharedTexture, medir throughput, memória e segurança.

### 15.3 Máquina de estados pós-falha

`healthy` → `degraded` (memória alta: prévia reduzida) → `lost` (sidecar crash/timeout/OOM) → `restartPending` → `rehydrating(snapshot imutável)` → `healthy` ou `safeMode`.

- UI nunca depende de esperar uma Promise de renderer sem timeout/rejeição; GPU loss exige liberar recursos e cair para Canvas CPU/low quality.
- Persistência e export têm isolamento lógico: **autosave transacional + journal/última geração confirmada**, sem apagar a versão anterior até escrita verificada.
- Se o **renderer UI** morrer, usar eventos do main, salvar/autorecuperar sessão com último documento já persistido; código não consegue salvar alterações que só existiam no heap de um processo morto, portanto **salvar frequentemente e evitar estado exclusivo em renderer**.
- `kill - crash - restart` sintético: confirmar que projeto não é perdido, nenhum MP4 parcial é publicado e consegue reabrir.
- Contar nº de restarts e aplicar backoff/`safeMode` para impedir loop de crashes. Limitar logs/dumps e não armazenar conteúdo privado.
- Export jobs existentes (`videoExportJobs.ts` + snapshot/sha/chunks) são **ativos de valor** a adaptar, não reiniciar do zero.

**Gate:** matar **somente** a engine/decoder isolado durante Play/export → main Electron e editor preservados, erro visível, projeto seguro, fallback/restart e nenhum output parcial. Testar também GUI renderer crash separadamente: recuperação via último autosave é o requisito realista.

---

## 16. INVESTIGAÇÃO PRIORITÁRIA 5/6 — Áudio/vídeo com relógio único, PTS e seek frame-exato

**Prioridade: P1, segurança de sincronização.** O código atual `VideoStudioEditor.tsx` calcula o playhead com `performance.now()/requestAnimationFrame`; cada `VideoStudioClipPreview` tem `HTMLVideoElement` e `VideoMediaPlayback` tenta corrigir `currentTime` quando desvia. No export, o `buildVideoStudioAudioPlan` usa `atrim/aresample/volume/adelay/amix` por clipe via FFmpeg. Em projetos com 2–4 mídias, o novo desenho deve ter **um único tempo de apresentação**, não múltiplas correções mutuamente independentes.

### 16.1 Fontes técnicas e decisão

1. **GStreamer clocks:** distingue relógio absoluto, `running-time`, `stream-time`, `base-time` e `SEGMENT`; todos os elementos de uma pipeline compartilham o mesmo relógio para sincronizar. Isso é um **padrão de projeto aproveitável independentemente de usar GStreamer**. Fonte: [GStreamer clocks](https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html).
2. **`requestVideoFrameCallback`:** informa `mediaTime`, `presentationTime`, `expectedDisplayTime` e `presentedFrames`; bom para observar frame efetivamente apresentado, mas **não promete callback em todo frame a 120fps numa tela de 60Hz nem garantia exata de vsync**. Fonte: [MDN rVFC](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
3. **AudioContext `getOutputTimestamp()`:** relaciona `contextTime` e `performanceTime` da saída real de áudio; candidato a referência para playback com áudio, sujeito a latência. Fonte: [MDN AudioContext.getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).
4. **FFmpeg `aresample`:** pode compensar timestamps por inserção/corte/stretch conforme configuração; usar com critério e medir drift, não “corrigir áudio até parecer certo” ocultando bug temporal. Fonte: [FFmpeg filters / aresample](https://ffmpeg.org/ffmpeg-filters.html).
5. **ffprobe frames/packets:** inspeciona PTS, DTS, duração e streams; validar *decoded frame PTS*, não derivar VFR de FPS nominal. Fonte: [ffprobe](https://ffmpeg.org/ffprobe.html).
6. **MLT producer/consumer:** `mlt_frame` contém imagem e áudio, com avaliação sob demanda; pode ser um candidato de backend, **não obrigatório**. Fonte: [MLT framework](https://mltframework.org/docs/framework/).

### 16.2 Contrato temporal proposto

- **Edição:** o `StudioDocument` de hoje usa **60 fps** e frame inteiro `N`. Definir intervalos semiabertos `[startFrame,endFrame)` para vídeo, texto e gaps, preservando borda atual. Sem mudar schema v1.
- **Tempo canônico:** `projectTime = N / 60` para avaliação frame-exata do Gacha. Em runtime/backend, representar `timeNumerator/timeDenominator` ou ticks inteiros, **não** acumular `0.016666...` em `number` a cada tick.
- **Mídia importada:** converter tempo do projeto → tempo do clipe relativo → **PTS de apresentação da fonte**; desconsiderar suposição de que “source frame index = N/60” quando o arquivo é 23.976/29.97/VFR. Precisar de política explícita de amostragem (ex.: último frame apresentado com `PTS <= target`, documentando tolerância e frame boundary).
- **Tempo do áudio:** buffer PCM e resampler seguem relógio de reprodução ou timestamps da media engine; áudio não deve ser reiniciado arbitrariamente a cada atualização React do playhead.
- **Relógio autoritativo:** em Play com áudio, preferir relógio efetivamente associado à saída/mixer (se backend suportar); em scrub pausado, **o frame solicitado é absoluto** e não precisa reproduzir todos os anteriores; em export, relógio determinístico de **N/60**, sem depender de wall clock ou `requestAnimationFrame`.
- **A/V skew:** monitorar `presentedVideoPTS - audioClockPTS` e dropped/late frames, evitando “corrigir” com pausas globais frequentes. Em atraso de preview, mostrar frame mais atual/descarte **somente na prévia**; export **nunca** descarta quadro para acompanhar realtime.

### 16.3 Plano de seek/prefetch

1. `seekTo(frame, revision)` invalida requisições pendentes inferiores e entra em **paused/exact**; apresentar somente resposta para aquele frame/revisão; A→B→A precisa mostrar A correto mesmo com decoders ocupados.
2. Decoder de vídeos com B-frames procura keyframe anterior e avança até o PTS desejado; o custo é medido por formato/codec, não por “seeked” sozinho. Prefetch por horizonte ajustado à velocidade/pressão RAM.
3. Clipe com trim/corte mapeia `project N` em `source PTS`; gap retorna alpha/sem áudio conforme contrato; limites de clip e de mídia ausente devem gerar estado explícito.
4. Se 4 vídeos estiverem ativos, o sistema prioriza decoders **visíveis** e audio emitido; não manter decoders de clipes fora da janela temporal apenas porque estão na timeline.
5. Em Play, amostrar personagens no frame derivado do relógio mestre; boca/blink determinísticos continuam resolvidos pelo `SceneIR`, sem loops de animação locais em desacordo com a timeline.

### 16.4 Fixtures de validação A/V

- Mídia sintética com **bip e flash** simultâneos a intervalos conhecidos, incluindo primeira e última boundary do clipe.
- 24, 25, 24000/1001, 30, 30000/1001, 60 FPS e **VFR real**; duração curta e longa, B-frames e variável de áudio 44.1/48 kHz.
- Um vídeo sem áudio; 2/4 vídeos com mix de volumes, mute e silêncio; fade/corte; seek repetido A→B→A; Play após pausa; source trim com offset e áudio.
- Comparar `ffprobe` frames/packets, decode integral, picos áudio PCM, número de frames exportados e **medição de desvio em milissegundos por evento de teste**. Escolher tolerância e rounding por contrato, não inventar “sample-accurate” antes da medição.
- Em Preview, registrar `presentedFrames`, `mediaTime`, p95 atraso e skew; na export, áudio/PTS reproduzíveis sob mais/menos workers.

**Gate:** zero frame errado nas boundaries Gacha, mídia no PTS declarado, áudio coerente com o mesmo relógio, sem crescendo de fila/decoder ao repetir seek. Se FFmpeg atual + controlador próprio atingir isso, não precisar de GES/MLT.

---

## 17. INVESTIGAÇÃO PRIORITÁRIA 6/6 — Laboratório pesado, automação Windows e regressões

**Prioridade: P0 para validar todas as outras.** Não usar somente unit tests ou soak de encoder com frame repetido. Construir **laboratório que gera e opera projetos sintéticos editáveis**, com evidência por commit/hardware, comparação de pixels/semântica, vídeo/áudio e recursos do sistema.

### 17.1 Ferramentas e limites

- **Playwright Electron**: suporta lançamento e controle de app Electron, cliques, Play/seek, screenshot e automação. Integração marcada como **experimental** na API; usar testes nativos já existentes do repo onde forem mais confiáveis. Fonte: [Playwright Electron](https://playwright.dev/docs/api/class-electron).
- **Playwright tracing**: gravar trace **em falha ou amostra**, pois screenshots/DOM snapshots têm custo e podem incluir dados sensíveis; fixtures sintéticos apenas. Fonte: [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer).
- **Windows WPR/WPA/ProcDump**: traces de RAM/CPU/heap, commit stack e dumps controlados; não coletar minidumps de projetos pessoais no CI. Fontes: [Microsoft WPR/WPA](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization) e [ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump).
- **ffprobe + full decode:** validar container H.264/AAC, contagem de frames, ordem PTS, duration, audio, truncated media e primeiros/últimos frames. Fonte: [ffprobe docs](https://ffmpeg.org/ffprobe.html).
- **Harness existente:** `tests/video-*.test.cjs`, `scripts/video-studio/*`, `LOCAL_HARDWARE_REPORT_2026-10-20.md` e Windows Electron UI tests são a baseline. **Reusar sem inferir que a suite atual prova stress**.
- **Separação de níveis:** Node unit/geometry → integration engine → Electron GUI real → stress de processos → instalador Windows offline. Linux só complementa; **gate de produção é Windows**.

### 17.2 Matriz de cenários fatorial (controla causa)

| ID | Cenário | Variáveis dominantes | Valida |
| --- | --- | --- | --- |
| **U0** | Estático, 2 personagens, 0 mídia, 1 min | baseline heap/GPU/idle | custo mínimo e retenção após fechar |
| **U1** | 12 personagens, 100–300 keys, 3 min | pose+expressão+blink+mouth sem vídeo | interpolação e `dataUrl` |
| **U2** | 24 personagens, variações de pupila PT L/R, 5 min | faces/máscaras/atlas/cache | paridade facial e memory plateau |
| **U3** | 48 personagens, 1.000 keys, 15 min | limite extremo, GC, autosave/history, UI responsiveness | proteção e degradação controlada |
| **V1** | 1/2/4 vídeos com áudio, cena Gacha estática | decoders/seek/PTS/VFR | custo mídia isolado |
| **V2** | vídeos VFR + B-frames + flash/bip + 2 atores animados | A/V, source trim, barriers e frame count | sincronização |
| **M1** | projeto misto 12/24 atores, 4 vídeos, vários balões, 15 min **com todos os quadros mudando** | renderer + audio + encode e cache | stress real, não só duração de container |
| **E1** | 1 vs 2 workers; cache cold/warm; CPU/GPU toggles | recursos por subprocesso/surface | autotuning, fallback |
| **C1** | encerrar sidecar, GPU loss simulado, renderer timeout, mídia ausente | recuperação e integridade | não perder projeto/MP4 parcial |
| **P1** | projeto v1 legado/cópia local + offline Windows portátil | compat e empacotamento | sem migração, SDK global nem privacidade comprometida |

**Importante:** cargas U3/M1 são **extremas**; o critério pode ser **não travar nem perder dados**, mesmo que preview tenha que diminuir qualidade ou pausar, e **não** necessariamente “60 FPS em 48 atores com quatro vídeos” num PC com RAM limitada.

### 17.3 Operações que o harness precisa executar

1. `createSyntheticProject(seed, actors, keys, mediaCount, duration, speechDensity)` → arquivo em pasta temporária isolada + hash/manifest. Assets Gacha podem ser gerados apenas a partir de peças de teste com licenças adequadas. Nunca capturar biblioteca pessoal em CI.
2. `openProject(copy)`; registrar estabilidade após carregamento. Executar Play 60 s, seek 200× com A→B→A e scrubbing reverso, pausas e replays; comparar golden frames e áudio.
3. Em cada cenário, inserir/editar/remover centenas de keys, fazer undo/redo e salvar; reiniciar Electron e checar **byte-safe roundtrip** do v1 (sem troca indevida de PNG/expressão PT).
4. `export(variant=animated/static-characters)` para 1080p/60, cancel em vários pontos, reiniciar, resume e verificação do MP4 (ffprobe + decode completo + hashes quando reproduzível).
5. `faultInjection`: matar **apenas** processo de render ou FFmpeg, forçar timeout, invalidar cache temporário (nunca original) e injetar pouca memória em processo de teste isolado. Verificar se janela principal permanece viva e se projeto reabre.
6. Repetir com Preview em 540/720/1080p, cache on/off, um ou dois workers, hardware acceleration ativada/desativada, sem alterar simultaneamente outras variáveis.
7. Salvar relatório por job contendo commit, SHA de assets sintéticos, Windows build, RAM/CPU/GPU/driver, binários FFmpeg/MLT/GES, codec/perfil, export settings, mediana/p95 e erro.

### 17.4 Métricas e análise comparativa A/B

**Métricas diretas:** `rssMiB/commitMiB/privateBytesMiB/VRAMMiB` por PID e árvore; pico **e** estabilização/variação no tempo; `time-to-first-frame`, fps efetivo, p50/p95/p99 de seek e render, dropped/late frames, pausas de UI, número de decoders, caches L1/L2 e bytes em voo; duração export, bitrate/codec real, A/V drift, crash/restart e perda de conteúdo.

**Oráculos:** (i) `evaluateVideoSceneFrame` semântico frame a frame; (ii) rasters em ROIs de olhos/PT, roupas, boca, texto e z-order; (iii) áudio flash/bip e PTS; (iv) snapshot imutável/sha e MP4 final verificado. Serial de export permanece **oracle** até um candidato provar equivalência.

**Repetições e estatística:** ao menos três rodadas *medidas* por variante com aquecimento separado, ordem alternada entre versões para reduzir aquecimento de cache e thermal drift; registrar distribuição e hardware. O erro visual/texto exige tolerâncias previamente declaradas; as semânticas não admitem diferença.

**Critérios iniciais propostos (não SLAs aprovados):**

- **0** corrupção de projeto original ou publicado incompleto em qualquer cenário;
- **0** encerramento do processo principal provocado por **falha injetada apenas na engine**, embora morte de renderer/UI/OS seja cenário distinto e reabra pelo último autosave;
- **0** filas indefinidamente crescentes; uso entra em patamar ou controlador reduz concorrência/preview antes de OOM;
- **0** mudança errada de pose/expressão/PT, boca/balão ou frame na fronteira;
- A/V e qualidade avaliados por amostras de PTS/golden com limites documentados, não percepção subjetiva;
- Export full-quality independente de cache de preview e de frames dropados durante playback;
- Instalador abre em Windows limpo sem mídia/SDK/FFmpeg instalado globalmente.

O número mínimo de quadros/s em carga extrema **será decidido depois da primeira baseline**. Se o PC não conseguir 60 FPS, o editor pode exibir 15/30 FPS temporários, mas preserva cronologia do projeto e 60 FPS no arquivo final.

### 17.5 Artefatos de engenharia futuros e plano curto de execução

| Entregável | Conteúdo | Pronto quando |
| --- | --- | --- |
| `STRESS_SCENARIOS.md` | IDs U0–P1, seeds, variantes, timings, perfis e licenças das fixtures | reproduzível em Windows sem bibliotecas do usuário |
| `MEMORY_PROBE.md` | coleta de processos, GPU, limits, traces, privacy e interpretação | identifica processo responsável e pico vs leak |
| `FRAME_PARITY_MANIFEST.json` | assets sintéticos e golden semântico/visual+PTS | diferenças sinalizadas por frame e ROI |
| `STRESS_REPORT_<commit>.md` | tabela A/B, grafo RAM vs tempo, crashes, CPU/GPU e versões | evidência verificável, sem promessas genéricas |
| `ADR-ENGINE-DECISION.md` | adotar/rejeitar Canvas/Pixi/Skia × FFmpeg/MLT/GES e processos | razões e rollback registrados, aprovação explícita |
| `WINDOWS_OFFLINE_GATE.md` | portable/instalador, dependências/licenças e smoke | roda/reabre/exporta sem nada do PATH externo |

**Execução em fatias:** T0 instrumentação/projeto sintético; T1 reproduzir/triar OOM; T2 teto global e caches; T3 camadas Gacha; T4 preview chunks; T5 isolamento/recuperação; T6 clock/PTS; T7 engine A/B; T8 gate longo Windows. Cada mudança tem feature flag, teste de regressão e rollback. **Não começar construindo MLT, Skia ou migrando o schema** antes de T0–T3 fornecerem dados.

---

### Fontes adicionais consolidadas para as seis investigações

| Tema | Documentação primária |
| --- | --- |
| Memória | [Electron app metrics](https://www.electronjs.org/docs/latest/api/app), [process memory](https://www.electronjs.org/docs/latest/api/process), [Chromium MemoryInfra](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md), [Windows WPA](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization), [ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump) |
| Gacha/2D | [PixiJS performance](https://pixijs.com/8.x/guides/concepts/performance-tips), [PixiJS texture GC](https://pixijs.com/8.x/guides/concepts/garbage-collection), [Skia](https://skia.org/docs/), [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen) |
| Preview/cache | [Kdenlive preview rendering](https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html), [Kdenlive proxy](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html), [Blender sequencer cache internals](https://developer.blender.org/docs/features/sequencer/cache/) |
| Falhas/IPC | [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [Crash reporting](https://www.electronjs.org/docs/latest/tutorial/crash-reporting), [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [Transferables](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) |
| AV | [GStreamer clocks](https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html), [rVFC](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [AudioContext timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [ffprobe](https://ffmpeg.org/ffprobe.html) |
| Testes | [Playwright Electron](https://playwright.dev/docs/api/class-electron), [Playwright tracing](https://playwright.dev/docs/trace-viewer), [WPR/WPA](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization), [ffprobe](https://ffmpeg.org/ffprobe.html) |

**Nota editorial:** Este documento continua sendo uma investigação e um plano técnico, **não uma afirmação de que as mudanças já foram implementadas ou benchmarkadas**. Links são referências abertas e ideias; licenças e APIs precisam ser validadas na versão exata da dependência que um dia for escolhida.

## 18. Referências gerais de engines/frameworks (verificadas 23/10/2026)

**Mídia/NLE:**  
[MLT framework/producer-consumer](https://mltframework.org/docs/framework/) · [MLT++](https://mltframework.org/docs/mlt%2B%2B/) · [MLT 7.42 release 03/10/2026](https://www.mltframework.org/blog/v7.42.0_released/) · [MLT license policy](https://mltframework.org/docs/copyrightpolicy/) · [MLT qimage GPL](https://www.mltframework.org/plugins/ProducerQimage/) · [MLT placebo/render](https://mltframework.org/plugins/FilterPlacebo-render/) · [GES architecture](https://gstreamer.freedesktop.org/documentation/gst-editing-services/) · [GStreamer Windows deployment](https://gstreamer.freedesktop.org/documentation/deploying/windows.html) · [FFmpeg libraries](https://ffmpeg.org/doxygen/trunk/md_README.html) · [FFmpeg legal](https://ffmpeg.org/legal.html) · [libopenshot features/license](https://www.openshot.org/libopenshot/) · [libmpv API](https://github.com/mpv-player/mpv/blob/master/include/mpv/client.h).

**Editores e boas práticas:**  
[Kdenlive architecture](https://github.com/KDE/kdenlive/blob/master/dev-docs/architecture.md) · [Kdenlive proxies](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html) · [Kdenlive timeline preview render](https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html) · [Shotcut dependencies](https://github.com/mltframework/shotcut) · [OBS libobs backend](https://docs.obsproject.com/backend-design) · [Remotion concurrency](https://www.remotiondocs.com/docs/terminology/concurrency) · [Remotion license](https://www.remotion.dev/docs/license/pricing) · [Remotion video limits](https://cloudrun.remotion.dev/docs/video-vs-offthreadvideo) · [Olive alpha status](https://github.com/olive-editor/olive/blob/master/README.md) · [Natron](https://github.com/NatronGitHub/Natron) · [LosslessCut Electron](https://github.com/mifi/lossless-cut).

**Renderização:**  
[PixiJS production WebGL](https://pixijs.com/guides/components/renderers/) · [Skia 2D docs](https://skia.org/docs/) · [Skia license](https://github.com/google/skia/blob/main/LICENSE) · [Blend2D SIMD/JIT](https://blend2d.com/) · [ThorVG](https://www.thorvg.org/) · [Dawn/WebGPU](https://github.com/google/dawn) · [Qt RHI](https://doc.qt.io/qt-6/topics-graphics.html) · [libplacebo](https://libplacebo.org/renderer/).

**Memória/isolamento:**  
[Electron process memory](https://www.electronjs.org/docs/latest/api/process) · [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) · [Electron render-process-gone/OOM](https://www.electronjs.org/docs/latest/tutorial/crash-reporting) · [Electron OSR/shared texture](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) · [WebCodecs lifecycle and backpressure](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API) · [VideoFrame.close](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/close) · [Mediabunny](https://mediabunny.dev/guide/introduction) · [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

**Fonte factual do Native Gacha:** os arquivos citados nas seções 1–2 deste mesmo commit e `docs/VIDEO_STUDIO_V5_MODERNIZACAO/LOCAL_HARDWARE_REPORT_2026-10-20.md` (histórico com limites claros).

---

**Síntese de decisão:** **o problema do criador é robustez no stress, não falta de uma lista de bibliotecas.** A primeira entrega técnica é um **diagnóstico de memória real + proteção contra OOM + adaptação modular reversível**, com benchmarks Windows. **MLT é opcional; Skia é opcional; C++ é opcional; processos isolados, budgets e paridade de dados não são opcionais.** A escolha final é feita por evidência, nunca por preferência estética de stack.
