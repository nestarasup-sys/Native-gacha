# Zona de guerra — Diagnóstico real, 309 quadros e plano de integração

**Data:** 2026-11-04 · **Fonte:** relatório JSON enviado pelo usuário, da primeira exportação observada em Windows 11 x64. Valores sanitizados; **sem** IDs de projetos/usuário, paths privados nem imagens de personagens.

## Configuração comprovada pelo relatório

- **309 quadros, 30fps, 1920×1080, duração 10,3s**, CPU H.264 `libopenh264`, Turbo dois trabalhadores.
- **Reação única do Posterior**, não do Traseiro. Preset 2; boca animada ciclo de 30 frames.
- MP4 `completed`, `fallback=false`, `seam` validado no quadro 154, 309 quadros conferidos por FFprobe.
- Exportador Main `44.587s`, **mais `9.984s` de preparação de cabelo ANTES de iniciar o job** = aproximadamente **54.571s do preparo até a publicação**, se sequenciais, sem contar UI/clique/diálogo.

## Onde o tempo realmente foi gasto

| Fase | Medição | Interpretação |
| --- | ---: | --- |
| `phaseMilliseconds.motionPreparation` | **23.658s** | Maior gargalo do trabalho Main; **21/21 bakes únicos**, concorrência máxima 2, nenhum reutilizado como atlas completo |
| `phaseMilliseconds.rendering` | **18.197s** | Dois workers Turbo renderizando e codificando em paralelo; os tempos individuais das partes são ~14.81s e 13.10s |
| `hairPreparation.totalMilliseconds` | **9.984s** | Pré-IPC: 10 grupos personagem/pose, 104 rigs, 117 superfícies, 8 texturas, 0 atlas extra sem cabelo |
| `hairPreparation.prepareCharacterRenderers` | 3.555s (soma) | Fazia variantes normal e sem cabelo; R30 compartilha roupas apenas, não elimina segundo renderer |
| `hairPreparation.measureFaceModeCrop` | 2.833s (soma) | Mede 28 recortes faciais |
| `hairPreparation.serializeFaceSurface` | 1.749s (soma) | Serializa 103 superfícies faciais |
| `hairPreparation.renderHairlessFaceTarget` | 1.375s (soma) | 104 pinturas de alvos faciais |
| `mouthAnimation.preparationMilliseconds` | 8.249s (soma) | 12 atlas de boca, dois personagens; inclui preparação de boca dentro da fase de renderização |
| Captura dos quadros via Electron | 8.344s + 6.677s (somas por worker) | **15.020s de chamadas de captura** em dois workers que sobrepõem no relógio; não somar à duração wall `rendering` |
| FFmpeg write | 1.191s + 1.272s (somas) | CPU H.264 não parece o gargalo dominante no caminho atual |
| Quadros reutilizados | 5 + 12 = **17/309** | Há pouca cena inteiramente idêntica; otimizar só repouso do Posterior não elimina as capturas quando boca/pose muda |
| Uso do processo Main | RSS pico ~940MB | **Não inclui toda a memória dos renderizadores separados do Electron**, monitorar no Windows antes de aumentar cache de Canvas |

**Cuidado na soma:** preparo pré-IPC ~9.984s ocorre antes dos 44.587s do job; já os tempos de `mouthAnimation`, captura, IPC e escrita FFmpeg são subetapas **contidas ou sobrepostas** em `rendering`. Não somar tudo como se fosse tempo adicional.

## O que implementamos nesta branch experimental

- [R32 — renderizadores de extremidade](ZONA_GUERRA_R32_ENDPOINT_RIGS.md): reutilização exata dos rigs de entrada/saída, por sessão Electron.
- [R33 — ordem por personagem](ZONA_GUERRA_R33_AGRUPAMENTO_BAKES.md): mantém trabalhadores quentes sem reordenar os resultados na timeline.
- [R34 — poses intermediárias](ZONA_GUERRA_R34_POSES_INTERMEDIARIAS_REUTILIZADAS.md): compartilha rigs estáticos de cada amostra interp./pose idêntica, orçamento 12 rigs / estimativa 96MiB por lane.
- [R35 — telemetria de rigs](ZONA_GUERRA_R35_METRICAS_REUSO_RIGS.md): registra `motionPreparation.preparedRigs` e `motionPreparation.reusedRigs` no JSON para comparar ao `23.658s` original.

## Próxima fronteira: R36/R37

- **R36 (a avaliar):** testar a entrega direta dos bitmaps do evento Electron offscreen `paint` antes de recorrer ao `capturePage`. O relatório revela ~15s de captura somada; implementação tem de validar token exato da pintura, Turbo, transparência, PNG sem artefato, cancelamento e fallback. **Não alterar a produção sem A/B visual e temporal.**
- **R37 (a avaliar):** eliminar montagem de roupa/corpo duplicada em cada pose distinta via compilador de comandos por peças (`EditorV6PartMotionPrototype`) e buffers de tint; obrigatoriamente incluir pele, pontes de juntas, roupa, rosto, camada posterior/traseira e RGBA 7/7, 30/30 antes de trocar atlas.

## Checklist de benchmark para a primeira exportação na branch de guerra

1. Manter a `Dev-V2` intacta, atualizar apenas `dev-v2-zona-de-guerra` em checkout isolado.
2. Iniciar numa cópia isolada do projeto real, Preset 2 real sem inventar dados; CPU H.264, Turbo, 1920×1080, 309 quadros.
3. **Sem reuso de atlas de exportação anterior para A/B**: identificar no relatório `motionCache.memoryHits=0` e `diskHits=0`; se forem positivos, o teste não equivale à linha de base da primeira exportação. Não limpar caches pessoais sem autorização.
4. Comparar `motionPreparation.milliseconds` com **23.658s**, `hairPreparation.totalMilliseconds` com **9.984s**, `rendering` com **18.197s**, e duração total com **44.587s + pré-IPC**.
5. Inspecionar as métricas novas `preparedRigs` e `reusedRigs`: se `reusedRigs=0`, o pool não está ajudando este projeto e o custo de serializar as chaves deve ser considerado para desligar a otimização.
6. Comparar 7 amostras de troca de pose + 30 quadros diferentes e validar 309 frames, boca/olhos/roupas, flipX, áudio, alpha e emenda entre workers.
7. Fazer no mínimo 3 medições A/B comparáveis antes de promover os commits para `Dev-V2`. CI GitHub Windows Server 2025 não substitui o Windows 11 do usuário.
