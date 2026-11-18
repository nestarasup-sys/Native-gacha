# Execução 1.1 — 18/11/2026

## Estado recebido

- `975336ac` usa uma camada em trechos sem vídeo sobreposto.
- `1551cbf2` acrescenta resumo por tentativa, fases e diagnóstico de falhas por trecho.
- `45e009f0` reduz carregamento duplicado de imagens e mede prontidão do worker e espera descoberta no pipe.
- O usuário observou que exportações continuam próximas da duração do vídeo. Seu corte novo foi localizado e analisado em [Pesquisa 1.1](PESQUISA-1.1.md).

## Próxima execução autônoma

### Autorização e meta

O usuário autorizou exportar autonomamente o mesmo corte de **3 min 20 s** do projeto `editorV6-408a77d1-d964-4c04-a66b-f4e9fcfeee46`. Use o intervalo de timeline `[0, 6000)`, 1920×1080, 30 FPS, Turbo, CPU `libopenh264`, boca com ciclo de 30 quadros e cabelo posterior com preset 2 e reação à pose. Consulte o JSON de referência para reproduzir as opções exatas.

**Perfil obrigatório das próximas medições:** export padrão da interface, caixinha “Usar só piscadas e transições de pose e expressão” desmarcada. Assim, piscadas e transições continuam ativas, junto com boca e preset de cabelo. Não use o perfil simplificado, não desative uma animação para melhorar artificialmente o tempo e não execute testes/benchmarks do renderizador nativo C++. A rodada integral registrada em `actual-project-full4-batch600-200s-2026-11-18` foi CPU `libopenh264`, `capturePage`, boca ativa, preset 2 e perfil `editor-v6-ui-default`; não foi C++.

A meta é **90 s no caminho padrão**, incluindo preparação anterior ao IPC, transições, renderização, validação e publicação. Frente aos 200,84 s registrados só no main, isso exige pelo menos **55% de redução** e ganho em mais de uma fase. A renderização sozinha levou 147,23 s. Como orçamento de investigação, mire em 25 s de preparação total, 60 s de renderização e 5 s de finalização. O critério de aceitação é o tempo total, com a qualidade e os 6.000 quadros verificados.

O projeto real é fonte de leitura. Use o harness isolado e uma cópia verificada do projeto e das dependências necessárias, com destino único em `out/`. O comando existente é `npm run bench:editor-v6:project -- ...`. Leia `scripts/editor-v6/benchmark-project-export.cjs` antes de executar. Confira as validações de origem, cópia, mídia e perfil. Se ele não admitir este corte, adapte o caminho de teste com autorização por ID exato e mantenha as verificações de isolamento e integridade. Preserve os dados e MP4s do usuário.

### Ordem de trabalho

1. Confira se o relatório e os scripts de teste continuam correspondendo ao código da branch.
2. Reaproveite o relatório existente para triagem. Crie ou amplie um analisador que compare relatórios e confira intervalo, perfil, encoder efetivo, revisão e fases antes de calcular ganhos. Use um cenário sintético curto para selecionar mudanças de captura, transições e prontidão com baixo custo.
3. Se captura não der um ganho consistente sem diferença visual, investigue as transições da preparação global. Use perfil de bake e fila por personagem. Se só houver dados somados, acrescente uma medição leve no relatório existente.
4. Se o problema se concentrar em prontidão, inspecione a montagem do renderer por fase. A leitura de 22,12 s depois da navegação cobre vários trechos. Verifique se a espera está em decodificação, montagem ou concorrência.
5. Use o corte real para medir conjuntamente fases, emendas, qualidade e limpeza. Ajude a localizar perdas adicionando métricas quando houver uma lacuna concreta. Rode novamente o corte completo para validar um candidato com potencial de ganho ou obter um controle equivalente quando ele faltar. Faça commit local após cada mudança concluída e continue pelas hipóteses verificáveis até atingir a meta ou documentar um bloqueio concreto.

## Restrições da entrega

- Use `Dev-V2` em `C:\TRABALHO 2\OUTROS\GACHA EM C++`. Preserve mudanças locais e dados do usuário.
- Compare exports com as mesmas opções. Uma diferença de encoder, FPS, animações ou escala invalida a atribuição de ganho.
- Nenhum reaproveitamento de resultados entre exports. No fluxo normal só permanecem MP4 e relatório. Em falha ou cancelamento, preserve o destino anterior e limpe os temporários do job.
- Preserve escala, recortes e altura nas transições, qualidade visual, áudio e emendas. O relatório aponta onde olhar, e as verificações visuais usam quadros decodificados ou fixtures.
- Use fixtures sintéticas para triagem e o corte real autorizado para comprovação. Prossiga sem depender de novos exports manuais do usuário.

## Registro desta passagem

- Localizado e interpretado o relatório de 6.000 quadros. O trabalho ativo foi consolidado nesta pasta.
- As otimizações citadas acima já pertencem aos commits indicados. Esta passagem é de documentação e preparação da próxima rodada.
- Próxima nota de execução deve registrar hipótese, fixture, controles, números, decisão, testes e commit em um único lugar.

## Rodada de comparação — alpha e captura

- Repeti o corte `[0, 6000)`, 1080p/30, dois workers, CPU `libopenh264`, áudio, boca e cabelo ativos, em perfil isolado. Backup e preset ficam em `out/editor-v6-stress`; o preset 2 disponível é o preset sintético autorizado do harness, não o estado exato da UI do usuário.
- Antes do export, validei que a leitura de alpha em fixture 960×1280 devolve os mesmos limites do algoritmo anterior. O scan novo levou 0,36 ms versus 1,76 ms por chamada no microbenchmark local. Essa diferença não apareceu no export inteiro: `cropDetectionMs` foi 39,83 s antes e 39,61 s depois, pois a medição inclui uma leitura Canvas custosa. Não atribuir o tempo total ao scan de bytes.
- A execução completa passou: 6.000 quadros H.264, 1920×1080, 30 FPS, 200 s, 6 clipes de áudio, 19 emendas, limpeza dos temporários. Tempo clique→MP4 validado 206,06 s; processo principal 191,95 s; renderização 141,25 s; preparação de movimento 45,76 s; cabelo 12,25 s; boca 24,49 s somados.
- O controle da rodada anterior, também captura 8 ms, foi 209,87 s. `captureStaleReadbacks` mudou de 429/2139 (20,1%) para 423/2133 (19,8%); captura descartada segue sem evidência de redução material. A medição de 3,81 s (1,8%) é pequena demais para confirmar melhoria.
- Não alterar o retry padrão: continua em 16 ms; 8 ms permanece apenas como modo de laboratório. Não anunciar a meta de 90 s como atingida.
- Ampliei o comparador para aceitar diretamente o relatório agregado do harness. Ele calcula clique→validado, identifica o projeto, compara os mesmos parâmetros e recusa conclusão quando faltam quadros, áudio, emendas ou limpeza. O relatório produzido antes desta ampliação não traz ID do projeto nem `cleanupErrors`; o comparador agora o rejeita como prova completa. Próximos relatórios de laboratório incluem esses campos.
- Nova tentativa recusada antes de rodar porque o harness não recebeu o ID autorizado no formato que espera; outra falhou na preparação por não injetar o preset; ambas pararam antes do primeiro quadro e não alteraram a fonte. A repetição final incluiu ID UUID, arquivo de preset e perfil UI.
- Próximo foco: a renderização consome 141 s de parede; captura, frame roundtrip e FFmpeg são custos sobrepostos. Investigar por trecho o ciclo de worker/FFmpeg e a contenção de CPU. A troca para AMF e quatro workers em corte curto já não mostrou caminho para uma redução de 2×. Não fazer novo corte completo sem candidato que ataque a etapa crítica.

## Rodada — partes de 600 e 1.200 quadros; tentativa C++

- Depois do A/B integral abaixo, o padrão de produção passou a 600 quadros por trecho falado. O harness mantém overrides 200/300/600/1.200 restritos a `GACHA_VIDEO_STRESS_OFFSCREEN=1`; fallback reutiliza o mesmo tamanho. O comparador tem `--allow-mouth-batch-change` para explicitar diferenças entre relatórios.
- O corte completo de 600 passou: 6.000 quadros, 1920×1080/30, AAC por 200 s, H.264, 9 emendas, zero estados de boca ignorados/obsoletos e zero erros de limpeza. Clique→validado 201,45 s; 10 partes; boca 20,61 s somados; renderização 138,58 s. O controle antigo não tem o mesmo cronômetro de clique; ainda não se pode anunciar uma redução pareada.
- O corte completo de 1.200 também passou: mesmo perfil, 6 emendas, clique→validado 209,20 s; 6 partes; boca 22,96 s; renderização 145,22 s. Escreveu 99,53 GB de quadros BGRA contra 94,56 GB no corte de 600. Menos inicializações não compensaram a carga por parte; rejeitado como otimização.
- O renderizador C++ falhou na amostra de 40 s antes de validar vídeo: conjunto de assets >512 MiB. Preparação de movimento 11,82 s e renderização parcial 19,84 s. Não houve MP4 para comparar. Não elevar o teto; primeiro medir tipos/bytes de assets enviados e limitar cache por execução.
- Repeti o teste C++ em 40 s com lotes de 300 em vez de 600; voltou a exceder os mesmos 512 MiB em cada processo (15,34 s de render parcial). Reduzir a parte não resolveu; sem MP4. O relatório isolado é `.../actual-project-2026-11-18T09-41-05-402Z-9736/native-renderer-300-failure.report.json`.
- O comparador exibe revisão e estado dirty em ambos os lados e recusa subtrair tempos com bases diferentes. O controle antigo usa main+preparação estimados; candidatos de harness medem clique→validado. A comparação 600→1.200, com ambos cronometrados desde o clique, é válida e dá Δ +7,75 s.
- O analisador agora lê o agregado do harness e exibe separadamente clique→validado, main, cabelo, fases somadas dos workers (marcadas como sobrepostas), modo de captura e picos de memória/CPU por processo. No corte de 1.200: roundtrip 188,34 s, `capturePage` 95,83 s, cópia BGRA 21,56 s, escrita FFmpeg 99,22 s e pipe descoberto 19,86 s (todos somados por worker); FFmpeg chegou a 454% CPU e main a 3,87 GiB. A renderização/captura continua principal.
- Metadados: o relatório de 600 foi criado antes da inclusão de revisão/dirty no agregado. O de 1.200 registra revisão `1ee95c3a...` e `workingTreeDirty=true`. O controle antigo também não guarda o fingerprint do preset; as duas execuções novas têm o mesmo preset sintético 2 (`2a0f0859...`). Portanto, não usar o controle antigo para reivindicar igualdade exata do preset ou delta de tempo.
- A/B curto de concorrência de bake, 1.200 quadros, 2 workers de render, batch 600: concurrency 2 terminou em 44,318 s; concurrency 3 em 45,151 s (+0,833 s). Preparação subiu de 12,360 para 12,745 s e render de 22,724 para 23,364 s. Amostra única, sem ganho; não elevar a concorrência padrão.
- Saídas: `out/editor-v6-stress/runs/actual-project-2026-11-18T09-06-07-709Z-16536/` (600), `.../actual-project-2026-11-18T09-22-59-852Z-4064/` (1.200) e falha C++ `.../actual-project-2026-11-18T09-27-48-073Z-20044/native-renderer-failure.report.json`. As duas execuções válidas ficaram só com MP4 e relatório; a falha, só com o relatório.
- Decisão registrada antes do A/B integral da rodada seguinte: manter 300 até haver evidência de qualidade e tempo de parede. O resultado de 18/11 abaixo supersede esta decisão.

## Rodada — lote 600 confirmado

- A/B integral `[0,6000)`, 1080p/30, CPU OpenH264, 4 workers, áudio e animações iguais: lote 300 = 194,502 s; lote 600 = 187,864 s, −6,637 s (−3,4%). Renderização caiu de 130,305 para 125,563 s. Os dois validaram 6.000 quadros, AAC por 200 s, emendas e limpeza.
- Comparei o MP4 curto de lote 600 (40 s; duas partes, portanto dois workers) com dois controles de lote 300 (40 s, quatro workers). FFmpeg reportou SSIM global 0,996211 em ambos. Isso sustenta qualidade semelhante, sem alegar igualdade exata.
- O teste integral de 600 manteve quatro workers e passou as validações; alterei o padrão de produção para 600 quadros. O fallback usa o mesmo tamanho; atlas e arquivos não são mantidos entre jobs. Lote 1.200 segue rejeitado por ser 7,75 s mais lento que 600.
- A análise do relatório integral confirmou o perfil padrão: 6.000 quadros, CPU `libopenh264`, captura `capturePage`, boca ativa e preset 2. O relatório anterior levava o analisador a rejeitar esse projeto por título fixo de outro roteiro; a validação agora usa o ID autorizado, confere o perfil padrão/animações e mostra o tempo de parede sem fase atribuída (1,58 s neste relatório).
- Duas primeiras tentativas de A/B falharam porque a cópia de entrada usada não tinha a biblioteca de fundos; uma pasta vazia foi um contorno inválido e os workers ficaram sem mídia. Identifiquei a segunda cópia verificada completa e repeti com suas fontes corretas. No perfil padrão, 40 s/1.200 quadros/2 workers: sobreposição ligada = 43,053 s; desligada = 43,366 s (+0,313 s / +0,7%). Ambas validaram H.264/AAC, duração, 1.200 quadros, emenda em 600 e limpeza. Mantive a sobreposição ligada; nenhum teste C++ foi executado.
- Criei no harness um limite experimental de threads FFmpeg, aplicado só ao perfil CPU isolado e registrado por trecho no relatório. No mesmo corte padrão de 40 s, automático (6 threads) = 43,053 s e limite 2 = 43,431 s (+0,378 s / +0,9%). Relatórios comparáveis e validação completa; cap não promovido. O comparador agora exige `--allow-encoder-thread-change` quando essa variável diverge.
- Repeti o corte padrão de 40 s com limite 4, mantendo piscadas, transições, boca e Preset 2 ativos, CPU OpenH264, 2 workers, 1.200 quadros, áudio, emenda e limpeza validados. Levou 43,618 s contra 43,053 s no controle automático de 6 threads (+0,565 s / +1,3%). Cap 4 também rejeitado; export de produção continua automático. Renderer C++ não foi usado.
- O bake repetia a medição dos recortes de 4 modos faciais para estados visuais de ponta idênticos em transições distintas. Adicionei um cache LRU de geometria limitado à sessão do export, chaveado pelo snapshot completo do personagem e pelo estado visual completo. Só é usado quando o pedido traz o escopo exclusivo daquele export; contém recortes/dimensões, não bitmaps ou atlas, e é descartado com a sessão.
- O corte padrão de 40 s passou com 1.200 quadros, boca, cabelo, piscadas e transições ativos: 42,905 s contra 43,053 s no controle de 2 workers. No corte completo de 200 s, o tempo caiu de 187,864 para 179,714 s (−8,150 s / −4,3%). Preparação global caiu de 44,770 para 37,007 s. A renderização ficou em 125,182 s, praticamente igual aos 125,563 s do controle; o ganho medido veio da preparação.
- No relatório completo, os `sampleRenderCalls` somados caíram de 1.800 para 1.215 (−32,5%); `endpointGeometryMs` somado dos workers caiu de 35,354 para 20,322 s e `cropDetectionMs` de 38,676 para 25,671 s. Esses tempos de workers se sobrepõem e não são parede. Ambos os exports validaram 6.000 quadros 1080p/30, H.264/AAC de 200 s, seis clipes, nove emendas e zero erros de limpeza. A meta de 90 s permanece aberta; este ganho não acelerou a renderização sustentada.
- Concorrência 1 para bake de movimentos, mesmo corte padrão de 40 s: 51,611 s contra 43,053 s com concorrência 2 (+8,558 s / +19,9%). Bake do movimento foi de 12,698 para 19,346 s; fila de bake da boca de 3,564 para 8,204 s. Saída validada, sem regressões estruturais. Manter concorrência 2; menor paralelismo piorou o preparo e o tempo total.
- Meta 90 s ainda aberta: mesmo a fase de renderização dura 125,563 s. O relatório agrega 119,86 s de `capturePage`, 20,89 s de conversão BGRA e 200,99 s de escrita FFmpeg, somas paralelas dos workers, não tempo de parede. Cena (272 ms), composição facial (8 ms) e commit React (175 ms) são residuais.
- Um protótipo de `ffconcat` repetiu imagens com durações exatas em fixture apenas com `option framerate 30`; sem isso, um segmento de dois quadros virou um quadro. Não integra: não reduz os quadros H.264 do contrato CFR e exigiria estratégia de armazenamento/timestamps sem ganho demonstrado.

## Rodada — encoder Media Foundation e concorrência real

- A captura experimental `paint-event` terminou sem quadro válido: o worker esperou 63,79 s e expirou em `aguardar quadro paint com token`. O relatório foi preservado como `paint-event-failure.report.json`; essa estratégia permanece desativada.
- Reencodei offline 40 s do MP4 já validado: `h264_mf` levou 3,70 s e `libopenh264` 7,06 s. SSIM/PSNR contra a origem comprimida foram 0,997073/48,52 dB e 0,996593/47,89 dB. Isso mede apenas o encoder, não a captura.
- No export real isolado de 40 s, `h264_mf` levou 44,282 s e OpenH264 44,318 s. O empate confirma que encoder não reduz o tempo de parede neste perfil; não alterei a seleção de produção.
- Uma tentativa de quatro workers usou lotes de 600: havia só dois trechos e o export executou com paralelismo 2. Corrigi o plano para recusar workers em número maior que trechos disponíveis. O relatório foi retido para auditoria, mas não conta como teste de quatro workers.
- Quatro execuções curtas, dois pares 2/4 em lote de 300, deram medianas 46,951/43,857 s (−6,6%). O par 2/6 em lote 200 deu 48,927/44,262 s (−9,5%); todos validaram quadros, áudio, emendas e limpeza.
- Full pareado, mesma cópia, `[0,6000)`, CPU OpenH264, lote 300: 2 workers = 210,963 s; 4 = 194,502 s; 6 = 192,850 s. Todos passaram 6.000 quadros, AAC por 200 s, 19 emendas, zero bocas ignoradas/obsoletas e limpeza. Quatro salvaram 16,461 s (7,8%); seis, 18,113 s (8,6%).
- Fases de renderização caíram de 145,97 s (2 workers) para 130,30 s (4) e 128,22 s (6); a preparação global ficou ~45 s nos três. O ganho veio do renderer, mas não chega perto de 90 s.
- Seis workers só venceram quatro por 1,65 s, com pico GPU ~1,49 GiB contra 1,20 GiB. Promovi quatro workers para H.264 CPU e mantive dois para encoder GPU; o texto da interface não promete “2×”.
- As somas de preparação de boca por worker foram 25,0/84,4/155,8 s, sobrepostas e não aditivas. Os 43 estados foram iguais e nenhum foi ignorado; sob concorrência a latência por trecho cresceu. Próxima otimização: reduzir espera/contenda da preparação facial durante renderização, sem duplicar ou alterar os atlas.
- A meta permanece 90 s. A próxima rodada deve medir a boca por fila, bake efetivo e tempo de parede da parte; não escalar workers acima de quatro sem evidência maior.

## Rodada — cadência da captura offscreen (18/11)

- Mantive o perfil padrão da interface: simplificação desmarcada, boca, piscadas, transições e Preset 2 ativos, 1080p/30, CPU OpenH264, 2 workers e lote 600. Não executei renderizador nem testes C++.
- A/B curto no mesmo commit e na mesma cópia do projeto: captura Electron a 60 Hz = 42,755 s; 120 Hz = 42,128 s (−0,627 s/−1,5%); 30 Hz = 43,713 s (+0,958 s/+2,2%). Todos validaram 1.200 quadros, H.264/AAC de 40 s, emenda no quadro 600 e limpeza sem erros.
- 120 Hz teve 400 readbacks e 79 antigos (19,8%); 60 Hz teve 428 e 107 (25%); 30 Hz teve 466 e 145 (31,1%). O ganho de 120 Hz é pequeno para uma única amostra e não prova ganho em export longo; não alterei o limite de produção (60 Hz).
- O corte padrão de 40 s a 30 Hz demorou mais. O comparador confirmou mesmo commit, fingerprint de preset e opções, exceto a cadência explicitamente autorizada; os relatórios dizem que a paridade visual não foi medida, então não alego equivalência pixel a pixel.
- O relatório isolado do `paint-event` revelou padding do Electron (1922×1105 contra 1920×1104). Ajustei a leitura para aceitar até 4 pixels extras por dimensão, validar o token no stride real e copiar as linhas sem redimensionar; bitmaps maiores ou incompletos continuam rejeitados. Os testes cobrem recorte normal, camadas sobrepostas e limite de padding.
- `compare-paint` no corte padrão confirmou igualdade exata entre todos os 321 bitmaps capturados pelas duas APIs e validou 1.200 quadros, áudio e emenda. No A/B limpo do mesmo commit, `paint-event` levou 41,654 s contra 41,147 s de `capturePage` (+0,507 s/+1,2%) e teve mais retries antigos (346 contra 88); portanto `capturePage` permanece o padrão.
- Testei retry de captura em 8 ms no mesmo perfil: 41,841 s contra 41,147 s em 16 ms (+0,693 s/+1,7%), com seis retries antigos a menos. A espera de 8 ms não foi promovida.
- Relatórios: `out/editor-v6-stress/runs/offscreen60-control-40s-2026-11-18/stress-export-validation.json`, `.../offscreen120-standard-40s-2026-11-18/stress-export-validation.json`, `.../offscreen30-standard-40s-2026-11-18/stress-export-validation.json`, `.../paint-parity-standard-40s-2026-11-18/stress-export-validation.json`, `.../paint-capturepage-control-40s-2026-11-18/stress-export-validation.json`, `.../paint-event-standard-40s-2026-11-18/stress-export-validation.json` e `.../capture8-standard-40s-2026-11-18/stress-export-validation.json`. Nenhum MP4 foi retido pelo harness.
- Não rodei o corte completo de 200 s nesta rodada: o melhor resultado curto não sustenta uma melhora relevante; repetir o export longo não seria um teste eficiente. O relatório integral anterior segue em 179,714 s, com renderização em 125,182 s. Meta de 90 s ainda não atingida; captura e escrita continuam como próximo gargalo para investigação.

## Rodada — descarte de quadros repetidos (18/11)

- No perfil padrão da interface, sem simplificação e com boca, piscadas, transições e Preset 2 ativos, o controle de 40 s terminou em 42,148 s. Validou 1.200 quadros 1080p/30, H.264/AAC e emenda no quadro 600.
- O FFmpeg do projeto (build 8.1 LGPL) não contém `mpdecimate`; essa primeira tentativa falhou antes de gerar vídeo. Testei então `select` por mudança de cena seguido de `fps=30`: no fixture, 30 quadros reconstruídos tiveram hashes idênticos aos originais. No projeto real, o candidato passou H.264/AAC, 1.200 quadros, 30 FPS, duração, emenda e limpeza, mas levou 42,731 s contra 42,148 s (+0,583 s/+1,38%). O pipe ainda recebeu 14,93 GB dos dois jeitos, porque a seleção só ocorre dentro do FFmpeg após receber os quadros. Descartei a otimização e removi o código experimental.
- Não rodei C++ nem o corte completo de 200 s; o candidato curto foi mais lento e não justifica outro export longo. A meta de 90 s segue sem avanço nesta rodada. Relatórios: controle `out/editor-v6-stress/runs/dupe-drop-control2-40s-2026-11-18/stress-export-validation.json`, tentativa sem filtro disponível `out/editor-v6-stress/runs/dupe-drop-candidate-40s-2026-11-18/failure-reports/1.report.json` e seleção por cena `out/editor-v6-stress/runs/select-dedupe-candidate-40s-2026-11-18/stress-export-validation.json`.

## Rodada — captura serial das camadas (18/11)

- O relatório mostrava captura stacked de 2160 px nos trechos com vídeo. Comparei o modo serial existente, com duas capturas de 1080 px, no perfil UI padrão: simplificação desligada, boca, piscadas, transições, Preset 2 e áudio ativos.
- A/B curto, mesmo build e projeto: stacked 42,639 s; serial 39,659 s (−2,980 s/−6,99%). Ambos validaram 1.200 quadros, H.264/AAC, duração de 40 s, emenda no quadro 600 e limpeza. Comparação dos MP4s decodificados: 1.200 quadros em cada, SSIM 0,999603. O quadro 630 inspecionado visualmente manteve a composição.
- A/B completo, `[0,6000)`, 4 workers, lote 600, OpenH264, 3 threads/FFmpeg, mesmo preset 2 e opções de animação: stacked 179,261 s; serial 162,689 s (−16,572 s/−9,25%). A fase de render caiu de 124,655 para 108,670 s; preparação caiu de 37,148 para 35,901 s. Os dois relatórios validam 6.000 quadros 1080p/30, H.264/AAC por 200 s, 9 emendas e zero erros de limpeza.
- O comparador agora inclui a estratégia de captura por camada e requer `--allow-layer-capture-change` para comparar serial com stacked. A estratégia serial passou a padrão nos trechos com vídeo; stacked permanece disponível apenas com `GACHA_EDITOR_V6_LAYER_CAPTURE=stacked` para comparação isolada. Projetos sem vídeo continuam com captura single.
- Evidência pixel a pixel da fixture integrada existente: 240 camadas comparadas, 225 idênticas, 15 com diferença máxima de 1 nível RGB, zero diferença em alpha e zero amostras fora da tolerância. A saída real curta teve SSIM alto, sem usar C++ nesta rodada.
- Relatórios: curto stacked `out/editor-v6-stress/runs/layer-stacked-control2-40s-2026-11-18/stress-export-validation.json`; curto serial `out/editor-v6-stress/runs/layer-serial-40s-2026-11-18/stress-export-validation.json`; completo stacked `out/editor-v6-stress/runs/layer-stacked-full200-control-2026-11-18/stress-export-validation.json`; completo serial `out/editor-v6-stress/runs/layer-serial-full200-2026-11-18/stress-export-validation.json`. O MP4 completo serial permanece junto ao relatório; controles e MP4s curtos ficaram só com relatórios.
- A meta de 90 s permanece aberta: captura serial ainda usa 108,670 s na fase de render e o total validado foi 162,689 s. Continuar pelo gargalo de captura/pipe; não repetir testes de duplicata pós-ingestão, pois não reduziram bytes transferidos.

## Rodada — exportação padrão confirmada (18/11)

- Reexportei o mesmo corte de 200 s no perfil UI padrão: simplificação desligada (`includeSpeechMouth=true`), piscadas/transições, boca, Preset 2, CPU H.264, áudio e qualidade 1080p/30 preservados. Serial já estava ativo por padrão. Nenhum renderizador C++ foi usado.
- Resultado: **163,760 s clique→MP4 validado**, 6.000 quadros, H.264/AAC com duração de 200 s, nove emendas, seis clipes de áudio e zero erros de limpeza. Fases: preparação global 36,806 s; renderização 109,489 s; finalização 3,535 s. O diretório da execução contém só MP4 e relatório.
- O relatório apontou um defeito de instrumentação: o cabeçalho dizia dois workers, mas `runs[0].workers` e `attemptDiagnostics[0].parallelism` confirmam quatro. Corrigi o campo no relatório com anotação de proveniência; o benchmark agora registra a contagem observada e calcula CPU Turbo como quatro workers no rótulo.
- Métricas somadas entre workers (não são tempo de parede): frame roundtrip 227,34 s, escrita FFmpeg 176,17 s, `capturePage` 82,07 s e IPC de desenho 118,87 s. Foram capturadas 1.654 imagens e 4.346 quadros reutilizados; houve 297 readbacks obsoletos. O próximo foco é o caminho captura→IPC→pipe/FFmpeg, sem alterar o conteúdo visual.
- A preparação de boca criou 36 atlas para cinco personagens; preparação somada 49,49 s, espera na fila 37,23 s (contadores sobrepostos). O cache de movimento registrou um hit apenas; não há evidência de ganho potencial relevante por ampliar cache entre trechos.
- O corte confirma a execução padrão e o modo serial, mas **não** atinge 90 s e não é um A/B com stacked nesta rodada. Relatório e MP4: `out/editor-v6-stress/runs/layer-serial-default-full200-2026-11-18/`.

- Reabri os relatórios do A/B pareado para separar a causa: stacked→serial reduziu `capturePage` somado de 114,65 para 82,05 s e `captureBitmap` de 20,67 para 14,60 s; FFmpeg write caiu de 193,78 para 172,20 s e IPC draw de 132,66 para 118,51 s. Readbacks obsoletos aumentaram de 193 para 283, portanto reduzir retries não explica o ganho. Priorizar o custo do surface/readback e do transporte BGRA; o teste anterior de retry curto também não acelerou.

## Rodada — buffers de camadas separados (18/11)

- Hipótese: no caminho padrão serial, remover a montagem/cópia do frame BGRA combinado e enviar os buffers de fundo e primeiro plano em ordem ao mesmo pipe rawvideo. O projeto/teste manteve boca, piscadas, transições, cabelo Preset 2, áudio, CPU OpenH264, 1080p/30 e captura padrão; os 40 s tiveram dois workers por conter duas partes.
- A/B no mesmo HEAD `0d50903d`, projeto/preset e opções iguais: combinado 40,755 s; buffers separados 43,693 s (+2,938 s / +7,2%). A renderização foi 20,708 s vs. 23,249 s; preparação 10,876 s vs. 10,307 s. Uma amostra por lado e a sonda de encoder variou (0,230 vs. 1,314 s), então não atribuir toda a diferença só ao transporte.
- Ambos passaram 1.200 quadros, áudio, emenda e limpeza. O MP4 do candidato comparado aos primeiros 40 s do export integral serial deu SSIM 0,999956, 1.200 quadros; isso confirma saída visual próxima, mas não compensa ausência de ganho de tempo.
- Decisão: rejeitar e retirar a montagem experimental de buffers separados; não fazer o corte de 200 s com este candidato. O original continua padrão. Relatórios: `serial-buffer-control-40s-2026-11-18` e `serial-buffer-candidate-40s-2026-11-18`; o segundo contém o MP4 comparado e o relatório. A meta de 90 s permanece aberta.
- A primeira chamada do script via `npm run bench:editor-v6:project` também acionou a etapa `build:editor-v6:native` definida no alias e compilou o executável, sem executar exportação ou teste C++. As duas medições efetivas foram invocadas diretamente pelo harness sem essa etapa. Não repetir o alias; para o perfil padrão, chamar o harness após `npx electron-vite build`.

## Rodada — boca preparada antes dos workers (18/11)

- Hipótese: preparar os atlas de boca de todos os trechos antes de iniciar os renderizadores, evitando que o bake de boca divida CPU/GPU com a captura. Preservei as 6 atlases, preset 2, boca, piscadas, transições, áudio, captura serial, H.264/1080p/30 e o mesmo intervalo de 40 s.
- A/B no mesmo HEAD `3aab4015` e duas partes/workers: preparação intercalada com render = 40,920 s; preparada antes = 41,617 s (+0,697 s / +1,7%). Renderização foi 21,001 s vs. 22,461 s; preparação global 10,494 s vs. 10,328 s. As somas das fases de boca foram 4,661 s vs. 4,311 s, com seis atlas nos dois casos.
- Os dois exports validaram 1.200 quadros, áudio e limpeza. O candidato antecipado teve SSIM 0,999956 contra os primeiros 40 s do export integral. A mudança de fase não diminuiu o total e perdeu a sobreposição atual entre bake e renderização; removida sem rodar o corte de 200 s.
- Relatórios: `mouth-interleaved-control-40s-2026-11-18` e `mouth-prepared-before-render-40s-2026-11-18`; o candidato contém MP4 + relatório. Próximo diagnóstico de boca deve reduzir trabalho por estado/crop ou deduplicação comprovável, não apenas mover o mesmo bake de fase.

## Rodada — perfil padrão e relatório de geometria (18/11)

- Todas as execuções mantiveram a exportação UI padrão, simplificação desligada, piscadas, transições de pose/expressão, boca, Preset 2, CPU OpenH264, áudio e 1080p/30. Nenhum build/teste C++ foi executado.
- Corrigi o schema IPC para preservar contadores de cache de geometria e agregá-los no relatório. A chave do cache ignora `state.id`, que é identidade da instância e não muda pixels/recorte. O corte de 40 s mostrou 22 hits/28 misses; o integral, 117/95. Não atribuo ganho de tempo sem A/B conclusivo.
- `paint-event` bateu `capturePage` pixel a pixel no modo de comparação de 40 s. No integral levou 165,836 s vs. 163,760 s do padrão. Não foi promovido.
- 80 s, padrão: 2 workers 69,088 s; 4 workers 63,810 s. Em 120 s: 4 workers 104,417 s; 6 workers 105,781 s. A fila somada de boca subiu de 23,956 s para 49,278 s com 6. Manter 4.
- Em 120 s, 4 workers com concorrência de boca 3 levou 102,517 s vs. 104,417 s com concorrência 2, mas o integral 3 levou 163,869 s vs. 163,760 s. Lote de boca 300 levou 104,713 s em 120 s. Manter concorrência 2/lote 600.
- O integral paint-event concluiu e validou 6.000 quadros, 9 emendas, H.264/AAC de 200 s e zero falhas de limpeza; seu comando terminou com status 1 apenas porque o harness exigia 2 workers quando o argumento era omitido, apesar de a execução ter usado 4. Corrigi o guard para validar contagem somente quando `--render-workers` for explícito.
- Relatórios: pastas `capture-paint-*`, `standard-workers*`, `standard-motion-concurrency3-*`, `standard-mouth-batch300-*` e `endpoint-geometry-schema-counters-40s-*` em `out/editor-v6-stress/runs/`. A meta de 90 s continua aberta; o custo principal permanece renderização e transporte dos quadros.
- Lookahead de dois quadros: 40 s levou 40,362 s vs. 41,057 s controle; 120 s levou 104,084 s vs. 104,417 s controle. O ganho de 0,3% no mesmo corte longo não justificou manter buffers extras; o pipeline padrão continua com um quadro antecipado. Relatórios `standard-lookahead2-*` preservados, MP4s de comparação removidos.
- Quatro threads por encoder em vez do automático de três: 120 s levou 102,660 s vs. 104,417 s; diferença sem repetição pareada. Não alterar padrão nem executar o corte integral com essa hipótese.

## Rodada — lote de boca 1.200 no perfil padrão (18/11)

- Conforme a orientação, medi somente o export normal do Editor V6, com simplificação desligada e todas as animações ativas: boca, piscadas, transições, cabelo Preset 2, áudio, CPU OpenH264, 1080p/30 e quatro workers. Nenhum build ou teste C++ foi executado.
- O lote de 1.200 quadros reduziu a divisão de 10 para 6 partes, mas o clique→MP4 validado subiu de 163,760 s (lote padrão 600) para 165,006 s (+1,247 s/+0,76%). Renderização: 110,280 s contra 109,489 s. Preparação global: 37,505 s contra 36,806 s.
- Os dois vídeos validaram 6.000 quadros H.264 e AAC, duração de 200 s, nove emendas (cinco no candidato por seis partes) e zero erros de limpeza. SSIM decodificado entre os MP4s: 0,996784. O candidato preparou 33 atlas de boca, mas somou 104,882 s de bake contra 55,999 s no lote 600; esses tempos são somas de workers e se sobrepõem.
- Decisão: rejeitar lote 1.200; preservar o padrão de 600 quadros. A hipótese de menos partes não reduziu a espera de inicialização o suficiente e aumentou o custo observado de preparação facial. Relatório: `out/editor-v6-stress/runs/standard-mouth-batch1200-full200-2026-11-18/stress-export-validation.json`.
- O ambiente bloqueou a remoção automática do MP4 usado na comparação e do marcador do ensaio. O diretório é apenas de laboratório em `out/`, não é reaproveitado pelo exportador do aplicativo; não tentei contornar o bloqueio. A meta de 90 s continua aberta.
