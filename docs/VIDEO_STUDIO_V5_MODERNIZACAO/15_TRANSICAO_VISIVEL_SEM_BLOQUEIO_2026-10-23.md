# Video Studio — transição sempre visível e preview em duas camadas

**Branch:** `Main-desenvolvimento`. **Escopo:** somente preview; sem alterações nos dados persistidos, no relógio, nos limites de blocos ou na exportação final.

## Causa-raiz comprovada por leitura do código

O player deixa de aguardar o render, mas a janela das transições é `VIDEO_CHARACTER_TRANSITION_FRAMES=15`, ou 250 ms a 60 fps. A renderização Gacha completa de uma única amostra pode ultrapassar toda a janela. Cada solicitação de frame ficava obsoleta antes que o raster fosse exibido; o usuário via cortes secos.

## Política corrigida

1. A timeline avança sem bloqueios, mantendo áudio/vídeo na referência temporal existente.
2. Durante Play, todo frame intermediário de uma transição ganha um **fallback visual determinístico e imediato** por `evaluateRealtimeTransitionFallback`. Usa as imagens autorais já presentes em `VideoCharacterState.imageDataUrl`. A função interpola posição, rotação, largura e altura com `mixStageElement` e a curva `smoothProgress` igual à do motor completo.
3. O DOM exibe os snapshots inicial e final sobrepostos com pesos `(1-t)` e `t`. Não cria 14 PNGs nem chama o compositor completo no meio da reprodução. O navegador só atualiza opacidade e geometria.
4. Em Pause/Seek, o editor solicita o **frame exato** via Gacha Canvas/Worker existente, sem bloquear o relógio. O fallback fica visível enquanto o raster preciso termina, e é substituído por esse raster no mesmo frame.
5. `PreviewEndpointWarmup` solicita `Image.decode()` assíncrono de endpoints com até 240 frames de antecedência para no máximo 3 transições próximas, conservando até 8 imagens decodificadas, para evitar um flash causado pela primeira decodificação do PNG final.
6. O hook não mistura um frame preciso isolado com os frames rápidos durante o Play: isso causava saltos visuais. `data-transition-fallback-count` na cena facilita o diagnóstico.

## Limite de qualidade explicitamente preservado

A **preview em reprodução** usa mistura alfa de *poses renderizadas em seus extremos*, isto é **cross-dissolve** com interpolação de geometria externa, **não interpolação esquelética exata** das partes do corpo. É uma camada de continuidade visual, não substitui o `mixPoseArtwork` que o export usa. A exportação continua calculando cada frame preciso. Os frames precisos também são acessíveis ao pausar/scrub.

Ainda será necessário processar os rigs Gacha completos fora da UI (worker/processo próprio) e disponibilizar frames reais prontos antes do deadline da transição para alcançar paridade em tempo real sem engasgos. Não confundir CI verde com garantia de FPS na máquina do usuário.

## Verificações

- `tests/video-studio-realtime-transition-fallback.test.cjs`: todos os 14 frames intermediários têm `progress` crescente, amostras extremas corretas e geometria interpolada; não grava dados persistidos.
- `tests/video-studio-preview-endpoint-warmup.test.cjs`: deduplicação, limitação a três boundaries próximos e teto de oito imagens, sem preparar todos os frames.
- `npm run test:video:next`, `npm run test:export:synthetic`, `npm run typecheck`, `npm run build` em GitHub Actions Windows/Ubuntu.
- **Validação pendente:** reproduzir e filmar casos reais no Windows: 1/4 personagens, duas poses radicalmente diferentes, presets de olho/boca, blocos consecutivos, seek A→B e pausas dentro da transição; medir `data-transition-fallback-count` e tempos.
- **Validação pendente:** MP4 vs oráculo de pixel e cenário de estresse 180s com dados sintéticos, contra o relatório 618s gasto preparando transições.

Este passo resolve o caso lógico "frame só fica pronto depois que a animação já acabou"; não garante que o compositor completo tenha performance de 60 FPS.
