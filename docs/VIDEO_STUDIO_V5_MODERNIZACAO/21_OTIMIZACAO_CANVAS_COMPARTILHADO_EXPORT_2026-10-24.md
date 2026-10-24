# Video Studio V5 — Canvas compartilhado entre prévia e exportação
**Data:** 24/10/2026
**Branch:** `Main-desenvolvimento` (sem PR ou branch lateral).
**Último commit de código validado:** `9f120cedd8bc3b3ac40d9972563d2d3361f48e62`.
**CI Windows + Ubuntu:** https://github.com/nestarasup-sys/Native-gacha/actions/runs/40069673147 — ambos SUCCESS; 154/154 contratos Video Studio, 108/108 contratos de exportação sintética, 285/285 gerais, geometria e build/typecheck verdes.

## Orientação de arquitetura

A GPU PixiJS segue **experimental/opt-in**. Foi rejeitada pelo pixel gate no teste real do usuário (pixel mismatch); não concluir que GPU AMD é lenta ou incompatível. A prioridade agora é otimizar o **compositor autoral Canvas** preservando skin tone, PT pupils, olhos, boca, máscara, as articulações de roupas, cabelo e posicionamentos do Fabricador DEV. O mesmo `TransitionRenderer` é chamado pela prévia `PreviewTransitionSession` e pela exportação `VideoCharacterFrameRenderer` / `VideoExportSurfacePage`.

## Código entregue nesta rodada

### 1. Sem PNG intermediário na composição de roupas

- `characterRenderer.ts` possui `renderWardrobeOverlayCanvases()`, que conserva os pixels diretamente nos `HTMLCanvasElement` do Canvas2D, inclusive acessórios `aboveHair`.
- `prepareSavedCharacterRenderer` usa esses objetos diretamente, retirando o antigo `toDataURL('image/png')` seguido de `loadCachedImage(dataUrl)` **para as roupas**, inclusive em frames de transição de pose.
- `renderWardrobeOverlay()` público **mantém exatamente o retorno anterior** (`imageUrl`/`aboveHairImageUrl`) para Customizador e outras telas.
- A mesma validação de fluxo de roupa, encaixe nos ossos, máscara de partes ocultas, desenho de cabelo e ordem de camadas continuam no código antigo. Não há novo cálculo geométrico aproximado.

### 2. Adotar buffers de personagem já desenhados

- `gachaStaticLayers.ts`: novo `adoptSourceCanvases: true` exclusivo do preparador de personagem, usando `baseImage` como `behindFace` e `frontHairImage` como `inFrontOfFace` quando suas dimensões são compatíveis.
- Evita até **duas alocações de Canvas full-resolution e duas operações de cópia por pose preparada**. A função original continua copiando as fontes quando o parâmetro não é passado.
- Contextos adotados usam amostragem `low` na etapa estática como os buffers antigos, para não mudar os métodos de interpolação do Canvas ao desenhar acessórios em resoluções diferentes.
- `prepareSavedCharacterRenderer.renderToCanvas` mantém uma única superfície redimensionada por pose preparada para animar olhos, pupilas, boca e proporções. Limpa a superfície antes de cada frame; o snapshot para cache continua independente.

### 3. Preparar cabelos e conjuntos de roupas uma vez por sessão/revisão

- `materialsForPreparedCharacter` resolve `loadHairAppearanceLayers(back/front/fringe)` e os conjuntos `loadWardrobeSet` só quando o personagem/seleção muda, deduplicando requests simultâneas.
- `TransitionRenderer.reusableMaterials` usa um Map limitado a 6 manifests; sua chave inclui personagem, revisão, slot, penteado e grupos de roupas (não o progresso da animação, expressão ou pose).
- As posições das roupas e cabelo **continuam recalculadas e desenhadas pelo Canvas para cada pose**. Isso é deliberado para preservar pixels e evita afirmar incorretamente que já existe um esqueleto 2D persistente Canvas.
- Edições de biblioteca/roupa criam outra chave; falhas removem promessas do cache e propagam o erro. `clearPrepared()` e `dispose()` soltam as referências.

### 4. Ciclos de boca não reconsultam catálogo a cada frame de exportação

- `VideoCharacterFrameRenderer.faceCatalogForSlot` memoriza os resumos de boca por slot durante a exportação.
- Blink/olhos e cada fase do movimento da boca continuam renderizados individualmente, com todas as transformações do Preset Rosto DEV. Erros podem ser repetidos depois de limpar a promessa falha.

### 5. Perfil de exportação com custos atribuídos

- `VideoExportSurfacePage` agora mede `characterMs` (rasterização dos personagens) e `mediaDecodeMs` (obtenção/decodificação de frames de vídeo importado), e mantém `composeMs` + `readbackMs`.
- `VideoExportSurfaceHost` valida números finitos/não negativos via IPC, antes de entregar ao coordenador.
- `VideoExportCoordinator` agrega métricas novas em andamento, conclusão e montagem de MP4, junto de `surfaceRoundTripMs`, `writerWaitMs`, `workerCount`, `cacheHits` e contadores persistentes.
- A renderização Gacha e a obtenção dos vídeos continuam em `Promise.allSettled` concorrente: **characterMs e mediaDecodeMs se sobrepõem; não somar os dois como se fossem o tempo total do frame**.
- O contrato do pixel RGBA 1920x1080 a 60 FPS, o FFmpeg H.264, o mux do áudio e a política de chunks não mudaram.

## Testes executados

CI: https://github.com/nestarasup-sys/Native-gacha/actions/runs/40069673147

- Windows: 285 gerais, 4 de geometria, **154 Video Studio**, **108 exportação sintética**, nenhum teste reprovado.
- Ubuntu: auditoria de fronteiras, typecheck e build Electron/React aprovados.
- Novos testes verificam ausência de PNG/decoded intermediários no caminho Canvas, camada de roupa e óculos acima do cabelo, retorno PNG legado, manifesto compartilhado entre poses, invalidação das seleções, orçamento limitado do cache, adoção de buffers com ordem preservada, catálogo de fala reutilizado e novas métricas.

## Validação local e Codex

1. Fazer pull através do `ATUALIZAR_DESENVOLVIMENTO.bat` e abrir pelo `ABRIR_DESENVOLVIMENTO.bat`. Deixar o botão **GPU PixiJS em OFF** durante o teste Canvas.
2. Abrir uma cena de dois blocos consecutivos com poses diferentes e cabelo/roupa/óculos. Testar seek, várias expressões, blink, boca, escala corporal e tons de pele.
3. Renderizar uma exportação curta e uma de 60+ segundos, comparando integridade visual e tempo. Não inferir FPS apenas pela CI.
4. Para diagnóstico técnico, scripts existentes: `npm run bench:video:cache`, `npm run bench:video:workers`, `npm run test:export:full-engine-soak:90`, `npm run test:export:full-engine-soak:900` (dependem do setup de Electron/FFmpeg correspondente). Inspecionar `characterMs`, `composeMs`, `readbackMs`, `mediaDecodeMs` e `writerWaitMs`.
5. Caso duas exportações tenham diferença visual, verificar primeiro as saídas PNG legadas vs Canvas, depois os testes de referência do personagem, sem reescrever os assets. A biblioteca do usuário não é alterada pelas otimizações.

## Pendências não ocultadas

- **O corpo/roupas/cabelo ainda são rasterizados por pose intermediária.** Esta rodada remove trabalho de preparação e cópia redundante, não cria automaticamente uma malha GPU nem resolve animação em cache de osso completo.
- A CI não executa um benchmark de GPU/CPU física do computador AMD do usuário nem mede velocidade real em um projeto grande. Ganhos líquidos devem ser medidos no próprio hardware.
- A equivalência visual de cada asset específico do usuário ainda precisa de validação por ele ou pelo Codex, inclusive antialiasing e transparência em resoluções incomuns.
- Próximo passo orientado pelas novas métricas: diminuir desenho de partes realmente inalteradas entre poses no Canvas, respeitando ordem, máscaras, parâmetros do Fabricador e as regras de `drawImage`. Só promover fast path para preview/export depois de oráculo Canvas com pixels aceitos.

**Regra:** o usuário anima exclusivamente no Video Studio, por transições entre blocos. Não introduzir animação nova em DEV. Não alterar projetos gravados para implementar melhorias de velocidade.
