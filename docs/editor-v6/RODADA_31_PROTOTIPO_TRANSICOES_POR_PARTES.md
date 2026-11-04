# Rodada 31 — IR experimental de sprites e transição por partes

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Estado:** protótipo geométrico, NÃO conectado ao exportador de MP4.

## Implementado
`src/shared/editorV6PartMotionPrototype.ts` compila um par de poses compatíveis do Fabricador e expõe `frame(progress)`: uma lista explícita de peças com ordem autoral, visibilidade, coordenadas, tamanho, rotação e referência ao PNG original. Ele usa o interpolador de pivôs/juntas *autoritativo* (`interpolateEditorV6Pose`), com easing igual ao exportador atual, e não modifica imagens ou snapshots.

Teste de **sete amostras** verifica cada posição/rotação/tamanho contra o interpolador atual. Outro teste cria **30 quadros diferentes**, muda a ordem/ocultação no ponto correto e confirma que as fontes e as poses não são alteradas. Sem render de imagem, sem codec, sem WebGPU, sem canvas.

## Por que ainda NÃO virou produção
O desenho real de um personagem não é apenas a lista de peças: inclui skin tint, contornos, pontes entre juntas, roupas deformadas, camadas sobre cabelo, Posterior e Traseiro separados, halo, alfa premultiplicado, boca e olhos. Isso tudo depende de `characterLayerRenderer.ts`, `characterWardrobeRenderer.ts` e `editorV6CharacterRenderer.ts`. A IR é **honesta**: retorna `exportReady:false` e os operadores ainda ausentes.

Para substituir a geração de atlas por sprites e malhas, próximos gates: implementar cada operador sem substituir o original; comparar 7/7 amostras **RGBA exatas**, 30 quadros diferentes + alpha/flipX/mouth, então benchmark CPU/Turbo 300 frames no Windows 11 e memória. Se não for idêntico ou mais rápido, rejeitar/fallback. Proibir substituir o renderer apenas porque a geometria passou nos testes.

**O ganho de tempo R31 é zero por enquanto:** o módulo é experimental, sem caminho de produção habilitado.