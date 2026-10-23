# Video Studio G-V5 — Reavaliação da reconstrução estrutural e hipótese Electron + C++ + MLT + Skia

**Data:** 23/10/2026  
**Status:** documento de decisão arquitetural **provisória**, sem autorização implícita para substituir o motor, migrar arquivos ou distribuir binários.  
**Referência auditada:** repositório `nestarasup-sys/Native-gacha`, branch `feature/model-source-editor`, commit `7f5f9ec9c7c6bc33b312e2720fd199b6f0180446`.  
**Produto:** Video Studio. Fabricador DEV, Customizador e Studio Principal ficam fora da reconstrução.

> **Recomendação:** é razoável reconstruir a organização interna do Video Studio, originalmente experimental, **mas não escolher MLT + Skia como dependências obrigatórias antes de uma prova comparativa no Windows**. Manter Electron/React; preservar formatos de projeto e semântica de personagens; extrair uma arquitetura de editor e motor desacoplados; decidir engine com paridade visual, áudio, seek, benchmarks, licenças, distribuição e recuperação.

## 1. Relação com o planejamento existente

O repositório **já contém planejamento extenso** em `docs/VIDEO_STUDIO_V5_MODERNIZACAO/`: `00_PLANO_DIRETOR.md`, `01_ESTUDO_DE_MOTORES.md`, `02_ARQUITETURA_CANONICA.md`, `03_MIGRACAO_E_DADOS.md`, `04_LAB_E_GATES.md`, `05_DECISOES_ADR.md`, `06_BACKLOG_DE_EXECUCAO.md`, `07_MODOS_DE_EXPORTACAO.md`, `08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md`, `10_RELEASE_CHECKLIST.md` e `11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md`.

Este documento **complementa** esses estudos, não os substitui. Vários estados em documentos antigos são históricos. **O código no HEAD e a CI Windows vencem descrições obsoletas.** Alguns textos se referem ao repositório `G-V5` e à branch `master-desenvolvimento`: esses destinos são históricos; na rodada presente, toda escrita ocorre **somente** em `Native-gacha/feature/model-source-editor`. Nunca tocar ou mesclar em `main` sem autorização explícita.

## 2. Estado real da implementação

| Responsabilidade | Código existente | Conclusão do diagnóstico |
| --- | --- | --- |
| Interface e orquestração | `src/renderer/src/features/videoStudio/VideoStudioEditor.tsx` (~2.500 linhas/180 kB); `VideoStudioEditor.css` (~60 kB) | Editor concentra funções demais: seleção, biblioteca, elenco, expressão, save, export e playback. **Reestruturação recomendada**. |
| Timeline | `VideoTimeline.tsx` (~596 linhas/51 kB), `videoTimelineIndex.ts`, `src/shared/videoTimelineEditing.ts` | Tracks de personagem, expressões/poses, lacunas, balões, vídeo, áudio, split, resize, zoom, lock e snapping já existem. MLT não substitui essa semântica automaticamente. |
| Dados persistidos | `src/shared/studio.ts`: `StudioDocument` e `VideoTimelineDocument` | `schemaVersion: 1` e `frameRate: 60`; keys e duração em frames, mídia importada, áudio, texto e estados faciais. **Contrato autoral a preservar**. |
| Compilação | `src/shared/videoSceneIR.ts` | `compileVideoScene` / `evaluateVideoSceneFrame` resolvem estados absolutos, ordem de layers, transições, blink, mouth, gaps e vídeo por frame. Já há um núcleo semântico reaproveitável. |
| Composição | `videoCanvasCompositor.ts`, `videoCharacterFrameRenderer.ts`, `VideoStudioDomElement.tsx` | Export usa Canvas/receitas de personagem; a UI também usa DOM. Paridade real DOM/Canvas/MP4 ainda merece teste visual rigoroso. |
| Exportação | `electron/videoExportCoordinator.ts`, `videoExportJobs.ts`, `videoExportSurfaceHost.ts`, `VideoExportSurfacePage.tsx`, `videoSerialChunkEncoder.ts`, `videoExportAssembler.ts` | Existem snapshots imutáveis, renderers isolados Electron, frames RGBA, chunks, FFmpeg/FFprobe, saída MP4, modos serial/Turbo, cancelamento e recuperação. **Não reconstruir essas fundações sem necessidade**. |
| Mídia/caches | `videoLibrary.ts`, `videoMediaProbe.ts`, `videoPreviewProxyStore.ts`, `videoPersistentFrameCache.ts`, `videoOutputVerifier.ts` | Há cópias de mídia por projeto, proxies, caches, probes e validação. Original não é cache descartável. |
| Gacha compartilhado | `src/renderer/src/characters/characterRenderer.ts`, `studioExpressionTransforms.ts`, `src/shared/portableExpression.ts` | Personagem, pose, rosto, roupa e expressões normal/PT possuem regras próprias; motor Skia precisaria implementá-las fielmente. |

**Diagnóstico:** “reconstruir do zero” é justificável para **fronteiras entre módulos, fluxo de estado e possivelmente pipeline audiovisual**. “Jogar fora tudo” não é: documentos, SceneIR, snapshots, validações e testes são contratos de valor que já existiam mesmo num editor originalmente experimental.

## 3. Avaliação objetiva de Electron + C++ + MLT + Skia

### Onde a proposta é boa

1. **Electron e React continuam na interface.** Não é preciso recriar menus, painel de propriedades e timeline em C++.
2. **MLT/MLT++** têm producers, playlists, tractors, filtros, consumers, áudio/vídeo e avaliação lazy/pull. O consumer `avformat` usa FFmpeg internamente para encode/mux, sem exigir obrigatoriamente um segundo `ffmpeg.exe` para isso.
3. **Skia** é um motor de desenho 2D nativo apropriado para PNG, sprites, clipping, geometria, cor e texto — **mas não contém as regras de montagem de um Gacha**.
4. Uma engine `GachaVideoEngine.exe` separada pode isolar falhas, administrar recursos e oferecer uma função de frame comum a preview e export.
5. Um IPC de controle pequeno e frames em memória compartilhada é uma direção plausível para reduzir cópias.

### O que não se obtém automaticamente

- **MLT não sabe** que um personagem preserva posição global enquanto pose/expressão variam, que há gaps, balões, lip sync ou PT com pupilas independentes. Precisamos de tradução do nosso SceneIR a serviços ou frames do MLT.
- **Skia não substitui** o renderizador de personagem sem portar ordem de peças, máscaras, flips, offsets, pupilas, roupas, olhos, boca, efeitos, tipografia, recortes e cores.
- **Paridade preview/export** depende de tempo, geometria, alpha, fontes, cor, escalonamento e regras de amostragem; colocar ambos em C++ pode reduzir divergências, mas não as elimina automaticamente.
- **C++ não garante velocidade**: decode, render, textura, readback, IPC, B-frames, audio mix e montagem de gráficos podem dominar o custo.
- **Windows distribuível** exige DLLs, plugins, CRT, símbolos, assinatura, caminho seguro, bibliotecas e licenças correspondentes. Skia também tem build GN/Ninja e dependências opcionais.
- Criar um producer customizado Skia→MLT é trabalho específico do projeto, não uma integração pronta.

**Síntese:** a ideia é tecnicamente viável e merece uma PoC. A justificativa maior seria um Video Studio com recursos amplos de NLE (muitas trilhas, efeitos, filtros, transições e mixagem profissional). Para um compositor 2D de histórias Gacha, talvez uma pipeline especializada mais simples vença em custo/robustez.

## 4. Matriz de arquiteturas candidatas

| Alternativa | Arquitetura | Vantagem esperada | Maior risco | Encaminhamento |
| --- | --- | --- | --- | --- |
| **A — Evolução modular** | React + SceneIR atual + Canvas ou Pixi sob benchmark + FFmpeg | Reutilização, fallback e menor superfície de mudança | DOM vs Canvas, readback e arquitetura React acoplada | **Baseline prioritária** |
| **B — MLT para mídia** | React + SceneIR + raster Gacha atual + MLT para mídia/mix/export | Adiciona NLE sem portar personagem | Sincronização e duas pipelines, DLLs/plugins | PoC específica |
| **C — MLT + Skia completos** | React + bridge Electron + sidecar C++ + MLT/MLT++ + Skia | Motor dedicado e controle audiovisual central | Port completo de personagem + protocolo + packaging | **PoC isolada; não adotar ainda** |
| **D — Skia + FFmpeg sem MLT** | React + sidecar C++ + Skia + libav*/FFmpeg | Frame Gacha especializado; evita grafo NLE | Teria de implementar agenda, áudio, cache e recovery | Concorrente se nativo for vantajoso |

Nenhum candidato recebe nota de FPS, RAM ou qualidade sem comparar **a mesma cena no mesmo Windows**. A hipótese inicial de menor risco é **A**. Se o gargalo for especificamente edição/mix de vídeo, estudar **B**. Se Skia trouxer vantagem comprovada, comparar **C e D**. Não usar “feito em C++” como critério.

## 5. Arquitetura-alvo independente de motor

`StudioDocument v1 (original do usuário)`  
→ `validação e adaptação de leitura`  
→ `snapshot imutável + AssetManifest pinado (SHA-256)`  
→ `Scene Compiler / SceneIR: estado absoluto no frame N`  
→ `FrameRenderer selecionável: Canvas/Pixi ou Skia`  
→ `MediaDecoder / AudioMixer / TimelineClock: FFmpeg ou MLT`  
→ `Preview Transport + ExportCoordinator`  
→ `preview Electron e MP4 verificado`

**Separação obrigatória de responsabilidades:**

- **ProjectRepository**: formatos de projeto, load/save/backup, versões. Único dono dos dados persistidos; não transformar XML de MLT no documento oficial.
- **EditorCommands / History**: operações puras de timeline (move/trim/split/snap/lock), undo/redo e seleção; sem escrita em arquivos no render.
- **SceneCompiler**: keyframes, easing, gaps, layers, resolução de personagem/pose/expressão/PT, texto e background, *sempre a partir de um frame absoluto* (sem deltas acumulativos).
- **AssetResolver**: IDs e hashes; manifest seguro; assets originais separados de caches/proxies; referências imutáveis durante export.
- **FrameRenderer**: pixels e recursos renderizados, sem decidir semântica da timeline.
- **MediaClock/Decoder/AudioMixer**: timestamps e sincronização de vídeo importado, inclusive VFR/B-frames; um relógio autoritativo.
- **PreviewController**: `seek` latest-only, IDs e revisão monotônica, bounded queues, descarte de frames atrasados, preview de resolução reduzida.
- **ExportCoordinator**: snapshot fixo, progresso, cancel, recovery, arquivos temporários, ffprobe/full decode e publicação atômica.
- **Diagnostics**: tempos por etapa, uso real de RAM/VRAM e IPC, crashes, métricas locais sem conteúdo privado.

**Contratos:** SceneIR da implementação atual pode ter `Map`, `dataUrl` e objetos JS; para cruzar o limite C++, criar representação **serializável e versionada**, não enviar internals React/DOM nem milhões de bytes por JSON a cada quadro. Canonizar tempo, unidades, layer IDs, assets e transformações; manter adaptadores legados e novas features com versionamento.

**Sidecar só após PoC:** protocolo sugerido `hello/capabilities`, `openSession(snapshot/manifest)`, `updateScene(revision, diff)`, `requestFrame(frame, revision, quality, requestId)`, `play/pause/seek`, `startExport(snapshotHash)`, `progress/cancel`, `releaseFrame` e `closeSession`. Renderer Electron não ganha acesso arbitrário ao sistema de arquivos. Supervisor reinicia/isola engine falha, com fallback.

**Custo de pixels:** RGBA Full HD = 1920 × 1080 × 4 = **8.294.400 bytes/frame** (~8,3 MB); 60 FPS × uma cópia = **~498 MB/s**, sem computar GPU readback/mais cópias. Usar pipe/IPC para comandos; frames preferencialmente via ring buffer/shared memory ou textura compartilhada medida, com ownership/ACK e backpressure. Electron sharedTexture é recurso avançado/experimental: testar fallback CPU.

## 6. O renderizador Gacha é o caminho crítico

A “etapa definitiva” nativa seria portar corretamente:

- PNG e camadas do Fabricador, cabeças, corpos, poses, roupas, cores e acessórios;
- máscaras, clipping, clipping invertido, recorte/crop/trim, premultiplied alpha;
- olhos esquerdo/direito, espelhamento real vs asset físico direito, transformação do olho sobre a pupila, rotação, escala e pivô;
- expressões normais **sem deslocamento artificial** e PT com **X/Y/rotação próprias de cada pupila**, resto herdado da expressão normal;
- Customizador como fonte da base facial sem alterações cumulativas;
- blink, talk, transição, interpolação, gaps, expressão e pose no frame exato;
- balões, tipografia, fontes, Unicode/emoji, espaçamento, quebras de linha, cor, efeitos, z-order;
- fundos e vídeo importado com alpha, fps variável e áudio sincronizado.

**Duas etapas intencionais:**

1. **PoC sem portar Gacha:** TypeScript gera assets/frame Gacha já conhecidos; engine usa raster para provar decode/mix/composição/seek/export/bridge. Isso isola o benefício de MLT.
2. **PoC com um personagem nativo:** portar um modelo e todas as variações selecionadas ao Skia; comparar por camada contra o oráculo atual; só depois considerar um renderizador completo. Não portar todo o sistema para descobrir no fim que a tipografia/máscara diverge.

Uma imagem “parecida” não é critério suficiente. Os testes devem registrar posição em coordenadas canônicas e diferenças por região (olho/pupila, boca, borda de roupa, texto), hash onde determinístico e tolerâncias documentadas para raster de texto. Erro semântico (PT olhar errado, peça fora da máscara, frame errado) é **veto**, mesmo com SSIM alto.

## 7. Reconstrução do editor React: modular, sem perder UX

Uma organização **proposta**, não migração imediata:

`features/videoStudio/{shell,projects,timeline,tracks,stage,inspector,playback,media,commands,history,export}/`  
`shared/video-studio/{contracts,scene,editing,time,geometry,assets}/`  
`electron/video-studio/{project-store,engine-adapter,media,export,diagnostics}/`  
`native/gacha-video-engine/{protocol,scene,timeline,gacha-renderer,media,preview,export}/` (**somente se decisão nativa for positiva**)  
`tests/video-studio/{fixtures,contracts,parity,windows-e2e,benchmarks}/`

Ordem de extração: **projeto e comandos → histórico → timeline → stage/inspector → playback → render-adapter → export UI**. PRs pequenos e reversíveis; preservar rotas, atalhos, seleção, drag, persistência e export atuais até provar equivalência.

**Produto a decidir com o criador antes de codificar:**
- foco principal: **produção de histórias Gacha** ou NLE abrangente semelhante a editores de vídeo tradicionais;
- tracks e regras de sobreposição (personagem/expressão/pose vs clips de vídeo/áudio/texto);
- keyframes de personagem, câmera, zoom/pan, transições e easing;
- manipulação de balões e lip sync, sons, waveform, scrubbing com áudio;
- editor offline no Windows, qualidade preview, resolução e perfis de export;
- ergonomia: undo/redo, snapping, lock/mute, atalhos, autosave/recovery, biblioteca.

Não copiar 100% da UI experimental por obrigação; porém cada mudança de comportamento atual deve estar explicitamente especificada, testada e aprovada.

## 8. Experimentos Windows e quality gates

### Gate G0 — baseline e oráculo

- Fixar **um fixture sintético**: projeto v1, sem dados pessoais e sem tocar a biblioteca real.
- Registrar HEAD, Windows/CPU/GPU/RAM, Electron e FFmpeg exatos, build flags, encoder, tempos e hashes.
- Guardar quadros de preview, export e print; provar seek `A→B→A`, carga fria/quente e restart.
- Validar todos os recursos atuais e o mesmo resultado após save/load, undo/redo e troca de expressão.

### Cena de PoC que pode reprovar a arquitetura

**1920×1080, 60 FPS, 10 s (600 frames)**: um fundo, 2 personagens de modelos diferentes, troca de pose e expressão normal/PT com pupilas personalizadas X/Y/rotação, blink/talk, movimento de palco, uma lacuna, balão de texto, vídeo importado com áudio e sobreposição. Separadamente testar vídeos 24/25/29,97/60 FPS e VFR, B-frames e codec não suportado.

Conferir **frames 0, 1, 29, 30, 59, 60, 149, 150, 299, 300, 449 e 599**, seek em sequência A→B→A, play/pause/scrub, MP4 H.264+AAC com audio sync, ffprobe e decode completo. Testar cancel, matar processo, retomar job, abrir após reiniciar e rodar **sem FFmpeg instalado globalmente**.

### Experimentos que isolam custos

| Spike | Comparação controlada | Resultado obrigatório |
| --- | --- | --- |
| **S0** | Pipeline atual, fixtures do HEAD | baseline de frames, seek, áudio, memória, duração export, falhas |
| **S1** | Editor modular com renderer antigo | prova de que desacoplar UI/estado não quebra comportamento |
| **S2** | FFmpeg atual **versus MLT** usando os *mesmos PNGs Gacha pré-renderizados* | custo MLT no decode/áudio/mix/encode, latência, PTS, qualidade, plugin BOM e instalação |
| **S3** | Canvas/Pixi **versus Skia** renderizando a mesma cena 2D/olho/PT/balão, sem MLT | ROI pixel, fontes, alpha, CPU/GPU/RSS, readback, tempo por frame |
| **S4** | Sidecar C++ + IPC sem render nativo inteiro | custo real frame transport/seek, crash/restart, bounded queue, fallback |
| **S5** | Integração completa **só se S2–S4 satisfatórios** | MP4+áudio + preview dentro do Electron e instalação Windows limpa |

**Medições:** p50/p95/p99 de frame e seek, drift e latência A/V, memória do Electron **mais subprocessos**, GPU, bytes em trânsito, tempo total do encode, cold start, tamanho do pacote, crash/recovery e qualidade por frame. Várias rodadas com warmup, não apenas uma amostra de cinco segundos. Não prometer ganho de FPS antes dos resultados.

**Gate para adotar MLT/Skia:** cumprir paridade sem regressão funcional, pacote Windows reproduzível e compliance de licença, recovery, fallback e benefício mensurável de performance **ou** funcionalidade NLE impossível/inviável com A. Se falhar, **não migrar**; continuar com A ou testar B/D. Uma decisão inconclusiva permanece inconclusiva, nunca positiva por preferência.

## 9. Persistência, dados pessoais e rollback

1. **Não trocar `StudioDocument v1` por XML MLT.** O projeto do usuário continua sendo a fonte autoral; graph MLT e caches são derivados descartáveis.
2. A PoC deve operar em **perfil Windows sintético isolado**. Nunca ler/modificar automaticamente PNG, pose, roupa, personagem, áudio/vídeo ou projeto pessoal para “migrar”.
3. Usar snapshots imutáveis, manifests e SHA-256 para frames/PNGs/mídia de export; paths normalizados e limitados a raízes autorizadas; nenhum plugin/script de projeto executável.
4. Engine experimental atrás de **feature flag desativada por padrão** e fallback imediato; projetos continuam abrindo pela implementação antiga.
5. Nenhuma limpeza, sobrescrita ou renomeação de dados originais. Migração de schema futura apenas com backup, cópia de teste, roundtrip, plano de restauração, aceite e rollback.
6. MP4 final somente é publicado depois da validação (ffprobe, decode, frames, áudio, hash). Crash e cancel deixam temporário gerenciável, não arquivo final enganoso.
7. CI utiliza mídias/PNGs sintéticos; diagnósticos não incluem automaticamente nomes, caminhos, frames privados nem conversas.

## 10. Licenças e empacotamento — bloqueadores possíveis

- **MLT framework e MLT++:** política oficial cita **LGPLv2.1**, mas **plugins variam**, e utilitários como `melt` são GPL. Auditar os **binários realmente distribuídos** (DLL, módulos, codecs, dependências, avisos/código-fonte). Não afirmar que todo MLT é LGPL.
- **FFmpeg:** LGPL na configuração padrão, mas opções/depêndencias podem ativar GPL ou condições adicionais. `--enable-gpl`, `--enable-nonfree`, origem/hash do pacote e licenças de codecs/patentes precisam de revisão.
- **Skia:** licença principal BSD-3-Clause; dependências de fontes, codec, imagem e build também demandam inventário. Build oficial usa **GN/Ninja** e pode envolver configurações/dlls complexas.
- **Electron/Windows:** provar execução completamente offline sem SDK/MLT/FFmpeg global, com permissões mínimas, paths seguros, DLL versionada, crash supervisionado, atualizador e diagnóstico sanitizado.
- **Contrato:** isto é checklist de engenharia; distribuição comercial exige revisão jurídica própria.

## 11. Backlog de execução, sem implantação prematura

| Ordem | Entrega pequena e verificável | Gate |
| --- | --- | --- |
| **R0** | Definir requisitos do Video Studio definitivo (histórias Gacha vs NLE, tracks, câmera, áudio, efeitos) | aprovação do escopo de produto |
| **R1** | Inventariar funções do editor atual e montar fixtures/goldens Windows | todos os recursos observáveis e projetos v1 legíveis |
| **R2** | Extrair comandos/store/timeline/stage do monólito React mantendo renderer e formato | UI, histórico, save/load e export idênticos |
| **R3** | PoC S2: FFmpeg vs MLT **sobre o mesmo raster Gacha** | comparação Windows de codec, áudio, timestamps, package BOM |
| **R4** | PoC S3/S4: Skia vs render 2D atual e IPC de sidecar | paridade de personagem/PT, texto, máscaras; latência e memória |
| **R5** | Registrar ADR selecionando A/B/C/D, fontes, commits, jobs e números | decisão baseada em dados; fallback e licença |
| **R6** | Implementar em fatias sob feature flag, sem substituir projeto de usuário | regressão Windows + Aceite visual em cada fatia |
| **R7** | Testar com **cópias locais** de projetos reais e instalador Windows | nenhuma perda; fallback funciona; autorização específica para release/merge |

**Definição de pronto deste planejamento:** escolher **o problema e o experimento a fazer primeiro**, não escolher antecipadamente uma engine. Este documento não aprova downloads de dependências, criação de sidecar de produção, edição da `main` nem migração de dados.

## 12. Fontes técnicas verificadas em 2026-10-23

- MLT, funcionamento producer/consumer: https://mltframework.org/docs/framework/
- API MLT++: https://mltframework.org/docs/mlt%2B%2B/
- Consumer avformat/FFmpeg: https://mltframework.org/plugins/ConsumerAvformat/
- Política de licenças MLT: https://mltframework.org/docs/copyrightpolicy/
- Funcionalidades e plugins MLT: https://www.mltframework.org/features/
- Skia e plataformas: https://skia.org/docs/
- Build GN/Ninja e Windows: https://skia.org/docs/user/build/
- Licença Skia: https://github.com/google/skia/blob/main/LICENSE
- Licença e redistribuição FFmpeg: https://ffmpeg.org/legal.html
- Electron offscreen bitmap/shared texture: https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering

**Regra final:** estado comprovado do código e testes do HEAD > texto histórico. Sem benchmark reproduzível, versão, hardware e comparação de saída, não é possível afirmar que uma engine será melhor que outra.
