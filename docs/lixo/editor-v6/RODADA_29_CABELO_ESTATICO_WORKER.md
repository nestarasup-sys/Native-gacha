# Rodada 29 — Superfície imutável das peças em repouso

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Escopo seguro integrado:** cache de textura PADDED imutável **dentro do worker da exportação atual**; sem cache MP4.

Antes, cada desenho de uma peça desativada, em repouso ou com intensidade zero limpava um Canvas, reconfigurava o sampling e copiava os mesmos pixels da textura original. A R29 cria uma superfície padding própria por textura somente na primeira vez em que ela está imóvel e **reutiliza os bytes exatos produzidos por aquele Canvas2D** nas demais passagens. As superfícies deformadas continuam distintas e mutáveis, sendo liberadas junto com o worker. O Posterior (`rearHair`) mantém a malha WebGL quando a reação está ativa; Traseiro (`backHair`), franja e outras peças continuam com o posicionamento original.

A lógica de ativação é testável em `hairMotionNeedsWarp`; não altera simulação, pixel shader, geometria, z-index, boca ou encoder. O ganho depende de quantos quadros precisam ser recompostos apesar de partes estacionárias.

## Próxima hipótese estrutural **não integrada**
Pré-compor "Personagem sem Posterior" + "Posterior dinâmico" sem duplicar renderizadores exigirá saída dual de materiais e ordem alpha consistente. O atalho de remover cabelo de um único renderer já foi rejeitado por falta de equivalência. Essa substituição de produção **não** foi feita só com suposição: permanecerá para R30/31 com testes de 7/7 amostras e 30 frames distintos.

## Gates
CI Windows (unit, TypeScript, build, offscreen BGRA). Comparar 30 quadros com imagens reais, mouth/flipX, cortes Turbo e ausência de salto na passagem repouso→movimento. Benchmark Windows 11 isolado, não estimar segundos.