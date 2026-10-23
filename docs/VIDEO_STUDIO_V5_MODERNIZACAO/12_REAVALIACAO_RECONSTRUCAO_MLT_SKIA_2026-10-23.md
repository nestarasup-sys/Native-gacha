# Video Studio G-V5 — PLANO DIRETOR DA RECONSTRUÇÃO INTEGRAL DA ARQUITETURA

**Revisão de decisão: 23/10/2026 — V2 do planejamento, substituindo a tese de “modernização suficiente”.**  
**Estado de execução:** DECISÃO DE ESCOPO E ARQUITETURA-ALVO, **não** implementação concluída, merge aprovado ou escolha de engine.  
**Fonte auditada:** `nestarasup-sys/Native-gacha`, branch `feature/model-source-editor`, HEAD de referência `671e2d2dd767dbdc168cada6987d6d8f67afeff2`; PR #5 em rascunho para `refactor/shared-character-core`.  
**Escopo:** somente o **Video Studio**; Fabricador DEV, Customizador, Studio Principal, Roteiros e Base de Vídeos permanecem fora da reconstrução, salvo contratos estritamente necessários de consumo de arquivos/modelos/mídia.  
**Limite:** planejamento pode ser alterado apenas na branch autorizada. **Não** migrar/apagar projetos, personagens, roupas, expressões, poses, PNGs, vídeos, bibliotecas, backups, caches de origem ou arquivos pessoais sem permissão explícita.

> **VEREDITO ARQUITETURAL — OBRIGATÓRIO:** vamos **reconstruir integralmente a arquitetura interna do Video Studio**, não apenas otimizar, reorganizar arquivos ou prolongar a vida do editor experimental. Ao final, o novo editor deverá ter **fundação própria, modular, observável, resiliente e de execução limitada por recursos**, com timeline, avaliação de cena Gacha, composição, preview, áudio/vídeo, exportação, persistência e recuperação sob contratos claros. **O editor antigo é referência de comportamento e compatibilidade, não o alicerce definitivo.** Reutilizar código é permitido **somente** quando ele se encaixar e passar nos contratos da nova arquitetura. Electron/React podem continuar como shell e UI; FFmpeg, Canvas, MLT, GES, PixiJS, Skia, C++ etc. serão escolhidos por evidência, não por obrigação.

**O que “reconstrução completa” significa:** todas as responsabilidades críticas passam a pertencer à nova arquitetura e o caminho experimental antigo deixa de ser necessário para a execução normal do Video Studio. **Não** significa reescrever todas as linhas, criar outro aplicativo independente, trocar todas as linguagens, mudar o formato dos projetos, nem criar uma engine audiovisual nativa do zero se uma biblioteca existente resolver com qualidade.

## 0. Decisão oficial, princípios e precedência

### 0.1 A mudança de estratégia é definitiva para o planejamento

**Antes:** modernizar o editor atual com caches, isolamento, proxies e possíveis trocas de bibliotecas; se isso resolvesse o travamento, seria aceitável ficar com a organização antiga.  
**Agora:** as otimizações são **etapas de risco reduzido e experimentos**. A entrega final exigida é uma **arquitetura reconstruída de ponta a ponta**. Mesmo que um pequeno conserto elimine o OOM hoje, **isso não encerra a missão**.

A implementação será incremental e protegida por flags, mas o **destino arquitetural não é incremental indefinidamente**. Finalizar o projeto requer aposentar os caminhos experimentais duplicados, apagar dependências circulares do fluxo crítico com testes e manter fallback controlado somente enquanto necessário e tecnicamente justificado.

**Distinções obrigatórias:**

- **Reconstruir arquitetura ≠ reescrever tudo de uma vez.** Um módulo antigo pode ser extraído/adaptado depois de testes de contrato, sem arrastar seu estado global, cache paralelo ou dependência implícita de UI.
- **Manter Electron/React ≠ manter o VideoStudioEditor monolítico.** O shell/UI pode ser o mesmo framework, mas a autoridade de tempo, cena, recursos, export e persistência deixa de ficar distribuída em hooks e elementos DOM.
- **Manter FFmpeg ≠ manter o pipeline antigo.** FFmpeg pode ser um backend na engine nova com controle de trabalho e supervisão.
- **Melhora de 10× ≠ promessa.** Pode ocorrer em hotspots, mas a meta mensurável primária é **não corromper nem encerrar o editor principal sob stress controlável** e sustentar cargas maiores com degradação elegante.

### 0.2 Precedência e compatibilidade de documentos

Este documento passa a ser a **decisão arquitetural ativa do Video Studio** na branch citada. Os arquivos `00_PLANO_DIRETOR.md`, `01_ESTUDO_DE_MOTORES.md`, `02_ARQUITETURA_CANONICA.md`, `03_MIGRACAO_E_DADOS.md`, `04_LAB_E_GATES.md`, `05_DECISOES_ADR.md`, `06_BACKLOG_DE_EXECUCAO.md`, `07_MODOS_DE_EXPORTACAO.md`, `08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md`, `10_RELEASE_CHECKLIST.md` e `11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md` continuam referências **técnicas/históricas**, não autorizações para voltar à estratégia de “só melhorar o editor antigo”.

Em conflito: **integridade dos projetos e contratos compartilhados > semântica observada e testes atuais > gates deste plano > documentos históricos**. Sem resultados reais de benchmarks, não há aprovação de biblioteca só pelo nome. Referências antigas a repositórios/branches `G-V5/master-desenvolvimento` **não** autorizam escrita fora de `Native-gacha/feature/model-source-editor`.

### 0.3 O que está decidido e o que continua em aberto

| Item | Situação | Justificativa |
| --- | --- | --- |
| **Reconstrução integral da arquitetura interna do Video Studio** | **DECIDIDA / OBRIGATÓRIA** | O monólito experimental não será o fundamento permanente. |
| Preservar projetos, assets, poses, expressões normal/PT, fala, blink, mídia e regras atuais | **DECIDIDO / BLOQUEADOR** | Identidade Gacha e dados não podem ser sacrificados. |
| Nova separação de editor, domínio, avaliador, media engine, renderer, jobs e supervisão | **DECIDIDA / OBRIGATÓRIA** | Responsabilidades auditáveis e substituíveis. |
| Controle global de memória, filas finitas, isolamento das tarefas pesadas e recuperação | **DECIDIDO / OBRIGATÓRIO** | O relato de crash em projeto pesado é risco de produto. |
| Implementação em paralelo, etapas com flags, aceitação por testes Windows | **DECIDIDO / OBRIGATÓRIO** | Evoluir sem perder a versão funcional. |
| Manter Electron/React para UI | **DIREÇÃO PREFERIDA**, sujeita a bloqueador demonstrado | Reescrever shell/UI não resolve automaticamente OOM do motor. |
| Motor AV: FFmpeg atual/`libav*`/MLT/GES/libopenshot | **NÃO DECIDIDO** | Comparação com mesma cena e render Gacha. |
| Raster/compose: Canvas/PixiJS/Skia/Blend2D | **NÃO DECIDIDO** | Avaliar ROI, texturas, GPU e custo de readback. |
| C++/sidecar nativo | **NÃO DECIDIDO** | Isolamento pode usar processos Electron/Node; C++ não é meta. |
| Prazo, ganho “10×”, número exato de MiB e FPS em 48 atores | **NÃO DECIDIDO** | Definir após baseline no Windows. |

## 1. Diagnóstico de onde estamos — base existente NÃO é a arquitetura-alvo

### 1.1 Capacidades reais a preservar

| Comportamento observado | Implementação atual (ponto de referência) | Tratamento obrigatório |
| --- | --- | --- |
| Projetos e timeline 60 FPS | `src/shared/studio.ts`, `StudioDocument schemaVersion: 1` e `VideoTimelineDocument` | Leitura/escrita compatíveis; nova arquitetura pode usar representação interna diferente. |
| Blocos de personagem, keys/gaps, bordas de clip e estado base | `VideoTimeline.tsx`, `characterTrack.ts`, `videoTimelineIndex.ts` | Novo domínio/timeline e SceneCompiler preservam semântica por frame. |
| Mudanças de pose/expressão e transição | `videoCharacterTransitions.ts` e `useCharacterTransitions.ts`, interpolação de ~15 frames | Portar/adaptar matemática e assets; não depender de PNG intermediário por frame como modelo geral. |
| Normal/PT, olhos/pupilas independentes, roupas, proporções | `studioExpressionTransforms.ts`, `portableExpression.ts`, `characterRenderer.ts` | Contratos Gacha compartilhados intactos; testes ROI por pupila/pose/roupa. |
| Boca em fala e blink automático | `videoSceneIR.ts` e lógica do preview `VideoStudioEditor.tsx` | Um avaliador determinístico calcula estado do frame, sem temporizadores faciais independentes. |
| Texto/balões e vínculos ao speaker | `VideoStudioEditor.tsx`, `VideoStudioDomElement.tsx` | Mesma semântica, layout e ordem visual. |
| Vídeos, áudio, trim, posicionamento | `VideoClipPreview.tsx`, `videoMediaPlayback.ts`, `videoStudioAudioPlan.ts` | MediaService com PTS/reclock e oráculo de frames/audio. |
| Preview DOM e export Canvas separados | `VideoStudioDomElement.tsx`, `videoCanvasCompositor.ts`, `VideoExportSurfacePage.tsx` | **Unificar o contrato de cena** e remover duplicação de regras de renderização. |
| FFmpeg, export serial/Turbo, cache e recuperação | `videoExportCoordinator.ts`, `videoExportJobs.ts`, `videoSerialChunkEncoder.ts`, `videoPersistentFrameCache.ts` | Reaproveitar infraestrutura **como adaptadores/oráculos**, não como arquitetura que manda na nova. |

### 1.2 Por que não basta “limpar” o React

O `VideoStudioEditor.tsx` atual tem ~2.517 linhas e centraliza seleção, documentos, estado, preview, export, preload facial, autorretrato, histórico e sincronização. A cada tick de preview, múltiplas decisões passam pelo React; `HTMLVideoElement` por clipe ativo mantém decoders próprios. Frames de personagem podem circular como `dataUrl` entre keys, snapshots, caches de boca/blink, transições e export. Existem limites **por cache** (ex.: ~128 MiB de transições, ~96 MiB de bitmap por surface, ~96 MiB de layer canvas e ~96 MiB de cache semântico), **não um orçamento completo de RAM/VRAM para o app inteiro**.

**Cuidado factual:** a timeline **já tem virtualização de viewport** e o export **já tem backpressure, cancelamento, snapshots, persistência de jobs e 1–2 workers**. Portanto, “criar virtualização”, “criar FFmpeg” ou “adicionar limite a toda fila” não são tarefas automaticamente ausentes. O problema é a soma, as responsabilidades, a paridade e a ausência de uma política única verificável.

**Falha não diagnosticada:** o fechamento sob carga foi relatado e merece prioridade absoluta. Nenhuma revisão de Markdown, inclusive esta, prova que a causa foi `dataUrl`, GPU, decode, `structuredClone` ou um renderer específico. Medir antes de culpar uma biblioteca.

**Limite dos benchmarks históricos:** o relatório local de 20/10/2026 mediu ~1,11 GiB/1,52 GiB de árvore Electron numa amostra de 5 s (FFmpeg não integralmente somado); o soak de 15 min reutilizou um frame estático depois do frame 301. **Não** usar isso como prova de reprodução Gacha complexa durante 15 min. Hardware/GPU e commits registrados ali são históricos.

## 2. Arquitetura nova obrigatória (camadas e responsabilidades)

A arquitetura deve ser **desenhada como sistema novo**, com API e testes de contrato independentes. Os caminhos legados entram depois, por adaptadores temporários. Diagrama conceitual:

`StudioDocument v1 (e futuras versões aditivas) + assets originais`  
→ **ProjectRepository** (load, save atômico, recuperação, validação, journal, asset refs)  
→ **EditorCore** (comandos transacionais, undo/redo, seleção, timeline editing, snapping, viewport)  
→ **SceneCompiler + SceneEvaluator** (semântica absoluta por frame; pose, PT, mouth, blink, fala, z-order, PTS do projeto)  
→ **ScenePlan versionado + AssetManifest content-addressed**  
→ **EngineSupervisor + ResourceBudgeter + FrameScheduler** (admissão, isolamento, deadlines, leases, crashes)  
↳ **GachaRenderer** (partes/camadas/atlas e adaptador Canvas/Pixi/Skia)  
↳ **MediaService** (demux/decode/seek, áudio, proxies, PTS; backend FFmpeg/MLT/GES escolhido por teste)  
↳ **Compositor** (ordem estrita: personagens, mídia, balões, fundo, alpha; respeitar z-order)  
→ **PreviewTransport** (preview adaptativo, latest-wins; overlays interativos no React) **ou**  
→ **ExportJob** (snapshot imutável, todos frames/PTS, áudio/mix, encode, verificação, publish atômico).

**Shell de UI:** Electron + React (candidato preferido) apenas apresentando estado/comandos, playback e feedback; **não** autoridade única de alocação de bitmap/decoder, nem portador de objetos enormes de mídia.

### 2.1 Contratos sem dependências implícitas

| Módulo | Entrada/saída estável | Proibições |
| --- | --- | --- |
| `ProjectRepository` | `load / saveAtomic / recover / resolveAsset(id)` | Não sobrescrever originals ou perder versão anterior por crash. |
| `EditorCore` | comandos `apply/undo/redo` → revisão de documento e delta de timeline | Não armazenar PNG completo por frame no histórico, nem fazer codec no reducer. |
| `SceneCompiler` | `compile(snapshot, assetManifest) → compiledScene` | Não depender de DOM, áudio do sistema ou side effects do playhead. |
| `SceneEvaluator` | `evaluate(compiledScene, frameN) → FramePlan` | Não mutar estado acumulativamente, não depender de chamadas sequenciais. |
| `AssetResolver` | `assetId/hash/revision → bytes/texture lease` | Não carregar todo o catálogo Gacha ao abrir projeto; não usar URL base64 como identidade. |
| `GachaRenderer` | `FramePlan + asset handles + quality → layers/surface` | Não reinterpretar normal/PT ou mouth/blink independentemente. |
| `MediaService` | `clipTime/projectPTS → decodedFrame/PCM + PTS` | Não criar relógios independentes como fonte de verdade; não fugir do ResourceBudgeter. |
| `Compositor` | layers ordenados + vídeo + alpha → frame visual único | Não colocar sempre Gacha por cima: z-order pode exigir intercalação. |
| `PreviewTransport` | `requestId/frame/revision/quality/deadline → frameLease` | Não aceitar frame atrasado de revisão anterior; não acumular pedidos de scrub. |
| `ExportService` | snapshot imutável + variant → job/chunks/MP4 verificado | Não consumir proxies de baixa qualidade no resultado final; não publicar arquivos parciais. |
| `EngineSupervisor/Budgeter` | `reserve(bytes, category, priority)`, `release`, status/errors | Não confiar em tetos isolados como teto global, nem deixar erro da engine derrubar UI. |

**Contrato binário/transporte:** informar `protocolVersion`, `sceneRevision`, `frameIndex`, `PTS` racional, `assetManifestHash`, pixel format, alpha premultiplicado ou straight explicitamente, color space, stride, dimensões, tamanho e ownership da memória. Frames e bitmaps exigem lease/ACK/release, não JSON com PNG inteiro a cada tick.

### 2.2 A UI também será reconstruída — não apenas o encoder

Extrair uma aplicação modular de edição:

- `VideoStudioShell`: layout, navegação, painéis e lifecycle de documento.
- `DocumentController`: carregar/cerrar/salvar, recuperação e sincronização transacional.
- `CommandBus`/`EditorStore`: edições tipadas, undo/redo com budget, serialização e revision.
- `TimelineModel`/`TimelineView`: keys de personagem, mídia, balões, tracks, gaps, resize, split, snapping, virtualização atual preservada.
- `StageView`: visualização, canvas/texture e overlay de seleção/handles; desacoplada dos algoritmos de render.
- `PlaybackController`: clocks/seek, buffering, volume, transporte, overlays de estado.
- `AssetsPanel`/`Inspector`/`CharacterPanel`: modelos e faces sob demanda, sem capturar documento inteiro.
- `ExportPanel`/`JobsPanel`: progresso, métricas, cancel/resume, verificação e erro recuperável.
- `DiagnosticsPanel` opcional: memória por categoria/processo, qualidade efetiva e razão de fallback, sem dados pessoais.

**Critério de refatoração falsa:** renomear `VideoStudioEditor.tsx` ou dividir o JSX em 30 arquivos **sem deslocar ownership das responsabilidades** não conta como reconstrução. Cada novo módulo precisa ser testável sem montar o editor inteiro, receber entradas explícitas e liberar recursos em `dispose`.

### 2.3 Semântica Gacha é o contrato, implementação é substituível

O novo evaluator herda por equivalência, e não por copiar toda a estrutura, as regras atuais:

- Keys/gaps, mudança de pose/expressão, interpolação de 15 frames, hold e fronteiras.
- Expressão normal **não** recebe offset PT, expressão PT preserva pupila esquerda/direita com X/Y/rotação próprios e fallback legado.
- Blink determinístico, mouth pelas fases de fala ligadas ao balão/`speaker`, balões Unicode e efeitos.
- Modelos, corpo, roupa, cabelo, acessórios, máscaras/oclusão, transforms, crop e pivot.
- Vídeo e personagem intercaláveis em ordem de layers; áudio mixer respeita trim, posição e volume do clipe.
- Modos `animated` e `static-characters` permanecem compatíveis e testáveis.
- Preview e export leem **o mesmo frame plan**; diferenças permitidas de resolução/codec não podem gerar divergência semântica.

## 3. Política de reaproveitamento: o que aproveitar e o que aposentar

| Artefato atual | Decisão de tratamento | O que precisa acontecer antes da adoção |
| --- | --- | --- |
| `StudioDocument v1` e arquivos originais | **PRESERVAR FORMATO DE ENTRADA e dados** | Testes roundtrip, backups, migrações futuras aditivas. |
| `videoSceneIR.ts` e avaliação por frame | **BASE SEMÂNTICA DE REFERÊNCIA** | Extrair interface pura/versionada; comparar evaluator antigo e novo em fixtures e projetos v1. |
| Interpolação de pose/face, normal/PT, blink/mouth | **ADAPTAR/PORTAR** | Golden de pupila L/R, pose/corpo, roupas, transições e balões. |
| `VideoTimeline.tsx` com virtualização | **PODE REAPROVEITAR VIEW** | Separar modelo/edits/histórico/driver de estado; nenhum decoder ou asset pesado embutido. |
| Componentes React de inspector e seleção | **PODEM SER ADAPTADOS** | Eventos/comandos tipados; não depender de global do monólito. |
| Pipeline FFmpeg, probe, audio plan e verifier | **POSSÍVEL BACKEND DA NOVA ENGINE** | Adaptador com contratos, PTS e orçamento, aceitação de Windows. |
| Jobs, checkpoints, snapshot, cancel/recovery | **REAPROVEITAR INVARIANTES E TESTES** | Novos contratos de jobs/supervisor e revisão persistente; evitar backend legacy escondido. |
| `VideoStudioEditor.tsx` como orquestrador total | **APOSENTAR** | Nenhuma responsabilidade de orquestração/renderer/media/export nele ao final; componentes simples podem migrar. |
| `useCharacterTransitions` com PNG por frame como padrão | **APOSENTAR COMO ESTRATÉGIA PADRÃO** | Raster incremental ou cache por asset/layer, com golden de 15 frames. |
| Preview dominado por `HTMLVideoElement` por clipe + rAF de estado React | **SUBSTITUIR AUTORIDADE** | MediaService/scheduler único; `<video>` ainda pode ser um decoder atrás do adaptador se passar. |
| Duplicações de regras DOM vs Canvas | **ELIMINAR** | Uma SceneIR + layout visual canônico e ROI/golden equivalentes. |
| Caches independentes por contagem de strings sem soma global | **SUBSTITUIR POLÍTICA** | ResourceBudgeter por bytes + VRAM + leases + caches L1/L2 por revisão. |
| Legado como fallback temporário | **SOMENTE DURANTE MIGRAÇÃO** | Flag, logs, métricas, remoção planejada após gate; fallback final é de backend/qualidade, não monólito. |

**Regra anti-herança de problemas:** um componente só entra na arquitetura nova após **(a)** contrato explícito, **(b)** teste de paridade, **(c)** avaliação de memória e lifecycle, **(d)** teste de falhas, **(e)** ownership claro. Se não cumprir, usar seu código como referência e implementar novo módulo. **Não fazer adaptador eterno que chama metade do monólito.**

## 4. Política tecnológica: arquitetura definitiva, stack flexível

**A fundação modular é obrigatória; as marcas de bibliotecas não.** Antes de escolher MLT, GES, Skia ou C++, comparar com a baseline atual sob a mesma cena/PTS e com todas as despesas de processo incluídas.

| Eixo | Baseline/candidato preferencial de partida | Concorrentes investigáveis | Quando trocar |
| --- | --- | --- | --- |
| UI desktop | Electron + React + TypeScript | Outra UI só se bloqueio demonstrado | Não trocar shell apenas para perseguir performance do raster. |
| Domínio e SceneIR | TypeScript com módulos puros e versionados | Rust/C++ apenas se profiling comprovar gargalo de avaliação | Manter semântica única e migrável. |
| Raster de personagens | Canvas atual como oráculo + **compositor incremental novo** | PixiJS WebGL (1º laboratório), Skia, Blend2D | Ganho total A/B + paridade facial/roupa + custo de suporte. |
| Decode e audio/encode | FFmpeg CLI/FFprobe atuais sob nova orquestração | libav*, MLT, GStreamer/GES, libopenshot | Se custo de manutenção, sincronização, memória/seek e empacotamento vencerem. |
| Isolamento | BrowserWindow offscreen isolada (onde já existe) + supervisão, utilityProcess para IO/CPU sem DOM | Sidecar Node/C++ com Job Objects | Exigir domínio de falha independente e budgets; evitar C++ sem necessidade. |
| Cache | L1 RAM/VRAM por bytes, L2 em disco por hashes + revisão | Blender/Kdenlive como referências | Escolher formato conforme seek, invalidation e custo de regeneração. |
| Render output | Job serial como oráculo + Turbocom limite controlado + verificador FFprobe | Encoder/hardware alternativo | Nunca publicar MP4 sem verificação/finalização atômica. |

### 4.1 Por que não selecionar hoje uma engine definitiva?

- FFmpeg já resolve codecs e mux; adicionar MLT/GES só compensa se simplificar **timeline audiovisual ou gerenciamento de mídia** medido no Windows.
- PixiJS facilita atlas/texturas, mas precisa de GPU funcional e pode piorar `readback`; Skia nativo porta fonte/alpha/máscaras/expressões com custo grande.
- Escolher tecnologia não equivale a resolver OOM: memória de JS, decoder, nativo e GPU pode crescer sem **ResourceBudgeter** e cleanup.
- O plano **não** autoriza reescrever todo o Fabricador/Customizador para servir ao renderer do Video Studio. Adaptador do modelo Gacha é a fronteira correta.

### 4.2 Decisão de não-trabalho / descarte

**Não:** converter projetos autorais em XML MLT; prometer 10× sem métricas; manter editor experimental como runtime final; misturar as duas implementações sem checkpoint/paridade; substituir tudo por um aplicativo Qt; recompilar Gacha em vídeo intermediário completo a cada edição; deixar preview usar a única fonte de dados de export; armazenar imagem/PNG por frame em undo; rodar GPU/4K/2 workers sem orçamento; copiar código de apps open source sem checar GPL/LGPL/MPL e dependências.

**Sim:** preservar algoritmos úteis, fonte dos modelos e projetos; usar processos e layouts novos, medir por PID, fazer adaptações pequenas e reversíveis; tratar serial/FFmpeg/Canvas atuais como oráculos até a nova engine substituí-los.

## 5. Memória e recuperação são propriedades de arquitetura, não patches

**Exigência de arquitetura nova:**

1. **Contabilizar bytes** de thumbnails, dataURL/PNG comprimido, bitmaps Canvas, atlas, texturas, decoders, audio PCM, surfaces, IPC, export frames e jobs, distinguindo cache vs recursos internos estimados e monitoramento real Windows.
2. **Um Budgeter central por sessão + subtree de processos**: limites por recurso/papel, picos em voo, prioridades e perfil do dispositivo. Proxies/preview 540p/720p como degradação controlada, export no perfil original.
3. **Filas finitas** nos estágios `evaluate → decode → render → composite → transfer → encode`, com reserva de bytes e liberação explícita. Latest-only para scrub; export sequencial/determinístico sob pressão.
4. **Scheduler orientado por deadlines**: input/UI e áudio/preview competem com thumbnails/prerender de prioridade inferior. Reduzir concorrência se RAM/VRAM sobem; não fazer prefetch sem limite.
5. **Isolamento de trabalhos pesados:** preview/render/decode/export fora da thread da UI, processos supervisionados onde exigidos. Um Worker no mesmo processo **não garante** isolamento contra OOM total; `utilityProcess` não fornece Canvas/DOM automaticamente.
6. **Recovery:** supervisionar exits/timeouts/GPU lost, reabrir último estado persistido, religar serviços, reidratar assets em leitura, tombstone de jobs parciais. Não prometer sobreviver ao encerramento de todo o SO.
7. **Persistência segura:** autosave serializado, versão anterior preservada até validação, journal/checksum com cópia, nada que dependa apenas de memória do renderer para ser recuperado.

Um frame 1080p RGBA usa **8.294.400 bytes (~7,91 MiB)** e 4K UHD usa **33.177.600 bytes (~31,64 MiB)**; cópias e texturas importam. **Teto de LRU local não prova teto global**. Escolher valores numéricos somente após medir por PID/VRAM no Windows real, sem confiar em número único de `heapUsed`.

### 5.1 Política de resposta sob pressão

`normal` → reduzir prefetch/thumbnails → expulsar cache não pinado → reduzir preview/decoders fora da janela → serializar export → informar modo degradado → erro de tarefa isolada e recuperável. **Nunca** resolver pressão descartando o documento, pulando frames do MP4 final ou desativando transições Gacha no export.

## 6. Projeto e mídias: reconstrução sem apagar legado

- **Arquivo autoral:** `StudioDocument schemaVersion:1` permanece legível e gravável. A representação do novo `EditorCore` é interna e versionada; mudanças de schema de disco só com ADR, migração **aditiva**, backups, plano de rollback e testes v1.
- **Original media/asset:** imutável por padrão, armazenado/copiado em caminho autorizado; `AssetManifest` com ID/hash/dimensões/revisão; CAS para derived assets, não excluir referência original.
- **Undo/redo:** comandos/revisões com limite por bytes (e.g. payload/diffs) sem guardar cópia raster de cada estado. 1.000 edições e reaproveitamento de objetos precisam ser medidos; exatidão de undo permanece.
- **Autosave:** escrita temporária + fsync/conferência apropriada + swap atômico dentro do volume quando suportado; journal/recover após kill; não assumir que um único rename resolve todas as situações sem teste Windows.
- **Cache:** thumb/proxy/preview render/bitmap/semantic frame **não** são originais. Podem ser descartados/recalculados com proteção contra limpezas fora da raiz de cache.
- **Compatibilidade:** importar projeto antigo e exportar cenas antigas sem mutar mídia; se asset faltar, mostrar recurso ausente de modo recuperável, nunca apagar automaticamente a referência.
- **CI:** usar somente fixtures sintéticas ou autorizadas; **nunca** publicar dumps, frame RAW, conteúdo de fala ou biblioteca pessoal em logs/artefatos.

## 7. Produto e comportamento: o que precisa continuar funcionando

A reconstrução só é válida se conseguir editar, visualizar, salvar/reabrir e exportar:

1. Keys/blocos e gaps de personagem, pose/expressão/transição, posição/escala/flip/transform, prioridades de camadas.
2. Preset facial normal sem offset artificial, PT com pupila esquerda e direita independentes (X/Y/rotação), fallbacks legados, blink automático e boca nas seis fases ligadas a fala.
3. Balões com tipografia/Unicode e vínculo ao speaker, fundo, overlays de palco, clipes de vídeo como camadas com trim/transform, mídia ausente recuperável.
4. Áudio original de vídeos, áudio importado, volume/mute/trim/mix, sync e decodificação de FPS misto/VFR com timestamps reais.
5. UI: biblioteca, inspector, adição/remoção de personagens, timeline, snapping/resize/split, zoom, lock, seleção, histórico, fullscreen, play/pause/seek e indicadores de progresso.
6. Export de `animated` e `static-characters`, MP4 H.264/AAC no perfil adotado, serial oráculo, paralelismo orçado, cancel/recovery, output verificável.
7. Reabrir projeto e continuar edição após falha recuperável; não deixar erro de decode/preview invalidar os dados.

**Oráculos:** (a) semântica `evaluate(frame)`, (b) ROIs/pixel alpha/composite de olhos/boca/roupa/transições, (c) PTS de vídeo e áudio e full decode MP4, (d) roundtrip v1 e undo/redo, (e) stress real Windows. Em conflitos, **dados e semântica não podem ser “aproximados” para ganhar FPS**.

## 8. Plano de construção DA NOVA arquitetura: marcos com remoção do legado

A execução avança em **vertical slices** que criam a nova arquitetura, testam contra o produto atual e **desligam o caminho antigo da responsabilidade migrada** depois do gate. Melhorias no legado podem ser aplicadas apenas como mitigação urgente e medição, não como declaração de missão concluída.

| Marco | Entrega tangível no novo sistema | Gate / remoção correspondente |
| --- | --- | --- |
| **N0 — Inventário e especificação** | Contratos de funcionalidades, asset manifest, SceneIR/FramePlan VNext, histórico v1, fixtures e goldens, mapa dos fluxos legados | Nenhum caso Gacha sem dono e sem oráculo; readme e ADR apontam reconstrução integral. |
| **N1 — Diagnóstico e laboratório** | Harness sintético Windows, medição RAM/commit/VRAM/processos e replay de crash/soak; baseline fria/quente | Dados de gargalo e budgets iniciais, sem afirmar causa não reproduzida. |
| **N2 — Núcleo de domínio independente** | `EditorCore/CommandBus/DocumentController` + timeline model puro, undo e asset ID; sem React no núcleo | 100% operações existentes cobertas por contrato/roundtrip; UI legacy ainda opera apenas como comparação. |
| **N3 — Novo SceneCompiler/Evaluator + Gacha asset resolver** | Frames absolutos determinísticos, normal/PT, blocos/15 frames, fala/blink; identidade/hash de assets | Passa golden semântico/ROIs e não duplica PNG por key; antigo evaluator vira referência, não runtime necessário. |
| **N4 — Nova engine de Gacha/render** | compositor incremental por partes ou camadas, budget/eviction, adapter Canvas/Pixi/Skia aprovado | Uma alteração de olho/boca não recompõe desnecessariamente assets estáticos; fallback correto e preview visual parity. |
| **N5 — MediaService + clock/PTS** | Codec/decode, seek, múltiplos vídeos, áudio, proxies, z-order e scheduler autoritativo | A→B→A, VFR, AV sync, sem clocks concorrentes; preview legado desligável. |
| **N6 — Execução e preview isolados** | supervisor, jobs, transport, cache de preview chunks e degradação controlada por RAM/VRAM | Fault injection durante Play e scrubbing sem perder projeto; engine reinicia; renderer antigo de preview aposentado. |
| **N7 — Exportação ligada à engine nova** | ExportService determinístico, snapshots e assets pinados, chunks/cancel/resume, FFprobe/full decode + publish atômico | Preview/export partilham plano semântico; serial e Turbo/1–2 workers medidos; nenhum MP4 parcial publicado. |
| **N8 — Nova interface completa** | Shell, timeline, panels, inspector, gestures, history e UX ligadas ao EditorCore novo | Full parity de ações, React não coordena bitmap, codecs, render e jobs; `VideoStudioEditor` monólito deixa de ser runtime. |
| **N9 — Soak, compatibilidade, packaging e desativação** | Windows 15–30min **com quadros mudando**, stress edit/play/seek/export, GPU fallback, app offline, projetos v1 | Todos gates de `9` e `17` verdes; **nenhum fluxo crítico depende da arquitetura experimental**. |
| **N10 — Handoff e liberação** | ADR definitivo de stack, documentação de módulos e custos, release gate, rollback/feature flags removidas ou justificadas | Aceite do criador, autorização de merge/release separada; CI em HEAD de release, não em commit histórico. |

**Sequenciamento e dependências:** N1 inicia com N0; N2/N3 fornecem novo contrato; N4 e N5 podem ser prototipados separadamente com fixtures; N6 integra sob budget; N7/N8 completam fluxos; N9 remove o velho; N10 exige aceitação. Se uma decisão de engine falhar, o módulo alternativo troca, **a reconstrução não é cancelada**.

### 8.1 Marcos que não podem ser falsamente concluídos

- N2 não está pronto só porque existe outra pasta `editorCore`; a timeline deve executar ações reais sem delegar ao monólito.
- N3 não está pronto só porque a SceneIR antiga foi copiada; estado PT, gaps, mouth/blink e bordas devem passar no contrato.
- N4 não está pronto apenas com benchmark de 1 ator/sprite; precisa memória controlada, múltiplos personagens e source assets reais em fixture autorizada.
- N6 não está pronto por criar um Web Worker no processo da UI; fault domain e recovery devem ser verificados por PID.
- N7 não está pronto porque exporta 5 s; precisa áudio, frames diferentes por tempo, cancel, restart, verificação, execução longa.
- N8/N9 não estão prontos enquanto o app depende do `VideoStudioEditor.tsx` como motor oculto, com regras paralelas DOM vs Canvas.
- N10 não é autorização automática para tocar branch de destino, `main`, instalador público ou projetos privados.

## 9. Definição objetiva de pronto e metas de qualidade

### 9.1 Portões obrigatórios (falha em um bloqueia a conclusão)

| Gate | Demonstração exigida | Falha bloqueadora |
| --- | --- | --- |
| **A — Arquitetura de verdade** | EditorCore, SceneEvaluator, compositor, MediaService, scheduler, jobs e persistência com contratos e testes isolados; componentes legados sem controle do fluxo central | “Refactor cosmético”; monólito antigo segue mandando no tempo/recursos. |
| **B — Integridade e compatibilidade** | Leitura, edição, save, reopen e export de `schemaVersion:1`; projetos v1 nunca apagados ou sobrescritos por migração destrutiva | Perda/corrupção de dados, PT alterado, asset substituído silenciosamente. |
| **C — Paridade Gacha** | Pose/expressão/transição, normal/PT L/R, blink, talk, balão, gaps, layer order, máscaras/crop/roupa equivalentes em frames e export | Pixel/estado Gacha incorreto, independentemente da FPS. |
| **D — AV e export** | Frame boundary e PTS sob fontes VFR, áudio sincronizado, FFprobe/decode integral, modalidades animated/static, serial/parallel, cancel/retomada | Frame errado, drift fora do limite documentado, MP4 parcial ou corrupto. |
| **E — Memória/robustez** | Pressão controlada por budget agregando JS/decoders/bitmap/IPC/native/GPU, monotonia de fila limitada, worker crash recuperável | UI principal morre por falha isolada da engine; cache/fila cresce sem freio; perde projeto. |
| **F — Stress real editável** | 12/24/48 personagens, centenas de keys e expressão normal/PT, 1/2/4 vídeos, scrub/play e 15–30 min de animação variável | Soak com frame repetido tratado como validação final; OOM sem fallback/diagnóstico. |
| **G — Windows/distribuição** | Instalação limpa x64, FFmpeg/deps embutidos com licenças auditadas, sem PATH do desenvolvedor, driver GPU/CPU fallback | Falha sem SDK externo, binário opcional obrigatoriamente instalado, plugin incompatível. |
| **H — Substituição final** | Nenhum fluxo crítico depende de orquestração experimental; limpeza dos caminhos paralelos; documentação e ADR final | Entrega como “modernização” sem novo núcleo completo. |

### 9.2 O que significa “10× melhor”?

**Aspiracional, não contratual.** Comparar sempre contra o baseline documentado no **mesmo hardware/commit/fixture**: memória de pico e patamar, tempo de primeiro frame, seek p95, dropped frames, FPS de preview, throughput de export e taxa de crashes/recuperações. O ganho pode ser de **capacidade e confiabilidade** (projeto antes crashava, agora trabalha e salva) mesmo sem 10× em FPS. Nenhum número publicitário sem pelo menos três execuções controladas, parâmetros e variação documentados.

**Objetivos de engenharia antes das metas numéricas:** nenhuma perda de dados, nenhuma publicação parcial, nenhum reprocessamento sem limite de um asset idêntico, nenhuma mudança semântica para aumentar FPS, budget/queues observáveis. Em perfis extremos, preview pode reduzir FPS/qualidade — export mantém 60fps e qualidade final correta.

## 10. Experimentos que decidem as bibliotecas (sem alterar o destino arquitetural)

Separar decisões A/B para não confundir ganhos:

**X0 — Oráculo:** pipeline atual FFmpeg + Canvas/DOM e SceneIR, cronometrado e instrumentado.  
**X1 — Novo núcleo + Canvas/FFmpeg existentes como adaptadores:** medir efeito da **arquitetura nova sem novas bibliotecas**. Isso não é “ficar com editor antigo”: o `EditorCore`, evaluator, scheduler, budget e supervisão são novos.  
**X2 — Gacha GPU:** PixiJS WebGL vs Canvas incremental, avaliando upload/readback, 12/24/48 atores, PT normal, roupa e composição.  
**X3 — Media engine:** FFmpeg CLI/library vs MLT vs GES **somente se** X1 mostrar necessidade; mesma FramePlan e rastros PTS/áudio.  
**X4 — Raster nativo:** Skia/Blend2D ou C++ sidecar se Canvas/Pixi não atenderem ou custo técnico justificar; nunca bloquear a nova fundação enquanto aguardam.  
**X5 — Stress e integração:** cache cold/warm, Play/seek, 15–30 min variáveis, falhas injetadas, offline Windows, migração de v1 em cópia, paridade visual/AV.

Cada spike gera ADR `aprovado/rejeitado/em aberto` com custos totais, versão/licença, benchmarks, SHA, hardware, RAM árvore **e** VRAM, resultados de Golden/PT/AV e estratégia de rollback. **A responsabilidade nova não muda se backend for rejeitado.**

## 11. Segurança, execução e documentos de pesquisa preservados

### 11.1 Não interferir no restante do Gacha

- Nenhuma dependência do Fabricador, Customizador ou Studio Principal pode ser modificada casualmente por um experimento audiovisual. Mudanças em contratos compartilhados exigem suíte de testes de continuidade e autorização de escopo.
- Originals e bibliotecas reais ficam fora de testes destrutivos; projetos são copiados e sintéticos. Assets temporários gerados por testes têm raiz isolada e limite de disco.
- Controles de execução devem respeitar segurança Electron/IPC, caminhos autorizados e validação de dados, e nunca executar shader/script não confiável por padrão.
- Rollback de versão nova pode retornar à leitura de projeto original; migrar schema só com backup/versionamento/compat. Logs, dumps e tracing são privados/local somente com opt-in para diagnósticos intensivos.
- Branch **única de trabalho:** `feature/model-source-editor`; não tocar `main` ou fazer merge/release automático. PR #5 continua rascunho sem autorização explícita.

### 11.2 Como usar as seis investigações abaixo

Os capítulos **12–17** preservam e aprofundam a pesquisa feita sobre:

1. **RAM/VRAM e causa de OOM** — `12`, medição PID/heap/decoders e baseline.
2. **Renderização Gacha incremental** — `13`, sprites, expressão PT/normal e texturas.
3. **Proxy/pré-render inteligente** — `14`, invalidação por intervalos/dependências, chunks e disco.
4. **Isolamento e recovery** — `15`, processos, leases, budgets e supervisão.
5. **Relógio AV/PTS** — `16`, VFR, seeks A→B→A e mix áudio.
6. **Stress automatizado** — `17`, fixtures reais/sintéticas, fault injection e golden, soak 15–30 min.

A pesquisa detalhada funciona como **base para projetar módulos novos**, não como backlog de “consertar o editor legado até parecer suficiente”. Mesmo se X1 com Canvas/FFmpeg vencer, os marcos N2–N9 continuam obrigatórios. O capítulo **18** reúne fontes externas.

**Status de execução atualizado:** cinco prioridades têm **entregas iniciais de código** na branch, **não a reconstrução completa**. (1) `getVideoStudioMemoryReport()` usa métricas Electron por PID e há probe PowerShell Windows para descendentes/FFmpeg; **sem medidas reais nesta sessão e sem VRAM/ETW**. (2) Ledger de **160 MiB por export surface** orça cache de layers Canvas, ImageBitmaps emprestados e retenção estimada de arte Gacha via `VideoStudioBoundedMemo`, mas não a árvore Electron ou buffers internos. (3) `VideoStudioCommandHistory` independente da UI preserva checkpoints/undo/redo, porém persistência/EditorCore total continuam legados. (4) Receitas Gacha usam memo LRU por bytes; **render por peças/atlas ainda não foi implementado**. (5) `projectClock.ts` compartilha regras inteiras de 60 fps entre preview e SceneIR/export; áudio master, VFR e fault injection ainda exigem validação. CI de contrato específica executa no Windows. **N0–N10 e os cinco objetivos finais permanecem abertos até stress Windows e migração arquitetural total**. Nenhum ganho 10× nem solução definitiva do OOM foi demonstrado. A CI Windows também faz smoke de PowerShell em processos e SceneIR sintético com 12 atores/4 vídeos; harness manual 12/24/48 atores com 15 min amostrados está disponível, **sem validar raster Gacha, Windows GPU ou áudio/export por completo**. Os diagnósticos também retêm em memória até 24 eventos Electron de `render-process-gone`/`child-process-gone` (motivo/exitCode, sem projetos) e o CI Windows passou a avaliar a SceneIR sintética para 12/24/48 atores com 15 minutos de timeline **amostrada**, não um export completo. **Métrica CI Windows registrada:** [run 40003220416](https://github.com/nestarasup-sys/Native-gacha/actions/runs/40003220416) avaliou 1.500 quadros amostrados por cenário em timeline sintética de 54.000 quadros: 12 atores/300 keys p95 0,081 ms, 24/600 p95 0,047 ms, 48/1.000 p95 0,075 ms; sem raster, decoders, áudio, FFmpeg ou VRAM. Esses números **não** demonstram estabilidade de export pesado e não encerram nenhum dos cinco gates completos. A camada de admissão mais recente agora reserva bytes de frame antes do seek/bitmap e limita geração Gacha a 1 trabalho ativo + 8 aguardando com lease estimado de 16 MiB. Ainda não é orçamento real multi-PID/VRAM. O oitavo corte passou a contabilizar também o cache de imagens fonte do compositor (48 MiB de retenção estimada; anteriormente até 256 imagens por contagem), ainda sem contabilizar texturas GPU ou decoders. O nono corte reutiliza preparação estática de corpo/roupa/cabelo em receitas face-only, com LRU por bytes e testes de poses distintas; os renders faciais ainda geram PNG e o compositor em partes continua pendente. O décimo corte faz o renderer comum usar caches por bytes apenas quando a export surface os habilita, incluindo imagens de corpo, cabelo e tons de pele; Fabricador e Customizador permanecem no comportamento default. O décimo primeiro corte liga renderização Gacha direta em Canvas do preparador à export surface, eliminando encode/decode PNG intermediário no caminho de expressões; o compositor multicamada por sprites permanece aberto para golden visual real. O corte seguinte separa a montagem Gacha em grupos Canvas persistentes abaixo/acima da face, elevando a estimativa da preparação para seis superfícies. Ainda sem validação golden real/VRAM.

---

### 11.3 Avanço do pipeline: admissão pré-alocação e trabalho Gacha finito (23/10/2026)

**Problema reproduzível em código:** até este corte, o pool de frames de vídeo chamava `createImageBitmap()` e **só depois** verificava o orçamento. Isso permitia um pico de bitmap RGBA **antes** da negação, justamente no ponto de maior risco de OOM. O renderer de personagem mantinha cache por bytes, mas o **trabalho em execução** não tinha admissão própria.

**Contrato novo N1/N4/N6:** o pool usa dimensões `videoWidth/videoHeight` para reservar `bytes = largura × altura × 4` antes do seek e da materialização; fecha frames fora dos limites e libera leases em **todas** as saídas, inclusive abort, decode failure e dispose. O GachaRasterAdmission reserva **16 MiB estimados por trabalho ativo**, serializa receitas, limita a **8 trabalhos aguardando** e rejeita trabalho novo antes de renderizar quando faltar budget. O scheduler não altera poses, expressão normal/PT, regras de fala/blink ou bitmap final; somente decide **quando** um render pesado pode começar.

**Gate de regressão Windows:** testes de mocks devem demonstrar zero `createImageBitmap` quando não há reserva, nenhum lease restante em falha/abort/descarte, nenhuma expulsão de frame emprestado, no máximo um trabalho Gacha ativo, fila finita e resultado semântico conservado. Testar Canvas/PNG real + GPU/VRAM + FFmpeg é **gate distinto ainda aberto**. Métricas exigidas na experiência física: pico/commit privada por PID, working set, GPU, número de decoders, frame admission denials, latência p95 por frame e variância durante export de 15 min com frames diferentes. **Nenhuma alegação de solução definitiva de OOM.**

---

### 11.4 Evolução do cache de `HTMLImageElement` por orçamento (23/10/2026)

O compositor de exportação ainda mantinha um `Map<string, Promise<HTMLImageElement>>` com até 256 imagens, independentemente da resolução: dez imagens grandes podiam equivaler a centenas de MiB de dados decodificados. O oitavo corte substitui isso por um memo assíncrono com **até 128 entradas e 48 MiB de pixels estimados por surface**, integrado ao `VideoStudioResourceBudget` compartilhado de 160 MiB e expulsão LRU de derivados sob pressão. Imagem não admitida permanece **utilizável transitoriamente**; nada é perdido do projeto.

**Critérios de validação:** reservas por `naturalWidth × naturalHeight × 4`, rejeição de retenção de imagens acima do teto, liberação de leases em `clear()`, comportamento de composição inalterado, e CI Windows sem regressão. **Não** equivale a limitar buffers de decode/VRAM nem comprova melhoria real sem benchmark e captura Windows.

### 11.5 Preparação de rig estático reutilizada nas variantes faciais (23/10/2026)

**Evidência em código:** `prepareSavedCharacterRenderer()` já separava o desenho da base/roupa/cabelo do `render(appearance, transforms, effects, mode)`, mas o `TransitionRenderer` chamava **um novo prepare por cada variante de boca/blink**. A exportação agora classifica o caso `from === to` com `fromPose === toPose` como *face-only* e reutiliza a preparação por identidade imutável de personagem, pose, modelo e **aparência facial completa**. O `render()` facial continua a receber todas as transformações PT (incluindo pupila L/R), efeitos e modo do frame; o sistema **não** aproxima pixel por interpolação de imagem.

**Orçamento e descarte:** LRU de 8 rigs estáticos e 48 MiB estimados de quatro superfícies RGBA por rig, somados ao budget local já compartilhado. `clearPrepared()` libera referências/leases; `dispose()` remove caches derivados após export. Transição real de pose continua usando `mixPoseArtwork()` e `prepareSavedCharacterRenderer()` sem cache, para preservar a fidelidade geométrica.

**Gate do corte:** testes Windows com chamadas simuladas confirmando 6 variantes boca/blink para 1 montagem-base, cálculos normal/PT individuais e efeitos sem alteração, invalidação quando a pose ou set facial muda e liberação por pressure/cleanup. **Gates ainda abertos:** golden pixel real com modelos/roupas e test 15–30 min com render de todos os quadros. Não chamar isso de motor Pixi/Skia ou de compositor por sprites completo.

### 11.6 Cache de assets Gacha com escopo exclusivo na export surface

Além da reutilização da montagem-base por pose, a exportação agora ativa três `VideoStudioBoundedMemo<HTMLImageElement>`: imagens originais do personagem (24 MiB), recoloração de pele (16 MiB), recoloração de cabelo/olhos (16 MiB). Todos admitem por estimativa `largura × altura × 4` e somam com os caches do Canvas/video/rig no ledger **de 160 MiB por surface**. A configuração é **opt-in** via `configureVideoExportCharacterImageCaches(budget)`, e `clearVideoExportCharacterImageCaches()`/`disposeVideoExportCharacterImageCaches()` liberam referências/leases sem escrever em assets originais.

**Proteção de escopo:** módulos de Fabricador/Customizador/Studio comum não são convertidos para esse modo nem perdem seus caches por padrão. A prova de regressão deve contemplar source image, skin tint e cabelo em fixtures reais; os testes sintéticos exercitam budget/cleanup, não equivalência visual pixel a pixel.

### 11.7 Rota Canvas direta do Gacha: elimina PNG intermediário da exportação (23/10/2026)

O núcleo de personagem preparado agora oferece `renderToCanvas()`, mantendo `render()` legado para compatibilidade. O desenho normal/ PT, camadas da roupa, cabelo e expressão continuam no compositor de origem; o `TransitionRenderer.renderCanvas()` retorna superfície RGBA própria e elemento transformado usando `faceRenderGeometry` com o mesmo recorte alfa do legado. Recorte é feito com `getImageData` diretamente da superfície final e cópia em canvas independente; não há `toDataURL` nem `new Image` para materializar cada variante de fala/olhos durante a exportação. Export surface ativa este modo explicitamente; outras telas e assets persistidos não são alterados.

**Armadilhas evitadas:** (1) snapshots RGBA são independentes da memória mutável da pose preparada, (2) as chaves cacheadas diferenciam Canvas/PNG, (3) pixéis transparentes usam limiar alfa >8 como `trimTransparentImage`, (4) uma falha de readback recua para a superfície inteira em vez de inventar crop, (5) o compositor mantém plugins, flipX, geometria 1920×1080 e z-order da SceneIR.

**Ainda não é compositor Pixi/Skia por sprites:** há uma composição Canvas final das camadas Gacha em cada variante, embora **o corpo/roupa/cabelo preparado seja reutilizado e o encode/decode PNG desapareça do hot path**. A próxima decisão só deve permitir mistura de superfícies individuais body/face/hair com golden real de oclusão/PT e métricas GPU/CPU; isto é um gate visual e não pode ser marcado completo a partir de mocks Node.

### 11.8 Subcamadas de rig estático: composição inferior/superior independente do rosto

A etapa seguinte à saída direta Canvas separou subcamadas **body + back hair + wardrobe** e **front hair + garment above hair**, pré-compostas uma vez por rig de pose. O caminho de cada expressão usa apenas `behindFace → drawFaceCatalogOverlay/legacyFace → inFrontOfFace`, preservando z-order e o posicionamento da pupila PT. `gachaStaticLayers.ts` centraliza esta montagem fora do `characterRenderer.ts`, respeitando o teto de linhas do módulo central; a estimativa do rig passou a `largura × altura × 4 × 6` bytes considerando canvas extras.

**Significado do marco:** há agora compositing por **três grupos** com cache de corpo/roupas/cabelo e face dinâmica, e saída final Canvas sem round-trip PNG de expressão. **Não** há ainda engine de sprites individualmente reposicionáveis em GPU nem golden Windows real de roupas/pupilas para reivindicar equivalência visual demonstrada. Essa validação é pré-requisito para substituir o compositor antigo em outras telas.

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

**Prioridade: P0/P1; maior diferencial técnico específico do produto e subsistema obrigatório do novo GachaRenderer.** O `characterRenderer` compõe modelos/poses/face e o `transitionRenderer` gera estados intermediários com `renderSavedCharacter` + crop + `dataUrl` por frame. O preview fala/blink também mantém imagens renderizadas. A pesquisa indica que o caminho barato deve ser **reutilizar recursos estáveis e trocar somente o estado facial necessário**, *se* o renderer conseguir manter a paridade das transformações e máscaras.

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

**Prioridade: P1; integra o novo PreviewTransport/MediaService sem comprometer edição e export.** Importante distinguir **proxy de vídeo original** (reduz custo de decodificação) de **preview render da composição Gacha** (reduz custo de efeitos/transições). Essas soluções são complementares, não iguais.

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

**Prioridade: P0/P1 para robustez; integra o novo EngineSupervisor e não depende de C++.** O usuário quer que o Native Gacha continue aberto mesmo se um decoder ou renderer falhar. Não é possível prometer isso ao OOM do **SO inteiro**; o desenho deve limitar trabalho antes do esgotamento e preservar dados do editor independentemente do render.

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

**Prioridade: P1, segurança de sincronização e requisito do novo MediaService.** O código atual `VideoStudioEditor.tsx` calcula o playhead com `performance.now()/requestAnimationFrame`; cada `VideoStudioClipPreview` tem `HTMLVideoElement` e `VideoMediaPlayback` tenta corrigir `currentTime` quando desvia. No export, o `buildVideoStudioAudioPlan` usa `atrim/aresample/volume/adelay/amix` por clipe via FFmpeg. Em projetos com 2–4 mídias, o novo desenho deve ter **um único tempo de apresentação**, não múltiplas correções mutuamente independentes.

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

**Prioridade: P0 para validar todas as outras e certificar a substituição da arquitetura antiga.** Não usar somente unit tests ou soak de encoder com frame repetido. Construir **laboratório que gera e opera projetos sintéticos editáveis**, com evidência por commit/hardware, comparação de pixels/semântica, vídeo/áudio e recursos do sistema.

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

**Ordem de engenharia para o novo núcleo:** N0/N1 contratos e instrumentação; N2 EditorCore; N3 evaluator/asset refs; N4 GachaRenderer incremental; N5 MediaService; N6 supervisor/preview; N7 export; N8 UI; N9 stress/remoção de legado; N10 aceite. O plano não termina com mitigação pontual de OOM. Flags são mecanismos de transição, não justificativa para deixar dois motores permanentes. **Não escolher MLT, Skia, C++ nem migrar schema antes dos gates apropriados.**

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

**Síntese final vinculante:** **a reconstrução integral da arquitetura interna do Video Studio é o resultado obrigatório**. Diagnosticar OOM e melhorar caches são etapas de engenharia dessa reconstrução, **não substitutos dela**. O produto final deve executar sobre EditorCore/SceneEvaluator/GachaRenderer/MediaService/EngineSupervisor/ExportService independentes, sem dependência crítica do orquestrador experimental. **Electron/React preferidos; MLT/Skia/C++ opcionais; compatibilidade de projetos, paridade Gacha, orçamento de recursos, isolamento, recuperação e testes Windows obrigatórios.** Nenhum ganho numérico, sobretudo 10×, está prometido sem benchmark.
