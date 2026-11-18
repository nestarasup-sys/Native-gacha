# Zona de Guerra — painel de pendências e evidências

**Revisado em:** 2026-11-05. **Branch:** `dev-v2-zona-de-guerra`. **A `Dev-V2` foi sincronizada com o trabalho anterior; esta rodada documental permanece somente na Zona de Guerra.**

Este documento distingue:
- **Implementado:** existe código versionado, não necessariamente aprovado.
- **Teste escrito:** existe um contrato ou script de validação; não significa execução aprovada.
- **Comprovado:** resultado medido/observado de uma execução identificável.
- **Pendente:** trabalho ou evidência ausente.

**Baseline ativa a partir de 05/11:** [novo projeto, 54,716 s com pré-preparo](baselines/native_gacha_nova_baseline_2026-11-05.md) · [plano de prioridades e gates](ZONA_GUERRA_PRIORIDADES_POS_BASELINE_2026-11-05.md). A comparação antiga permanece histórica porque o projeto anterior foi alterado. Uma única medição não demonstra ganho.

**CI do commit `7739e8b` validada:** [laboratório Windows](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41966829609), [paridade do Editor V6](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41966829608) e [Fabricador Windows](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41966829602) concluídos com sucesso. Esses testes não substituem benchmark do projeto real.

## Resumo executivo

| Frente | Implementação | Evidência disponível | O que falta |
| --- | --- | --- | --- |
| R32 — endpoints | Experimental | Contratos e testes sintéticos descritos | CI verde confirmada e A/B do projeto real |
| R33 — agrupar por personagem | Experimental | Testes de ordem e preservação da timeline escritos | Medir afinidade de lanes e tempo real |
| R34 — poses intermediárias | Experimental | Contrato de atlas idêntico descrito | Comparar casos reais com 21 bakes |
| R35 — contadores de rigs | Implementado | Relatório do projeto novo: 141 rigs preparados / 0 reutilizados | Diagnosticar chaves, sessões, evicções e medir ganho A/B |
| R36 — captura direta do `paint` | Não comprovada/sem integração identificada nesta revisão | Hipótese do diagnóstico | Protótipo com token, fallback, cancelamento e A/B |
| R37 — compilador de peças | Protótipo existente (R31) | Testes de geometria, 7 amostras/30 quadros escritos | Equivalência visual de personagem completo |
| R37 — raster simples | Implementado isoladamente | Testes de cache, geometria e 30 quadros RGBA sintéticos escritos | Confirmar CI e integrar operadores visuais ausentes |
| CI Windows remota | Workflows executados | Três workflows do commit `7739e8b` concluídos com sucesso | Validar equivalência de projeto real no Windows 11 do usuário |
| Integração anterior em `Dev-V2` | Fast-forward concluído em 05/11 | Mesmo commit `7739e8b` nas duas branches antes desta rodada documental | Não promover novas alterações sem gates de aceitação |

**Importante:** a CI Windows do commit anterior foi confirmada como verde. O R36/R37 continua experimental e sem paridade completa de personagem; não interpretar teste sintético como ganho local.

## R36 — captura direta do paint

- [x] Criar probe isolado Electron com `paint` e `capturePage` em sete quadros sintéticos (`scripts/editor-v6/check-r36-paint.cjs`).
- [x] Registrar duração e igualdade de bytes BGRA dos dois caminhos sem ativar a produção.
- [ ] Localizar e instrumentar o caminho offscreen atual de `capturePage` na produção.
- [ ] Protótipo `paint` com associação inequívoca entre frame solicitado e bitmap recebido.
- [ ] A/B de RGBA, transparência, PNG, flipX, boca, cabelo e quadros de emenda.
- [ ] Cancelamento, timeout e fallback para `capturePage` sem frames atrasados.
- [ ] Medição em Turbo com dois workers e memória por processo.
- [ ] Decidir ativação somente se houver paridade e ganho sustentado.

## R37 — composição completa por peças

- [x] Compilador geométrico experimental `src/shared/editorV6PartMotionPrototype.ts`, desligado do exportador.
- [x] Backend isolado de raster `src/shared/editorV6PartRasterRenderer.ts` com cache de imagens decodificadas.
- [x] Testes de comportamento `tests/editor-v6/partMotionPrototype.test.ts` e `partRasterRenderer.test.ts`.
- [x] Fixture de 309 quadros sintéticos `tests/editor-v6/r37RasterParity.browser.ts` com comparador RGBA para peças planas.
- [x] Script Electron `scripts/editor-v6/check-r37-raster.cjs` e integração no laboratório Windows.
- [x] Confirmar workflows Windows verdes no commit `7739e8b` (laboratório sintético, contratos/paridade e Fabricador). Os resultados não equivalem ao projeto real.
- [ ] Pele, tint e contorno com a mesma ordem e amostragem do renderizador atual.
- [ ] Pontes de articulações e pivôs.
- [ ] Roupas, acessórios, recortes, camadas Posterior/Traseiro.
- [ ] Rosto, boca, olhos, expressões, blink e cabelo frontal/traseiro.
- [ ] Paridade RGBA/BGRA de 7 amostras, 30 quadros e exportações 720p/1080p.
- [ ] Cancelamento e fallback, orçamento de memória e ausência de regressões.
- [ ] A/B com 309 quadros reais e três medições comparáveis.
- [ ] Integração opt-in no exportador, somente depois dos gates visuais.

## Benchmark real pós-R35 — baseline ativa de 05/11

- [x] Receber relatório sanitizado do **novo** projeto (o anterior foi alterado).
- [x] Verificar 309 quadros, 30fps, 1080p, CPU H.264, Turbo 2 e ausência de fallback.
- [x] Confirmar `motionCache.memoryHits=0` e `diskHits=0` nesta amostra.
- [x] Registrar `motionPreparation=23,7045s`, `hairPreparation=10,503s`, `rendering=17,7905s`, `preparedRigs=141`, `reusedRigs=0` e RSS Main ~655 MiB.
- [ ] Repetir **o mesmo projeto novo** em ambientes frios isolados, sem limpar cache pessoal, e obter três medições comparáveis.
- [ ] Registrar SHA do app utilizado no PC e validar paridade visual real antes de qualquer alegação de ganho.
- [ ] Comparar o projeto novo apenas com sua própria baseline de **54,7158s** (total aproximado com pré-preparo); números do projeto antigo são históricos.

## Rodada adicional de implementação (2026-11-04)

- R36: A/B offscreen de sete quadros com `paint`/`capturePage` e comparação de bytes, **apenas diagnóstico**. O evento de pintura pode ser coalescido e observar o token DOM não prova a identidade atômica do bitmap; por isso não é seguro usar o probe como substituto de captura.
- R37: corrigida invalidação de decode em andamento, teste de regressão e paridade sintética estendida a 309 quadros; o benchmark mede desenho simples em 96×96, **não** exportação real 1080p.
- CI: três rodadas automáticas com agregação min/mediana/máximo por verificação; ainda sem resultado de execução confirmado.
- **Não concluído:** compositor completo com roupas, juntas, tint, rosto e cabelo; R36 produção; três A/B reais de 309 quadros em Windows 11. Não declarar as três frentes finalizadas sem esses dados.

## Limites da revisão documental

Foram lidos os documentos centrais conhecidos de `docs/editor-v6`, README e ADRs/relatório de arquitetura. A busca conectada do GitHub não fornece inventário recursivo confiável de **todos** os Markdown da branch; portanto este painel não afirma ser auditoria exaustiva de cada `.md` do repositório. Os estados acima não devem ser interpretados como CI aprovada sem logs de execução.
