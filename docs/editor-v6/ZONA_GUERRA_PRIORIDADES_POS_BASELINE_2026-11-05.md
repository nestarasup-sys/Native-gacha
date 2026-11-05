# Zona de Guerra — prioridades após a nova linha de base (2026-11-05)

**Baseline ativa:** [resumo](baselines/native_gacha_nova_baseline_2026-11-05.md) · [dados estruturados](baselines/native_gacha_nova_baseline_2026-11-05.json).
O projeto histórico foi alterado e **não** pode mais ser comparado com este; manter o arquivo antigo somente como diagnóstico histórico.

**Estado medido, sem inferir ganho:** uma exportação fria de 309 quadros, 1080p/30, CPU `libopenh264`, Turbo 2x, Preset 2 e cabelo posterior, sem áudio ou vídeo. Main: 44,2128 s; preparo de cabelo anterior ao job: 10,503 s; soma aproximada: **54,7158 s**. MP4 completo, sem fallback, 309/309 quadros e emenda 154 validados pelo relatório. Nenhum teste A/B deste novo projeto foi executado. O relatório não identifica inequivocamente o SHA da versão executada no computador.

## P0 — A/B confiável e telemetria da execução (pré-requisito)

- Fixar cópia isolada e imutável do novo projeto e Preset 2; registrar SHA do aplicativo, CPU/GPU e versão do Windows, sem enviar arquivos pessoais ao GitHub.
- Instrumentar contadores por fase e por worker, com duração total desde antes do preparo de cabelo até o MP4 publicado. Separar tempo de parede de soma de tempos paralelos.
- Para comparar primeiras exportações, usar perfis/caches **isolados** equivalentes e conferir `motionCache.memoryHits=0`, `diskHits=0`; **nunca** limpar o cache ou o perfil pessoal automaticamente.
- Registrar mínimo de três execuções comparáveis por variante e mediana; conservar um MP4 de referência para inspeção visual. Registrar amostras de 7 trocas de pose, 30 quadros distintos, quadro de emenda e amostras de alpha/roupas/rosto/cabelo.
- **Gate:** sem projeto e condições equivalentes, registrar "não comparável"; sem SHA e configuração, evitar alegar velocidade atribuída à alteração.

## P1 — Eliminar trabalho repetido na preparação de movimento (maior potencial)

**Evidência:** `motionPreparation=23,7045 s`, 21 bakes únicos, `preparedRigs=141`, `reusedRigs=0`. Isso mostra que os mecanismos atuais não encontraram reuso no caso medido; **não prova** que 141 rigs sejam geometricamente idênticos.

**Como atacar:** instrumentar `src/renderer/src/features/editorV6/motion/bakeMotion.ts` e `electron/domains/editorV6/prepareMotions.ts` para obter, por worker e revisão de personagem, chave de pose, tentativas/acertos/evicções de reuso, tempo de `prepareSavedCharacterRenderer`, amostras e custo de raster. Verificar o motivo do 0/141: ausência de poses repetidas, chaves divergentes, cache local a outro worker ou eviction. Só então implementar reuso **por identidade visual comprovada** e/ou estrutura/material imutável compartilhado dentro da mesma exportação. Não reutilizar frames de MP4 de exportações anteriores.

**Gate:** saída RGBA/MP4 invariável, 309 quadros, mesma física/boca, cancelamento preservado, memória limitada; mediana do preparo menor no novo projeto, sem piora relevante do tempo total.

## P2 — Reduzir a preparação anterior ao job (cabelo/face)

**Evidência:** `hairPreparation.totalMilliseconds=10,503 s`. Subfases observadas: preparar renderizadores 3,686 s, medir recortes de face 3,048 s, serializar superfícies faciais 1,776 s e renderizar alvos sem cabelo 1,353 s. São etapas do preparo; **não adicioná-las** novamente ao total.

**Como atacar:** investigar `src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts` e `faceModeAssets.ts`: preparar renderizador normal/sem cabelo com base imutável compartilhada; guardar recorte facial com chave completa de expressão, transformações e modo; evitar `canvas.toDataURL` repetido apenas quando os pixels da superfície forem realmente idênticos. Medir economias por subfase e a memória, sem perder crop, tint, camadas ou alpha.

**Gate:** 104 rigs/117 superfícies/28 medições da referência explicados antes/depois (contagem pode mudar se o trabalho for eliminado); equivalência visual para olhos, boca, blink, roupa e cabelo; redução de tempo de parede do preparo, não só de uma função.

## P3 — Diminuir o tempo por quadro da renderização sem trocar uma captura correta por uma incorreta

**Evidência:** `rendering=17,7905 s`, 292 frames efetivamente renderizados; `captureMs` acumulado nos dois workers = **16,3693 s**, com sobreposição entre workers, portanto **não** são 16 s de ganho direto. A preparação de atlas da boca (8,5964 s somados) é subetapa desta fase.

**Como atacar:** instrumentar o caminho `exportWorkers.ts` / `exportWorker.tsx` por tipo de quadro, incluindo custo de React, preparo de boca, WebGL/Canvas, token de sincronização, readback e escrita no FFmpeg. Primeiro reduzir trabalhos idênticos **dentro do mesmo job** (atlas facial, estados estáticos e preparação compartilhável) preservando a fase global da boca. Para um salto maior, evoluir o compositor R37 em isolamento: tint, contornos, juntas, roupas, face/olhos/boca, cabelo, crop e alpha. Só comparar caminho direto de desenho versus `capturePage` após equivalência real.

**Não fazer:** habilitar o evento R36 `paint` como captura oficial, ignorar tokens de frame, reduzir resolução/FPS/qualidade ou promover R37 parcial. O diagnóstico R36 não demonstrou equivalência segura.

**Gate:** 7 amostras RGBA/BGRA e 30 quadros dinâmicos de personagem real, 309 quadros 1080p com MP4 Turbo, quadro de emenda, cancelamento/fallback, pico de memória e três medições A/B; se houver divergência, manter o exportador atual.

## Sequência objetiva

1. **Próxima rodada de código:** acrescentar telemetria de identificação de rigs, chaves, acerto/evicção por worker e microtempos; rodar CI Windows e observar o projeto de referência em execução local.
2. Corrigir a causa **comprovada** do desperdício em P1, implementando um mecanismo reversível e com limite de memória; testar pixels e tempo.
3. Atacar P2 após o primeiro A/B de P1, pois o preparo de cabelo antecede o job e pode neutralizar ganhos da renderização.
4. Atacar P3 em laboratório, preservando o exportador seguro, e só integrar com os gates visuais e métricas completas.
5. Publicar por experimento um par *antes/depois* com SHA, total, preparo, renderização, acertos de cache, qualidade e mediana; jamais declarar a meta de 10–15 s cumprida por um teste sintético.

**Limites conhecidos:** GitHub Actions Windows Server valida testes/MP4 sintéticos, mas não mede a GPU, drivers ou perfil do Windows 11 do usuário. Nenhum ganho foi demonstrado por esta documentação.
