# Rodada 23 — Preparação única de estilos e texturas de cabelo

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Escopo:** exportação MP4 / preparador de cabelo

## Problema corrigido

Na preparação do cabelo para várias poses, `editorV6HairMotionPreparation.ts` chamava `loadHairStyle` de novo para cada grupo `personagem + pose`, mesmo quando os mesmos estilos do Posterior, Traseiro, Franja, Rabo de cavalo e Ahoge já haviam sido lidos na própria exportação. Também chamava o tint de uma textura e convertia Canvas→PNG novamente quando a mesma peça, cor e estilo apareciam noutra pose.

## Implementação

- `motion/hairPreparationReuse.ts` implementa duas tabelas independentes de promises temporárias, com máximo de 64 entradas por tabela: uma para leitura de estilo (`modelSlot+id`) e outra para textura `PNG` (`modelSlot+id+side+part+colors`). Requests simultâneos recebem exatamente a mesma Promise.
- O preparador lê/colore somente uma vez por combinação dentro de uma exportação. Os dados dos materiais, recortes, transformações e corpo ainda são gerados por pose. **Nenhuma alteração na geometria, física ou bitrate.**
- Tabelas são limpas ao acabar a fase de personagens, antes dos bakes de transição. Sem cache de export anterior, sem salvar PNGs adicionais no projeto.
- Testes: requests concorrentes, diferença entre categorias **Posterior e Traseiro**, mudança de cor, falha/retentativa, limites de retenção e exportação independente.

## Aceite e limitações

Esta rodada elimina chamadas redundantes de IPC e recoloração; **não demonstra aceleração em segundos** até ser medida no Windows 11 / AMD em 300 quadros reais. Os testes do Editor V6 e MP4 offscreen Windows validam regressões, mas não medem o projeto pessoal nem provam ausência de variações visuais no Preset 2 real.

A Rodada 24 investigará composição facial repetida entre múltiplos retratos/estados **somente se a chave for idêntica**. Não tocar no Fabricador nem na UI.
