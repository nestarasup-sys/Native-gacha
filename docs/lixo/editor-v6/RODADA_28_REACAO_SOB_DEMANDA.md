# Rodada 28 — Quadros do Posterior realmente em repouso
**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Status:** integrado para reação única; CI/benchmark necessários.

## Técnica
`hairMotionPoseReactionIsActive` retorna verdadeiro exatamente entre `endFrame + 1` e `endFrame + 29` para cada troca de pose. O worker **não troca** o compositor pelo snapshot salvo no repouso (pixels podem ser diferentes): preserva a composição original no primeiro quadro e só reutiliza o quadro capturado quando a cena é rigorosamente idêntica nos quadros subsequentes.

Dentro da janela da reação continua usando o contador `hairAnimationFrame` para forçar atualização. Fora dela, inclui `JSON.stringify(scene.elements)` na chave de repouso, além dos campos históricos de geometria/fundo. Isso evita perder variações de expressão, boca, roupa e transformações que a chave original abreviava. React/SVG/capture só deixa de trabalhar se os visuais forem de fato iguais.

Os modos contínuo, loop, transições motionSprite e áudio continuam no caminho original.

## Validação
Teste de 3 eventos consecutivos: 87 frames móveis, limites end+1/end+29 e quadros de repouso. No Win11 AMD comparar 7 amostras, 30 quadros **diferentes** e números `reused`/`hairRasterFrames`, depois o MP4 inteiro. Não alegar ganho sem medição.