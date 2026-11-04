# Zona de guerra — R32: renderizadores de extremidade entre transições

**Base:** relatório 309 quadros de 2026-11-04. As 21 transições novas somaram 23.658s, maior tempo de preparação.

## Alteração
Em uma lane do Electron, a criação de uma versão completa do personagem para os dois endpoints de cada transição era repetida mesmo em poses iguais. O bake retém agora até **quatro** renderizadores de extremidade (`progress=0 ou progress=1`) por sessão, sob chave exata de `[character, source.updatedAt, interpolatedArtwork]`. A comparação usa JSON **completo**, sem hash probabilístico; qualquer diferença força recomposição. Intermediários continuam sendo calculados com o compositor antigo. As mutações de boca/expressão repintam o rosto do renderer, e os quadros/recortes/atlas continuam independentes por transição.

`bakeWorker.ts` destrói os renderizadores ao trocar a revisão da personagem ou ocorrer erro. `bakeMotion.ts` só faz trim depois que os frames deste bake terminaram, não libera canvas usado pela requisição atual. Sem persistência em disco e sem cache de MP4 ou de exportações anteriores.

## Contrato visual
O teste Electron executa duas transições com mesmo par de poses e posições da cena diferentes; exige que o atlas PNG permaneça **byte a byte igual**, que a posição dos elementos continue diferente e que a segunda transição prepare pelo menos 2 rigs a menos. Preservar 7 amostras, fala/blink/roupa/Posterior/Traseiro/flipX/Turbo.

## Limite
Se os 21 pares de poses tiverem fontes interpoladas diferentes, o ganho será zero. Não inferir segundos de velocidade antes de comparar a primeira exportação no Windows 11 x64; o relatório antigo era 23.658s de bakes.
