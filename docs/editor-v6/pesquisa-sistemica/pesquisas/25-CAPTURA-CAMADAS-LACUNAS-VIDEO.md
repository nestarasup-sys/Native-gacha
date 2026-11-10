# Pesquisa 25 — Captura em camadas durante lacunas de vídeo

**Data:** 10/11/2026 · **Estado:** hipótese medida no projeto real; implementação revertida por não demonstrar melhora ponta a ponta.

## Hipótese

Quando o projeto contém qualquer clipe de vídeo, `runEditorV6Export` calcula `layeredVideo` para todo o intervalo. O worker então captura fundo e primeiro plano em duas imagens para cada quadro novo, mesmo durante uma lacuna em que nenhum overlay está ativo. A saída FFmpeg é sempre dividida em uma faixa base e outra camada transparente sobreposta.

Na cópia verificada, os vídeos cobrem os intervalos 0–482, 510–1135, 1146–1665 e 1683–2232 de uma timeline de 2.394 quadros. Há 219 quadros de lacuna no total. O tempo que isso representa em capturas depende do reuso de cena por quadro, então essa contagem não prevê um ganho.

## Implementação experimental

Foi testado um modo de captura completa em quadros sem vídeo ativo, mantendo a segunda metade do buffer BGRA transparente; quadros com vídeo continuaram usando as duas camadas. O estado de reuso do Renderer foi separado entre saída completa e saída em camadas para não reutilizar pixels incompatíveis ao cruzar a fronteira.

O primeiro teste Electron identificou a interação entre a chave do quadro e o reuso de camada. A chave foi ajustada; depois disso, testes rápidos do worker passaram (14/14), typecheck e build passaram, e `npm run test:editor-v6:export` passou: 81 quadros, emendas, áudio contínuo, fallback, cancelamento e full HD. Um smoke frio de 30 quadros entre os vídeos em 1120–1150 também validou MP4, os dois vídeos e áudio.

## Medição completa e decisão

| Execução fria | Quadros | Clique→MP4 validado | Motion | Render | Captura agregada entre workers |
|---|---:|---:|---:|---:|---:|
| Referência integral arquivada | 2.394 | 76,34s | 16,33s | 48,43s | 24,676s / 456 amostras |
| Captura dinâmica experimental | 2.394 | 76,96s | 16,34s | 49,20s | 24,190s / 464 amostras |

Ambas passaram 2.394 quadros, 4 entradas de vídeo, 4 faixas de áudio e zero gravações no cache de movimento. A contagem e o tempo agregado de captura variaram em direções distintas; são métricas por workers concorrentes. O wall ficou 0,62s mais lento na amostra candidata e o render 0,77s mais alto. Como existe uma execução por condição, isso não estima causalidade, mas tampouco mostra ganho que justifique o risco do reuso de camadas.

**Decisão:** reverter a implementação e manter o caminho atual. Não promover nem repetir sem um trace que mostre número de quadros não reutilizados dentro das lacunas e uma hipótese de maior retorno. A saída MP4 do candidato foi removida pelo harness após validação; não há comparação pixel a pixel retida.

## Artefatos e limites

- `out/editor-v6-stress/runs/target30-video-gap-transition-smoke/stress-export-validation.json`
- `out/editor-v6-stress/runs/target30-video-gap-full-candidate/stress-export-validation.json`
- Os relatórios são JSON pequenos; nenhum frame, atlas, perfil isolado ou MP4 deste experimento foi mantido.
- A conclusão vale para esta cópia do projeto, Electron 45.1.0, Ryzen 5 4600G + Radeon RX 7600 e configuração 1080p30/x264 ultrafast/8 threads/duas lanes.
