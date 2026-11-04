# Zona de Guerra — painel de pendências e evidências

**Revisado em:** 2026-11-04. **Branch:** `dev-v2-zona-de-guerra`. **Base protegida:** `Dev-V2`.

Este documento distingue:
- **Implementado:** existe código versionado, não necessariamente aprovado.
- **Teste escrito:** existe um contrato ou script de validação; não significa execução aprovada.
- **Comprovado:** resultado medido/observado de uma execução identificável.
- **Pendente:** trabalho ou evidência ausente.

## Resumo executivo

| Frente | Implementação | Evidência disponível | O que falta |
| --- | --- | --- | --- |
| R32 — endpoints | Experimental | Contratos e testes sintéticos descritos | CI verde confirmada e A/B do projeto real |
| R33 — agrupar por personagem | Experimental | Testes de ordem e preservação da timeline escritos | Medir afinidade de lanes e tempo real |
| R34 — poses intermediárias | Experimental | Contrato de atlas idêntico descrito | Comparar casos reais com 21 bakes |
| R35 — contadores de rigs | Experimental | Campos `preparedRigs`/`reusedRigs` documentados | Capturar novo relatório pós-R35 |
| R36 — captura direta do `paint` | Não comprovada/sem integração identificada nesta revisão | Hipótese do diagnóstico | Protótipo com token, fallback, cancelamento e A/B |
| R37 — compilador de peças | Protótipo existente (R31) | Testes de geometria, 7 amostras/30 quadros escritos | Equivalência visual de personagem completo |
| R37 — raster simples | Implementado isoladamente | Testes de cache, geometria e 30 quadros RGBA sintéticos escritos | Confirmar CI e integrar operadores visuais ausentes |
| CI Windows remota | Workflow configurado | Pipeline, logs, JSON, PNG e medições previstos | Obter execução verde e inspecionar artifacts |
| Promoção para `Dev-V2` | Não realizada | Branch separada | Paridade e benchmarks de aceitação |

**Importante:** não foi confirmada uma execução verde do workflow na presente revisão. O código e os testes existem; os resultados precisam ser verificados no GitHub Actions.

## R36 — captura direta do paint

- [ ] Localizar e instrumentar o caminho offscreen atual de `capturePage`.
- [ ] Protótipo `paint` com associação inequívoca entre frame solicitado e bitmap recebido.
- [ ] A/B de RGBA, transparência, PNG, flipX, boca, cabelo e quadros de emenda.
- [ ] Cancelamento, timeout e fallback para `capturePage` sem frames atrasados.
- [ ] Medição em Turbo com dois workers e memória por processo.
- [ ] Decidir ativação somente se houver paridade e ganho sustentado.

## R37 — composição completa por peças

- [x] Compilador geométrico experimental `src/shared/editorV6PartMotionPrototype.ts`, desligado do exportador.
- [x] Backend isolado de raster `src/shared/editorV6PartRasterRenderer.ts` com cache de imagens decodificadas.
- [x] Testes de comportamento `tests/editor-v6/partMotionPrototype.test.ts` e `partRasterRenderer.test.ts`.
- [x] Fixture de 30 quadros sintéticos `tests/editor-v6/r37RasterParity.browser.ts` com comparador RGBA para peças planas.
- [x] Script Electron `scripts/editor-v6/check-r37-raster.cjs` e integração no laboratório Windows.
- [ ] Confirmar resultado verde dos testes e analisar capturas PNG/tempos.
- [ ] Pele, tint e contorno com a mesma ordem e amostragem do renderizador atual.
- [ ] Pontes de articulações e pivôs.
- [ ] Roupas, acessórios, recortes, camadas Posterior/Traseiro.
- [ ] Rosto, boca, olhos, expressões, blink e cabelo frontal/traseiro.
- [ ] Paridade RGBA/BGRA de 7 amostras, 30 quadros e exportações 720p/1080p.
- [ ] Cancelamento e fallback, orçamento de memória e ausência de regressões.
- [ ] A/B com 309 quadros reais e três medições comparáveis.
- [ ] Integração opt-in no exportador, somente depois dos gates visuais.

## Benchmark real pós-R35

- [ ] Usar cópia isolada do projeto de referência, sem compartilhar mídia pessoal no GitHub.
- [ ] Repetir 309 quadros, 30fps, 1080p, CPU H.264, Turbo 2.
- [ ] Confirmar `motionCache.memoryHits=0` e `diskHits=0`.
- [ ] Comparar `motionPreparation` com 23.658s; `hairPreparation` com 9.984s; `rendering` com 18.197s.
- [ ] Registrar `preparedRigs` e `reusedRigs`, picos de memória e qualidade visual.
- [ ] Executar pelo menos três A/B comparáveis antes de propor promoção.

## Limites da revisão documental

Foram lidos os documentos centrais conhecidos de `docs/editor-v6`, README e ADRs/relatório de arquitetura. A busca conectada do GitHub não fornece inventário recursivo confiável de **todos** os Markdown da branch; portanto este painel não afirma ser auditoria exaustiva de cada `.md` do repositório. Os estados acima não devem ser interpretados como CI aprovada sem logs de execução.
