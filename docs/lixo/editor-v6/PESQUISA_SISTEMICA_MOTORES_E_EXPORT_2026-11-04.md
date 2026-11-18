# Editor V6 — Pesquisa sistêmica de arquitetura, motores e exportação

> **Rodada 16 / 04-11-2026. Documento vivo de pesquisa, não implementação.** Branch `Dev-V2`, base `3a1a99ab8e599ac83b4ede322ba381f82ac0076c`. Links e hipóteses sujeitos a verificação. Esta rodada **não mediu aceleração** e **não alterou o motor de produção**.

**Missão:** estudar mudanças em **todo o Native-gacha** (Fabricador, Customizador, Studio, Editor V6, Electron, formatos, motor gráfico, codec e UX), inclusive bibliotecas e ferramentas externas, que tornem o primeiro MP4 mais rápido e a criação de vídeo mais agradável. Evitar “otimizar 1% do lugar errado”. Classificar evidência, medir barato, implementar só com paridade e progresso demonstrados.

**Não negociável:** primeira exportação bruta; **não recriar o cache de reexportação** R10 removido em R12. Windows 11 x64 + AMD/AMF como aceite de velocidade; CI Windows Server x64 apenas regressão. **Nunca Linux.** MP4 1080p/30 FPS/300 frames e qualidade, áudio, boca, expressão, roupa, contornos, cabelo dinâmico 120 Hz, espelhamento, transparência e cancelamento intactos. A prévia normal continua sem cabelo experimental (somente MP4 e laboratório DEV). Projetos pessoais intocáveis, somente backups verificados/isolados para testes.

## 1. O que sabemos e o que não sabemos

| Item | Situação |
| --- | --- |
| Benchmark pessoal `Editor V6 06` (2 personagens, Preset 2, 300 frames 1920×1080, AMF, Turbo) | **[MEDIDO anteriormente]** melhor MP4 completo 34,15 s; mediana/média quente 34,33 s; frio 53,47 s |
| Preparo do cabelo | **[MEDIDO anteriormente]** 18,23 s quente, 11 transições |
| Export principal | **[MEDIDO anteriormente]** 16,10 s quente |
| Áudio/vídeo real nesse trecho | **[LIMITAÇÃO]** nenhum clipe; só testes sintéticos validaram áudio |
| R13 (endpoints e equivalências dentro do lote), R14 (face única), R15 (varredura alfa) | **[IMPLEMENTADO/CI Windows]** contratos e MP4 sintético passaram; **não existe medição Windows 11 desses ganhos** |
| Meta | **≤15 s, ideal ≤10 s**, pelo menos ~19,33 s a cortar da última média quente, redução >56% do tempo |
| R10 | **[REJEITADO]** cache da exportação anterior, removido na R12. Não reintroduzir |

**Observação central:** se o preparo ainda fosse 18,23 s, nenhuma otimização só de captura conseguiria entregar ≤15 s. Se render/encode ainda consumirem 16,10 s, acelerar apenas preparo também não bastaria. Estas parcelas são da medição anterior: **reperfilá-las após R13–R15**, pois podem ter mudado.

**Padrão epistemológico:** `[MEDIDO]` exige hardware/commit/fixture/fases; `[CÓDIGO]` é uma chamada redundante confirmada no repo, não um número em segundos; `[HIPÓTESE]` é ideia ainda não testada; `[REJEITADO]` é experimento negativo documentado; `[PROPOSTO]` é candidato futuro. Um ganho em FPS da biblioteca ou em tempo de uma função isolada não equivale a acelerar o MP4.

## 2. Mapa de como o app inteiro afeta o export

### 2.1 Fabricador: o custo pode nascer na fonte

- `electron/domains/fabricator/modelSource.ts`, `posePersistence.ts`, `hairStorage.ts`, `faceStorage.ts`, `wardrobePersistence.ts` gerenciam modelos, partes, poses, cabelos, expressões e roupas. A área `src/renderer/src/features/fabricator/hair-animation/HairAnimationWorkspace.tsx` é laboratório visual de física e presets, **não** precisa ficar dentro do Editor para cada export.
- **[CÓDIGO]** Persistir imagem+posição é prático para authoring, mas interpolar isso exige remontar partes. Alternativa maior: publicar **rig geométrico e materiais renderizáveis** (pivôs, malhas, ordem de camadas, texturas) junto das fontes, com versão e referências verificáveis.
- Não apagar a área DEV, nem forçar todos os modelos antigos a um formato novo. Adaptador legados → IR e fallback.

### 2.2 Customizador: talvez seja o verdadeiro lugar para otimizar

- `src/renderer/src/features/customizer/useCustomizerCharacterCommands.ts` e `customizerCharacterSaveCommand.ts` salvam configuração de personagem com revisão e sinalizam `customizer:characters-updated`. `src/renderer/src/characters/characterSourceResolver.ts` aplica pose, cabeça, corpo e proporções; `preparedCharacterMaterials.ts` reconsulta material de cabelo/roupa; `editorV6CharacterRenderer.ts` constrói várias camadas de Canvas.
- **Hipótese ousada e plausível:** no **ato de publicar/salvar** o personagem, materializar uma representação imutável de corpo, face, roupa e cabelo (chave de revisão completa). O Editor consumiria dados prontos para desenhar, sem remontar o modelo inteiro para cada amostra de cada uma das 11 transições.
- **Diferença fundamental:** um **asset compilado na origem** é formato de personagem, não um cache de MP4 ou bundle da última exportação. Cada export continua executando sua própria física/cenas/codificação. O tempo de compilar ao salvar deve ser **contabilizado e apresentado**, sem “ganho grátis” disfarçado.

### 2.3 Editor V6: já existem bons pontos de extensão

- `src/renderer/src/features/editorV6/characterSnapshotRefresh.ts` já resolve revisões de modelo, pose, cabelo, roupa, acessórios, olhos e versões do renderizador e produz variantes `idle/blink/talk/talk-blink`. Reutilizar **essa árvore de dependências** para uma futura representação compilada, sem criar um segundo rastreador de invalidação.
- `editorV6HairMotionPreparation.ts` cria `originalRenderer` e `hairlessRenderer` para grupos de pose e chama `renderToCanvas` / `renderLayersToCanvas`; ainda usa `toDataURL('image/png')` para várias superfícies. `motion/bakeMotion.ts` interpola poses, prepara renderers por amostra, faz crops e serializa atlas. Esse caminho é alvo prioritário por custo bruto.
- `SceneSurface.tsx` é React/SVG, com `foreignObject` para vídeo e Canvas animado, enquanto `exportWorker.tsx` controla frames, rig e WebGL. **O Editor não precisa abandonar React para a exportação deixar de depender do DOM**: criar draw-list/IR de cena com 2 backends.
- `electron/domains/editorV6/exportWorkers.ts` usa 2 BrowserWindows offscreen, `executeJavaScript`, `capturePage` e token para proteger contra frame obsoleto. `exportRunner.ts` manda BGRA ao FFmpeg, concatena trechos Turbo e valida MP4. Nada disso é inamovível, mas trocar sem preservar fences/ordem/alpha cria quadros errados.

### 2.4 Infraestrutura a aproveitar, não duplicar

- `electron/domains/editorV6/motionCache.ts` já possui cache **de movimento genérico**, versionado e limitado. Não confundir com “cache da reexportação R10”; investigar só quando ajudar compilação de fonte ou custo bruto.
- `scripts/editor-v6/spike-native-compositor.cjs` já permite estudar `sharp`/RGBA fora do Chromium, **mas repete o mesmo par de PNGs**. Um FPS alto desse teste não significa 300 frames dinâmicos.
- `docs/editor-v6/PLANO_ACELERACAO_EXPORT.md` registra negativos históricos: não repetir `paint` ingênuo, triplicar concorrência, descartar atlas ou pular validações sem nova hipótese distinta.

## 3. Catálogo A — alterações upstream (Fabricador / Customizador / personagem)

| ID | Ideia | Efeito pretendido | Complexidade; primeiro experimento |
| --- | --- | --- | --- |
| **A01 P0** | **Compilador de personagem publicado**: mapa de camadas, pivôs, partes, geometria, materiais, hashes/revisões | Menos reconstrução em primeira exportação | Média; 1 ator/1 pose, hashes RGBA |
| **A02 P0** | Separar “corpo e roupa sem cabelo” + “cabelo atrás/frente” em recurso de origem | Evitar construir dois renderers `original/hairless` | Média; 2 cabelos e alpha nas bordas |
| **A03 P0** | **Rig paramétrico completo** do Fabricador para interpolações de pose | Substituir múltiplas imagens/atlas por desenho por partes | Alta; 7 samples de uma transição, pixel compare |
| **A04 P0** | Matriz de transformações/UV e pivôs precompilados em vez de reavaliar poses JSON repetidas vezes | Menos geometria CPU por sample | Média; comparar valores da IR com render legado |
| A05 P1 | Expressões/visemas como layers independentes, em vez de re-render do personagem completo | Rosto muda sem refazer corpo | Média; idle/talk/blink/talk-blink |
| A06 P1 | Materiais de roupa/cabelo tintáveis via shader e base imutável | Menos PNG/tint por variação | Alta; cor exata, pele, reflexos e contornos |
| A07 P1 | Manifesto versionado por partes, com dependências detalhadas de fontes do Fabricador | Invalidação precisa entre módulos | Média; alterar só franja e validar dependentes |
| A08 P1 | Contornos alpha/bounds + dimensões no modelo/pose publicado | Evitar `getImageData` para descobrir limites | Média; 20 poses, todos limites exatos |
| A09 P1 | Assets binários/transferíveis, sem converter PNG para base64 em cada transição | Cortar encode/decode e RAM | Média; bytes/tempo/pixels de 1 atlas |
| A10 P1 | **Compilar enquanto publica** no Customizador, com progresso/rollback visíveis | Deslocar transformação de arte para momento correto | Média; tempo de salvar e do primeiro MP4 |
| A11 P2 | Exportar pacote “personagem compilado” compartilhável V6/Studio/Customizador | Uma representação visual no app inteiro | Alta; contratos/versionamento |
| A12 P2 | Autor de deformação/rig no Fabricador DEV (referência Spine/Live2D) | Longo prazo: abandonar atlases de poses | Alta; preservar personagens legados |

**Favorita:** **A01 + A02**, pois testa uma mudança **fora** do exportador que pode eliminar grande parte da preparação, com menos risco que substituir o app inteiro. Se surgir queda de fidelidade, interromper sem migrar projetos.

## 4. Catálogo B — motor gráfico e arquitetura do V6

| ID | Ideia | O que muda | Prova pequena |
| --- | --- | --- | --- |
| **B01 P0** | **IR / draw-list de cena puro**, derivado do frame sem React ou DOM | Separar resolução da timeline de renderização | 30 frames, valores/ordens idênticos |
| **B02 P0** | **Compositor Canvas2D imperativo** apenas no MP4 | Tirar reconciliação React/SVG de 300 quadros | 30 frames com face/boca/texto/flip |
| **B03 P0** | Camadas **retidas** com dirty regions (fundo, corpo, rosto, cabelo, texto) | Só redesenhar o que mudou; sem alterar matemática | 30 frames, contagem de paints |
| B04 P1 | **sharp/libvips**: composição RGBA nativa de fundos/personagens | Evitar BrowserWindow onde só há imagens | Atualizar `spike-native-compositor.cjs` para 30 inputs diferentes |
| B05 P1 | **@napi-rs/canvas** Skia via Node-API | Canvas nativo, texto, blend e paths | 30 frames, RSS e alpha |
| B06 P1 | **skia-canvas** como rival do B05 | Outro backend nativo Canvas/Skia | Mesma fixture, cold start/build Windows |
| B07 P1 | **PixiJS WebGL2**, display list + sprites + malha de cabelo | GPU compositor sem React | Canvas da cena, 30 frames, readback |
| B08 P1 | “Classificador de scene features”: usar nativo só quando seguro | Fallback inteiro para cena incompatível | 10 projetos sintéticos compatíveis/incompatíveis |
| B09 P2 | **PixiJS WebGPU / WGSL** com corpo+cabelo em shader | Menos ida GPU/CPU | Spike Win11 AMD, suporte e sincronismo |
| B10 P2 | **Vello CPU/GPU** (vetores, balões, texto e raster) | Scene encoding num backend independente | Amostra de texto português e máscara |
| B11 P2 | **resvg-js** / **canvg** para cenas SVG estáticas | Raster de subset SVG sem navegador | Verificar `foreignObject` / texto e alpha |
| B12 P2 | Render graph/DAG por frame e por segmento | Planejar operações e copiar só o necessário | Planejador de 30 frames, sem desenhar |
| B13 P2 | Raster de personagem Rust/Skia, mantendo V6 React | Ataca montagem de pose sem rewrite total | Uma pose animada com 2 personagens |
| B14 P2 | Intercâmbio de cena com Blender/OpenToonz/Grease Pencil | Auxílio de authoring/batch, não correção imediata | Somente protótipo/export de fontes |

**Princípio:** **trocar renderizador não exige trocar editor**. A tela pode continuar em React/SVG, mas o MP4 usar B01 + outro backend com fallback rigoroso. Nenhum backend reproduz automaticamente `foreignObject`, React e shaders WebGL de cabelo.

## 5. Catálogo C — bakes, poses e animação de cabelo

| ID | Ideia | Custo alvo | Gate |
| --- | --- | --- | --- |
| **C01 P0** | Não gerar **7 PNGs intermediários por transição**; interpolar partes/rig por frame | Até 11 bakes caros | Mesma amostra RGBA nas 7 posições |
| **C02 P0** | Desenhar corpo+face+cabelo em **mesmo compositor GPU** com 3 layers | Evitar canvas/PNG intermediários | Alpha, espelho, boca e matiz |
| **C03 P0** | Física 120 Hz em **tabela deterministicamente amostrada**, consumida por qualquer backend | Separar física do DOM e do draw | Float32/poses exatas nos frames 0,23,30,299 |
| C04 P1 | Instancing de malhas e texturas, menos draw calls WebGL | CPU/GPU por frame | Centróides/alpha da malha |
| C05 P1 | Uma mesma base de material/roupa por pose **na mesma exportação** | Evitar preparar renderer por sample | Número de renderers e RGBA |
| C06 P1 | Pipeline preparador → transferência → compositor assim que um rig está pronto | Sobrepor preparação e captura | Ordem, cancelamento, atraso, RAM |
| C07 P1 | Contornos por rig/união conservadora, quando provadamente seguro | Evitar leituras RGBA repetidas | Bounds exatos de poses e acessórios |
| C08 P1 | Atalhos de transformação para poses que diferem só em partes rígidas | Não gerar atlas corporal completo | Matriz vs pixels |
| C09 P2 | Implementar blending de expressões separado de pose | Menos paint facial por movimento | Visemas/boca, pupilas |
| C10 P2 | Preset físico como parte do compositor (não import/encode de textura a cada frame) | Menos transferências da camada de cabelo | Inércia, espelhamento e render 30 FPS |

## 6. Catálogo D — captura, codificação e alternativas ao Chromium

| ID | Ideia | Benefício possível | Bloqueador |
| --- | --- | --- | --- |
| **D01 P0** | B01/B02 para export sem `executeJavaScript` + `capturePage` | Cortar roundtrip/paint fence em cenas suportadas | Garantir frame correto, alpha |
| D02 P1 | **OffscreenCanvas** + Worker/transferência de `ImageBitmap` | Mais trabalho fora do renderer UI | Compatibilidade/segurança |
| D03 P1 | **WebCodecs VideoFrame/VideoEncoder** + mux MP4, com backpressure | Evitar cópia BGRA para FFmpeg em alguns caminhos | H264/codec support e áudio |
| D04 P1 | Medir `FFmpeg h264_amf` ocioso aguardando quadro | Focar em compositor, não codec, se for o caso | Perfil de wait |
| D05 P1 | `FFmpeg overlay` para parte do vídeo/fundo/elementos | Composição no processo de encode | Ordem, alpha, PTS, áudio |
| D06 P1 | IO pipeline sem `toDataURL` / sem base64 em IPC | Menos encode/cópia | Transferíveis e contrato |
| D07 P1 | Partições Turbo por **custo estimado**, não só metade temporal | Evitar worker ocioso | Costura e frames exatos |
| D08 P2 | `useSharedTexture` Electron → addon D3D11 → AMD AMF | Evitar GPU→CPU→GPU | Texture handle, fence, `release()` |
| D09 P2 | Direct2D/Direct3D11 como compositor nativo Win11 | GPU end-to-end | Engenharia, fontes, máscaras |
| D10 P2 | Um encode incremental em vez de encode de partes/concat, onde codec permitir | Menor finalização | Contrato Turbo/concat |
| D11 P2 | Revisitar `paint` com sincronização diferente **só se** nova arquitetura | Poder evitar `capturePage` | Tentativa ingênua anterior falhou |
| D12 P2 | Decodificar mídia de vídeo com FFmpeg/WebCodecs e inserir nos layers | Melhor caso com vídeos pesados | O benchmark real conhecido não tem vídeo |
| D13 P2 | Pipeline GPU portátil wgpu/Vulkan vs D3D11 AMD | Extensível Windows | Drivers, native addon, custo alto |

**Não escolher D08 antes de medir:** Electron afirma oficialmente que textura GPU compartilhada exige código nativo; não existe chave mágica que entregue pixels ao FFmpeg sem trabalho. E o preparo de cabelo, sozinho, poderia continuar acima da meta.

## 7. Catálogo E — fazer o Editor V6 melhor, não apenas o MP4

| ID | Proposta | Ganho humano/técnico |
| --- | --- | --- |
| **E01 P0** | **Preflight de exportação**: tempo estimado por fases e validação das fontes, RAM/disco, encoder, áudio | Evitar export fracassado |
| **E02 P0** | **Painel de diagnóstico por fase** legível sem log pessoal: 11 bakes, total, captura, write wait, RAM | Saber a próxima otimização |
| E03 P1 | Render uma **prova de 12 quadros** antes do MP4 | Detectar incompatibilidade rápido |
| E04 P1 | Preview leve com proxies de mídia **somente na edição**, fonte original no MP4 | Seek/edição fluídos sem perda de qualidade |
| E05 P1 | Presets de pose/animação/padrões de personagem publicados no Customizador | Menos reconstrução da timeline manual |
| E06 P1 | Template de cena/voz/boca/câmera e balões | Mais produtividade por vídeo |
| E07 P1 | Timeline compilada em comandos simples, scrubbing imperativo | Menor custo de React no playback |
| E08 P1 | Preset de cabelo no exportador, Fabricador como laboratório físico avançado | Evitar navegação desnecessária |
| E09 P2 | Biblioteca de rostos/movimentos em formato comum V6/Studio | Eliminar duplicação e melhorar consistência |
| E10 P2 | Histórico/undo, autosave, recuperação e export queue com estado transacional | Menos trabalho perdido |
| E11 P2 | Verificador de renderização por “features suportadas” | Compatibilidade de novos motores transparente |
| E12 P2 | Editor guiado por tarefas rápidas para criador de vídeo (cena→personagem→fala→exportar) | Reduzir cliques, tempo humano |

## 8. Catálogo F — ferramentas externas: adotaria, investigaria ou evitaria?

| Biblioteca/sistema | Situação | Melhor uso e risco |
| --- | --- | --- |
| **sharp/libvips** | Já depende do projeto | Prova mais barata de compositor CPU; não entende React/WebGL |
| **@napi-rs/canvas** | Externo, Skia + Node-API, MIT reportado no repo | 2D nativo, texto; testar binários Electron Windows |
| **skia-canvas** | Externo, Skia headless | Comparador de API/qualidade/cold start |
| **PixiJS WebGL2** | Externo, renderer GPU estável | Display list de sprites e cabelos; medir extração |
| **PixiJS WebGPU** | Externo, suporte ainda deve ser verificado | POC de malha; driver AMD e feature set |
| **Vello CPU/GPU** | Externo Rust, arquitetura Sparse Strips | Futuro de vetor/texto; bindings nativos custosos |
| **resvg-js** / **canvg** | Externos, rasterizadores SVG | Só subconjunto sem `foreignObject` |
| **WebCodecs / OffscreenCanvas** | APIs Web, conferir Electron 45/Windows real | Frames/encode de baixa cópia; mux externo e fila |
| **FFmpeg** | Já presente; encoder hardware/fallback | Compositor/filtergraph, áudio, concat; respeitar licenças do binário LGPL |
| **Remotion** | Framework React para vídeo | Inspirar determinismo frame→imagem, chunk/parallel encode; ainda usa Chromium |
| **Rive / Spine / DragonBones / Live2D** | Referências de rigs, licenças distintas | Inspiração de modelo paramétrico, não migração rápida |
| **Blender/OpenToonz** | Apps de authoring externos | Interoperabilidade futura; não melhora diretamente a exportação atual |

**Licença/compatibilidade:** antes de adicionar qualquer dependência ao `package.json`: verificar licenciamento comercial, binário Windows x64, ABI Node-API/Electron, custo de instalação, empacotamento portátil, CVEs e tamanho do bundle. Primeiro POC descartável fora da produção.

## 9. Rotas de produto, não micro-otimizações

### Rota alfa — **compilar personagem no Customizador / Fabricador** (minha primeira aposta)

`Fabricador (fontes rig/pose) → Customizador publica layers e representação imutável → Editor resolve só pose/expressão/tempo → export desenha diretamente`.

**Onde pode dobrar velocidade:** se reconstruir partes/tints/corpo domina os 11 bakes, tirar esse trabalho do export reduz custo bruto. A compilação seria registrada no artefato fonte, **não um cache entre exportações idênticas**. A medição tem de incluir o custo deslocado para “Salvar personagem”, sem esconder trabalho. Primeiro teste: 1 personagem, 2 poses, quatro expressões; RGBA legacy = proposto.

### Rota beta — **motor de render separado da interface**

`Editor React para interação → resolver timeline para IR/draw-list de frames → renderer Canvas2D/Skia/Pixi/sharp → encoder FFmpeg/WebCodecs`.

**Onde pode dobrar velocidade:** reduzir 300 reconciliações SVG/DOM, `capturePage` e cópia BGRA. Não remover React da edição; permitir fallback seguro por cena/features. Primeiro teste: 30 frames diferentes incluindo cabelo, boca, texto, flip, sombra/alpha; comparar **RGBA**, tempo total e RSS.

### Rota gama — **GPU end-to-end Windows AMD**

`IR → Pixi/WebGPU/Direct2D ou D3D11 → textura GPU → AMF hardware → MP4`.

Teto potencial alto, custo/risco alto. Requer textura compartilhada, formato, cor, fences, lifetimes e native addon; só começar depois de medir que captura/readback é o limitador **e** ter resolvido o preparo das poses.

### Rota delta — **melhorar workflow sem mudar motor**

Preflight, composição de 12 quadros, proxies só de edição, template de cena, falas, áudio, presets, mini-relatório visual e recuperação. Pode poupar mais tempo de produção humana que ganhar 1 segundo no encoder. Fazer como roadmap paralelo, não desviar a missão da exportação.

## 10. Ranking de ROI inicial (pontuações não são ganhos medidos)

| Rank | IDs | Impacto hipotético | Esforço | Risco visual | Experimento eliminatório |
| --- | --- | --- | --- | --- | --- |
| **0** | Perfil profundo | Muito alto para direção | Baixo | Nenhum | 1 bake e 30 frames com tempos confiáveis |
| **1** | A01+A02 | Muito alto | Médio | Médio | 1 ator com corpo/hair/face idênticos |
| **2** | C01+A03 | Muito alto | Médio/alto | Alto | 7/7 amostras iguais |
| **3** | B01+B02+B03 | Alto | Médio | Médio | 30 frames iguais, sem React na exportação |
| **4** | A09+D06 | Médio/alto | Médio | Baixo/médio | Tempo de encode PNG, heap/IPC, RGBA |
| **5** | B04+B05 | Médio/alto | Pequeno/médio | Médio | 30 frames diferentes no CPU nativo |
| **6** | B07+C02 | Alto | Alto | Alto | 30 frames com cabelo GPU, readback |
| **7** | D02+D03 | Médio | Médio | Alto | Codec/queue/timestamps e MP4 válido |
| **8** | D08+D09 | Incerto/alto | Muito alto | Alto | Native spike que supere custo de readback |
| **9** | E01+E03 | Melhorar confiança | Pequeno | Baixo | Detecta erro antes de export longo |

**Sem prova não migrar.** Descartar hipóteses que não atinjam um custo relevante. É melhor provar um micro-motor de 30 frames e rejeitá-lo do que reescrever 1.000 linhas para descobrir que PNG/AMF era o gargalo.

## 11. Negativos do passado e o que NÃO repetir

- **[REJEITADO]** concorrência 1 e 3 de bake: testes anteriores mostraram que 2 era melhor no caso real; aumentar não resolve automaticamente contenção.
- **[REJEITADO]** pular atlas corporal: 52/300 hashes de frame divergiram em uma execução e houve piora de tempo.
- **[REJEITADO]** cache de bundle entre exportações R10, removido em R12 por solicitação explícita.
- **[REJEITADO]** substituir `capturePage` por `paint` simples; requer arquitetura/fence diferente, senão pode retornar frame antigo.
- **[REJEITADO como prática]** alterar resolução, fps, taxa/qualidade, diminuir amostras da física, descartar alpha, afrouxar tolerância, esconder testes quebrados, executar Linux ou limpar dados pessoais.
- Uma técnica “rápida” que apenas desloca custo de export para “salvar personagem” não é automaticamente ganho de produtividade: medir **os dois tempos**.

## 12. Critérios de escolha e teste: Windows 11, erro rápido, qualidade total

**G0 – localizar o custo:** métricas por módulo e número de renders/PNG/bytes; identificar hot path medido no HEAD novo, não inferir da baseline antiga.

**G1 – microprova:** 1 personagem, 1 pose/transição, fixtures sintéticas e 7 amostras. Abort imediatamente se imagem, cor, alpha, bbox, mouth, flip, hair ou fontes diferirem sem explicação.

**G2 – prova curta:** **30 quadros diferentes** com PNG/RGBA, 2 personagens/uma transição + boca e cabelo; medir p50/p95, RAM/VRAM e pixels. O spike `sharp` existente repete o mesmo par de imagens: **não usar seu FPS como prova de MP4**.

**G3 – candidato pequeno e reversível:** feature flag de laboratório, fallback atual, sem alterar arquivos do projeto; testes direcionados, architecture/typecheck/build no Windows 11. Não instalar SDK pesado só para fazer a CI passar.

**G4 – benchmark de aceite:** mesma cópia isolada `Editor V6 06`, Preset 2, 300×1920×1080 @30, 2 workers Turbo, `h264_amf` e três exportações comparáveis. Comparar **todos os 300 frames decodificados**, dimensões, áudio/vídeo real adicional, consumo de processos e integridade MP4. Só aí declarar tempo.

**Métricas por primeiro export:** `clickToValidatedWallMs`, `hairPreparationWallMs`, 11 bakes detalhados (material, fonte, corpo, face, PNG, upload), `ipcDrawMs`, `captureMs`, `frameRoundTripMs`, `ffmpegWriteMs`, encode final, RAM de Main/renderer/FFmpeg, pico de GPU quando suportado. Tempos de workers sobrepostos não se somam como wall clock.

**Modo operacional do Codex:** 1 hipótese / 1 spike / 1 decisão; timebox curta no experimento (por exemplo, no máximo 10–15 min de investigação inicial por candidato); só executar teste longo no candidato aprovado. Registrar fracassos, não acumular tentativas que não agreguem evidência. Nenhum push sem autorização posterior; fetch/pull seguro permitido.

## 13. Perguntas que precisamos responder antes de investir em motor novo

1. Quanto dos **11 bakes** é `prepareSavedCharacterRenderer`, carregar roupas/tint, renderizar face, PNG, `getImageData`, montagem de atlas, mais IPC? O profiling pós-R15 mudou isso?
2. O que o Customizador poderia salvar **como representação renderizável** sem perder edição dinâmica? A01 exige migrar arquivos ou podemos anexar schema opcional?
3. Podemos reproduzir o render **original + hairless** com um único rig sem alterar a ordem do cabelo (back/front/fringe, acessórios e expressão)?
4. Os 7 samples de atlas realmente precisam ser PNGs prontos? É possível desenhar os mesmos pixels a partir de UV/partes ou só reproduzir visualmente? A exigência de hash exato é viável no novo backend?
5. Quanto do export principal é **draw React**, espera do compositor, `capturePage`, GPU readback, IPC, FFmpeg aguardando frames ou encode AMF ocupado?
6. A figura do caso real usa recursos impossíveis para sharp/Skia (foreignObject, máscaras complexas)? Qual é um subset seguro com fallback?
7. Quais ganhos de **tempo humano** (fluxo de cena, personagem, voz, presets) superam pequenas reduções da exportação e podem entrar em paralelo sem comprometer o foco?

## 14. Fontes técnicas primárias e documentação existente

**Internas:** [medição real anterior](RODADA_05_V4_ACELERACAO_EDITOR_V6_06.md), [plano e negativas](PLANO_ACELERACAO_EXPORT.md), [alternativas ao Chromium](ALTERNATIVAS_EXPORT_SEM_CHROMIUM_2026-11-04.md), [R13](RODADA_13_V4_BAKE_BRUTO_ENDPOINTS.md), [R14](RODADA_14_V4_RENDER_FACE_UNICA.md), [R15](RODADA_15_V4_VARREDURA_ALPHA_NATIVA.md), [quadro de experimentos Windows](EXPERIMENTOS_RAPIDOS_WINDOWS11.md).

**Externas:**
- [Electron: Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [webContents](https://www.electronjs.org/docs/latest/api/web-contents), [Performance](https://www.electronjs.org/docs/latest/tutorial/performance).
- [sharp: Compositing](https://sharp.pixelplumbing.com/api-composite/); [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas); [skia-canvas](https://skia-canvas.org/).
- [PixiJS: renderers](https://pixijs.com/guides/components/renderers/), [Vello: architecture](https://github.com/linebender/vello/blob/main/ARCHITECTURE.md).
- [resvg-js](https://github.com/thx/resvg-js); [canvg](https://github.com/canvg/canvg).
- [OffscreenCanvas transfer](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen); [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [WebCodecs usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API).
- [FFmpeg: filtergraph/overlay](https://ffmpeg.org/ffmpeg-filters.html); [Remotion: render](https://www.remotion.dev/docs/render), [determinismo e flicker](https://www.remotion.dev/docs/flickering).

**Nota:** bibliotecas não são magicamente mais rápidas. Verificar licença comercial, versão do Electron, binários e dependências Windows antes de integrar. Não recomendar mudança de app/motor de produção com base só em benchmarks dos fornecedores.
