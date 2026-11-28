# Plano 1.8 — triagem da concorrência de motion bake

**Data:** 26/11/2026 · **Revisão testada:** `4c978cfbea271d11b3b4bd667107591bac2c4c8b` · **Decisão:** manter concorrência 2; concorrência 3 rejeitada pelo gate de parede.

## Triagem curta

Na mesma cópia verificada, build e perfil de export, foi comparada concorrência 2 (A) com 3 (B), em `[0,1200)`, 40 s, 1920×1080/30, quatro renderizadores, lote de boca 300, preset 2, áudio e MP4 retido. Um par alternado passou a validação: A **38,777 s**, B **37,068 s** (−4,41%). O PCM decodificado foi idêntico (`4d44261930603c91ff433a0a545bd7efb641cd521e30fb03de2c0d62056e1ab5`); SSIM All foi **0,999988**, PSNR médio **75,325 dB**. O pico do processo principal caiu de 3,51 para 3,09 GiB; GPU ficou em 1,07/1,14 GiB. O resultado justificou testar a condição integral, mas era apenas um corte curto.

## Gate integral

O controle A1 foi o baseline integral atual, da mesma revisão, cópia, build e configuração de produção: 6.000 quadros/200 s, renderizadores 4, boca 600, concorrência 2. O candidato B1 usou a mesma configuração, alterando só a concorrência para 3.

| Métrica | A1: concorrência 2 | B1: concorrência 3 | Variação |
|---|---:|---:|---:|
| Clique → MP4 validado | 158,926 s | 158,564 s | −0,362 s / **−0,23%** |
| Preparação de movimento (parede) | 31,220 s | 31,043 s | −0,57% |
| Renderização/captura | 108,475 s | 108,660 s | +0,17% mais lenta |
| Pico de RSS do processo principal | 4,13 GiB | 3,29 GiB | −0,84 GiB |

Ambos passaram: 6.000 quadros H.264 1920×1080/30, 200 s, AAC estéreo 48 kHz, nove emendas e zero erro de limpeza. O PCM decodificado integral foi idêntico (`778afa3a2ba29fbcaab0f7fe5df401f3907ac1ac875e4268f296bccbf5961c6c`). SSIM All A1/B1: **0,999990**; PSNR médio: **73,003 dB**. Embora a memória observada tenha caído, o primeiro par integral ficou abaixo do gate mínimo de 2%; por isso a hipótese foi eliminada sem gastar outros quatro exports integrais. A triagem curta não se sustentou na carga completa.

## Artefatos e hashes

Todos estão em `out/editor-v6-stress/runs/`; o MP4 final de cada braço foi retido.

| Execução | Relatório SHA-256 | MP4 SHA-256 |
|---|---|---|
| A40 `plan18-motion-concurrency2-screen-40s-20261126` | `867007821a591aa1f73435c05d292edc29158c1f1a10ae0d63f7a459459cbcab` | `c9e0ff1a0eb7b52eda417622d0993d31089ddde721c04273440ed160cc3365e1` |
| B40 `plan18-motion-concurrency3-screen-40s-20261126` | `5c2ea2fc3a9958d3bccce1196f60f6b13a67fa51b2959918226a7ba0b349e652` | `e479426dc15212cea8602fd64207945251262227fab23ca5a37a7bf3cafc4753` |
| A1 `plan18-current-200s-baseline-20261125` | `cf262c41c7a3bc04f13355bcccfc92645e4fb4a3791e701c7ee2dc1b41144a4e` | `ff64865cc2027ac08d974f15f87331ce2856e553c311a8ef246a310933c298cf` |
| B1 `plan18-motion-concurrency3-formal-B1-20261126` | `644ca63637329d0aedaaeb3588ce15b72eacf05d9e0a54c8f32423be08dcb70d` | `a53e1e710ce481c86196dc99d077c32aa0465a329607878d1f92802090c0c563` |

Os JSONs passaram pelo comparador de relatórios. Revisões iguais e árvores limpas; nenhuma mudança de produto foi feita.
