# Plano 1.8 — baseline integral de 200 s

**Data:** 25/11/2026 · **Revisão de origem:** `4c978cfbea271d11b3b4bd667107591bac2c4c8b` · **Execuções:** 1 · **Estado:** válida, observação única (não é nova mediana).

## Método e resultado

Foi usado o pacote de importação verificado em `out/editor-v6-stress/backups/authorized-import-package-2026-11-22T05-43-57-943Z-13804`, build Electron produzido da revisão limpa acima e saída isolada. Perfil padrão da interface: `[0,6000)`, 1920×1080/30, Turbo, CPU/libopenh264, quatro renderizadores, boca em lote 600, cabelo Preset 2, piscadas/transições e áudio. O harness marcou a execução como aprovada, sem alterar a revisão nem usar renderizador nativo.

| Métrica | Resultado |
|---|---:|
| Clique → MP4 validado | **158,926 s** |
| Fase no processo principal | 143,623 s |
| Preparação de movimento | 31,220 s |
| Renderização/captura | 108,475 s |
| Finalização | 3,602 s |
| RSS máximo do processo principal | 4,13 GiB |

O `ffprobe` confirmou H.264 1920×1080/30 com 6.000 quadros e 200,000 s, além de AAC estéreo 48 kHz por 200,000 s. O relatório registra seis clipes de áudio, nove emendas e zero erros de limpeza. O MP4 tem 108.103.513 bytes.

Este corte único ficou 0,442 s (0,28%) acima do melhor tempo previamente promovido de 158,484 s; não o substitui como referência mediana nem demonstra regressão. O gap nominal para 90 s é **68,926 s** nesta observação. O gargalo de parede continua concentrado em render/captura; não foi testada hipótese nova neste job.

## Artefatos

- Diretório: `out/editor-v6-stress/runs/plan18-current-200s-baseline-20261125/`
- Relatório: `stress-export-validation.json`; SHA-256 `cf262c41c7a3bc04f13355bcccfc92645e4fb4a3791e701c7ee2dc1b41144a4e`
- MP4: `FYN & RONAN — UM CASAL PERIGOSO - db8d6ba7-4cc2-4419-b097-a78f60bcee38.mp4`; SHA-256 `ff64865cc2027ac08d974f15f87331ce2856e553c311a8ef246a310933c298cf`
- Cópia-base preservada; uso de espaço ocorreu somente na pasta `out` isolada.
