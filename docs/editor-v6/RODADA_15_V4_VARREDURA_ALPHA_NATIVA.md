# Editor V6 — Rodada 15 · Varredura de alfa eficiente para bakes

**Data:** 2026-11-04. **Branch:** Dev-V2. **Base:** `75f067a595f57c5dfd73384d8e6a1cb04d0d525d`.

## Problema

No bake de transições cada quadro intermediário é recortado em resolução nativa antes de entrar no atlas de PNG. `cropOf` já precisava ler RGBA com `getImageData`, mas o laço anterior executava quatro chamadas `Math.min/Math.max` para **cada** pixel visível e consultava a opção `fingerprint` em cada pixel. Isso é trabalho CPU redundante em grandes personagens.

## Implementação

- Extraído `motionAlphaCrop.ts` com varredura de uma linha por vez. Obtém o primeiro e o último pixel alfa válido de cada linha; calcula mínimos/máximos globais apenas uma vez por linha ocupada.
- `cropOf` usa o novo caminho apenas quando não exige fingerprint. Para fingerprint, preserva a ordem original de leitura e o algoritmo FNV de quatro canais, garantindo resultados idênticos.
- Nenhum tamanho de quadro, pixel, limiar alfa, recorte, atlas, shader, áudio, encoder ou prévia foi alterado. O novo código não aloca cópias de pixels nem listas por linha.
- Testes de equivalência reproduzem a função antiga com transparência, limites, bordas, alfa 8/9/255, 100 quadros pseudoaleatórios determinísticos e um sprite RGBA grande com margens e antialiasing.

## Validação e limites

Validar no CI **Windows x64**, incluindo `npm run test:editor-v6`, typecheck, build e paridade MP4. O hardware de CI é Windows Server, não o PC do usuário. A medição de economia efetiva na primeira exportação `Editor V6 06` (300 quadros, Preset 2) continua pendente até executar o benchmark com Windows 11 AMD.

A Rodada 15 reduz operações por pixel sem alterar o custo de `getImageData`; não há promessa de quanto tempo poupará na exportação completa.
