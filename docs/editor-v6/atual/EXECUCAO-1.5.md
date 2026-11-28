# Execução 1.5 — threads e transporte NUT

**Data:** 24/11/2026 · **branch:** `Dev-V2` · **projeto:** cópia autorizada verificada `408a77d1-d964-4c04-a66b-f4e9fcfeee46`.

## Decisão

Promovidos ao caminho normal do Editor V6: duas threads para filtros FFmpeg, teto de duas threads para encoder CPU e transporte NUT com um pacote por corrida de quadros idênticos. A opção preserva os quadros lógicos, os timestamps e um quadro terminal para manter a duração CFR. O usuário autorizou pequenas diferenças de imagem imperceptíveis em reprodução e mais uso de CPU/RAM em troca de velocidade.

O A/B integral combinado passou os três pares. A mediana caiu de **163,943 s** para **158,484 s**: **5,458 s (3,326%)**. O menor ganho pareado foi 4,002 s (2,473%). Todos os braços candidatos venceram. O melhor tempo ainda fica **68,484 s acima da meta de 90 s**.

## Séries integrais

O ensaio isolado de threads usou seis exports válidos em ordem A/B, B/A, A/B. A permaneceu automático; B fixou filtros e encoder em 2. O segundo ensaio comparou CFR/NUT com threads=2 em uma única build, na ordem CFR/NUT, NUT/CFR, CFR/NUT. Cada trabalho usou o perfil Turbo autorizado, 6.000 quadros, 1920×1080, 30 FPS, quatro workers, dez partes, pausa de 60 s e MP4 retido. As 10 partes de cada job registraram ambos os limites de thread e argv FFmpeg.

A [documentação oficial do FFmpeg](https://www.ffmpeg.org/ffmpeg.html) confirma que `-filter_threads` e `-filter_complex_threads` criam pools por pipeline e, sem limite, usam o número de CPUs disponíveis; o teto foi escolhido por A/B neste projeto, não por uma regra universal. A [descrição oficial do NUT](https://ffmpeg.org/nut.html) caracteriza o contêiner como baixo overhead. O [manual dos muxers FFmpeg](https://ffmpeg.org/ffmpeg-formats.html) informa que desligar syncpoints remove algum overhead, mas avisa que o fluxo resultante é sensível a danos e não permite seek; o writer mantém syncpoints porque essa opção não foi medida.

| Par | Controle threads=2 CFR | Candidato threads=2 NUT | Ganho |
|---|---:|---:|---:|
| 1 | 165.414,774 ms | 159.913,724 ms | 5.501,050 ms · 3,326% |
| 2 | 161.835,976 ms | 157.833,575 ms | 4.002,400 ms · 2,473% |
| 3 | 163.942,571 ms | 158.484,145 ms | 5.458,426 ms · 3,329% |

A série anterior de threads isoladas mediu mediana de 4,148 s (2,474%) a favor de B, sem mudar o transporte. Na série combinada, a mediana de CPU caiu de 806,994 para 743,052 CPU-s (−7,9%). O pico mediano de RSS do FFmpeg subiu de 426.270.720 B para 765.677.568 B (+79,6%); o maior pico NUT foi 779.411.456 B. Não houve OOM, travamento, erro de validação ou falha de limpeza.

## Integridade e imagem

Os seis arquivos validaram 6.000 quadros, 1920×1080, 30 FPS, 200 s, H.264/AAC, áudio 48 kHz estéreo e as nove emendas. Os PCM decodificados tiveram 38.400.000 bytes e o mesmo SHA-256 (`778afa3a2ba29fbcaab0f7fe5df401f3907ac1ac875e4268f296bccbf5961c6c`). Os MP4s mantiveram tamanho próximo de 108,1 MB.

SSIM em todos os quadros foi 0,999927, 0,999992 e 0,999994 nos pares CFR/NUT; os controles CFR↔CFR ficaram em 0,999934, 0,999927 e 0,999987. A contagem de quadros com hash diferente nos pares NUT/CFR foi 1.572, 599 e 1.003, dentro da variação CFR↔CFR observada (767, 1.539 e 1.181). Nas amostras críticas, NUT3/CFR3 diferiu no quadro 599 em 364 pixels, delta máximo 5; os PNGs lado a lado foram visualmente indistinguíveis. As diferenças de emenda nos outros pares também ocorreram no piso CFR↔CFR.

AMF não foi reaberto: os três pares da 1.4 tinham sinais mistos, SSIM 0,985803 e arquivo 1,615× maior. A autorização visual atual não torna esse ganho de parede repetível nem remove o custo de tamanho.

## Build, fontes e artefatos

O benchmark mediu o commit base `5d5de119558ca4722d5027bd80e6db26c7b3952f` com a integração NUT experimental local (`workingTreeDirty=true`). A política final de produção gera os mesmos argumentos avaliados no braço B; a diferença é que NUT e threads=2 agora são o padrão, sem a variável de experimento. A cópia do projeto foi revalidada antes da série: 3.687 arquivos / 966.335.489 bytes.

- FFmpeg `n8.1.3-27-g8dca1586f4-20261031`, SHA-256 `04d0c351e53dde1cc45ba437c28d20a0b382df2798999def5d4110e23d74e62c`; ffprobe SHA-256 `48d6297c8e6538ca8c351300e80ea3ff67a4f0c54337f653f8df7d687ae0afbb`.
- Série combinada: `out/editor-v6-stress/runs/round15-nut-threads-200s/`; `series-result.json` SHA-256 `B327E3BE3034DCEF4B4CB59855B5AB52802926E1B26A8E91E15EAF365A96345F`.
- Qualidade: `out/editor-v6-stress/runs/round15-nut-threads-quality/quality-report.json`; SHA-256 `A7591E2DEED2E71763CFD31BBF8C033A1AF98248E769C1742E57C3070CE5741B`.
- Amostras visuais: `CFR3-frame-599.png` e `NUT3-frame-599.png` em `out/editor-v6-stress/runs/round15-nut-threads-quality/`.

Verificações no snapshot promovido: 38 testes focados passaram; suíte Editor V6: 927 passaram (1 ignorado); `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram. O comparador decodificou os 36.000 quadros, comparou SSIM nos seis pares relevantes e confirmou PCM. `git diff --check` passou. Commit local da implementação: `93a915eb`.

## Continuação

A meta de 90 s permanece aberta. Nos três candidatos NUT, a mediana de render foi 107,731 s (68,0% da parede), preparo de movimento 31,940 s (20,2%) e finalização 3,538 s. O próximo diagnóstico deve concentrar-se no trabalho de render: C3 mediu 19,830 CPU-s poupados por 600 quadros ao retirar decode/scale, mas mudou o caminho do conteúdo. Localize decode/scale redundantes no grafo de vídeo e valide equivalência antes de qualquer promoção. Não promova AMF sem um novo sinal de parede consistente.
