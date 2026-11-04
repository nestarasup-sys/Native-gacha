# Rodada 05 — aceleração local do export do Editor V6

- Data: 2026-11-04
- Branch: `Dev-V2`
- Código de referência: R07 `efbb7dac`, R08 `f3098be1`, R09 `2c3bc6b`; correção local de integração Fabricador `c78e1ccc`; reaproveitamento do bake `9f668657`.

**Resultado: meta de 10–15 s não atingida.** Melhor execução quente validada: 34,15 s; média/mediana das duas execuções quentes: 34,33 s.

## Segurança e integração

- Atualizei a cópia local por `fetch` e `pull --ff-only`; o HEAD remoto esperado da R09 estava presente. Nenhuma outra branch foi criada ou alterada, e não houve push.
- O backup isolado foi conferido por SHA-256: 2.545 arquivos, 178.076.502 bytes, zero divergências e zero arquivos extras. Os benchmarks escreveram apenas em cópias descartáveis sob `out/`; o projeto-fonte e o perfil normal do Electron não foram usados como destino de escrita.
- A revisão local da R07–R09 confirmou os novos imports, índices de transição e seleção de assets do quadro. Os testes direcionados passaram.
- `npm run test:fabricator` revelou uma incompatibilidade no protocolo de composição: o consumidor esperava que uma opção ausente não aparecesse no objeto materializado, mas o produtor emitia `bodyJointBridgeEnabled: undefined`. A serialização agora omite a propriedade ausente. A correção está em `c78e1ccc`; a suíte passou 43/43.

## Configuração real medida

O harness usou o projeto local autorizado, suas cópias verificadas de biblioteca, Customizador, Fabricador e sessão, além de cache de movimento inicialmente vazio. Cada relatório exige três exportações completas. Foram mantidos 300 quadros, 1920×1080, 30/1 fps, Turbo com dois renderizadores, Preset 2 e encoder automático; o encoder selecionado em todas as rodadas foi `h264_amf`.

Todos os MP4s aceitos pelo harness passaram FFprobe, contagem e duração dos quadros e validação das emendas. Cada arquivo tem 10,000 s e 300 quadros. Não houve redução de resolução, FPS ou qualidade solicitada.

**Limite do material de entrada:** a cópia tem uma faixa de áudio vazia, zero clipes de áudio e zero entradas de vídeo no trecho exportado. Portanto, esses MP4s não contêm áudio e não demonstram preservação de áudio do projeto real. As verificações sintéticas de exportação com áudio passaram separadamente.

## Linha de base R09 e sessão de bake compartilhada

Os tempos abaixo são de parede, desde o início da preparação do cabelo até o MP4 verificado. As rodadas 2 e 3 são quentes no mesmo processo; as médias/medianas quentes são a média de duas observações.

| Variante | Rodada 1 — fria | Rodada 2 — quente | Rodada 3 — quente | Média/mediana quente |
| --- | ---: | ---: | ---: | ---: |
| R09 sem sessão compartilhada | 57,72 s (preparo 21,37; export 36,35) | 35,23 s (18,44; 16,79) | 34,46 s (18,18; 16,28) | **34,84 s** (preparo 18,31; export 16,54) |
| Candidato: sessão local reutilizada nos bakes das transições | 53,47 s (19,26; 34,21) | 34,15 s (18,28; 15,87) | 34,50 s (18,18; 16,32) | **34,33 s** (preparo 18,23; export 16,10) |

A sessão reutiliza os caches de provider e materiais apenas durante o lote de transições do export. O mapa de materiais é limpo no `finally`; a sessão/provider fica limitada ao escopo desse lote. A soma dos tempos reportados pelos 11 bakes concorrentes caiu de 16,134 s para 15,954 s (−180 ms, −1,1%); esses tempos de tarefas se sobrepõem e não são duração de parede. A parede de preparação caiu 81 ms (−0,44%). A diferença observada no total quente foi 519 ms (−1,49%), mas a maior parte veio de variação da fase de renderização, não da preparação. Trate o ganho total como modesto e ainda sem precisão estatística para prometer aceleração consistente.

Os três MP4s do candidato e os três da linha de base tiveram SHA-256 idêntico, comparados por ordem de execução; a decodificação dos pares também coincidiu. A sessão compartilhada foi mantida como reaproveitamento local de trabalho, sem alegar que aproximou a meta.

## Gargalos medidos

Na linha de base quente, o preparo de cabelo levou em média 18,31 s antes da exportação principal. Dentro da exportação, a fase de renderização consumiu 14,83 s em média; finalização, cerca de 1,00 s; consulta do encoder, 0,59 s. A fase `motionPreparation` do Main levou cerca de 94 ms e não explica o custo dominante.

Em uma rodada quente de referência, cada parte teve 150 amostras. Por quadro, `frameRoundTrip` teve p50 de 66–68 ms e p95 de 123–125 ms; `capture` teve p95 de 79–85 ms; `ipcDraw` teve p95 de 54–56 ms. A composição do cabelo teve p95 de 44 ms. Essas medições se sobrepõem ao roundtrip e não devem ser somadas como tempos independentes.

Apenas a preparação já excede a meta inteira de 15 s. Além disso, remover matematicamente todo esse preparo ainda deixaria a exportação principal em aproximadamente 16,5 s na linha de base. A meta exige reduzir as duas fases.

## Experimentos e decisões

| Experimento | Resultado observado | Decisão |
| --- | --- | --- |
| Reutilizar uma sessão de bake por lote (concorrência 2) | 34,33 s quente; bakes agregados −180 ms; 3/3 MP4s byte a byte iguais à R09. | Mantido com escopo por export; ganho pequeno e explicitamente não conclusivo no tempo total. |
| Concorrência 1 nas transições | 35,15 s quente; preparo 18,59 s; 3/3 MP4s byte a byte iguais à R09. O menor tempo agregado dos bakes (15,03 s) foi compensado pela perda de sobreposição. | Rejeitado; sem ganho de parede. |
| Concorrência 3 nas transições | 38,20 s quente; preparo 20,29 s; +9,6% no total quente. Os MP4s passaram as verificações estruturais, mas um dos três hashes codificados diferiu do correspondente R09. | Rejeitado; mais concorrência aumentou contenção e não comprovou paridade. |
| Pular o atlas corporal que o capturador de camadas descarta | 35,91 s quente; +3,1% contra a linha de base. Um MP4 quente diferiu em 52 de 300 hashes de quadro decodificados; os outros dois pares coincidiram. | Revertido por lentidão e falta de paridade estável. Nenhum código deste experimento permanece. |

Não foram alterados bitrate, preset do encoder, precisão da física, resolução, formato de captura ou sincronização para obter tempo menor.

## Verificações locais

- `npm run audit:architecture`: passou; 670 arquivos TS/TSX, nenhuma referência local ausente ou violação de fronteira.
- `npm run typecheck`: passou.
- `npm run test:editor-v6`: passou; 46 arquivos, 251 testes aprovados, 1 arquivo e 1 teste ignorados pelo projeto.
- `npm run build`: passou.
- `npm run test:editor-v6:hair-motion`: passou na execução final isolada (25 testes de física/contrato e exportação Electron MP4). Duas tentativas executadas junto com outras tarefas falharam a tolerância de centróide da peça espelhada por 0,20–0,22 px; três verificações isoladas seguintes passaram sem alterar tolerâncias. A sensibilidade a contenção fica registrada como instabilidade da verificação local.
- `npm run test:editor-v6:export`, `npm run test:editor-v6:export-overlay` e `npm run test:editor-v6:face-export-silent`: passaram; o teste facial verificou paridade exata de pixels, e os testes MP4 cobriram áudio sintético, overlay e Turbo.
- `npm run test:editor-v6:combined-hair-mouth-memory`: passou.
- Suítes locais do Customizador, paleta/cache de cabelo, Fabricador, cabelo do Fabricador e armazenamento de cabelo passaram; Fabricador: 43/43 após a correção mencionada.
- Testes direcionados R07–R09: analisador de benchmark 6/6; quatro arquivos Vitest de transições, assets visíveis, geometria da malha e exportação 16/16.

## Pendências técnicas

1. Fazer o trecho real conter um clipe de áudio para validar mixagem e MP4 com áudio real; a suíte sintética não substitui essa verificação.
2. O custo principal restante está no preparo das 11 transições e no roundtrip por quadro Chromium/Electron. A próxima rodada deve começar por composição em camadas e captura, com paridade RGBA/MP4 antes de medir ganho.
3. A documentação oficial do Electron explica que a captura offscreen por textura compartilhada exige integração nativa para importar a textura; `useSharedTexture` não é uma opção que conecte diretamente a GPU ao FFmpeg. Ver [Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering/) e [webContents.capturePage](https://www.electronjs.org/docs/latest/api/web-contents/). Uma implementação nativa requer spike isolado de ciclo de vida, formato/alpha, driver Windows e fallback antes de substituir o caminho atual.

**Conclusão:** nenhum caminho testado chegou a 10–15 s. A melhor medição completa ficou em 34,15 s; a média quente ficou em 34,33 s. O cabelo continua exclusivamente na exportação MP4; a prévia normal não foi modificada.
