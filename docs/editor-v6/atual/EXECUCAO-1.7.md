# Execução 1.7 — limpeza e candidatos de desempenho

Atualizado em 25/11/2026. Branch `Dev-V2`; base inicial `64f3485197e93d92322be6956816bfbdb59ad085`. Meta segue 90 s para 200 s/6.000 quadros. Baseline de produção mais recente continua sendo a Execução 1.5: mediana 158,484 s. Esta rodada não aprovou mudança de produto.

## Decisão e gate

A pedido explícito do dono, antes da medição o gate foi alterado de 5% para 2%. Para promoção, mediana e menor ganho pareado devem atingir 2%, todos os pares precisam favorecer B, e qualidade/lifecycle precisam passar. A candidata C teve dois pares favoráveis, mediana 2,16%, porém o mínimo foi 1,44%; não passou. Sem série integral e sem alteração de produto.

## A — composição FFmpeg

**A1, rotação zero.** FFmpeg empacotado `n8.1.3-27-g8dca1586f4-20261031` (SHA-256 `04D0C351E53DDE1CC45BA437C28D20A0B382DF2798999DEF5D4110E23D74E62C`). No fixture sintético, o grafo atual `rotate=0:ow=rotw(iw):oh=roth(ih)` resultou em 574×636 e 1.460.256 bytes; sem rotate, 556×312 e 693.888 bytes. Logo, omitir o filtro não preserva geometria/pixels neste caminho. Sem implementação.

**A2, fontes de vídeo.** Análise dos argv das 10 partes: 11 entradas de vídeo, seis fontes distintas, cinco reutilizadas entre partes, no máximo duas utilizações por fonte e nenhuma fonte repetida dentro da mesma parte/job. As fontes originais não estavam acessíveis no caminho do runtime verificado; não foi possível confirmar metadados para omitir scale. Compartilhar decode/scale entre jobs não tem repetição dentro do job e exigiria nova arquitetura/cópia. Não há redundância comprovada que justifique implementação. Nenhum contrato foi alterado.

## B — preparação de movimento

**B1, contexto Canvas.** Rejeitado e já removido da árvore. `check-motion.cjs`, cinco execuções por braço: controle mediano 63,5 ms total/17,4 ms crop; candidato 81,9/26,4 ms (+28,98%/+51,72%). Atlas idêntico, 70.000 pixels. Testes focados temporários: 60 testes/15 arquivos passaram. Patch guardado em `D:\EDITOR-V6-ARQUIVO-PRESERVADO-1.7\experimentos\b1-will-read-frequently.patch`.

**B2, lanes.** Nas cinco sequências, 106 grupos: cargas de 21.835 ms e 31.910 ms; parede de transição 31.939 ms. Há desequilíbrio, mas os dados disponíveis não oferecem estimativa pré-bake melhor: sequências têm 15–24 grupos, 105–168 samples, sete samples/grupo e dimensões/áreas de personagem próximas. Um estimador reproduzível só separa 46/60 grupos, sem prova de que prevê custo real ou melhora wall. Não adicionar heurística sem sinal causal. Nenhum código alterado.

## C — cache de memória de boca, ensaio curto

Candidata: reutilizar atlas já bakeado no mesmo escopo de export, somente se o budget produtor for >= solicitante e os pixels reais couberem no budget solicitante. Chaves persistentes e single-flight entre budgets permaneceriam inalteradas. A cópia do projeto foi verificada; corte escolhido 80–120 s (1.200 quadros, 1920×1080/30), contendo vídeo e fala. Mesmo perfil nos braços, no máximo dois render workers por haver duas partes. A primeira tentativa A1 com quatro workers foi erro de configuração do harness (mais workers do que partes); preservada e repetida com dois workers. Não contar a tentativa inválida. Os pares válidos ficaram na ordem A1/B1 e A2/B2 (não alternada); como o segundo par não atingiu o gate, não houve terceiro par para inverter ordem. Essa limitação enfraquece a atribuição causal e reforça a decisão de não promover.

| Par | Controle A | Candidata B | Ganho de parede | Diferença de quadros | PCM |
|---|---:|---:|---:|---:|---|
| 1 | 51.559,158 ms | 50.074,219 ms | 1.484,939 ms / 2,88% | A1/B1: 86 de 1.200 | idêntico |
| 2 | 47.840,584 ms | 47.150,317 ms | 690,268 ms / 1,44% | A2/B2: 0 de 1.200 | idêntico |

Ganho mediano 2,16%; ganho mínimo 1,44%, abaixo do gate. O controle A/A variou em 140 quadros, PCM idêntico; portanto as 86 diferenças do primeiro par não indicam regressão sistemática. Os quatro arquivos têm 1.200 quadros e 7.680.000 bytes PCM cada. Saída de áudio SHA-256 `ac63dc9db8f92e23b6cd565690439beb9f1ed2d0e0e38c3cf4a50f4e16109a3f`. Saídas e relatório de paridade em `out/editor-v6-stress/runs/round17-c-40s-*` e arquivo preservado.

| Par | Bake boca | Fases motion / render / final | Pico máximo RSS reportado |
|---|---:|---:|---:|
| A1 | 9.177,9 ms | 11.164,85 / 28.504,83 / 808,69 ms | 3.703.881.728 B |
| B1 | 9.085,3 ms | 10.860,59 / 27.768,21 / 796,92 ms | 2.251.427.840 B |
| A2 | 8.825,1 ms | 10.410,83 / 26.616,20 / 838,87 ms | 2.828.066.816 B |
| B2 | 8.763,3 ms | 10.642,50 / 26.079,25 / 772,64 ms | 2.150.387.712 B |

A economia de bake foi apenas 92,6 ms e 61,8 ms; a diferença total observada não pode ser atribuída causalmente à candidata. Pares favoráveis não compensam falha do mínimo de 2%. Conforme o protocolo de até três pares, não foi gasto um terceiro par após falha do gate; série de 200 s não autorizada pelo resultado. Patch e teste temporário foram preservados em `D:\EDITOR-V6-ARQUIVO-PRESERVADO-1.7\experimentos\c-budget-aware-memory-cache.patch` e `motionCacheBudget.test.ts`; código candidato não permanece no produto.

## Arquivo histórico e pasta do lixo

Cópia completa em unidade física D: `D:\EDITOR-V6-ARQUIVO-PRESERVADO-1.7\pasta do lixo`. 16.389 arquivos, 8.490.167.105 bytes; SHA-256 conferido arquivo a arquivo, 0 divergências e 0 extras. Manifesto: `D:\EDITOR-V6-ARQUIVO-PRESERVADO-1.7\manifest.json` (SHA-256 `ED7D1D245610071DAC525CB6518E3AEB66318C9DCB7A4CBF88E98AF3D8115000`). Um junction de `node_modules` foi registrado e não seguido; seu destino ativo continua fora da pasta. Nenhum original foi movido/apagado. Índice e portão: [Arquivo preservado](ARQUIVO-PRESERVADO-1.7.md) e [Lista manual](LISTA-MANUAL-LIXO-1.7.md).

O arquivo em D protege contra exclusão acidental da cópia em C, mas não contra falha física do disco D. A pasta fonte segue ocupando 8.490.167.105 bytes; ainda não houve liberação de espaço.

## Verificações e encerramento técnico

Após remover C, Vitest Editor V6 completo: 927 passaram, 1 ignorado (191 arquivos, 1 ignorado). Focados baseline: 32 passaram em 3 arquivos. `npm run typecheck`, `npm run audit:architecture`, `npx electron-vite build`, `check-motion.cjs`, `check-motion-service.cjs`, `check-overlay-parity.cjs` (60 quadros) e `check-golden-export.cjs` (90 quadros; sem diferenças BGRA) passaram. `check-hair-motion-export.cjs` com `GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS=1` falhou uma vez em teste sintético de flip de peça (erros 1,34–2,22 px) e passou na repetição (máximo 1,585 px); o relatório final ficou `out/editor-v6-hair-motion-check/result.json`. Sem env, o gate falha antes porque não liga fase 2. Não mascarar a flutuação nem alterar thresholds. `git apply --check` confirmou que o patch C externo reaplica limpo no HEAD inicial. `git diff --check` e revisão final vêm antes do commit. Não rodar build/testes C++.

Nenhuma mudança de produto foi aprovada: A1/A2 não provaram oportunidade segura; B1 piorou; B2 não permite estimativa causal; C falhou o mínimo de 2%. A meta de 90 s permanece aberta; melhor série ativa permanece 158,484 s (gap de 68,484 s). Próximo foco único: otimizar o custo sustentado do renderer/FFmpeg de vídeo, guiado por metadados e medições do pipeline já instrumentado, sem promover remoção de operações sem prova de pixels.
