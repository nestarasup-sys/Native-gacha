# Rodada 03 — cabelo natural, espelhamento e fase individual

**Data:** 03/11/2026
**Branch:** `Dev-V2`
**Base local:** `bea21340`
**Tipo de validação:** Electron/Chromium e FFmpeg/FFprobe reais com documentos e arte sintéticos; nenhum projeto do usuário foi usado.

## Resultado

O cabelo começa a exportação em uma posição de movimento determinística, cada instância da cena tem sua própria fase e os espelhamentos global do personagem e individual da peça são comprovados nos pixels decodificados de MP4. A correção permanece exclusiva da exportação MP4 do Editor V6. Não foram adicionadas chamadas de pré-aquecimento ou fase individual à prévia do Fabricador DEV.

Os cinco presets e a chave `gacha-nymi:hair-animation-presets:v1` continuam intactos. O vento `-50` do teste permaneceu `-50` ao exportar as versões normal e espelhada.

## Implementação

1. **Coordenadas e espelhamento:** o preset é uma direção local da arte. Como a composição final do personagem já aplica o `flipX` global, não se inverte o vento no preset nem no motor. A inércia usa o movimento do centro da instância convertido para o eixo local pela rotação e pelo `flipX`; o deslocamento local da cabeça na arte fica separado. Isso impede que coordenadas de palco absolutas sejam confundidas com movimento local e evita um impulso ao alternar `flipX` numa transição.
2. **Espelho da peça:** a inércia converte o eixo local para o eixo da peça conforme `piece.flipX`. O worker mantém somente os pontos em que o estado de flip muda, sem uma trilha de floats por peça para cada quadro.
3. **Fase da instância:** FNV-1a de `elementId` escolhe uma fase estável no ciclo completo. O ID é da instância persistida na cena, então duas aparições do mesmo `characterId` são independentes e a fase não muda ao reordenar a lista, trocar worker ou repetir exportação.
4. **Pré-aquecimento:** cada estado novo ou reiniciado na busca para trás simula 240 passos fixos de 1/120 s, com a cabeça estacionária no ponto do quadro zero. Depois marca `frame = 0`; a timeline real não é avançada. `hairMotionPrewarmMs` passou a integrar o relatório de tempo de exportação, sem misturar o custo com `hairCompositionMs`.
5. **Paridade:** `advanceHairMotionToFrame` continua reproduzindo do quadro absoluto zero. Um Turbo worker que começa, por exemplo, no quadro 450 reconstrói o mesmo estado; a fase individual não depende do trecho que recebeu. Não foram criadas texturas ou superfícies por instância.

## Provas de imagem e continuidade

- **`flipX` global:** dois MP4s da mesma instância e cena, com vento `-50`, foram decodificados nos quadros 0, 5, 10, 15, 20, 30, 45 e 60. O maior erro do espelho horizontal do centróide do cabelo foi **0,813 px**; o maior erro da trajetória relativa foi **0,339 px**. O quadro 0 já estava em movimento.
- **`flipX` local da peça:** dois MP4s com personagem fixo e apenas a peça verde espelhada deram maior erro de **1,662 px** no eixo esperado e **0,817 px** na trajetória. Isso inclui o espelhamento e a resposta à inércia na camada.
- **Múltiplas instâncias:** a cena sintética de quatro personagens colocou duas instâncias normais e duas espelhadas, todas no mesmo preset. Centróides foram medidos em seis quadros do MP4; todos os pares de trajetórias foram distinguíveis. A mesma cena teve diferença de até **1,5 px** entre seguro e Turbo nos quadros comparáveis.
- **Fases por quantidade:** testes determinísticos cobrem 1, 2, 3, 4, 8 e 32 IDs, com IDs distintos, sem ordenar a cena ou usar aleatoriedade por quadro. Estados com fases distintas também passaram no teste de rajadas quando `wind = 0`.
- **Continuidade e raiz:** o pré-aquecimento é reproduzível, mantém offset e velocidade da raiz em zero e o primeiro passo posterior não salta. Seeks para trás reproduzem um estado fresco. A transição de pose com rotação e flip continuou passando a verificação de cabelo/cabeça e da emenda Turbo já existente.
- **Escala/resoluções:** permanecem cobertas pela fixture do export 720p/1080p, pelos testes de geometria da cabeça com escalas separadas e pelo export 1080p iniciado no quadro 20.

As capturas pré-codec preservam RGBA; as medições acima usam também os MP4s H.264 decodificados. As tolerâncias do MP4 cobrem arredondamento/subamostragem do codec, sem afrouxar as verificações internas de determinismo.

## Medições

O usuário informou que o PC estava livre de jogo. O relatório registrou `gameRunningByUserStatement: false`; processos de fundo do Windows não foram controlados, então não é um benchmark laboratorial.

| Fixture | Tempo total | Tempo de pré-aquecimento | Pico do renderer exportador por processo (working set / privado) |
| --- | ---: | ---: | ---: |
| 4 atores, 1080p, seguro, 900 quadros | 81,0 s | 7,3 ms | 151,6 / 82,2 MiB |
| 4 atores, 1080p, Turbo, 900 quadros | 64,6 s | 10,8 ms | 151,1 / 81,8 MiB |
| 8 atores, 1080p, seguro, 900 quadros | 122,8 s | 10,7 ms | 180,3 / 111,6 MiB |
| 8 atores, 1080p, Turbo, 900 quadros | 100,5 s | 14,7 ms | 157,7 / 87,6 MiB |
| 1 ator, 720p, seguro, 9.000 quadros | 345,4 s | 55,4 ms em 30 workers | 122,3 / 53,8 MiB |

No clipe de cinco minutos, `hairCompositionMs` somou **127.674,7 ms** (14,2 ms/quadro em média) e o pré-aquecimento somou **55,4 ms**; o FFprobe confirmou 9.000 quadros a 30 FPS e FFmpeg decodificou cabelo e boca nos quadros 0, 4.500 e 8.999. O pico observado do processo GPU foi 188,4 MiB de working set nesse perfil; nos quatro testes da matriz variou entre 196,6 e 295,8 MiB. **Working set do processo GPU não mede VRAM.**

Esses dados medem esta implementação; não houve uma execução A/B prévia com o mesmo commit sem a fase individual. Portanto, não se declara ganho de velocidade em relação a uma versão anterior. O custo isolado observado do pré-aquecimento ficou abaixo de 15 ms até com oito personagens.

## Verificações executadas

- `npm run typecheck` — aprovado.
- `npm run audit:architecture` — aprovado, sem violações novas.
- `npm run test:editor-v6` — 231 testes aprovados, 1 skip.
- `npm run test:editor-v6:hair-motion-export` — aprovado; MP4s globais e de peça foram criados, FFprobe/FFmpeg e análise de pixels passaram.
- `npm run test:editor-v6:combined-hair-mouth-memory` — aprovado; matriz 4/8 atores e 5 minutos, 720p.
- `npm run test:editor-v6:export` — aprovado; saída de 81 quadros, boca, áudio na emenda Turbo, cancelamento e destino anterior preservado.
- `npm run build` — aprovado.
- Física/presets/contrato de cabelo — 23 testes aprovados; Fabricador: armazenamento (2), catálogo (7), workspace (9) e salvar estilo (4), todos aprovados.
- `npm run test:editor-v6:motion` e `npm run test:editor-v6:motion-service` — aprovados, incluindo personagem sintético rotacionado/espelhado, refresh, cancelamento e cache.

## Pendências

- Falta o usuário aceitar visualmente um cabelo e personagem real; a fixture não pode provar acabamento artístico para todo asset.
- Os benchmarks não têm linha de base anterior medida nas mesmas condições. O tempo de exportação não é afirmado como mais rápido; o custo novo medido é somente o pré-aquecimento e foi baixo.
- CI hospedada não foi executada nesta rodada local.

## Commits locais

- `fcd0edb` — implementação, regressões e evidências desta rodada.
- O registro desta referência será incluído em um commit local de documentação na própria `Dev-V2`.

Nenhum push, PR, merge ou troca de branch foi feito.
