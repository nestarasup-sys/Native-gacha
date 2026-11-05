# Native Gacha — nova linha de base de exportação
**Data:** 05/11/2026

Este documento substitui a referência do projeto anterior, que foi modificado acidentalmente. Todos os nomes de usuário, caminhos e IDs foram removidos.

## Cenário de teste
- 309 quadros em 10,3 s; 1920×1080, 30 FPS.
- CPU H.264 (libopenh264), Turbo 2×, dois workers.
- Reação única do cabelo posterior, Preset 2; ciclo de boca de 30 quadros.
- Exportação concluída, sem fallback; 309/309 quadros validados; emenda no quadro 154.
- Sem áudio e sem vídeos externos.

## Tempos
| Métrica | Valor |
|---|---:|
| **Total aproximado, incluindo pré-preparo** | **54.716 s** |
| Exportador principal | 44.213 s |
| Pré-preparo de cabelo (fora do job) | 10.503 s |
| Preparação de transições | 23.704 s |
| Renderização/encode | 17.791 s |
| Sondagem de encoder | 1.412 s |
| Finalização | 1.287 s |
| Captura: soma dos dois workers, **não wall-clock** | 16.369 s |
| Preparação da boca, **contida na renderização** | 8.596 s |

## Gargalos e validade
- **21/21** transições preparadas; **0** bakes reutilizados.
- **141** rigs preparados; **0** rigs reutilizados.
- Cache de movimentos: **0 memory hits, 0 disk hits, 21 misses** — primeira exportação fria em relação a esses movimentos.
- **292** quadros renderizados e **17** reutilizados.
- Pico RSS Main: **655.2 MiB**; exclui GPU e renderizadores.
- Reporte completo e sem fallback; porém **uma amostra não prova ganho**, e projetos anteriores diferentes não são comparáveis diretamente.

## Regra para próximas comparações
Repetir **o mesmo projeto novo**, cenas, personagens, presets, resolução, FPS, hardware, encoder, modo Turbo e condição de cache. Comparar primeiramente tempo total incluindo pré-preparo, depois `motionPreparation`, `hairPreparation`, `rendering`, cache e qualidade visual. Evitar apagar caches/perfis reais; use cópias isoladas quando necessário.
