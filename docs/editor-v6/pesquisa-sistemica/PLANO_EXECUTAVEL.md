# Plano executável — pesquisa → experimento → decisão → implementação

**Regra atual:** o usuário autoriza **pesquisa + implementação + testes iterativos** para melhorar o Editor V6 **e módulos conectados**, **somente** numa cópia local isolada com branch nova, BAT/porta novos e dados canônicos verificados. Não modificar app/dados originais nem dar push sem pedido. Seguir [LABORATORIO_CODEX_EXPORTACAO_FRIA.md](LABORATORIO_CODEX_EXPORTACAO_FRIA.md). **Exportação fria sem cache persistente pesado** e gates de qualidade obrigatórios.

> **Critério global de escolha técnica revisado:** [Diretriz de resultado final](DIRETRIZ_CODEX_RESULTADO_FINAL.md). O usuário autorizou trocar encoder (CPU/AMF/NVENC/QSV/Media Foundation/WebCodecs), GPU, Chromium/Electron/compositor e caminhos de captura **se** houver melhor MP4 frio, fidelidade, fallback e regressões aprovadas. Não manter CPU somente por tradição. Comparar o mesmo trabalho/preset ao isolar gargalos, depois testar **backends diferentes como variável registrada** em competição por melhor resultado. O usuário relatou 91s num perfil não idêntico ao baseline do LAB; não compará-los diretamente.

## Fluxo de trabalho e estados

`IDEIA → PESQUISADA → EXPERIMENTO AUTORIZADO → VALIDADA/REJEITADA → ADR APROVADA → PRONTA PARA IMPLEMENTAR → IMPLEMENTADA + REGRESSÃO`.

Toda mudança exige: owner, arquivos, dependências, entradas autorizadas, condição inicial, passos reproduzíveis, artefatos de saída, comandos de teste, critério de aceitação, rollback, impactos nos consumidores e resultado negativo se houver.

## Fase A — fundamentos e pesquisa (apenas documentação)

### AUD-001 — Mapear arquitetura completa
- **Fonte:** [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md), mapa e inventário.
- **Já realizado:** mapa estático de camadas, processos e módulos, docs oficiais de Electron/Chromium/SQLite; não mediu runtime.
- **Pendente:** inventário de imports/chamadores no checkout local e mapa de referências vivas vs snapshots; conferir revisão real dos builds.
- **Aceite:** todo fluxo prioritário possui UI→estado→preload→IPC→domínio→persistência→consumidor, com [A CONFIRMAR] explícito se não inspecionado.
- **Proibido:** alterar schemas, IPC ou ownership para "completar" auditoria.

### AUD-002 — Caracterizar exportação fria de 91s com cabelo ON no projeto atual
- **Dependências:** projeto vigente **Teste de Importação — Personagens do Pacote**, copiado com seus dados canônicos e assets para LAB; [RELATO] **91s cabelo ON**, OFF não medido; duração real do projeto a confirmar.
- **Resultado LAB 06/11/2026:** 3 exports frios hair ON mediana 116,32s; 2 controles completos sem cabelo mediana 68,01s. Baseline do relato (91s) não foi reproduzida e condições/preset original não são conhecidos. Há dados por fase no [progresso](PROGRESSO_E_RESULTADOS.md).
- **Protocolo cumprido para primeiro A/B:** [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md), processo/sessão novos, cache de movimento vazio, mesmo snapshot, duração/encoder/Turbo/áudio. Incluir pre-job no tempo clique→MP4 validado; estender OFF para 3 amostras quando uma comparação equivalente adicional for necessária.
- **Saída:** relatório sanitizado com fases, número de reações, contagem de reconstruções, cache, hardware, timecodes e hash do fixture.
- **Aceite:** atribuir as diferenças a subetapas **sem somar tempos concorrentes como parede**.
- **Scripts:** `benchmark-project-export.cjs` e `backup-authorized-project.cjs` **já autorizam o projeto atual**. Revisar como copiam motion cache e sessão: manter guards e backup SHA-256, mas garantir que nenhum cache de export anterior aqueça o LAB.

### AUD-003 — Confirmar versão e capacidades do stack
- **Fontes:** `package.json`, `package-lock.json`, EXE real, FFmpeg embutido, GPU/driver Windows.
- **Medir:** `process.versions`, WebGL/WebGL2, WebCodecs disponíveis, tamanho de textura, uso de offscreen/paint, FFmpeg `-encoders` e `-buildconf`.
- **Aceite:** capacidade verificada com checks, não deduzida de documentação "latest".

## Fase A2 — Resultados de pesquisa do Grupo A (somente decisões de investigação)

**Estado:** 15 estudos concluídos na dimensão documental; primeiro spike dinâmico de captura implementado e medido em LAB. Estudos 06–08, 12 e 14 ainda são roteiros; demais experimentos continuam condicionados a evidência.

| Ordem | Trabalho executável | Base | Dependências / critério de saída |
|---|---|---|---|
| A2-01 | Profiling seguro de hair ON/OFF com relatório do **preparo pré-job** | [10](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) + [15](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md) | Fixture autorizado, 3+3 corridas, total clique→MP4 |
| A2-02 | Traçar `composeHairFrame` e `hairRasterPixels` em repouso/transição | [04](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md) + [05](pesquisas/05-GPU-WEBGL-WEBGPU-NATIVO.md) | Somente depois A2-01; distinguir 0/1/muitas reações |
| A2-03 | PoC de cabelo posterior RGBA ROI sob oclusão correta | [10](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) | RGBA paridade e ganho prep+render, não duplicar cabelo |
| A2-04 | Captura offscreen `capturePage` vs `paint` | [03](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md), [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md) | A/B frio 3+3 completo; agora ampliar golden RGBA, cancelamento e resize |
| A2-05 | Comparar pipeline FFmpeg, encoders CPU/GPU e mux/probe | [11](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md) + [19](pesquisas/19-NODE-IPC-STREAMS-BUFFERS.md) + [12](pesquisas/12-WINDOWS-AMD-AMF-DIRECT3D.md) | A/B de mesmo encoder para causa + disputa explícita CPU/AMF/NVENC/QSV se disponíveis; igual qualidade/áudio, fallback, vídeo real |
| A2-06 | Benchmark da preparação de materiais estáticos Sharp × Canvas | [17](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md) | Se preparo de assets for dominante; PNG/crop/alpha iguais |
| A2-07 | Perfil de React/estado e staleness de face | [09](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md) + [18](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md) | Métrica de UI + renderer; preservar undo/redo e relógio |
| A2-08 | Capabilities WebCodecs e PoC de MP4 muxado | [20](pesquisas/20-WEBCODECS-VIDEODECODER-VIDEOENCODER.md) | Só se encode for relevante; mux+áudio+codec são obrigatórios |
| A2-09 | Build portátil e gates de contrato IPC/schema | [16](pesquisas/16-SEGURANCA-BUILD-E-DISTRIBUICAO.md) + [21](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md) | Todos os spikes promovidos: CSP, sandbox, Zod, ABI, FFmpeg, recovery |

**Prioridade de execução:** laboratório isolado concluído → baseline fria A2-01 medida → A2-04 implementado após perfil mostrar captura relevante → próximo medir preparação/composição do cabelo posterior (A2-02/A2-03) e validar expansão de paridade. Uma pesquisa terminada não autoriza outra implementação sem gate. A documentação de fontes oficiais não substitui teste do Electron/FFmpeg empacotado.

## Fase B — experimentos isolados (sem produção)

### EXP-CAB-001 — Cabelo em repouso, zero recomposição induzida
- Medir projeto sintético sem mudança de pose mas com fala; com preset ON e OFF.
- Confirmar se há `composeHairFrame`/prep desnecessário em frames estáticos.
- Comparar pixels, RAM e tempo. Se não houver duplicidade, rejeitar hipótese.

### EXP-CAB-002 — ROI/camada RGBA somente do cabelo posterior
- **Depende:** AUD-002 e EXP-CAB-001.
- Preparar pose/rig correto, máscara de oclusão e base sem a camada posterior estática; desenhar reação nos quadros ativos (29 por evento) e repor repouso fora do intervalo.
- Comparar RGBA antes de codificar e MP4; espelho, proporção, flip, roupas, boca, contornos e limites das duas lanes Turbo.
- **Aceite:** nenhum quadro com cabelo duplo/recorte e redução do total de parede inclusive prep.
- Não assumir que MP4 H.264 suporta alpha em clip temporário.

### EXP-CHAR-001 — Materiais e revisões imutáveis por personagem
- **Depende:** mapa de live references/snapshots e inspeção de `preparedCharacterMaterials`.
- Chave deve identificar modelo, pose, roupas, tint, face, estilo de cabelo, rig, crop e revisões; cache limitado, seguro para alterações de origem.
- Aceite: arte e dados equivalentes entre Customizador, Studio e V6 (sem cache stale).
- **Proibido:** recriar cache de MP4 anterior como atalho para "primeira exportação".

### EXP-ELE-001 — Offscreen/capturePage vs paint
- **Depende:** AUD-002 provar captura relevante. Protocolo [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md).
- A/B 150 quadros e depois 300, checagem de token/frameId, dirty rect, transparência e seam; limite de buffer e cancelamento.
- Aceite: ganho no total, zero frames stale, pixels equivalentes.

### EXP-ELE-002 — GPU shared texture / Direct3D / AMD
- Depende de EXP-ELE-001 e proof-of-concept com Native addon, sincronização e `release()` explícito.
- Aceite: Windows real, estabilidade e memória/VRAM bounded, paridade visual e ganho total. Sem habilitar recurso experimental por padrão antes disso.

### EXP-FFM-001 — Escolher melhor encoder/backend livremente (CPU, AMF, NVENC, QSV, etc.)
- **Depende:** AUD-002 para medir fases. Comparar CPU, AMF, NVENC, QSV, Media Foundation, WebCodecs ou outros backends disponíveis (com feature detection), usando **mesma entrada e saída pretendida**; registrar configuração/qualidade e preço em cópias GPU, inicialização, mux e fallback. Troca de encoder é permitida e pode virar padrão da UI se beneficiar o usuário.
- Validar H.264, 1080p30, contagem exata 150/300, PTS, seams, áudio, MP4 final.
- Aceleração de hardware **não substitui** teste de renderização/preparação.

### EXP-RAS-001 — DrawPlan e compositor alternativo
- Primeira rodada somente cenas cujo plano `unsupported` está vazio; sem forçar cabelo/vídeo no backend parcial.
- Testar pose/roupa/texto/face/flip, transparência, PNG de referência e cor.
- Aceite: paridade RGBA definida **antes** de benchmark; qualquer feature não suportada deve dar bloqueio explícito.

### EXP-UI-001 — Fluidez da UI
- Traces de arrastar, scrub, selecionar, abrir mídia e timeline longa. Preservar RAF externo e virtualização já existentes.
- Aceite: comparação de latência/interação e regressão sem perda de estado.

### EXP-DATA-001 — Revisões e gravação transacional
- Mapear escritor/leitor por domínio, cross-domain references, cache invalidation, recuperação após crash.
- Aceite: invariantes e testes de recuperação; não fazer migração real só para mensurar.


### CHROM-AUD-001 — Evidência causal Chromium/Blink/Viz para hair ON/OFF

- **Estudo técnico completo:** [Pesquisa 02 aprofundada](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md), capítulos 7–21, na revisão GitHub atual.
- **Pré-requisito:** snapshot autorizado, build e hash da fixture, [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md), baseline OFF/ON incluindo hair pre-job anterior ao Main; 3+3 amostras, 1080p30, Turbo, encoder controlado dentro do par A/B; variantes CPU/GPU podem ser testadas depois como escolha final.
- **Coletar:** hairPreparationBeforeJobMs, hairRasterFrames e pixels em repouso vs reação, faceComposition, hairCanvasBlitMs, React commit, rAF wait, capturePage/Bitmap, retry/token, FFmpeg write, wall-clock e memória.
- **Resultado necessário:** atribuir diferença a fases **sem somar durações de workers concorrentes como parede**, com caso de 0/1/várias reações. Se hipótese cair, não iniciar o spike dependente.

### CHROM-AUD-002 — Trace de rendering Chromium sem alterar baseline

- Depende de CHROM-AUD-001; Electron `contentTracing.getCategories()` no build instalado, `startRecording/stopRecording` com categorias confirmadas, sessão curta e trace **Perfetto protobuf (Electron 45+)**. Não usar tutoriais JSON obsoletos nem `['*']` por padrão.
- Cruzar JS, Blink style/layout/paint, raster/Skia, cc, Viz, GPU, readback e token de frame. Trace é ferramenta de diagnóstico com overhead: executar **depois** do A/B sem trace.
- Resultado: evento por frame, problema evidenciado, alternativas/riscos e relatório sanitizado; nunca publicar trace bruto com mídia/paths.

### CHROM-SPIKE-001/002 — Descoberta em repouso e cabelo RGBA/ROI

- **Dependências:** CHROM-AUD-001/002 provar custo de Canvas/recomposição; estudo 10/04 e [EXP-003](experimentos/EXP-003-ROI-CABELO.md).
- PoC fora do export default: base sem cabelo posterior + back hair RGBA + oclusão da cabeça + face/mouth independente, 0/1/várias reações de 29 quadros.
- **Aceite:** RGBA golden antes de H.264, MP4 total menor incluindo preparações, sem cabelo duplo/recortes, flipX/roupa/face, duas lanes, memória limitada. Se não cumprir, rejeitar.

### CHROM-SPIKE-003 — CapturePage vs Paint com confirmação de token

- **Depende:** CHROM-AUD-001 provar tempo significativo de captura; [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md).
- PoC `paint` + dirtyRect acumulado + frameId comprovado + token lateral e layers, 150/300 frames, abort/resize/DPR, sem stale frame.
- SharedTexture/D3D exige decisão/integração nativa separadas; `offscreen:true` atual não é zero-copy.



### ELE-AUD-001 — Medir Electron offscreen no caminho atual

- **Referência:** [Pesquisa 03 aprofundada, capítulos 1–25](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md). Não assumir que capturePage é o gargalo antes de medir.
- **Entrada:** cópia autorizada, commit/dirty, 1080p30, duração real ou fixture indicada, Turbo/encoder fixo dentro de cada contraste, 3× hair ON + 3× OFF, pré-job de cabelo incluído no wall clock.
- **Coletar:** workerStartupMs, ipcDrawMs, rafWaitMs, capturePageMs, captureBitmapMs, captureReadbacks/stale, hair/face/frame, ffmpegWriteMs, RSS e wall-clock. Separar as duas lanes e o pre-job.
- **Gate:** custo atribuído por etapa e MP4/paridade preservados; não somar tempo de lanes como se fosse parede.

### ELE-AUD-002 — Verificar cor, token, DPR e capacidades do Electron instalado

- **Referência:** estudo 03, capítulos 6, 7, 15 e 18. A documentação informa que `NativeImage.toBitmap()` normaliza para sRGB por padrão desde o Electron 43.
- **Experimento:** golden RGBA antes de H.264, tokens válidos/obsoletos, janela invisível, escala 1× e monitor DPI alto, alpha de background/foreground, `getFrameRate` e versões reais.
- **Gate:** pixels corretamente ordenados BGRA, sRGB e alpha equivalentes ao baseline e nenhum quadro stale.

### ELE-SPIKE-001 — Avaliar `paint` com dirtyRect, sem GPU sharedTexture

- **Dependência:** ELE-AUD-001 demonstrar readback/capture relevante; [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md).
- **Implementação:** PoC isolado push, buffer bounded, `dirtyRect` confirmado na versão Electron instalada, token da mesma imagem, event ordering, cancellation e 2 layers.
- **Gate:** 150/300 frames exatos, sem stale, MP4 com mídia externa/áudio, memória estável e tempo **total** menor. Se não reduzir, rejeitar.

### ELE-SPIKE-002 — Experimentos de cadência/visibilidade (sem produção)

- Em ambiente isolado comparar 30/60/90 de `setFrameRate` e `capturePage stayHidden`, com mesma configuração de output 30fps.
- **Gate:** nenhuma regressão de rAF/token, pixels, áudio ou tempo total; rejeitar se ganhos forem apenas em evento paint ou microbench.

### ELE-SPIKE-003 — SharedTexture/VideoFrame e caminho GPU

- **Dependências:** ELE-AUD-001 mostrar readback dominante, estudo 12 Windows/AMD, capacidade de driver/ABI e teste de cor.
- Testar `offscreen.useSharedTexture`, `event.texture.textureInfo`, `release()`, formatos, imports, limites GPU, handlers nativos e possível integração com encoder AMF/Media Foundation.
- **Gate:** pipeline do **MP4 completo** mais rápido incluindo mux/áudio, D3D sync correto, fallback CPU e nenhuma textura vazada. Não ativar flags experimentais em produção sem ADR.

### ELE-ADR-001 — Decisão de backend de captura

- Escolher **manter capturePage**, melhorar Canvas/ROI, `paint` ou GPU somente após baselines, golden color/alpha, vídeo layered e rollback. Registrar opção rejeitada.

## Critério de conclusão integrado do laboratório

- **Não concluir ao terminar uma pesquisa**: implementar e testar continuamente, priorizando maior redução de tempo total frio por risco/esforço. Entrega final inclui Editor V6 e integrações relevantes (Fabricador, Customizador, Studio, bibliotecas, timeline, renderer, export, persistência), regressões e fallback.
- **Encoder não é requisito fixo.** Se AMF/NVENC/QSV ou outro backend gerar MP4 correto com qualidade equivalente, menor tempo frio e fallback, adotá-lo no LAB, com opção CPU quando GPU indisponível.
- **`paint-event`** mantém status experimental até golden RGB(A), layered video, cancelamento, métricas de espera e distribuição portátil serem verificados; conservar `capturePage` disponível.
- **Documentar cada decisão:** input/commit, modo frio, meio (CPU/GPU), qualidade, tempo total medido, pico RAM/VRAM/disco, impacto nos módulos, regressões e rollback. Não publicar dados privados ou MP4.

## Fase C — decisões e implementação

- `ADR-001`: escolher a intervenção com maior **ganho medido em parede** e paridade, listando alternativas rejeitadas.
- `REF-001`: só então preparar plano por módulo pequeno com feature flag/laboratório, downgrade, testes dos consumidores e reversão.
- Gate completo: `npm run typecheck`, `npm run audit:architecture`, testes específicos, `npm run build`, e validação Windows real quando pertinente. **Estes comandos ainda NÃO foram rodados nesta entrega.**

## Definição de "feito"

Uma pesquisa está feita quando informa arquivos/linhas ou funções verificadas, URLs oficiais e versões, lacunas, experimentos falsificáveis e decisão de próxima rodada. Uma refatoração só está feita com diff, build, testes, benchmark real, validação de paridade e relatório. Não existe "concluído por intenção".

## Retomada segura — estado em 06/11/2026

1. Começar na pasta irmã isolada do laboratório (`*-V6-LAB`); confirmar branch `refactor/editor-v6-cold-lab`, `git status`, `HEAD` e `origin` antes de editar. Não limpar/resetar o diff local: ver o handoff em [PROGRESSO_E_RESULTADOS.md](PROGRESSO_E_RESULTADOS.md).
2. Validação integrada aprovada nessa branch com `npm run test:editor-v6:integration -- --scope=all`; build, typecheck e arquitetura também passaram. A suíte `test:refactor` tem duas expectativas de fixture de mídia antigas; corrigir após confirmar fluxo e adicionar cobertura do comando que grava após o picker.
3. Ajustar `scripts/editor-v6/rapid-gates-windows.cjs`/doctor e seu teste para suportar explicitamente o branch do laboratório, sem trocar checkout: hoje o doctor interrompe ao exigir `Dev-V2`.
4. `paint-event` permanece opt-in até prova de pixels no mesmo worker/estado; não promover apenas por velocidade. O benchmark só é elegível após captura controlada, cancelamento/layered video e saída completa validados.
5. Ao retomar os ciclos de otimização, medir primeiro o custo frio dominante de preparação/render (Motion ~17s, render ~51s na última configuração) e então escolher intervenção. Manter padrão de 2 lanes, x264 `ultrafast` a 12Mbps no LAB, cache pesado apenas dentro do job e limpeza restrita a temporários marcados pelo LAB.
6. Alterações de código do usuário ainda sem commit devem ser revisadas individualmente e mantidas. Criar commits seletivos, sem incluir perfis, app-data, mídia ou diagnósticos acidentais; push somente para a branch do LAB, nunca merge em `Dev-V2`.

[Estado real](PROGRESSO_E_RESULTADOS.md).

## Execução LAB — 06/11/2026

- Perfil de benchmark UI equivalente, caminho command+IPC, projeto inteiro e cache/processo frios: concluído, com 3 amostras cada em CPU/libx264 e Auto/AMF. Medianas e qualidade estão em [Progresso](PROGRESSO_E_RESULTADOS.md), [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md) e [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md).
- Correção aceita: escolha CPU suportava apenas libopenh264 ausente no FFmpeg empacotado; adicionar libx264 resolveu o erro. CPU/libx264 mediana 82,44s vs AMF 84,83s no projeto e hardware avaliados; manter CPU como default local, sem retirar Auto.
- Paint não promovido: smoke teve maior tempo e SHA diferente na camada frontal. Medida de espera paint separada e capturePage segue padrão.
- Sobreposição de escrita pipe/captura foi medida em smoke e revertida por lentidão e cópia adicional de frame.
- [x] Equivalência OFF corrigida: controle usa `runEditorV6ExportCommand` + IPC start/status, sessão e processo novos. Três corridas de projeto inteiro incluem 2.394 frames, áudio, perfil CPU e zero escrita de cache.
- [x] A/B x264 `veryfast`/`ultrafast` com taxa 12Mbps no projeto completo, ON e OFF; validação SSIM/PSNR/áudio integral antes de promover o preset rápido.
- Pendências P0 restantes: golden RGBA integral de `paint-event`, vídeo layered, resize/timeout/cancelamento; validar preset em outro projeto/hardware. Paint continua opt-in.
- Próxima intervenção: Motion (mediana ~17,1s no cabelo ON) e renderização comum (~51,2s), usando profiling por lane e mudanças limitadas. Não iniciar ROI sem prova de hotspot e golden.
- Último teste de concorrência: 3 lanes Motion com 37 planos únicos continuaram em pico 2 (só dois personagens) e levaram 18,22s; 4 render workers reduziram render 51,20→50,92s e elevaram RSS a 1.060MiB, sem ganho de parede contra 80,11s (variação < ruído). Não ativar; padrão continua 2/2. Usar terceira lane somente em outro projeto com 3+ personagens.
- Limite atual: não foi estabelecida comparação válida contra o relato de 91s, pois as configurações originais são desconhecidas. Esta atualização ainda não fecha o critério global de conclusão.

## Rodada causal e cache por exportação — 06/11/2026

- [x] Controles hair OFF completos 3× no projeto/UI-alvo, 2.394 quadros, 1080p30, CPU/libx264, áudio: 74,76 / 74,29 / 76,88s, mediana 74,76s. É um controle via runner direto, portanto exclui a camada de comando da UI; não reportar como diferença pura de cabelo sem essa limitação.
- [x] Eliminado o cache persistente de atlas de movimento no serviço Electron. Antes, export fria escrevia ~70 MB no cache de perfil. Agora cada export gera `cacheScope` UUID, isola memória de exportações anteriores, permite deduplicação ao longo de todo o job (motion e mouth loops) e libera as entradas ao concluir/falhar; o serviço não lê/escreve atlas em disco.
- [x] Corrida pós-isolamento sem alteração do crop: 86,54s mediana em 3 corridas; usada como grupo de comparação local, não como ganho.
- [x] `canvasFaceAlphaBounds` mudou a leitura RGBA byte-a-byte para palavras RGBA alinhadas, com seleção explícita do byte alpha por endianness. Mesmo corte/limiar >8. Regressão de alpha transparente/limiar/limites passou.
- [x] 3 exports completos após a otimização: 80,94 / 87,85 / 82,13s, mediana 82,13s; preparo hair 7,89 / 10,66 / 8,20s (mediana 8,20); crop 3,67 / 4,81 / 3,72s (mediana 3,72). Grupo anterior de 3: crop 4,38 / 4,52 / 4,15s (mediana 4,38). Redução local mediana de ~15%; tempo total similar à baseline inicial 82,44s e a dispersão impede atribuir ~5% de ganho à mudança.
- Todos os exports finais passaram contagem 2.394, H.264 1920×1080 30fps e áudio; zero bytes lidos/escritos no cache de movimento. Pico RSS Main 846,7–971,2 MiB nas 3 corridas.
- [x] Suite integrada Windows: 25 arquivos/115 direcionados, suíte completa 65 arquivos/361 testes + 1 skip, Electron hair/scene offscreen, typecheck, auditoria (713 arquivos, zero imports ausentes/violações) e build passaram.
- Artefatos pesados da rodada interrompida foram removidos somente de um `isolated-app-data` marcado pelo próprio benchmark; relatórios leves preservados. Perfil canônico LAB e original não foram limpos.

**Próxima causa a investigar:** composição/renderização continua 54,13–55,57s; motion 17,32–18,99s. Priorizar distribuição do tempo de FFmpeg CPU vs worker/render nas duas lanes e avaliar D3D12VA/Media Foundation somente com smoke de disponibilidade, mesma qualidade e fallback. ROI/captura paint continuam bloqueados por golden/paridade.

## Motor V6 isolado — início da reconstrução, 06/11/2026

**Direção agora escolhida pelo usuário:** manter React para comandos e feedback, e reconstruir progressivamente o caminho de cena/exportação atrás de contratos. Esta seção atualiza a antiga prioridade de pequenas otimizações do backend atual. Não autoriza trocar o renderer de produção sem paridade.

### Fase ENG-01 — adaptador e plano determinístico (concluída no LAB)

- O adaptador existente em `electron/domains/editorV6/exportIpc.ts` aplica `parseEditorV6ExportDocument` antes de começar o job; cada BrowserWindow de exportação recebe uma cópia IPC isolada e validada.
- `compileEditorV6RenderPlan` assume propriedade dessa cópia no worker, congela sua estrutura sem duplicar strings Base64, indexa assets por ID e prepara motion plans uma vez.
- `evaluateFrame(n)` aceita somente índices inteiros dentro do intervalo e usa o resolver atual como oráculo visual. O export worker agora consome esse plano; saída, captura e encoder atuais continuam iguais.
- Testes verificam metadata, ownership/imutabilidade, lookup por ID, limites do quadro, determinismo e paridade antes/depois de uma transição de pose. Isto é uma fronteira arquitetural, **não** uma melhoria de velocidade comprovada.

### Fase ENG-02 — contrato da superfície e Canvas2D candidato (A/B integral concluído; sem promoção)

- A interface `EditorV6FrameSurface` recebe estado resolvido + assets/canvases e define `present`/`dispose`. `exportWorker` já delega a apresentação a esse contrato; `createReactSvgFrameSurface` preserva React, `SceneSurface`, espera de imagens, marcador de quadro e RAF como adaptador atual.
- Primeira prova Electron: canvas RGBA sintético em `foreignObject` foi capturado corretamente por `capturePage`; SVG serializado como imagem contaminou a leitura de Canvas e não fornece pixels legíveis. `foreignObjectCanvasRoundTripsPixels=false` bloqueia esta conversão simples. O harness remove bundle, perfil e imagens em `finally`.
- `createCanvas2dFrameSurface` compõe imagem/personagem/canvases raster em uma única saída Canvas; só decodifica assets usados pela camada/quadro e invalida cache por identidade do objeto de asset. Fala e pensamento são rasterizados como SVG vetorial e desenhados nessa saída, e o narrador usa SVG rasterizado local para preservar texto/ordem de camadas. Reutiliza o bitmap de diálogo enquanto o layout não muda; máscaras faciais usam scratch Canvas por ator/job e são liberadas no `dispose`. Background/foreground preservam alpha; asset de fundo mantém o esticamento explícito do `SceneSurface` (`preserveAspectRatio="none"`). `scene.mediaVideo` ainda é rejeitado e exige fallback. O algoritmo de quebra de linha vem de `engine/sceneTextLayout.ts`, sem importar componente React.
- Golden expandido Electron: personagem com atlas/motionSprite, flip/rotação e boca, imagem letterboxed, narrador, fala e pensamento com speaker labels, rotação e fundo com asset. 6.750 canais divergentes de 2.073.600 (<0,33%), erro máximo 90/255 e médio 0,14072; quatro amostras do fundo coincidiram pixel a pixel. A fixture simples ficou com 7.524 canais, máximo 75 e médio 0,12531; hair RGBA com alpha/máscara/flip/rotação teve 6.860 canais, zero divergência fora do ator, máximo 35 e média 0,00563. Alpha transparente, layer separation e liberação seguem aprovados.
- O A/B frio completo na UI usou o mesmo projeto, Preset 2 posterior-only, libx264 `ultrafast`, 2 lanes, 1080p30, `capturePage`, processo/sessão novos e cache vazio. SVG: 90,38s clique→MP4 validado; Canvas2D: 90,87s. A fase de render subiu 54,38→59,04s (+4,66s); hashes RGBA do fundo coincidiram nas amostras, mas foreground divergiu. O Canvas continuou usando `capturePage` e adicionou desenho; não foi promovido.
- Os vídeos reais são overlays externos do filter graph FFmpeg: `exportWorker` remove `mediaVideo` do pedido da surface. Zero `svgFallbackPresentations` não significa exportação sem vídeo. O fallback foi testado com cena sintética contendo mídia.
- No SVG, os workers acumularam 18,08s de `capturePage`, 4,83s de cópia/conversão BGRA e 43,74s de callbacks do stdin em parts concorrentes; são somas por worker, não tempo de parede. Motion ficou em 19,59s e render em 54,38s de parede.
- O worker de produção permanece SVG/capturePage. O próximo alvo é medir transporte/readback direto da superfície para o processo de exportação, incluindo custo IPC, mantendo FFmpeg para overlays de vídeo, áudio e fallback.
- Não trocar a captura padrão nem mexer em `paint-event` até equivalência por quadro/camada, cancelamento, timeout e vídeo em camadas.

### Fase ENG-03 — saída para encoder com fila limitada (pesquisa runtime inicial)

- `scripts/editor-v6/spike-webcodecs-encoder.cjs` provou H.264 sintético no Electron 45.1.0/Chromium 156: 150 quadros 1080p30, encode/flush 1.569,8 ms, remux silencioso por stream copy e ffprobe 150/150. O perfil é novo por execução e o diretório temporário é removido.
- Esse resultado não representa render da cena, qualidade comparável ao FFmpeg nem acelerador físico selecionado. Não comparar 1,57 s com os ~80 s do projeto real.
- Para avançar, transferir quadros já renderizados ao VideoEncoder com backpressure, testar H.264/PTS e integrar áudio/mux por FFmpeg. Projetos com overlays de vídeo ou camadas que exijam composição posterior podem requerer recodificação ou fallback integral para o FFmpeg atual.
- Fechar encoder/frame no sucesso, abort e falha; limitar queue/memória e manter fallback validado. Nenhum cache entre jobs.

### Gates desta etapa

- Fase 1 passou: `npm run typecheck`; `npm run audit:architecture`; 13 testes focados no novo plano/export worker/assets; `npm run test:editor-v6:export` (build + Electron, 81 quadros sintéticos, emenda Turbo/áudio e cenários de cancelamento/fallback); spike frio de 150 quadros H.264; `npm run test:editor-v6:integration -- --scope=all` (115 direcionados, Electron hair/scene, TypeScript, arquitetura, 366 testes completos + 1 skip e build).
- Contrato/superfície Canvas2D: `npm run test:editor-v6:surface` passou com golden expandido (fala, pensamento, narrador, sprite/atlas, imagem, fundo e asset não usado), cabelo em `capturePage`, round-trip SVG contaminado, alpha/camadas, rejeição de vídeo e liberação. `npm run typecheck` passou. `npm run test:editor-v6:export` passou: 81 quadros, 78 reutilizados, áudio contínuo, full HD, movimento/cancelamento/fallback, mais stress sintético de 301 quadros. `npm run test:editor-v6:integration -- --scope=all` passou: 115 direcionados, compositor nativo 4/4, Electron hair/scene, TypeScript, arquitetura (718 arquivos, 0 violações), 366 testes + 1 skip e build. O export worker segue SVG/capturePage; nenhum ganho de exportação real foi medido.
- A primeira tentativa de `test:editor-v6:export` parou no fixture de cor que solicitava `libopenh264`, encoder ausente no FFmpeg fornecido. O fixture foi ajustado para o `libx264` disponível e passou; o fallback de runtime não foi removido.
- Sem ganho real de exportação alegado nesta etapa. Antes de uma implementação de composição/encoder tornar-se padrão: golden RGBA, benchmark frio do projeto inteiro (2.394 quadros, 1080p30, áudio), qualidade decodificada e teste de fallback.

### Próximo ciclo mensurável

1. O microbenchmark direto Canvas→main foi concluído a 1080p em 3 processos Electron novos. TypedArray + conversão RGBA→BGRA empatou com `capturePage` dentro da variação; MessagePort com clone foi mais lento. Não integrar esse caminho.
2. Próximo experimento: testar alocação de threads do x264 em smoke curto e A/B frio completo. Use a mesma cena, encoder, bitrate, qualidade, áudio, workers e processo frio; candidate só é aceito se reduzir clique→MP4 validado.
3. Em paralelo, manter visíveis os maiores estágios medidos (render comum e motion). Coletar tempo por part/lane, encoder e peak RSS; somas de timings em partes concorrentes não são wall time.
4. Se o perfil de CPU não apontar margem de threads, voltar ao hotspot de preparo dos 37 bakes de movimento e verificar custo por pedido antes de mudar reuso por personagem. Não elevar concorrência nem mudar resolução/qualidade para obter um número melhor.
5. Avaliar WebCodecs/shared texture só com um resultado que atravesse composição real, vídeo, áudio, mux, backpressure, fallback e validação MP4; depois compartilhar o plano determinístico com preview/timeline por IDs.
