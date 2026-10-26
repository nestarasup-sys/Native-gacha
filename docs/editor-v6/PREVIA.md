# Prévia do Editor V6

## Cena no instante do cursor

`resolveEditorV6SceneAtFrame` calcula o fundo e os elementos visíveis no quadro escolhido. A consulta usa os estados salvos na timeline e funciona ao saltar diretamente para qualquer ponto. O cursor no limite final do projeto mostra o último quadro válido.

`SceneSurface.tsx` é o componente React que desenha essa cena no Chromium. O desenho usa SVG com coordenadas de projeto de 1920 × 1080. O painel mantém a proporção 16:9 ao mudar de tamanho. A seleção e os controles do editor ficam fora da imagem capturada.

Personagens e objetos reutilizam as imagens do projeto; os textos têm quebra de linha explícita. Elementos estáticos são memorizados e não precisam reconstruir seu desenho a cada avanço do relógio.

## Play e posicionamento

O Play continua usando o relógio de tempo decorrido, a 30 FPS. A prévia resolve o quadro correspondente; não soma atrasos de desenho de quadros anteriores.

Ao arrastar um personagem com o cursor no meio de um período, o editor prepara um novo estado naquele quadro. Os quadros anteriores e as próximas mudanças já existentes são preservados. Outro arraste no mesmo quadro reutiliza o estado existente.

O arraste pausa a reprodução e atualiza a prévia ao vivo. Apenas ao soltar o ponteiro é registrada uma entrada no histórico. Um clique sem deslocamento não cria estado nem histórico. Esc ou cancelamento do ponteiro restaura o documento anterior ao gesto. O salvamento automático espera a conclusão do arraste.

Os bloqueios de faixa e posição protegem os personagens. Durante uma composição facial/pose em andamento, o arraste aguarda o término da preparação da imagem.

Os fundos também são estados: escolher uma imagem, alterar a cor ou reposicionar o fundo registra o resultado a partir do instante escolhido. Os blocos correspondentes aparecem na faixa Vídeo e persistem até a próxima mudança de fundo.

## Captura do mesmo componente

`sceneCapture.tsx` usa o próprio `SceneSurface` para preparar o SVG e capturar PNG/JPEG. Os prints e miniaturas passaram a usar essa implementação. O texto, enquadramento, pose, expressão e ordem das camadas vêm do mesmo componente da prévia.

`captureEditorV6Frames` prepara os quadros sequencialmente, sem depender de um relógio de reprodução. Trechos visualmente estáticos reutilizam a imagem preparada. A operação aceita cancelamento. Essa é a base de captura para um futuro codificador de vídeo.

A codificação MP4 por FFmpeg, importação e sincronização de arquivos de vídeo/áudio ainda não foram conectadas ao V6. Esta atualização não adiciona uma exportação de vídeo completa.

## Verificação

- `npm run test:editor-v6`: testa consulta por quadro, estados anteriores preservados, bloqueios, duração, JSON e agrupamento de desfazer/refazer.
- `npm run test:editor-v6:surface`: abre Chromium em uma janela oculta com perfil temporário isolado. Confere imagens e texto, mudanças de estado, fundos, proporção 16:9, captura sequencial e cancelamento.
- O teste compara o componente montado com sua captura SVG e com a imagem nativa do Chromium. Geometria e imagens precisam coincidir; diferenças pequenas de suavização do texto entre o desenho nativo do Windows e a rasterização de SVG são limitadas à área dos glifos.

O teste de superfície não lê nem grava projetos do perfil real.
