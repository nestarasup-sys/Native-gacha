# Laboratório de exportação do Editor V6 — Plano B

## Objetivo

Executar exportações offscreen, repetíveis e isoladas para diagnosticar as falhas de CPU/Turbo e AMD AMF observadas no projeto curto e medir se os resultados permanecem corretos no projeto Plano B. O laboratório não grava no perfil vivo do app nem substitui os executáveis de mídia distribuídos com o aplicativo.

## Execução

Na branch `codex/editor-v6-plano-b`, executar:

```powershell
.
scripts\editor-v6\download-comparison-ffmpeg.ps1
npm run build
npm run lab:editor-v6:plan-b
# após terminar, passar a pasta retornada pelo laboratório:
npm run summary:editor-v6:plan-b-lab -- out/editor-v6-stress/runs/<run-id>
```

Para validar uma correção antes da matriz completa, `npm run lab:editor-v6:plan-b -- --smoke` roda uma vez o projeto curto com CPU e AMF na build empacotada; a matriz completa continua sendo o padrão.

O primeiro comando baixa uma build LGPL do FFmpeg 9.0.2 para `out/editor-v6-stress/tools`, verifica o SHA-256 pinado e confere `ffmpeg.exe`, `ffprobe.exe`, `libopenh264` e `h264_amf`. A cópia empacotada do app permanece intacta.

## Experimento de throughput do pipeline de quadros (branch Plano B)

A exportação agora pode preparar **um único quadro** enquanto o FFmpeg ainda recebe o anterior, reduzindo a serialização entre Chromium e encoder. Isso inclui **vídeo em camadas**, com dois buffers BGRA alternados: o quadro anterior não é sobrescrito durante a montagem do próximo; cada camada reaproveitada é copiada apenas para o buffer seguinte. A próxima gravação só começa depois da confirmação do pipe. O modo serial desativa também o buffer duplo. A otimização beneficia a alimentação dos encoders CPU/Turbo e AMD AMF, **sem alterar parâmetros, bitrate, cor ou presets**. O custo extra por worker em 1920×1080 no vídeo em camadas é um segundo buffer de cerca de 15,8 MiB. O efeito sobre o tempo final ainda não foi medido.

Para comparar a versão serial com a versão com sobreposição, usando o mesmo commit, projeto, GPU e FFmpeg, executar no PowerShell após o build e a preparação de ferramentas:

```powershell
$env:GACHA_EDITOR_V6_FRAME_OVERLAP = '0'
npm run lab:editor-v6:plan-b -- --smoke
Remove-Item Env:\GACHA_EDITOR_V6_FRAME_OVERLAP
npm run lab:editor-v6:plan-b -- --smoke
```

Cada execução escreve snapshots e resultados próprios em `out/editor-v6-stress/runs/<run-id>`; o relatório registra `methodology.framePipelineOverlap`, e cada parte de exportação registra `framePipelineOverlap`. Comparar `medianExportWallMs`, `ffmpegWriteMs`, `frameRoundTripMs`, `rendered/reused`, integridade FFprobe, pixels de referência, RSS e falhas para **cada encoder separadamente**. Repetir as rodadas alternando a ordem para atenuar variações de cache/temperatura. Não declarar aceleração caso a exportação ainda falhe antes do encoder.

## Matriz e controles

- Projeto de reprodução `Editor V6 01`: timeline inteira (519 quadros, 17,3 s), três rodadas por encoder/build.
- Projeto `FYN & RONAN — UM CASAL PERIGOSO — Plano B · 6 min`: trecho inicial de 20 s (600 quadros), uma rodada por encoder/build. O arquivo fonte continua com seis minutos.
- Encoders estritos CPU/Turbo e AMD AMF; erro significa rodada falhada, sem fallback silencioso.
- FFmpeg empacotado e FFmpeg de comparação pinado.
- Perfil UI de referência: 1920×1080, 30 fps, preset de cabelo 2/posterior, animação da boca desativada e concorrência de preparação de movimento igual a 2.
- FFprobe independente examina os arquivos concluídos. O relatório inclui tempos por etapa, amostras de memória dos processos conhecidos, streams/contagem de quadros, relatórios de falha e comparação de imagem.
- WPR tenta capturar GeneralProfile + GPU separadamente por encoder/build no projeto curto. Uma sessão WPR já ativa nunca é interrompida. Falha por privilégio ou disponibilidade aparece no relatório e não invalida os demais sensores.

## Isolamento e artefatos

O harness valida branch e identidade/duração dos projetos, calcula SHA-256 das fontes antes e depois da cópia e verifica a cópia. Faz snapshot de somente leitura do projeto curto, do projeto Plano B, da biblioteca de mídia, do catálogo de personagens e do Fabricador. A pasta temporária do cache de movimento é nova e vazia. O preset 2 é semeado no perfil isolado com o preset padrão distribuído pelo app, pois a preferência pessoal do perfil vivo não é copiada.

Resultados ficam em `out/editor-v6-stress/runs/<run-id>`; snapshots ficam em `out/editor-v6-stress/backups/<run-id>`. Arquivos incluem `suite-report.json`, logs de console, relatórios de falha, MP4, quadros BGRA de referência e, se WPR aceitar a sessão, ETL. Dados gerados ali são diagnóstico e não são adicionados ao Git.

## Comparação de qualidade e limites

Para quadros amostrados, calcula PSNR RGB e SSIM de luminância em blocos 8×8 entre a captura BGRA imediatamente anterior ao encoder e a decodificação do MP4. Isso detecta degradação introduzida por codificação/conversão de cor; não prova igualdade perceptual total, qualidade do áudio ou ausência de erro entre quadros amostrados. FFprobe registra streams e contagem de quadros, mas a validação de sincronismo áudio/vídeo ainda requer análise por timestamps/pacotes e inspeção auditiva/visual em casos divergentes.

WPR/WPA provê evidência de sistema (CPU, GPU, memória, disco e escalonamento), enquanto o amostrador já existente observa subprocessos do export. A comparação de uma única GPU e uma máquina não deve ser generalizada para outras placas AMD ou versões de driver. O relatório deve registrar versão de driver, GPU, CPU e Windows antes de qualquer conclusão de compatibilidade ampla.

## Critérios de leitura

Falha em ambos FFmpeg sugere investigar contrato/ambiente do encoder ou pipeline do app; falha apenas na build empacotada aponta possível incompatibilidade entre a versão/compilação atual e o hardware. Não declarar AMF superior apenas pelo menor tempo: comparar validade, áudio, dimensões, quadros, qualidade, consumo e estabilidade. Três repetições no projeto curto permitem mediana, ainda insuficientes para caracterizar variância térmica ou comportamento prolongado.

## Primeira execução — 14/11/2026

O laboratório executou os 16 casos configurados: três rodadas do projeto de 17,3 s por encoder e build (12), mais um trecho de 20 s do Plano B por combinação de encoder/build (4). **Nenhum chegou a produzir uma exportação validada.** Isso é um resultado do produto, não uma falha do harness: todos os logs contêm `SecurityError` no `texImage2D` durante o desenho de cabelo, antes da etapa de codificação. O projeto curto falha no quadro 259; o trecho do Plano B, no quadro 451. CPU e AMF reproduzem o mesmo defeito e o FFmpeg 8.1/9.0.2 não altera o resultado. Portanto, esta execução ainda não permite comparar velocidade, qualidade final ou sincronismo dos encoders.

Os relatórios indicam preparação de movimentos em torno de 46–49 s no projeto curto e 4,4–4,6 s no trecho do Plano B. Os picos medidos ficaram entre 896–1.378 MiB RSS no processo principal e 2.802–3.989 MiB de conjunto de trabalho agregado dos processos Electron. Esses números caracterizam a preparação/renderização que falha, não uma exportação completa. O JSON `suite-report-diagnostics.json` enriquece o relatório de execução com diagnósticos por rodada; o coletor lê relatórios preservados e também procura no perfil isolado, caso a cópia pós-falha falhe.

Ambiente medido: Windows 11 Pro build 26300; AMD Ryzen 5 4600G (6 núcleos/12 threads); AMD Radeon RX 7600, driver 32.0.32015.7029. A build empacotada é FFmpeg `n8.1.3-27-g8dca1586f4-20261031`; a alternativa é `n9.0.2-57-gd838f9f9ae-20261114`.

WPR está disponível no Windows (`wpr.exe` 10.0.26100) e WPA foi instalado (11.8.423.0), mas nenhuma ETL foi criada: o WPR recusou iniciar o perfil `GeneralProfile + GPU` com `0xc5585011` (“Failed to enable the policy to profile system performance”). A documentação da Microsoft requer privilégios administrativos para iniciar/parar rastreamento ETW em cenários de sistema; não foi aberta uma sessão elevada interativa. A próxima captura deve ser iniciada em terminal administrativo e nunca sobrepor sessão WPR preexistente. Até então, ficam disponíveis os relatórios internos de memória e fase do Editor V6.

O FFmpeg 9.0.2 alternativo foi baixado da release `autobuild-2026-11-14-12-37`, com SHA-256 do ZIP `0c229f788a2e33a62ca4ea41d509028aa42df051c27b93a166155d7534db8271`. A verificação encontrou os encoders `libopenh264` e `h264_amf`. Como não houve MP4 dos projetos, FFprobe não pôde comparar suas streams. O comparador foi exercitado separadamente com um clipe sintético de 64×64: um quadro decodificado contra a própria referência retornou PSNR sem erro (`null`, MSE 0), SSIM 1 e zero quadros ausentes. A função também rejeita ausência de referência para não declarar uma comparação vazia como sucesso.

**Interpretação técnica:** a mensagem superficial “Turbo obrigatório falhou” ou “AMF obrigatório falhou” encapsula uma exceção que ocorreu antes do encoder; não há evidência nesta execução de que CPU ou AMF causaram a falha. O próximo passo de diagnóstico é rastrear a origem/CORS da imagem de cabelo usada pelo `HTMLImageElement` em `exportHairMeshRenderer.render()` (`src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`) no contexto HTTP do worker, preservando as validações de origem e sem desabilitar segurança WebGL. Após essa correção, repetir a matriz é necessário para avaliar codecs.

## Referências técnicas

- A Microsoft descreve WPR como captura ETW de comportamento/uso de recursos, usada junto ao WPA para análise: [Introduction to WPR](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/introduction-to-wpr) e [WPR/WPA troubleshooting and prerequisites](https://learn.microsoft.com/en-us/troubleshoot/windows-server/support-tools/support-tools-xperf-wpa-wpr).
- O protocolo utiliza `ffprobe -count_frames`, `-show_streams`, `-show_frames` e, em futuras verificações de sincronismo, `-show_packets`, documentados no [manual oficial do ffprobe](https://ffmpeg.org/ffprobe.html).
- O suporte `h264_amf` depende da build FFmpeg estar compilada com `--enable-amf` e da disponibilidade do stack AMF/driver; a [documentação oficial do FFmpeg sobre AMF](https://ffmpeg.org/general.html#AMD-AMF_002fVCE) explica esses requisitos. A presença do encoder na lista, isoladamente, não prova que ele inicializará no hardware.


## Boca estática enquanto pose, expressão ou cabelo estão em movimento

O Plano B mantém **pose e preset facial na mesma transição de 250 ms**. Se o personagem fala durante a transição, a boca do atlas fica em `talk` estático na escala `1×`; o preparador não gera amostras de boca ampliada para cada quadro intermediário, e a piscada automática já é suprimida nesse intervalo. Isso permite reutilizar movimentos previamente preparados sem repetir o bake apenas porque a fala está habilitada.

No perfil padrão, a reação do cabelo posterior é uma animação única depois de cada troca de pose, em `end+1` até `end+29` (30 FPS). Enquanto ela ocorre, a exportação seleciona o primeiro recorte da boca (`1×`) e ignora piscadas automáticas. Fora desses momentos, **a boca volta ao ciclo completo e as piscadas voltam ao normal**. A exportação com cabelo em loop contínuo não congela a boca indefinidamente.

As versões das chaves de transição e do cache de bake foram aumentadas para impedir mistura com antigos atlas de mouth-patches. Os projetos salvos e presets de expressão não são regravados por essa otimização. Repetir a exportação real para medir preparação de movimentos e verificar continuidade no início e fim das reações.
