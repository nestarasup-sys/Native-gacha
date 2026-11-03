# Exportação MP4 e Turbo 2× do Editor V6

## Uso

Abra **Exportar MP4** na barra lateral do V6. Escolha o intervalo, 1080p ou 720p e a codificação automática ou CPU. O projeto usa 30 FPS. Com Turbo habilitado, o botão é **EXPORTAR TURBO 2×**.

O painel também permite adicionar trilhas sonoras, ajustar início na edição, início no arquivo, duração, volume e silenciamento. Esses áudios são copiados para `export-audio` dentro do projeto e suas configurações são persistidas no JSON. Duplicar um projeto copia também esses arquivos. Remover uma trilha do painel remove sua participação na mixagem, preservando a cópia do arquivo no projeto.

Quando há personagem visível ligado a uma fala no intervalo, o exportador anima a boca automaticamente em um ciclo contínuo. Não há opção no painel para desligar a animação; chamadas antigas com `mouthLoop: false` são normalizadas para `true` no coordenador. A prévia e o documento salvo não são alterados pelo atlas temporário. Cenas sem personagem elegível falando não preparam recortes de boca.

> **Decisão de produto — somente exportação:** a animação experimental de cabelo **não deve aparecer na prévia normal do Editor V6** (viewport, reprodução, seek ou timeline). Ela roda exclusivamente no renderizador offscreen da **exportação MP4**, e apenas quando ativada no modal. A simulação na prévia do **Fabricador DEV** continua permitida para editar/testar os cinco presets. Não implementar paridade de animação de cabelo com a prévia interativa do Editor V6 sem autorização expressa do usuário.
O painel também oferece **Animação de cabelo · experimental**. Ao ativá-la, selecione um dos cinco presets salvos em Fabricador DEV → Animação cabelo DEV. O renderer prepara cópias temporárias das camadas do personagem, do rosto e do cabelo escolhido, incluindo cores e ajustes salvos no Customizador; para cada troca de pose no intervalo, também prepara as camadas sem cabelo de cada amostra de transição. O processo principal valida referências e limites antes de enviar o pacote aos renderizadores. Nenhuma imagem, preset ou alteração de aparência é gravada no documento do Editor V6. Personagens sem cabelo selecionado continuam com a imagem normal; se nenhum personagem tiver uma camada visível de cabelo, o painel mostra um erro e para a preparação.

O motor usa a mesma cadeia de física fixa de 120 Hz da prévia do Fabricador DEV. Cada quadro exportado avança pelo tempo absoluto da timeline, então seeks, intervalos que começam no meio da animação e a emenda entre trechos Turbo preservam a fase. **O Editor V6 não anima cabelo na prévia, viewport, reprodução, seek ou timeline.**

## Estado de qualidade — animação de cabelo experimental (2026-11-03)

> **Experimental e opt-in; não aprovado visualmente em personagem completo.** O recurso continua desligado por padrão. O fato de um MP4 sintético ter sido gerado não comprova fidelidade com cabelos detalhados, transparência ou transições reais.

### Funcionamento e correções locais efetivamente implementadas

- Presets: cinco posições guardadas em `localStorage`, chave `gacha-nymi:hair-animation-presets:v1`, produzidas no Fabricador DEV. Ao exportar, o renderer resolve Customizador/Fabricador e prepara `body`, `face`, cabelo atrás, frente e franjas, preservando o documento V6 e a instância do personagem.
- Física: `src/shared/hairMotionEngine.ts` usa passos determinísticos de 120 Hz, quatro por quadro de 30 FPS, partindo do quadro absoluto zero para suportar início tardio e trechos Turbo.
- Transporte: `src/shared/editorV6HairMotion.ts` valida referências e orçamento dos dados temporários. O worker mede `hairCompositionMs`. O cabelo **não é animado na prévia normal do Editor V6**.
- Coordenadas da física: a posição de inércia agora usa o centro local da cabeça do rig transformado pelo tamanho, escala, rotação, espelhamento e centro do recorte transparente no palco. Nas amostras `motionSprite`, interpola a geometria dos rigs de origem/destino e usa o recorte exato da imagem sem cabelo daquele quadro. Isso substitui a aproximação anterior `element.x / element.width`, que não representava a posição da cabeça.
- Troca de pose: o preparador gera atlas temporários de corpo atrás da face, face e overlay sem cabelo. O worker recompõe o cabelo dinâmico entre essas camadas, interpola os transforms por amostra, mantém o patch facial/boca e só remove `motionSprite` do elemento transitório de exportação. O PNG do atlas completo com cabelo estático não é sobreposto ao cabelo animado.
- Encaixe e recorte: a textura deformada inclui margens para o balanço; sua imagem original é centralizada no mesmo ponto usado pelo renderizador do personagem. Na troca de pose, a composição usa a área inteira da arte e reposiciona o atlas do corpo e o patch facial, preservando fios que ultrapassam o recorte do corpo.
- Vida dos atlas: as três camadas são convertidas para PNG dentro do callback do bake. O bake limpa os canvases no `finally`; a preparação guarda as imagens antes de retornar pelo `await`, evitando enviar imagens vazias.
- Continuidade facial: cada quadro monta uma nova lista de assets de renderização. O atlas facial temporário agora é reinserido nessa lista mesmo quando já está no cache compartilhado entre quadros; a fixture cobre a boca nos sete quadros, incluindo o espelhado.
- Rasterização: `exportHairMeshRenderer.ts` usa uma malha texturizada contínua de 24 × 32 células, compartilha a geometria com a prévia do Fabricador DEV, mantém a resolução nativa das texturas e cria texturas WebGL isoladas por imagem. O worker reutiliza um contexto, descarta texturas/buffers/programa ao fechar e falha explicitamente se WebGL não estiver disponível ou perder o contexto; não publica uma exportação silenciosamente degradada. A malha não é desenhada na prévia interativa do Editor V6.
- Alpha e amostragem: o fixture inclui fios finos, bordas semitransparentes, transparência, PNGs de pose realmente recortados, quatro camadas com transforms diferentes e fundos branco, preto, colorido e quadriculado. Os sete quadros intermediários usam camadas sem cabelo e um patch facial sintético. Pixels foram verificados sem compressão; H.264 foi verificado separadamente em 720p/1080p.
- Âncora em pixels: `geometry-frames.json` registra um marcador sintético da cabeça, drift em relação à geometria derivada do palco, retângulo/centroide do cabelo, `sourceCrop`, `targetHead`, transformação da cena e modo de cada quadro. O limite de regressão é 1,5 px no fixture 320 × 180; o maior drift medido foi 0,922 px. Isso não é um limite universal para retratos reais.
- Captura do compositor: cada desenho envia um marcador de 24 bits fora da imagem final. O main só aceita uma `NativeImage` quando esse marcador está presente **na mesma captura que será exportada**, e corta a imagem a partir desse bitmap validado. Isso substitui a suposição anterior de que qualquer evento `paint` correspondia ao quadro solicitado. A captura do mesmo `NativeImage` e o recorte pela API foram escolhidos conforme o contrato de regiões sujas do Electron offscreen e `capturePage`.
- Instrumentação sintética: o harness grava duas repetições alternadas de exportação 720p no mesmo trecho (seguro/1 worker e Turbo/2 workers), mais 1080p Turbo com início tardio; também coleta amostras sob demanda de `app.getAppMetrics()` para Main, renderer, GPU e processos auxiliares, e estima o tamanho RGBA8 das texturas e do maior canvas WebGL. Com o jogo aberto, as medianas 720p observadas foram 2.073 ms (seguro) e 1.421 ms (Turbo); o 1080p Turbo com início tardio levou 1.709 ms. Os pares repetidos produziram o mesmo SHA-256 dentro de cada modo. Isso é uma observação de duas repetições sob carga concorrente, não um benchmark controlado nem uma promessa de ganho geral. A estimativa não é a alocação física do driver: Electron não expõe VRAM/texture allocation exata por esse contrato. O relatório marca jogo em execução por declaração do usuário e identifica as medições como não controladas.

### Limitações e aceite visual pendentes

1. **Cabelo real ainda precisa da revisão do usuário.** O fixture sintético confirma que o cabelo continua deformando durante os sete quadros de `motionSprite`, que o recorte da cabeça acompanha o atlas e que o patch facial permanece visível. Isso não comprova o acabamento estético de penteados e poses reais.
2. **O centroide de cabelo pode mudar com uma pose/espelhamento intencional.** A regressão usa texturas artificiais; centroide não é critério de aprovação estética.
3. **Medições de memória GPU são aproximadas.** Working set/private bytes por processo são expostos pelo Electron em KB e convertidos para bytes. VRAM, buffers internos do driver e custo isolado do FFmpeg não são observáveis pelo harness atual; o tamanho RGBA8 da fonte/canvas é somente uma estimativa.

### Cobertura implementada e cobertura ainda necessária

- Implementado: fixture alfa/sem fundo, quatro fundos, textura de alta frequência, camadas traseira/frontal/franja, escala, rotação, espelhamento, recorte transparente, captura `antes/durante/depois`, início tardio, emenda Turbo e pixel RGBA sem compressão; MP4 H.264 conferido por FFprobe em 720p seguro e 1080p Turbo.
- Implementado: sete quadros de troca recompostos a partir de atlases sem cabelo; todos mantêm o cabelo visível, a comparação com intensidade zerada detecta movimento e o patch facial sintético permanece visível nos sete. Uma peça opaca sintética verifica seu centro em relação à cabeça em poses e transições, incluindo espelhamento e fios além do recorte do corpo.
- Implementado: serialização dos atlas separados dentro do callback, antes de o bake descartar os canvases; a suíte browser valida dimensões e pixels decodificados.
- Implementado: simulação de quadro absoluto independente da ordem de seek e igualdade pixel a pixel do mesmo quadro sequencial e Turbo; captura do quadro em andamento valida token no bitmap final.
- Pendente: revisão visual do usuário usando personagem real. Nenhuma imagem ou projeto pessoal foi acessado como fixture.
- Pendente fora deste workspace: executar workflow hospedado depois de autorização para publicar. A CI local foi executada nesta branch.
- Limitação da instrumentação: tempo por fase e RSS Main já são registrados no relatório de exportação. O harness registra snapshots Main/renderer/GPU/auxiliares em quadros selecionados; CPU é média desde a coleta anterior. Electron não informa VRAM nem bytes efetivamente alocados pelo driver; não apresentamos essa estimativa como memória física.
- Preservado e testado: geometria, fala/boca obrigatória, sobreposição de vídeo, áudio, 720p/1080p, cancelamento, recuperação Turbo → CPU e destino existente.
- **Emenda de export sem cabelo:** causa reproduzida no worker: evento `paint` não era correlacionado com o token do quadro; uma captura atrasada podia ser aceita após o desenho seguinte e produzia pixel incorreto perto de `(240, 90)`. A cerca de 24 bits agora rejeita a imagem antiga e repete a captura até obter o token do quadro pedido; teste Electron/FFmpeg dos 81 quadros, emenda, áudio e recuperação passou.
- **Gate CI:** a assertion de `trackOperation(async () => { planEditorV6Export` era estrutural e ficou obsoleta após a preparação async. Foi substituída por testes comportamentais de planejamento/importação, preparo, IPC/flush e cancelamento; o gate preserva cobertura do caminho real. O workflow Windows agora executa o teste sintético de cabelo reaproveitando o bundle e FFmpeg já preparados e publica somente artefatos sintéticos com hashes. Ainda não houve uma run hospedada dos commits locais.

### Referências técnicas consultadas

- Electron 45 — [Offscreen rendering](https://www.electronjs.org/docs/v45.1.0/tutorial/offscreen-rendering): `paint` fornece somente regiões sujas e o modo de bitmap GPU faz readback GPU→CPU; [webContents.capturePage](https://www.electronjs.org/docs/v45.1.0/api/web-contents#contentscapturepagerect-opts) captura uma região como `NativeImage`.
- Electron — [ProcessMetric](https://www.electronjs.org/docs/v45.1.0/api/structures/process-metric) e [MemoryInfo](https://www.electronjs.org/docs/v45.1.0/api/structures/memory-info): CPU média entre coletas, `workingSetSize` em KB e `privateBytes` quando a plataforma informa. Não expõe bytes de VRAM por textura.
- WebGL — [MDN API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API), [context attributes](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getContextAttributes) e [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): contexto alfa premultiplicado, orientação de textura, limites do contexto e ciclo de recursos foram verificados no renderer Electron. O renderer não baixa resolução nem cria mipmaps.
- FFmpeg/FFprobe — [documentação oficial](https://ffmpeg.org/documentation.html): usado para decodificar capturas RGBA e confirmar codec, resolução, FPS e quadros nos MP4 sintéticos.

---

O painel pode ser fechado durante a exportação. O trabalho continua enquanto o aplicativo estiver aberto. Ao reabrir, o painel recupera o trabalho mais recente da janela. Encerrar o aplicativo cancela os processos e aguarda a liberação dos temporários.

## Fluxo implementado

1. O main valida o documento e o intervalo `[início, fim)`, em quadros inteiros, e abre o diálogo de destino.
2. Para Turbo com pelo menos dois quadros, a divisão ocorre em `início + floor(total / 2)`. Intervalos ímpares não repetem nem perdem o quadro da emenda. Um intervalo de um quadro usa um único renderizador.
3. O codificador é escolhido antes de renderizar. A seleção automática testa NVENC, QSV e AMF e usa OpenH264 por CPU se necessário. O FFmpeg já incluído no projeto fornece OpenH264; não exige baixar outro binário.
4. Duas janelas Electron ocultas e offscreen recebem o documento completo. Cada uma carrega uma página exclusiva de exportação e desenha apenas seu intervalo com o próprio `SceneSurface` da prévia.
5. O worker resolve o quadro diretamente, prepara as imagens e espera o desenho do Chromium. Estados anteriores ao início da segunda parte continuam disponíveis.
6. Quando existe fala ligada a personagem visível, o main pede ao preparador facial até três recortes temporários por estado visual. O atlas contém só a pequena região facial que muda; o corpo mantém a imagem original. O ciclo segue a fase global do vídeo, inclusive nas emendas Turbo. Se faltarem personagem, recorte, revisão compatível ou orçamento para manter a resolução nativa, a exportação falha e não publica um MP4 sem a animação obrigatória. Cenas sem fala elegível não fazem preparação facial.
6a. Se a opção experimental estiver ativa, o renderer prepara camadas temporárias por personagem e variante facial, aplica o preset selecionado e valida IDs/referências no main antes de abrir os workers. O worker reexecuta a simulação determinística a partir do quadro zero, recompõe o cabelo fora de imagens rasterizadas de transição e acrescenta o quadro da animação à chave visual para não reaproveitar uma captura parada. Os dados não são persistidos no documento nem no catálogo. O custo adicional depende das dimensões e do número de peças de cabelo; sem preset, a captura permanece idêntica ao fluxo normal.
7. Antes de abrir os workers, o main define uma única decisão `layeredVideo` usando somente vídeos válidos, visíveis, não silenciados e que cruzem o intervalo exportado. Envia essa decisão ao renderer e ao FFmpeg. Assim, ambos concordam se o bitmap terá fundo e elementos em camadas; faixas ocultas, silenciadas ou fora do intervalo não ativam essa composição.
8. O main captura o bitmap BGRA e o envia por pipe ao FFmpeg, com espera de escrita para limitar a fila. As partes são MP4/H.264 sem áudio. Se há vídeo, o FFmpeg compõe o vídeo da timeline entre as camadas capturadas.
9. Se a composição visual não mudou, o worker sinaliza reaproveitamento e o main reutiliza o bitmap anterior. O recorte do atlas da boca faz parte da chave visual e impede reaproveitar o quadro errado.
10. As partes precisam usar o mesmo codificador e os mesmos parâmetros de stream, incluindo o hash dos dados de inicialização H.264.
11. O FFmpeg concatena as partes com `-c:v copy`. O áudio é recortado sobre o intervalo inteiro, deslocado por amostras, misturado uma única vez e codificado em AAC a 48 kHz. Silêncio completa os trechos sem áudio.
12. FFprobe verifica contagem de quadros, resolução, FPS e duração. O exportador também verifica a duração do áudio e decodifica três quadros próximos de cada emenda para detectar erros técnicos.
13. O relatório é salvo e o arquivo candidato só substitui o destino depois da validação. Cancelamento e falhas anteriores à publicação preservam um MP4 que já existia no destino.

Se a tentativa Turbo falhar durante renderização, compatibilidade, junção ou validação, os dois trabalhos são encerrados e a exportação reinicia uma vez com um renderizador e OpenH264 por CPU. Cancelamento explícito não aciona essa recuperação.

## Relatórios e isolamento

Os relatórios ficam em `exports/<job-id>.report.json` dentro do projeto. Registram intervalo, encoder testado/usado, tentativas, quadros por parte, capturas reaproveitadas, tempos, áudio, validação e erros. Quando o loop está ativo, incluem quantidade de estados e personagens preparados, duração do ciclo e estados ignorados. O botão de resultado mostra o MP4 ou relatório no Explorador.

Cada parte inclui `frameTiming`, que resume por fase os tempos `workerStartupMs`, `sceneResolutionMs`, `faceCompositionMs`, `hairCompositionMs`, `assetPreparationMs`, `reactCommitMs`, `rafWaitMs`, `ipcDrawMs`, `captureMs`, `backgroundCaptureMs`, `foregroundCaptureMs`, `frameRoundTripMs`, `ffmpegWriteMs` e `ffmpegFinalizeMs`. `hairCompositionMs` só aparece quando a opção experimental está ativa e separa a deformação/composição do cabelo do restante do quadro. São durações medidas com `performance.now()` no processo que executa cada etapa; não são timestamps absolutos e não devem ser alinhadas diretamente entre processos. P50/P95 usam baldes de 0,1 ms até 200 ms; o máximo e a soma permanecem mais precisos. Fases sem trabalho positivo não ganham amostras. A instrumentação separa o tempo dos estágios, mas ainda não atribui ao FFmpeg o custo de codificação de cada quadro enquanto ele trabalha em paralelo.

Os intermediários ficam em uma pasta temporária exclusiva. O caminho absoluto é conferido antes da limpeza recursiva. Não há imagens PNG intermediárias por quadro nem gravação da reprodução da tela do usuário. A preparação facial usa orçamento agregado por trecho; se exceder o limite, ela interrompe com diagnóstico em vez de reduzir a resolução ou pular a boca.

O preload dos workers expõe apenas a obtenção do documento e a confirmação de inicialização. Cada chamada é vinculada ao `webContents` registrado pelo coordenador. Os workers não recebem o objeto `desktop` do aplicativo, não têm Node no renderer e não acessam recursos de rede externos.

## Arquivos principais

- `src/shared/editorV6Export.ts`: contrato, divisão por quadros, planejamento do áudio e chave visual.
- `electron/domains/editorV6/exportIpc.ts`: diálogos, importação/cópia de áudio, trabalhos, progresso e cancelamento.
- `electron/domains/editorV6/exportRunner.ts`: coordenação, FFmpeg/FFprobe, concatenação, mixagem, recuperação e publicação.
- `electron/domains/editorV6/prepareMouthLoops.ts`: preparação dos atlases temporários da boca, com limites de estados e memória.
- `electron/domains/editorV6/exportWorkers.ts`: janelas ocultas e captura BGRA.
- `electron/domains/editorV6/exportProcess.ts`: subprocessos, limites de espera, cancelamento e encerramento.
- `electron/editorV6ExportPreload.ts`: ponte restrita dos workers.
- `src/renderer/src/features/editorV6/exportWorker.tsx`: desenho por quadro e reaproveitamento visual.
- `src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts` e `src/shared/editorV6HairMotion.ts`: preparação descartável das camadas e validação do contrato de cabelo experimental; `src/shared/hairMotionEngine.ts` compartilha a física fixa com a prévia do Fabricador.
- `tests/editor-v6/hairMotionExport.electron.ts`: captura sintética no Electron que verifica movimento e continuidade entre início sequencial e início de trecho Turbo.
- `src/renderer/src/features/editorV6/motion/bakeMotion.ts`: rasterização dos tamanhos temporários com o mesmo compositor facial.
- `src/renderer/src/features/editorV6/EditorV6ExportPanel.tsx`: configuração e acompanhamento.

## Verificações

`npm run test:editor-v6` cobre divisão de intervalos pares/ímpares, resolução, áudio recortado/deslocado e referências seguras.

`npm run test:editor-v6:export` compila e executa o fluxo real no Electron/Chromium e FFmpeg incluídos, com perfil e arquivos temporários isolados. Confere duas partes simultâneas, 81 quadros em 40+41, estado anterior ao início da segunda parte, cores BGRA, continuidade em transição de pose, talk e pensamento, faixa de vídeo oculta, áudio contínuo na emenda, recuperação após falha simulada, cancelamento preservando o destino, intervalo de um quadro e saída 1080p. Também verifica que o relatório contém tempos por fase. A contagem de quadros e amostras de áudio são verificadas no MP4 produzido.

`npm run test:editor-v6:surface` confere o desenho comum da cena e a ligação do painel de exportação/importação de áudio.

## Limites atuais

Turbo 2× significa dois trabalhos simultâneos; não garante reduzir o tempo pela metade. GPU só é usada na codificação quando um encoder compatível passa no teste inicial. As verificações técnicas não substituem revisão visual de todas as cenas.

O loop aumenta o trabalho de preparação antes do FFmpeg. Os atlas ficam no documento temporário do job e o serviço de animação pode manter cópias no cache descartável fora da pasta do projeto; nada é acrescentado ao JSON do projeto. O orçamento agregado é 64 MiB e 32 milhões de pixels para os trechos simultâneos, com no máximo 8 milhões de pixels por estado. Não há corte artificial de 12 estados; o teste sintético prepara 501 estados. Se o orçamento ou os vínculos faciais não forem compatíveis, a exportação falha claramente em vez de publicar um vídeo sem movimento de boca.

O V6 pode compor vídeos presentes na timeline e mixar as faixas de áudio habilitadas, mas ainda não prepara proxies. A reprodução de vídeos usa o Chromium na prévia; na exportação, o FFmpeg compõe o vídeo sob os elementos capturados pelo renderer. Os quadros de vídeo impedem reaproveitar a composição inteira como imagem estática. Os tempos no relatório indicam onde o exportador espera; não medem por si só a latência de apresentação física no monitor.


## Paridade de composição — ordem dos vídeos e animações (2026-10-30)

A prévia e o exportador usam o mesmo estado visual da timeline. A prévia interativa também deve exibir os quadros intermediários de transições de pose/expressão já preparados; esses quadros antes eram desativados somente no componente de reprodução.

Para vídeos sobrepostos, o FFmpeg recebe as camadas em ordem crescente de **início original do bloco e ID do bloco**, a mesma precedência usada pela prévia, mesmo quando uma parte Turbo começa no meio de duas sobreposições. Não se pode ordenar por nome do arquivo nem apenas pelo início recortado da parte, pois isso alteraria o vídeo visível no MP4. O planejamento está em `src/shared/editorV6VideoComposition.ts`; a resolução visual permanece em `src/shared/editorV6TimelineScene.ts`.

Os testes sintéticos em `tests/editor-v6/editorV6ExportParity.test.ts` comparam a mídia visível a cada quadro, offset de leitura, layout, estados escondidos/silenciados e as imagens de atlas da transição no SVG da prévia e da captura. O workflow `editor-v6-parity.yml` valida Editor V6, TypeScript e build em Linux/Windows. Esses testes **não substituem** um aceite visual com FFmpeg no Electron Windows e arquivos sintéticos.

 
### Teste MP4 real de sobreposição e emenda Turbo

O workflow dedicado do Editor V6 agora tem um job Windows que instala o runtime Electron e prepara **FFmpeg/FFprobe LGPL** usando o arquivo ZIP e seu hash SHA-256 do manifesto `resources/video-tools.manifest.json`. Em perfil Electron isolado, o comando `npm run test:editor-v6:export-overlay` gera três clipes sintéticos opacos, com IDs e nomes ordenados em sentido contrário à prioridade das camadas.

A exportação Turbo gera **60 quadros a 30 FPS**. Todos os quadros do MP4 final são decodificados e seu pixel central é comparado à mídia que `resolveEditorV6SceneAtFrame` seleciona no mesmo instante: vermelho até o 19, verde do 20 ao 36, azul do 37 ao 49 e vermelho do 50 ao 59. A emenda entre as partes, nos quadros 29 e 30, deve continuar verde. São verificadas também resolução, quantidade exata de quadros e exportação em duas partes sem fallback. O relatório de verificação sintética é anexado à execução da CI, sem acessar mídia ou dados pessoais.

O teste cobre a prioridade dos clipes opacos em tela inteira, não a paridade de áudio, transparência nem transformações de layout. O teste completo `npm run test:editor-v6:export` e o aceite visual de casos adicionais continuam relevantes.
