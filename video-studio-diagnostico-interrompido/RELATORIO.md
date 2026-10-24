# Relatório — Video Studio interrompido

**Pasta do repositório:** C:\TRABALHO 2\OUTROS\GACHA LARAPIO  
**Captura:** 2026-10-23, aproximadamente 19:17 America/Sao_Paulo (22:17 UTC)  
**Modo de execução:** Electron e automação offscreen  
**Motivo:** pedido explícito para interromper; não retomar testes nem exportação.

## Estado imediato e interrupção

O comando de controle em execução era node scripts/video-studio/windows-stress-playback.cjs, no ciclo warm-same-process. A sessão de terminal do Codex era 88229; o PID específico do runner não estava mais presente quando a lista de processos foi consultada. O último progresso estruturado disponível foi:

- 591 s do ciclo aquecido; quadro 8.101; playhead 02:15:01; quatro personagens; zero vídeos naquele ponto; working set 2.417 MiB e Private Bytes 2.477 MiB.

Enviei Ctrl+C ao runner. O processo de reprodução do Electron continuou avançando sem o runner. Na inspeção offscreen, a interface chegou a 02:59:54 / 03:00:00 e depois exibiu Reproduzir; não há relatório final daquele ciclo, então não é possível afirmar que o runner observou 10.800 quadros aquecidos. Cliquei em Salvar Video Studio; o editor já indicava “Salvo automaticamente”. Em seguida encerrei por Ctrl+C a sessão de desenvolvimento que eu havia iniciado. A verificação posterior não encontrou processos do repositório, Electron, FFmpeg, FFprobe, runner ou coletor de memória ativos.

Na inspeção anterior ao encerramento, o grupo do aplicativo era: PowerShell 3496, npm 1824, electron-vite 19240, Electron principal 9164, GPU 12724, renderer 17212, rede 17988 e áudio 17116. Esses processos pertenciam à execução offscreen desta tarefa. Nenhum processo FFmpeg/FFprobe estava ativo. Não houve processo de exportação.

O aplicativo foi salvo antes do encerramento. O documento local continua presente; após salvar, seu playheadFrame persistido era 0. Não reabri o projeto depois de fechar o app, porque a instrução proíbe reiniciar os testes.

## 1. Resumo do que foi executado

- Repositório oficial confirmado: https://github.com/nestarasup-sys/Native-gacha.git.
- Branch examinada: feature/model-source-editor, HEAD b00c1b644b11f93a29f231d6ebb2956567e2830c.
- Ambiente Windows, Node.js 24.18.0, npm 11.16.0, Electron 44.7.1, FFmpeg/FFprobe 8.1.2. O host reportou 16.526.802.944 bytes de RAM (~15,4 GiB). VRAM dedicada não foi medida.
- As operações desta execução foram feitas offscreen.
- Há evidências de testes entre 17:57:45 e 19:15:11, horário local: cerca de 77 min e 26 s. O início real do trabalho pode ter ocorrido antes do primeiro artefato. O tempo total de ~90 min informado pelo usuário não pode ser confirmado por um log de sessão completo.
- Foram criados e salvos quatro personagens, um projeto real de 180 segundos, duas mídias de vídeo sintéticas e evidências de preview/edição.
- Um ciclo frio percorreu os 10.800 quadros do playhead. A maior demora medida foi a preparação de transições; veja a seção de métricas.
- Nenhuma exportação foi iniciada. Não existe MP4 exportado dentro de app-data\stress-runs.

## 2. O que realmente foi concluído

### Personagens e assets reais

Os quatro personagens foram salvos no Customizador e os quatro nomes ainda estavam presentes no arquivo local após encerrar o app:

| Personagem | Aparência que aparece na folha de contato |
|---|---|
| STRESS_Aurora | Cabelo loiro claro, roupa branca/azul clara |
| STRESS_Nix | Cabelo roxo escuro, roupa vermelha e azul-marinho |
| STRESS_Brisa | Cabelo turquesa, roupa ciano clara e óculos reais do catálogo |
| STRESS_Dorian | Cabelo castanho claro, roupa verde e bege |

Foram usados o modelo real original (slot 1, 10 partes), o conjunto real Modelo de Roupa Xadrez e Jeans (7 componentes), peças reais de cabelo, face e acessório, e 21 presets de expressão padrão. O catálogo tinha os slots de pose 1 (categoria Parado) e 2 (categoria Sentado), cada um com 10 partes. O conjunto e a família de cabelo foram reutilizados com variações de cor; não foram criadas três fichas estáticas diferentes de roupa por personagem. A folha de contato está incluída nas evidências.

A verificação do setup registrou o round-trip dos personagens após salvar (charactersAfterSave: 4, loadRoundTrip: true). A tela também confirmou imagens dos quatro personagens carregadas. Não alterei nem excluí personagens pessoais.

### Projeto persistente

O projeto foi criado pelas APIs reais do Video Studio, salvo na biblioteca e confirmado por round-trip antes da interrupção:

- Nome: STRESS TEST — 4 GACHA — 180 SEGUNDOS
- ID: 1c9b7ef5-e020-40bd-bfb5-b56b6fac5241
- StudioDocument / VideoTimelineDocument
- 180 s, 60 FPS, 10.800 quadros
- 213 chaves de personagem: Aurora 55, Nix 55, Brisa 51, Dorian 52
- 48 clipes combinados de fala e pensamento
- 2 clipes de vídeo sintético sobrepostos em parte da timeline
- 4 lacunas intencionais
- Transições de personagem ligadas

O projeto permanece em:

C:\TRABALHO 2\OUTROS\GACHA LARAPIO\app-data\runtime\profile\studios\Video Studio\studio-1c9b7ef5-e020-40bd-bfb5-b56b6fac5241\studio.json

O cartão da biblioteca também continua ao lado como studio-card.json. O arquivo foi gravado às 19:15:11 e, após o salvamento, contém duração 10.800, 60 FPS, 213 chaves, 48 clipes de texto e 2 de vídeo. O arquivo de personagens está em:

C:\TRABALHO 2\OUTROS\GACHA LARAPIO\app-data\runtime\profile\customizer\characters\characters.json

As transformações de palco do contrato são globais por personagem, não animações independentes por chave. Portanto, mudanças de posição/escala/rotação/mirror por keyframe não foram comprovadas nem simuladas como suportadas. O projeto não possui faixa independente de áudio; os dois vídeos sintéticos carregam áudio próprio.

## 3. O que ficou incompleto

- Exportação: não executada. Não há MP4 final, validação FFprobe, contagem de 10.800 quadros exportados ou comparação visual preview/exportação.
- Ciclo aquecido: o runner foi interrompido no último registro em 8.101 quadros. A interface continuou depois sem o runner e chegou perto do fim, mas não deixou um relatório final nem um CSV desse ciclo. O avanço visto na UI não substitui uma métrica final do runner.
- Preview versus exportação: não pode ser comparado sem o arquivo exportado.
- Memória aquecida/cache frio-quente: sem segundo relatório/CSV completo, não existe comparação quantitativa.
- VRAM, atividade de GPU, CPU, paginação/pagefile e garbage collection: não foram instrumentados. Não há evidência para afirmar pressão de paginação, GC ou VRAM.
- Cancelamento e recuperação de exportação: não executados; não houve export para cancelar.
- Abertura após o encerramento final: o projeto estava salvo e o round-trip/listagem foram verificados antes. Não foi reaberto após fechar o app, conforme a ordem de não reiniciar testes.
- Áudio audível: os vídeos sintéticos têm áudio embutido, mas as evidências disponíveis não confirmam saída acústica real. O importador de faixa de áudio independente não é suportado pelo contrato atual da timeline.
- O cancelamento do pré-render no editor invalida a solicitação atual por contador de geração, mas o caminho verificado não passa um AbortSignal à fila de preparação. Assim, clicar cancelar não garante interromper um render que já entrou na fila; encerrar o processo do aplicativo foi necessário para garantir que a execução parasse.

## 4. Linha do tempo observável

Horários convertidos de UTC para America/Sao_Paulo (UTC−3). O total de ~90 min é a estimativa do usuário; os artefatos sobreviventes cobrem somente o intervalo abaixo.

| Horário local | Evidência |
|---|---|
| 17:57:45 | Primeira pasta de diagnóstico e gravação do arquivo de personagens |
| 18:05–18:10 | Inspeção e capturas da biblioteca/Video Studio |
| 18:14:24 | Relatório do setup final e folha de contato |
| 18:21:04 | Relatório de tentativa de reprodução das mídias |
| 18:35:59–18:41:07 | Tentativa de preview terminou com alerta genérico de reprodução em 00:48:25 da timeline; o arquivo não registrou o tipo interno do erro |
| 18:42:14–18:46:51 | Segunda tentativa registrou AbortError explícito durante a troca da origem gacha-video://studio para gacha-video://preview-proxy |
| 18:48:47–19:02:13 | Ciclo frio após reiniciar o aplicativo; 13 min e 26 s entre criação e último artefato, com 802,473 s de ciclo medido |
| Após 19:02 | Ciclo aquecido começou; horário exato de início não ficou registrado em arquivo. Último progresso estruturado: 591 s, quadro 8.101, 02:15:01 |
| Durante a interrupção | Runner recebeu Ctrl+C; o renderer Electron continuou. UI observada em 02:59:54 / 03:00:00; salvamento explícito confirmado |
| 19:15:11 | Timestamp de gravação do projeto e do cartão da biblioteca após salvar |
| Depois do salvamento | Ctrl+C na sessão de desenvolvimento; lista posterior não encontrou processos do app ou da tarefa ativos |

## 5. Métricas e evidências disponíveis

### Ciclo frio completo

Origem: playback-cold-report.json e playback-cold-memory.csv.

- Estado: completed=true, finalFrame=10800, totalFrames=10800.
- Ciclo: 802,473 s (13 min 22,5 s); 803,681 s incluindo a preparação total medida.
- Preparação: 618,005 s em 52 períodos; média aproximada de 11,9 s por período; maior período 28,728 s. Isso representa cerca de 77% do tempo do ciclo.
- Amostras: 602 em preparing, 175 em playing, 1 em stopped; erro de preview foi 0 em todas as 778 amostras.
- Até quatro personagens visíveis; até dois decodificadores de vídeo ativos e dois prontos.
- Intervalo entre callbacks de requestAnimationFrame: p50 13,4 ms, p95 79,9 ms, p99 93,4 ms; média 48,96 callbacks/s no período total. Isso não equivale a FPS de exportação.
- Avanço medido do playhead enquanto reproduzia: p50 54,83, p95 64,20 e p99 67,05 quadros/s (229 amostras). São amostras de progresso da timeline, não uma prova de 60 quadros exportados.

### Memória do ciclo frio

A planilha original tem 132 amostras e 616 linhas de processos Electron (4–5 processos por amostra). Reagreguei as linhas existentes por amostra; não iniciei novo teste. O script de sumarização do relatório de playback não interpretou corretamente o CSV original, então os campos de memória dentro do JSON aparecem nulos. Os valores abaixo vêm diretamente do CSV preservado.

| Soma da árvore Electron | p50 | p95 | p99 | Pico |
|---|---:|---:|---:|---:|
| Working Set | 2.387,7 MiB | 2.521,6 MiB | 2.550,9 MiB | 2.552,1 MiB |
| Private Bytes | 2.480,1 MiB | 2.686,0 MiB | 2.974,5 MiB | 3.029,0 MiB |

O working set agregado pode contar páginas compartilhadas mais de uma vez; Private Bytes é compromisso privado agregado. A amostra de processos registrada pela aplicação foi de ~1,15 GiB de working set no começo para ~2,50 GiB no final. A RAM livre do sistema caiu de ~6,23 GB para ~4,99 GB no intervalo, mas isso não pode ser atribuído exclusivamente ao app. O coletor não incluiu FFmpeg nem outros filhos. Nenhuma medição de VRAM foi coletada.

### Edição e capturas

O relatório de UI registra seeks em 5, 45, 90, 135, 179 e 10 segundos, zoom alterado/restaurado, undo/redo de transições, 4 personagens e clipes sobrepostos. As capturas disponíveis cobrem 5, 25, 48, 72, 90, 115, 140, 165 e 179 segundos, mais a biblioteca. Essas imagens são do preview; não existe exportação com a qual compará-las.

## 6. Erros, gargalos e análise de causa

### Fato reproduzido antes da correção

Duas tentativas anteriores terminaram com mensagem genérica de preview. O segundo log registra AbortError: The play() request was interrupted by a new load request quando o elemento de vídeo trocou de gacha-video://studio/... para gacha-video://preview-proxy/.... A interface mostrava uma mensagem genérica de formato incompatível embora o vídeo estivesse carregado. A lógica em videoMediaPlayback.ts foi corrigida para ignorar esse AbortError somente quando a origem mudou; erros com a mesma origem continuam tratados como falha real. Os testes específicos passaram, e o ciclo frio posterior completou com errorCount=0.

### Fato medido sobre o tempo

O ciclo frio ficou 618 s em preparação. O código em useCharacterTransitions.ts usa uma fila serial: para cada amostra da transição, aguarda TransitionRenderer.render, decodificação da imagem PNG e armazenamento no cache. As transições usam amostras intermediárias a 60 FPS e a fila mantém limites de 128 MiB/240 itens. É compatível com a demora observada e é o gargalo medido mais forte.

### Inferência e limites

- Inferência forte: o pré-render serial das transições faciais/de pose é o principal consumidor de tempo neste preview, não FFmpeg de exportação, porque 77% do ciclo foi rotulado como preparação e não houve export.
- Ainda incerto: se renderização Canvas, composição de assets, corte/decodificação PNG, cache/evicção ou espera do renderer domina cada amostra. Não há perfil de CPU/GPU por função.
- Sem evidência suficiente: se o cache melhora ou piora o ciclo aquecido. O ciclo aquecido não gerou métricas finais.
- Sem evidência: leak, GC excessivo, paginação, falta de VRAM ou pressão de GPU.
- O primeiro modo oculto usado no harness reduziu muito callbacks por throttling de janela em background; o harness foi ajustado para offscreen sem esse throttling. A medição final de 48,96 callbacks/s pertence ao modo offscreen ajustado, não à janela oculta anterior.

## 7. Resultados dos testes

### APROVADO

- npm run typecheck
- npm run build
- npm run test:video:next: 53 aprovados, 0 falhas
- node --test tests/video-media-playback.test.cjs: 2 aprovados
- node --test tests/video-preview-proxy-store.test.cjs: 6 aprovados
- Round-trip e presença dos quatro personagens; cartão do projeto disponível na biblioteca antes da interrupção
- Ciclo frio do preview avançou até 10.800 quadros sem erros de preview
- Mídias/proxies visíveis e dois decodificadores prontos nos trechos registrados

### FALHOU (antes da correção)

- Duas execuções iniciais do preview pararam com a mensagem genérica de reprodução; a segunda registra AbortError durante a troca de URL original para URL de proxy. A correção foi aplicada e coberta pelos testes específicos; a execução fria subsequente passou.

### PARCIAL

- Segundo preview aquecido: último progresso registrado pelo runner foi quadro 8.101. A UI depois avançou até perto do final sem o runner, mas não há arquivo final para confirmar quadros/métricas.
- Comparação visual: capturas do preview disponíveis; comparação com exportação não ocorreu.
- Integridade depois do fechamento: arquivos do projeto e personagens existem e o salvamento foi confirmado; o projeto não foi reaberto após o encerramento.

### NÃO EXECUTADO

- Exportar MP4 completo em 1920×1080, 60 FPS, 10.800 quadros
- Validar codec, duração, FPS, número de quadros e áudio por FFprobe
- Comparar capturas do MP4 com o preview
- Segundo ciclo quente quantitativo, segunda exportação, cancelamento/recuperação de exportação
- Medição de VRAM, CPU, paginação, pagefile ou GC

## 8. Arquivos preservados e caminhos

As origens continuam em seus locais; nada foi movido ou apagado. A pasta diagnóstica contém cópias seletivas de evidências, não cópias de mídias privadas.

- Ciclo frio e memória:
  app-data\stress-runs\playback-2026-10-23T21-48-47-435Z-19344\
- Falhas anteriores:
  app-data\stress-runs\playback-2026-10-23T21-35-59-360Z-19104\playback-abort.json
  app-data\stress-runs\playback-2026-10-23T21-42-14-022Z-15772\playback-abort.json
- Setup, assets e folha de contato:
  app-data\stress-runs\windows-2026-10-23_21-14-23-504Z-17260\
- UI, biblioteca e capturas de preview:
  app-data\stress-runs\ui-2026-10-23T21-10-26-910Z-17296\
- Teste das duas mídias:
  app-data\stress-runs\media-play-2026-10-23T21-21-04-966Z-21112\report.json
- Vídeos sintéticos originais:
  app-data\stress-media\synthetic-moving-24fps-audio440hz.mp4
  app-data\stress-media\synthetic-moving-30fps-audio660hz.mp4
- Projeto real e cartão: caminho na seção 2.
- Personagens: app-data\runtime\profile\customizer\characters\characters.json.
- O terminal não tinha redirecionamento para um arquivo completo de stdout/stderr. O pacote inclui o último fragmento de progresso disponível, os JSON estruturados e o CSV de memória; não apresenta o fragmento como log completo.
- Não há MP4 de exportação em app-data\stress-runs; os únicos MP4 listados são os dois clipes de entrada sintéticos.

## 9. Estado do repositório

- Diretório: C:\TRABALHO 2\OUTROS\GACHA LARAPIO
- Remoto: origin https://github.com/nestarasup-sys/Native-gacha.git
- Branch: feature/model-source-editor
- HEAD: b00c1b644b11f93a29f231d6ebb2956567e2830c
- Não fiz reset, clean, merge, push ou commit.
- Mudanças pré-existentes preservadas: ABRIR_DESENVOLVIMENTO.bat, ATUALIZAR_DESENVOLVIMENTO.bat.
- Alterações locais desta execução: electron/main.ts, electron/preload.ts, electron/videoPreviewProxyStore.ts, scripts/video-studio/windows-memory-probe.ps1, src/renderer/src/features/videoStudio/videoMediaPlayback.ts, src/shared/studio.ts, tests/video-preview-proxy-store.test.cjs; scripts novos scripts/video-studio/windows-stress-diagnose.cjs, windows-stress-fixture.js, windows-stress-inspect.cjs, windows-stress-media-play-test.cjs, windows-stress-media.ps1, windows-stress-playback.cjs, windows-stress-run.cjs, windows-stress-status.cjs, windows-stress-ui.cjs; e tests/video-media-playback.test.cjs.
- O relatório diagnóstico é uma nova pasta local não commitada.

## 10. Recomendação para análise externa

Investigar e corrigir o caminho de preparação das transições; manter a arquitetura geral por enquanto. O dado mais forte é 618 s de preparação serial no preview, não uma exportação lenta. Antes de substituir o motor, a próxima análise deve separar custo de renderização por amostra, corte/decodificação PNG, hits/evicções do cache e paralelismo seguro; também deve dar cancelamento real à fila. A exportação continua sem evidência e precisa ser medida separadamente em outro momento, se autorizada.

