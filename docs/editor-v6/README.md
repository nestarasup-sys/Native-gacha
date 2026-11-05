# Documentação do Native Gacha — índice de navegação

**Escopo:** branch experimental `dev-v2-zona-de-guerra`. Este índice não altera o fluxo histórico de atualização da branch `Main-desenvolvimento`, nem promove alterações à `Dev-V2`.

## Comece aqui

| Documento | Finalidade |
| --- | --- |
| [README do produto](../../README.md) | Instalação, produto, branches e comandos |
| [Painel de pendências da Zona de Guerra](ZONA_GUERRA_PENDENCIAS.md) | O que está implementado, o que falta validar e o que não começou |
| [Baseline ativa — projeto novo (05/11)](baselines/native_gacha_nova_baseline_2026-11-05.md) | Medição do projeto novo, separado do cenário anterior alterado |
| [Baseline ativa — dados JSON](baselines/native_gacha_nova_baseline_2026-11-05.json) | Números estruturados e sanitizados para A/B |
| [Prioridades pós-baseline](ZONA_GUERRA_PRIORIDADES_POS_BASELINE_2026-11-05.md) | Próximas mudanças, hipóteses, métricas e gates |
| [Diagnóstico histórico de 309 quadros](ZONA_GUERRA_RELATORIO_309_QUADROS_E_PLANO.md) | Projeto antigo, não comparar contra a nova linha de base |
| [Bancada Windows remota](ZONA_GUERRA_BANCADA_WINDOWS_REMOTA.md) | CI, resultados sintéticos e limitações |
| [R37 — estado e gates](ZONA_GUERRA_R37_STATUS_E_GATES.md) | Protótipo de peças, raster experimental e paridade pendente |

## Histórico técnico por etapa

| Etapa | Documento | Estado resumido |
| --- | --- | --- |
| R32 | [Rigs de extremidade](ZONA_GUERRA_R32_ENDPOINT_RIGS.md) | Implementação experimental; A/B real pendente |
| R33 | [Agrupamento de bakes](ZONA_GUERRA_R33_AGRUPAMENTO_BAKES.md) | Implementação experimental; ganho real não medido |
| R34 | [Reuso de poses intermediárias](ZONA_GUERRA_R34_POSES_INTERMEDIARIAS_REUTILIZADAS.md) | Implementação experimental; equivalência de projeto real pendente |
| R35 | [Métricas de reuso](ZONA_GUERRA_R35_METRICAS_REUSO_RIGS.md) | Instrumentação com leitura real pós-R35: 141 rigs preparados, 0 reutilizados; ganho ainda não comprovado |
| R36 | [Painel de pendências](ZONA_GUERRA_PENDENCIAS.md#r36--captura-direta-do-paint) | Proposta de avaliação, não implementação validada |
| R37 | [Compositor por peças](ZONA_GUERRA_R37_STATUS_E_GATES.md) | Protótipo e raster parcial implementados; não integrado ao exportador |

## Arquitetura e histórico

- [ADR-001 — Modularizar Electron](../architecture/ADR-001-modular-electron.md)
- [ADR-002 — Propriedade dos dados e fluxo de personagens](../architecture/ADR-002-fluxo-personagens.md)
- [Relatório de evolução de 2026-10-22](../architecture/RELATORIO_EVOLUCAO_2026-10-22.md)

**Regra de leitura:** um teste escrito ou um workflow configurado não significa que a execução passou. Relatórios de benchmark histórico não comprovam desempenho da branch experimental. O estado consolidado deve ser atualizado somente com evidência observável de CI ou execução local.
