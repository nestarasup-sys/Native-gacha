> **Documento histórico de arranque da Dev-v3.** O plano principal agora é [Engine V6 / Dev-v3](../engine-v3/README.md). Em caso de divergência, seguir o plano novo e as decisões explícitas do usuário, especialmente a prévia com somente piscadas.\n\n# Dev-v3 — direcao de engenharia exclusiva do Editor V6

**Origem:** `Dev-V2` no commit `25efe9bccf253c4e374a1f4eb6729745e9c3c3fb`.
**Escopo:** somente Editor V6. Editor V7 permanece experimental, fora deste plano.
**Estado:** primeira fatia de isolamento e paridade temporal implementada; validacao automatizada ainda pendente de execucao em ambiente com dependencias.

## Contrato principal

O usuario deve poder montar uma timeline, reproduzir e exportar um MP4 que respeite o mesmo estado autoral. Os calculos de tempo, recortes, pose, expressao, boca, piscada, cabelo, ordem de camadas e geometria nao devem ser reinterpretados silenciosamente por cada saida.

A separacao de responsabilidades e intencional: **nao** unificar todas as animacoes em um motor monolitico. Compartilhar **as regras do quadro avaliado**, mantendo renderizacao interativa e offline especializadas quando necessario.

## Primeira fatia nesta branch

1. O cache de planos de movimento em `src/shared/editorV6Motion.ts` passa a ser isolado por timeline **e** ID do projeto, alem da configuracao de fala. A programacao de face consulta o ID do projeto; duplicacoes que compartilhem uma referencia da timeline nao devem compartilhar indevidamente o cache derivado.
2. O indice de movimentos de `src/shared/editorV6TimelineScene.ts` segue a mesma fronteira. A reutilizacao dentro do mesmo projeto e da mesma timeline permanece.
3. `src/shared/editorV6VideoComposition.ts` centraliza a amostragem do frame de origem e a conversao dos frames de 30 FPS para segundos.
4. Previa de video, planejador de trechos, chaves de reuso visual e composicao FFmpeg passam a usar essa mesma regra, sem mudar a taxa nem os formatos de saida.
5. Testes: isolamento de caches por projeto/modo de fala, mapeamento de fonte apos recorte Turbo e argumentos temporais da composicao FFmpeg.

Essas mudancas nao demonstram melhoria de FPS nem confirmam igualdade de pixels. Foram escolhidas para reduzir risco e criar fronteiras verificaveis antes de uma intervencao maior.

## Proximos gates tecnicos (ordem de prioridade)

### Gate A — fidelidade do quadro final

- Amostras de projetos com transicoes de pose/expressao, piscada, fala, boca, cabelo, videos, imagens, texto, fundos e audio.
- Mesmo frame do projeto no preview e no MP4 decodificado; medir pixels com criterio de tolerancia documentado e observar movimento nos quadros vizinhos.
- Confirmar ordenacao em emendas, clip in/out, videos sobrepostos e export em 24/30 FPS.
- **Risco ja identificado:** a previa usa o video ativo superior, enquanto o plano FFmpeg pode compor varios videos simultaneamente. Documentar o comportamento esperado antes de mudar ambos os caminhos.
- O preview nao deve ocultar um quadro facial incompleto sem sinalizacao: avaliar o fallback assincrono de `EditorV6PlaybackScene.tsx`.

### Gate B — fluidez do editor, independente do export

- Capturar percentis de commit da cena/timeline, latencia do scrub, frame drops de playback, tempo de preparo de assets e pausas de GC.
- Medir com projetos pequenos, medios e grandes, antes/depois, sem confundir render em tempo real com exportacao.
- Corrigir apenas as etapas comprovadamente dominantes; preservar a semantica dos gestos, desfazer/refazer e salvamento.

### Gate C — reduzir trabalho no exportador

- Reutilizar a medicao real de 200 s (historico: 163,760 s clique ate MP4 validado, 1080p30, 6.000 quadros) como referencia, nao como numero confirmado para novos commits.
- Separar tempo de preparo, render, readback/capturePage, transferencia BGRA, pipe, filtro, encode e finalizacao por tempo de parede, nao somar workers sobrepostos.
- A/B de uma hipotese por vez. Nao promover candidato por microbenchmark se o MP4 final nao ficou mais rapido sem regressao visual.
- Renderer alternativo apenas como experimento interno ao V6, depois de provar pixels equivalentes e memoria controlada; nunca migracao forcada para V7.

## Regras para mudar a arquitetura

- O resolvedor `resolveEditorV6SceneAtFrame` e uma base existente a preservar; evoluir seu contrato so ao demonstrar necessidade de um consumidor.
- Preservar o schema persistido, IDs, fontes de personagem, arquivos de usuario, importacao, undo/redo e IPC.
- Nao alterar varios motores, caches e encode na mesma rodada.
- Nao usar testes com dados reais sem copia isolada e autorizacao explicita do projeto.
- Nao declarar desempenho ou paridade sem executar a bateria correspondente.

## Verificacao para esta primeira fatia

```bash
npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/editorV6Motion.test.ts tests/editor-v6/editorV6ExportParity.test.ts tests/editor-v6/editorV6VideoTimebase.test.ts tests/editor-v6/sceneVideoLayer.test.ts
npm run typecheck
npm run audit:architecture
```

Em maquina com suporte ao Electron e FFmpeg, avancar posteriormente para `npm run test:editor-v6:export` e comparacao de export real autorizada. **Os comandos acima sao instrucoes de verificacao; nao indicam resultados aprovados nesta branch.**
