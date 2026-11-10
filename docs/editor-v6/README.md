# Documentação do Native Gacha — índice de navegação

**Escopo:** documentação do Editor V6 na `Dev-V2` e histórico de experimentos na `dev-v2-zona-de-guerra`. Os seis modos de exportação foram retirados da interface da `Dev-V2` em 05/11/2026; o exportador padrão permanece ativo.

## Comece aqui

| Documento | Finalidade |
| --- | --- |
| [README do produto](../../README.md) | Instalação, produto, branches e comandos |
| [Auditoria de importação JSON (05/11)](AUDITORIA_IMPORTACAO_JSON_IA_GUIA_V14_2026-11-05.md) | Diagnóstico do V6 e incompatibilidades do V13.1 |
| [Guia V14.1 — React JSON](GUIA_V14_1_NATIVE_GACHA_EDITOR_V6_JSON_REACT.md) | Guia atual para IA: contrato V6 e direção criativa do V13.1 consolidado |
| [Guia V14.0 — histórico](GUIA_V14_NATIVE_GACHA_EDITOR_V6_JSON_REACT.md) | Versão anterior do guia de importação |
| [Painel de pendências da Zona de Guerra](ZONA_GUERRA_PENDENCIAS.md) | O que está implementado, o que falta validar e o que não começou |
| [Baseline ativa — projeto novo (05/11)](baselines/native_gacha_nova_baseline_2026-11-05.md) | Medição do projeto novo, separado do cenário anterior alterado |
| [Baseline ativa — dados JSON](baselines/native_gacha_nova_baseline_2026-11-05.json) | Números estruturados e sanitizados para A/B |
| [Redesenho do exportador para salto real](ARQUITETURA_SALTO_REAL_EXPORTADOR_2026-11-05.md) | Alternativas de arquitetura e gates, não ajustes menores |
| [Prioridades pós-baseline](ZONA_GUERRA_PRIORIDADES_POS_BASELINE_2026-11-05.md) | Histórico de prioridades, hipóteses, métricas e gates |
| [Diagnóstico histórico de 309 quadros](ZONA_GUERRA_RELATORIO_309_QUADROS_E_PLANO.md) | Projeto antigo, não comparar contra a nova linha de base |
| [Bancada Windows remota](ZONA_GUERRA_BANCADA_WINDOWS_REMOTA.md) | CI, resultados sintéticos e limitações |
| [R37 — estado e gates](ZONA_GUERRA_R37_STATUS_E_GATES.md) | Protótipo de peças, raster experimental e paridade pendente |
| [Refatoração incremental em execução](REESTRUTURACAO.md) | Ciclos, mudanças, gates e pendências da branch isolada. |

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

## Programa de pesquisa sistêmica (06/11/2026)

- [Índice, 16 trilhas e plano executável: Native Gacha inteiro / Editor V6](pesquisa-sistemica/README.md).
- [Primeira pesquisa concluída no código: arquitetura geral e integrações](pesquisa-sistemica/pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md).
