# Rodada 27 — Relatório real de preparação do cabelo
**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Status:** implementado; benchmark pessoal ainda pendente.

## Problema e solução
O relatório MP4 era iniciado **depois** de o painel preparar o cabelo. Assim o tempo de preparação inicial (~18s num histórico antigo) não entrava nas fases registradas pelo Main. A R27 acrescenta `preparationProfile` ao bundle de cabelo validado no IPC. O perfil contém apenas números agregados, sem nomes de personagem, caminhos locais nem dados salvos. O Main copia os números para `hairPreparation` do relatório JSON do MP4.

A preparação total abrange desde antes de `collectTargets` até imediatamente antes de devolver o bundle. As fases `collectTargets`, `loadCustomizerCharacters`, `resolveSavedCharacterSource`, `loadHairStyles`, `prepareCharacterRenderers`, `prepareHairLayers`, `renderHairlessFaceTarget`, `measureFaceModeCrop`, `serializeFaceSurface` e `bakeHairlessMotionTransition` acumulam número de chamadas, soma e máximo. O relatório traz ainda `counts` de superfícies, texturas, rigs, atlas de transição e caracteres base64 de PNG.

**As durações das fases podem se sobrepor** em `Promise.all`. Não somar durações de fase para estimar tempo total: usar `totalMilliseconds`. O bloco `phaseMilliseconds` do runner continua medindo a exportação principal.

## Roteiro de comparação
1. No Windows 11 x64, usar **cópia isolada verificada** do projeto e Preset 2 original; CPU H.264, 1920×1080, 30fps, Turbo. Não tocar em perfis ativos e não testar no Linux.
2. Exportar pela primeira vez, abrir o JSON ao lado do MP4. Anotar `hairPreparation.totalMilliseconds` e `hairPreparation.stages`, `phaseMilliseconds.motionPreparation` e `rendering`, `attempts[].parts[].frameTiming`.
3. Comparar após cada experimento: mínimo de 7 amostras/30 quadros distintos com paridade visual, depois três exportações reais de 300 quadros. Não reduzir qualidade.
4. Se Preset 2 estiver ausente na cópia isolada, declarar medição bloqueada — jamais criar um substituto para fabricar números.

## Limite
Os novos valores de R27 ainda não foram medidos no computador AMD do usuário. CI Windows Server valida contratos/MP4 sintético, **não** velocidade no hardware real.