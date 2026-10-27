# Exportação MP4 e Turbo 2× do Editor V6

## Uso

Abra **Exportar MP4** na barra lateral do V6. Escolha o intervalo, 1080p ou 720p e a codificação automática ou CPU. O projeto usa 30 FPS. Com Turbo habilitado, o botão é **EXPORTAR TURBO 2×**.

O painel também permite adicionar trilhas sonoras, ajustar início na edição, início no arquivo, duração, volume e silenciamento. Esses áudios são copiados para `export-audio` dentro do projeto e suas configurações são persistidas no JSON. Duplicar um projeto copia também esses arquivos. Remover uma trilha do painel remove sua participação na mixagem, preservando a cópia do arquivo no projeto.

O painel pode ser fechado durante a exportação. O trabalho continua enquanto o aplicativo estiver aberto. Ao reabrir, o painel recupera o trabalho mais recente da janela. Encerrar o aplicativo cancela os processos e aguarda a liberação dos temporários.

## Fluxo implementado

1. O main valida o documento e o intervalo `[início, fim)`, em quadros inteiros, e abre o diálogo de destino.
2. Para Turbo com pelo menos dois quadros, a divisão ocorre em `início + floor(total / 2)`. Intervalos ímpares não repetem nem perdem o quadro da emenda. Um intervalo de um quadro usa um único renderizador.
3. O codificador é escolhido antes de renderizar. A seleção automática testa NVENC, QSV e AMF e usa OpenH264 por CPU se necessário. O FFmpeg já incluído no projeto fornece OpenH264; não exige baixar outro binário.
4. Duas janelas Electron ocultas e offscreen recebem o documento completo. Cada uma carrega uma página exclusiva de exportação e desenha apenas seu intervalo com o próprio `SceneSurface` da prévia.
5. O worker resolve o quadro diretamente, prepara as imagens e espera o desenho do Chromium. Estados anteriores ao início da segunda parte continuam disponíveis.
6. Antes de abrir os workers, o main define uma única decisão `layeredVideo` usando somente vídeos válidos, visíveis, não silenciados e que cruzem o intervalo exportado. Envia essa decisão ao renderer e ao FFmpeg. Assim, ambos concordam se o bitmap terá fundo e elementos em camadas; faixas ocultas, silenciadas ou fora do intervalo não ativam essa composição.
7. O main captura o bitmap BGRA e o envia por pipe ao FFmpeg, com espera de escrita para limitar a fila. As partes são MP4/H.264 sem áudio. Se há vídeo, o FFmpeg compõe o vídeo da timeline entre as camadas capturadas.
8. Se a composição visual não mudou, o worker sinaliza reaproveitamento e o main reutiliza o bitmap anterior. Essa otimização atende aos estados estáticos atualmente suportados pelo V6.
9. As partes precisam usar o mesmo codificador e os mesmos parâmetros de stream, incluindo o hash dos dados de inicialização H.264.
10. O FFmpeg concatena as partes com `-c:v copy`. O áudio é recortado sobre o intervalo inteiro, deslocado por amostras, misturado uma única vez e codificado em AAC a 48 kHz. Silêncio completa os trechos sem áudio.
11. FFprobe verifica contagem de quadros, resolução, FPS e duração. O exportador também verifica a duração do áudio e decodifica três quadros próximos de cada emenda para detectar erros técnicos.
12. O relatório é salvo e o arquivo candidato só substitui o destino depois da validação. Cancelamento e falhas anteriores à publicação preservam um MP4 que já existia no destino.

Se a tentativa Turbo falhar durante renderização, compatibilidade, junção ou validação, os dois trabalhos são encerrados e a exportação reinicia uma vez com um renderizador e OpenH264 por CPU. Cancelamento explícito não aciona essa recuperação.

## Relatórios e isolamento

Os relatórios ficam em `exports/<job-id>.report.json` dentro do projeto. Registram intervalo, encoder testado/usado, tentativas, quadros por parte, capturas reaproveitadas, tempos, áudio, validação e erros. O botão de resultado mostra o MP4 ou relatório no Explorador.

Cada parte inclui `frameTiming`, que resume por fase os tempos `workerStartupMs`, `sceneResolutionMs`, `assetPreparationMs`, `reactCommitMs`, `rafWaitMs`, `ipcDrawMs`, `captureMs`, `backgroundCaptureMs`, `foregroundCaptureMs`, `frameRoundTripMs`, `ffmpegWriteMs` e `ffmpegFinalizeMs`. São durações medidas com `performance.now()` no processo que executa cada etapa; não são timestamps absolutos e não devem ser alinhadas diretamente entre processos. P50/P95 usam baldes de 0,1 ms até 200 ms; o máximo e a soma permanecem mais precisos. Fases sem trabalho positivo não ganham amostras. A instrumentação separa o tempo dos estágios, mas ainda não atribui ao FFmpeg o custo de codificação de cada quadro enquanto ele trabalha em paralelo.

Os intermediários ficam em uma pasta temporária exclusiva. O caminho absoluto é conferido antes da limpeza recursiva. Não há imagens PNG intermediárias por quadro nem gravação da reprodução da tela do usuário.

O preload dos workers expõe apenas a obtenção do documento e a confirmação de inicialização. Cada chamada é vinculada ao `webContents` registrado pelo coordenador. Os workers não recebem o objeto `desktop` do aplicativo, não têm Node no renderer e não acessam recursos de rede externos.

## Arquivos principais

- `src/shared/editorV6Export.ts`: contrato, divisão por quadros, planejamento do áudio e chave visual.
- `electron/domains/editorV6/exportIpc.ts`: diálogos, importação/cópia de áudio, trabalhos, progresso e cancelamento.
- `electron/domains/editorV6/exportRunner.ts`: coordenação, FFmpeg/FFprobe, concatenação, mixagem, recuperação e publicação.
- `electron/domains/editorV6/exportWorkers.ts`: janelas ocultas e captura BGRA.
- `electron/domains/editorV6/exportProcess.ts`: subprocessos, limites de espera, cancelamento e encerramento.
- `electron/editorV6ExportPreload.ts`: ponte restrita dos workers.
- `src/renderer/src/features/editorV6/exportWorker.tsx`: desenho por quadro e reaproveitamento visual.
- `src/renderer/src/features/editorV6/EditorV6ExportPanel.tsx`: configuração e acompanhamento.

## Verificações

`npm run test:editor-v6` cobre divisão de intervalos pares/ímpares, resolução, áudio recortado/deslocado e referências seguras.

`npm run test:editor-v6:export` compila e executa o fluxo real no Electron/Chromium e FFmpeg incluídos, com perfil e arquivos temporários isolados. Confere duas partes simultâneas, 81 quadros em 40+41, estado anterior ao início da segunda parte, cores BGRA, continuidade em transição de pose, talk e pensamento, faixa de vídeo oculta, áudio contínuo na emenda, recuperação após falha simulada, cancelamento preservando o destino, intervalo de um quadro e saída 1080p. Também verifica que o relatório contém tempos por fase. A contagem de quadros e amostras de áudio são verificadas no MP4 produzido.

`npm run test:editor-v6:surface` confere o desenho comum da cena e a ligação do painel de exportação/importação de áudio.

## Limites atuais

Turbo 2× significa dois trabalhos simultâneos; não garante reduzir o tempo pela metade. GPU só é usada na codificação quando um encoder compatível passa no teste inicial. As verificações técnicas não substituem revisão visual de todas as cenas.

O V6 pode compor vídeos presentes na timeline e mixar as faixas de áudio habilitadas, mas ainda não prepara proxies. A reprodução de vídeos usa o Chromium na prévia; na exportação, o FFmpeg compõe o vídeo sob os elementos capturados pelo renderer. Os quadros de vídeo impedem reaproveitar a composição inteira como imagem estática. Os tempos no relatório indicam onde o exportador espera; não medem por si só a latência de apresentação física no monitor.
