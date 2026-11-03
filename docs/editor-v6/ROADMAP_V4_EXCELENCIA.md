# Editor V6 — Plano de excelência V4 (revisão de 2026-11-03)

> **Proposta de evolução, não autorização para implementar tudo de uma vez.** Prioridades fundamentadas na `Dev-V2` após a refatoração V3. A finalidade é melhorar **qualidade de edição, confiança no resultado, fluidez e velocidade do trabalho do criador**. "10× melhor" significa ganho de experiência e produtividade a demonstrar, não promessa de exportar dez vezes mais rápido.

**Baseline de análise de código:** `0354c065c1e4bdcd2c9717fc54b3fc4aa9630665` (11 commits posteriores ao handoff V3 anterior). Verificar HEAD antes de implementar. Os commits de documentação e uma correção portátil de Logs Dev podem ser mais recentes.

**Regra de produto inegociável:** a animação dinâmica experimental de cabelo fica **exclusivamente na exportação MP4**, habilitada manualmente. A prévia, viewport, seek e reprodução normal do Editor V6 não devem ganhar cabelo animado. A prévia de animação do **Fabricador DEV** permanece.

## 1. Estado comprovado do aplicativo

| Sistema | O que já existe — preservar | Limites e oportunidade |
| --- | --- | --- |
| Timeline | Faixas Vídeo/Fala/Pensamento, personagens, Objetos/Áudio; edição por quadros a 30 FPS; dividir, duplicar, mover, redimensionar, bloquear, magnetismo, zoom, Fit, atalhos e undo/redo; busca/indexação e render de janela visível. | Uso intensivo com muitos clipes merece revisão de ergonomia, múltiplas seleções, feedback e miniaturas de mídia. Evitar reconstruir a timeline porque o arquivo tem ~320 linhas. |
| Prévia de cena | `SceneSurface` SVG 1920×1080; resolução por frame, imagens e rostos; arraste de elementos com rascunho/histórico; reprodução com relógio monotônico. | A correção de drift de mídia por `HTMLMediaElement.currentTime` é heurística; falta aferir quadros **apresentados** e sincronismo em seek/salto. |
| Áudio e vídeo | `SceneVideoLayer` com `<video>`, `EditorV6PlaybackAudio` com `Audio`; importação/vínculo à Base e clipes em timeline; mídia referenciada por ID; FFmpeg em export. | Sem proxies automáticos, waveform derivada e teste sistemático de drift A/V multiclipes. Há `play().catch(() => {})` silencioso em reprodução, a revisar com diagnósticos sanitizados. |
| Personagens e transições | Poses, expressões, blink/talk, boca obrigatória em fala no export, atlas e transição antecipada de 250 ms; cache, persistência e recuperação. | Aceite artístico em modelos reais complexos ainda não foi comprovado pelo teste sintético. Evitar prometer morph/IK universal. |
| MP4 | 720p/1080p a 30 FPS; Turbo de 2 partes e recuperação segura; várias camadas de vídeo, áudio mixado, controles de cancelamento e verificação por FFprobe; token por quadro para offscreen. | Melhorar pré-checagem, experiência de falha, confiabilidade do FFmpeg hospedado, relatório para usuário e desempenho de composição por quadro **após perfil**. |
| Cabelo export-only | Presets do Fabricador, física 120 Hz e composição temporária no worker; malha WebGL contínua; cabelo durante motionSprite sem duplicação; testes RGBA/MP4 com alpha e Turbo. | Falta aceite do usuário com personagem real; a V3 concluiu **aceite técnico sintético**, não artístico. Não animar na prévia normal. |
| Persistência e arquitetura | Contratos separados de Main/renderer/preload, snapshots, flush, validação de referências, testes de composição e CI por plataforma. | Observação em projetos maiores e testes de falha/disco cheio podem revelar melhorias. Não reescrever contratos sem motivo. |

### Evidências no código

- `src/renderer/src/features/editorV6/EditorV6Timeline.tsx`: virtualização da janela de blocos, rascunho de arraste, snap e ferramentas da faixa.
- `src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx`: prévia visual; composição facial assíncrona associada ao frame atual.
- `src/renderer/src/features/editorV6/SceneSurface.tsx`: vídeo HTML e cena SVG.
- `src/renderer/src/features/editorV6/EditorV6PlaybackAudio.tsx`: instâncias HTMLAudio, sync por `currentTime` e tolerância aproximada de **0,18 s** durante reprodução; não confundir com medição real de sync.
- `src/renderer/src/features/editorV6/useEditorV6Playback.ts`: relógio lógico via `performance.now()` / `requestAnimationFrame`, 30 FPS e opção de pular quadro lógico atrasado.
- `src/renderer/src/features/editorV6/exportWorker.tsx`: renderização por quadro, composição facial/cabelo, assets temporários e `canvas.toDataURL('image/png')` em estados animados; candidato a perfil de custo CPU/allocations, **não gargalo comprovado**.
- `electron/domains/editorV6/exportRunner.ts`: coordenação com FFmpeg, relatórios de fase, fallback, mixagem e verificação.
- `docs/architecture/PROGRAMA_REFATORACAO_GERAL_V3_NATIVE_GACHA.md`: resultados sintéticos V3, limites de aceite real e comparações com jogo aberto.

## 2. BLOQUEADOR P0 — colocar a CI em ordem

### CI no commit `0354c065`

[GitHub Actions 41661823251](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41661823251) apresentou:

1. **General gates / Linux:** falha em `tests/diagnostics-ipc.test.mjs` por usar um caminho fictício Windows (`C:\reports\filtered.json`), mas `basename()` do sistema Linux não reconhecer `\`. O resultado veio com caminho inteiro em `fileName` em vez de só o nome. Esta revisão já recebeu a correção localizada em `electron/domains/storage/diagnosticsIpc.ts` usando `path.win32.basename`, que também aceita caminhos POSIX, além de regressão POSIX no teste. **Aguardar validação na CI de HEAD mais recente**, não considerar aprovado somente porque o código foi modificado.
2. **MP4 Windows:** `scripts/video-studio/prepare-ffmpeg-lgpl.ps1` recebeu HTTP **404 Not Found** em `Invoke-WebRequest`. O manifesto pinado em `resources/video-tools.manifest.json` apontava para release `BtbN/FFmpeg-Builds` tag `autobuild-2026-10-20-13-08`, que também retornou 404 na API pública do GitHub nesta revisão. Logo, a CI **não executou** os testes de MP4 com cabelo nesse commit.

**Próxima correção obrigatória:** resolver a proveniência do binário de FFmpeg/FFprobe sem baixar código arbitrário ou reduzir integridade. Escolher pacote LGPL publicado e realmente disponível, conferir encoders requeridos, licenças, hash SHA-256 conhecido e teste de instalação em Windows; atualizar manifesto/script somente após comprovação. Evitar apontar para `latest` mutável sem política de pinagem e integridade; preservar a pasta local existente do usuário. Adicionar mensagens claras para arquivo removido, falta de rede e hash divergente. Não executar `npm audit fix --force` para mascarar falhas de CI.

**Critério P0:** novo HEAD passa todos os jobs da Dev-V2, incluindo teste real de cabelo, MP4 facial e paridade overlay; registrar SHA e link da execução efetivamente verde. Uma execução antiga verde não comprova o HEAD.

## 3. BLOQUEADOR P0 — aceite visual da V3 com cabelo real

A V3 passou com fixtures sintéticos: cabelo semitransparente, mudança de pose, espelhamento, frame intermediário e Turbo. Isso **não prova** que o cabelo específico do usuário ficou correto.

Procedimento recomendado:
1. Exportar um clipe real curto com **cabelo desligado** e o mesmo trecho com **cabelo ligado**, sem mexer no projeto-base.
2. Verificar raiz na cabeça, franja, costas, cores, proporções, alpha/bordas e troca de pose ao longo de todos os quadros críticos.
3. Conferir **primeiro/último quadro da transição**, face e boca quando existe fala. Conferir 720p/1080p e Turbo/seguro com o mesmo trecho.
4. Se houver diferença, gerar fixture sintético que reproduza a geometria **sem copiar mídia pessoal para CI** e corrigir causa, não só o efeito visual.
5. Registrar o aceite artístico como **pendente** até a revisão manual; manter feature experimental e desligada por padrão.

**Não implementar cabelo animado no viewport do Editor V6.**

## 3A. PRIORIDADE VISUAL P0 — animar a boca como peça independente, não um quadrado de rosto

**Relato do usuário:** atualmente, ao falar, é perceptível um recorte retangular ao redor da boca que pode incluir **pele, cabelo e outros detalhes** e parecer aumentar junto com ela. Ele quer **movimentar somente a boca**, porque os assets de boca já existem separados no Fabricador/Customizador. Isso é uma prioridade explícita de qualidade do Editor V6 e deve ser tratada como problema de produto, não somente como limpeza de código.

**O que o código realmente faz:** `motion/bakeMotion.ts` aplica a ampliação em `transforms.mouth` (não multiplica intencionalmente todo o rosto), renderiza versões inteiras do personagem e compara os pixels para encontrar `changedBounds`. Em seguida, `changedPixelPatch` captura um **retângulo RGBA completo**, com os pixels vizinhos dentro do limite. `sceneFaceComposition.ts` aplica a substituição de pixels retangular, embora o personagem tenha a boca como componente de origem separado. Esse método evita alguns halos e permite transparência/remoção de pixels anteriores, mas pode reintroduzir bordas, detalhes indesejados e custos de compor/encodar grandes áreas. **Não declarar a causa exata do artefato visual sem um par de quadros do usuário ou fixture equivalente.**

### Arquitetura desejada, a ser comprovada por protótipo

1. **Renderizar só a boca** da seleção `mouth-open`/`mouth-closed` (e seus efeitos dependentes), em uma camada RGBA com transparência verdadeira, na posição/calibração da cabeça, usando o renderizador de face já existente — sem duplicar a regra de paletas, tintas, rotação, posições ou seleção de catálogo.
2. **Compor a base do personagem sem a boca antiga**, mas mantendo pele, nariz, olhos, cabelo frontal e demais camadas na ordem correta. Desenhar a boca animada **entre as camadas apropriadas**, e não como imagem quadrada por cima de cabelo/pele. A remoção do desenho anterior exige plano explícito; simplesmente sobrepor uma boca nova à antiga causa fantasmas.
3. Guardar apenas variantes/renders **compactos da boca** necessários ao ciclo de fala. O cache e atlas devem ser chaveados por personagem/pose/expressão/calibração/paleta e invalidados quando a fonte muda, sem criar PNG de corpo inteiro por frame.
4. Para rigs legados sem boca isolável, manter **fallback seguro e explícito**, sem reduzir qualidade silenciosamente ou perder a fala obrigatória. Registrar no diagnóstico de exportação o uso de fallback de forma sanitizada.
5. Preservar **transições de pose**, boca em `motionSprite`, `talk-blink`, giro, flip, zoom, proporções, contorno, transparência, máscaras, cabelo à frente da boca, efeitos faciais e áudio da fala.

### Experimento e testes obrigatórios

- Primeiro, fixture com **boca detalhada e cabelo/pele atravessando o retângulo antigo**. Comparar visualmente e em RGBA a boca antiga e a isolada em todos os quadros críticos, inclusive transparência total e semitransparente.
- Separar testes de **posição da boca**, **limpeza da boca anterior**, **oclusão por cabelo**, **borda alpha**, **piscada/fala**, **transição** e **paridade Turbo/seguro**.
- Medir quantidade de pixels alterados **fora da região real da boca**: objetivo visual é não alterar pele/cabelo ao falar, salvo efeitos expressamente ligados à boca. Não editar os olhos para encobrir problema de boca.
- Comparar região de tela e PNG final nas mesmas dimensões 720p/1080p; inspecionar MP4 decodificado com tolerâncias de H.264 separadas da composição RGBA.
- Provar ganho/custo: área de atlas, número de `getImageData`, tamanho de payload, PNG/encode, buffers RGBA, tempo de preparação e `faceCompositionMs`. Não prometer ganho 10× antes de medir.
- **Executar a troca de renderizador só quando o isolamento da peça preservar ou melhorar os pixels visuais em todas as variantes relevantes**. Não usar máscara cromática aproximada, crop retangular menor sem limpar a boca anterior, nem substituir `putImageData` por `source-over` sem testar pixels alpha que devem ser apagados.

**Critério final:** só a boca aparenta mudar de tamanho/forma, nenhuma moldura/recorte de pele ou cabelo segue o movimento, sem perda de blink, pose ou boca obrigatória em MP4. Não adicionar animação de cabelo à prévia normal do Editor V6.

## 3B. PRIORIDADE DE DESEMPENHO P0 — crescimento de RAM na exportação

**Relato do usuário:** durante exportação longa, a RAM total usada pelo aplicativo parece só aumentar. Isto exige investigação dos processos individualmente, antes de decidir se há leak, cache legítimo, aquecimento de buffers, memória de GPU, commit do Windows ou atividade temporária do FFmpeg. **Mais RAM no monitor de tarefas, isoladamente, não comprova um vazamento.**

### Correção inicial já publicada nesta rodada

- O `exportWorker.tsx` inseria **toda composição facial gerada a cada quadro** em `assetsById`, mapa persistente durante o worker. Esse mapa podia manter todos os PNGs faciais mesmo depois da expulsão pelo cache LRU limitado de `sceneFaceComposition.ts`. Agora **assets temporários de rosto e cabelo ficam apenas no registro do quadro**; o mapa durável retém assets do projeto e atlas de transição explicitamente reutilizáveis.
- A separação está em `exportFrameAssets.ts` e seu teste `tests/editor-v6/exportFrameAssets.test.ts`, que cobre mil quadros sintéticos e o reuso de IDs com isolamento de escopo. Isso testa o contrato de retenção **não** o RSS real.
- `composeMotionHairFrame` criava um canvas nativo de resolução cheia para cada quadro durante troca de pose. Agora utiliza **um canvas scratch reutilizável**, limpa a superfície a cada uso, redimensiona apenas quando necessário e libera os canvases no encerramento do worker.
- A física de cabelo calculava duas vezes `resolveEditorV6SceneAtFrame` por amostra/cabeça; agora reutiliza a cena já resolvida. O ganho deve ser **medido**, não presumido.
- **Status:** alterações de código publicadas, regressão de escopo criada, teste Electron/FFmpeg completo e benchmark de RAM ainda **pendentes de CI/execução**. Não afirmar que parou de crescer até confirmar em uma exportação longa.

### Próxima investigação de memória — medições por processo

1. Criar fixture **sintético** com exportação 30 s / 2 min / 5 min; três níveis de complexidade (1/4/8 personagens, fala e cabelo ativados/desativados, transições e mídia), 720p/1080p, 1 vs 2 workers e Turbo/seguro.
2. Amostrar a cada intervalo fixo, em formato **agregado e sanitizado**: RSS/working set e private bytes do Main, renderer de export, processo GPU e FFmpeg; JS heap quando viável, contagens de caches, número de canvases/texturas e bytes de imagens temporárias. Registrar baseline de warm-up, curva, pico, após cancelamento, após finalizar e após fechar janela. Indicar métricas indisponíveis sem inventar VRAM.
3. Distinguir **retenção persistente** (curva monotônica com quadros), **platô de cache** (sobe e estabiliza), **picos por transição**, **fragmentação/alocador** e **buffers de renderização já liberados mas ainda reservados pelo SO/Chromium**.
4. Perfilar alocações e copies de `canvas.toDataURL('image/png')` por quadro, strings Base64, `Image.decode()`, `getImageData/putImageData`, superfícies intermediárias, atlas facial, malha GPU, `capturePage` e pipes de bitmap para FFmpeg. Verificar se algum Map/Set/Promise/listener retém assets fora de prazo.
5. Considerar **Blob/Object URLs com `URL.revokeObjectURL`**, `ImageBitmap.close()`, canvas offscreen e buffers transferíveis, **somente** com ciclo de vida definido, segurança de origem/IPC e pixel tests; tratar perdas de alpha e latência de GPU readback.
6. O exportador já faz envio de quadros ao FFmpeg em fluxo; **não enviar indiscriminadamente toda a RAM para swap/disco**. Arquivos temporários/proxies podem diminuir retenção de dados persistentes, mas podem piorar desempenho, fazer I/O excessivo ou ampliar o uso de espaço. Adotar apenas streaming/backpressure/caches limitados com benchmarks; nunca substituir imagens originais nem persistir dados privados em diretórios de testes.
7. Criar report por export com **pico e platô** medidos, `hairCompositionMs`, `faceCompositionMs`, custo de captura e encerramento de recursos. Relatório local em Logs Dev com códigos sanitizados e amostras de agregados, sem payloads de projetos.

**Critério:** sob fixture fixa, o uso de memória **não cresce indefinidamente com o número de quadros** após aquecimento; o renderer e seus recursos terminam corretamente no sucesso, falha e cancelamento. Manter desempenho e qualidade visual. Benchmarks com o usuário jogando são **sob carga concorrente**, com repetições e sem conclusões definitivas de ganho.

## 4. P1 — sincronismo real de áudio, vídeo, fala e timeline

**Maior oportunidade técnica identificada para qualidade de edição cotidiana.**

O código possui relógio monotônico por frame, mas vídeo e áudio usam `currentTime` e limiares separados (vídeo próximo a 0,18/0,25 s; áudio próximo a 0,18 s). Em 30 FPS, 0,18 s equivale a cerca de **5,4 quadros**, mas isso é apenas tolerância de correção; **não demonstra drift real**. Não trocar esse mecanismo sem medir primeiro.

### Etapa de medição

- Criar fixture de 60–120 segundos com vídeo sintético que estampe índice de quadro, cliques/tons de áudio em frames conhecidos, cortes, pausas e seek aleatório.
- Medir relógio lógico, `HTMLVideoElement.currentTime`, `requestVideoFrameCallback` (`metadata.mediaTime`, `presentedFrames`, `expectedDisplayTime`) e pontos de mixagem/áudio observáveis.
- Registrar p50/p95/p99 do desvio em frames e contagem de apresentações omitidas, com limitação explícita da instrumentação de áudio e compositor.
- Medir ao iniciar/reiniciar, após long tasks, em clipes com áudio e vídeos sobrepostos, com vídeo local e referenciado pela Base; tempo de edição longo.
- Preservar políticas de muting por clipe/faixa e zero áudio duplicado de vídeo.

### Evolução condicionada à medição

Uma coordenação de mídia por fonte de tempo única é **hipótese de solução**, não tarefa de reescrever tudo. Testar integração por clocks, seek com `seeked` e `requestVideoFrameCallback` para saber **qual quadro foi efetivamente apresentado**. Não forçar seek por frame se prejudicar decode e causar engasgos. Instrumentação deve ficar opt-in e sanitizada, com resultados acessíveis em Logs Dev.

**Critério:** com a mesma fixture, menos drift/frames inconsistentes sem regressão na fluidez nem na exportação. Não exigir precisão física absoluta que Chromium não garante.

## 5. P1 — timeline que acelera o trabalho de verdade

A timeline **já tem** divisão, duplicação, magnetismo, zoom, Fit, bloqueio e atalhos. Não reconstruir essas funcionalidades.

**Propostas de alto retorno, sujeitas a validação visual/uso:**

1. **Waveforms de áudio derivadas** para ver pausas e sincronizar falas; usar cache descartável por revisão da mídia, sem alterar bytes originais. Não decodificar áudio inteiro a cada render; medir memória.
2. **Miniaturas de vídeo em clipes** com poucas amostras, cache de tamanho limitado e cancelamento; preservar ordem e crop.
3. **Operações em múltiplos blocos** (seleção múltipla, arraste relativo, duplicação em grupo) com undo atômico e respeito a faixas bloqueadas/vínculos de balões; validar contrato de overlap.
4. **Controles contextuais mais rápidos**: navegação de fala ↔ personagem, indicadores de mídia ausente, seleção de um trecho de exportação usando In/Out sem modificar o documento.
5. **Feedback da timeline**: exibir loading, recorte original, duração visível e snapping com precisão de frame; mensagens acessíveis e não intrusivas.

Priorize um protótipo ou uma primeira fatia pequena de waveform/miniaturas antes de construir multi-seleção. Validar ergonomia e efeitos em projetos grandes; não transformar a timeline em uma cópia de um NLE profissional.

**Métrica de sucesso de produto:** número de ações, tempo para sincronizar uma fala de 30 s, tempo para localizar um corte e taxa de erros de arraste. "10× melhor" pode vir de menos passos manuais.

## 6. P1 — exportação previsível e acessível

### Pré-checagem somente leitura antes de exportar

Criar proposta de **preflight** sobre as validações já existentes para comunicar, antes de gastar processamento:
- Projetos com assets/arquivos ausentes e referências quebradas.
- Fontes, faces/atlas, mouth-loop e animações de pose pendentes.
- Codecs/mídias sem suporte detectado; não presumir que `canPlayType` assegura desempenho.
- Intervalo, fps/resolução válidos, duração/áudio e superfície de exportação.
- Disponibilidade de FFmpeg/FFprobe, codificador e espaço temporário estimado **com limites claros de confiabilidade**.
- Cabelo opt-in: preset salvo, referências, orçamento e preparação; não pré-compor tudo apenas para mostrar checklist.

O resultado deve explicar **ação corrigível** ou "indisponível para verificar" em vez de um painel que finge garantir uma exportação perfeita. Falhas definitivas impedem início; avisos permitem escolher.

### Experiência de exportação

- Melhorar resumo de etapas (preparação → captura → vídeo → áudio → validação → publicação), tempo medido e cancelamento.
- Pré-configurações locais de 720p/1080p e intervalos de exportação, sem alterar formato do documento sem demanda.
- Explicitar Turbo/fallback, codec usado e integridade do destino anterior.
- Erros de exportação em Logs Dev com códigos curtos e **sem** caminho/ID/mídia sensíveis.
- Comparações reais de fotogramas de entrada, emenda e último quadro; continuar testes de mouth/talk, facial, vídeo sobreposto e cabelo no export.

**Não habilitar 60 FPS ou 4K automaticamente.** A arquitetura, atlas/tempo absoluto, física 120 Hz, memória e H.264 precisam de uma proposta de contrato e testes próprios antes de ampliar esse escopo.

## 7. P2 — prévia pesada e projetos grandes

O histórico de stress de 26/10 apontou long tasks e picos isolados de React/compositor; métricas de RAF/DOM não demonstram todos os frames fisicamente apresentados. Atualizar a medição após V3 com fixture idêntico.

- Capturar trace CDP, commits React e Long Tasks correlacionados em timestamps, sem profiling permanente em builds normais.
- Medir abrir projeto, seek 0→último→meio, scroll/zoom da timeline, adicionar e arrastar personagens, carregar vídeo e alternar painéis.
- `EditorV6Page.tsx` ~65 KB é **orquestração**, não prova de monólito prejudicial. Extrair apenas lógica com fronteira/lifecycle demonstráveis; não criar hooks vazios para reduzir contagem.
- Medir o custo do PNG `toDataURL` por quadro de cabelo, imagens decodificadas, cópias Base64 e captura GPU→CPU antes de mudar pipeline. Avaliar `ImageBitmap`, `OffscreenCanvas` ou superfície transferível **somente** se o bridge IPC e os testes permitirem.
- Avaliar proxies **opt-in** para vídeos pesados após demonstrar gargalo de decode; nunca substituir original nem exportar silenciosamente a partir do proxy.
- Monitorar recursos de WebGL, workers, áudio e mídia no cancelamento e troca de projeto.
- Benchmarks podem usar a capacidade máxima do PC enquanto o usuário joga; marcar as medições como **sob carga concorrente não controlada**.

## 8. P2 — produtividade criativa e evoluções futuras

**Para discussão de produto, sem execução automática antes de escolher escopo.**

- Catálogo de **templates de cena** (abertura, diálogo, corte, fundo), independente da biblioteca de personagens. Criar/duplicar a partir de defaults sem alterar projetos antigos.
- Presets de posicionamento de balões e falas com controle visual rápido.
- Favoritos de poses/expressões e acesso contextual do personagem na timeline, sem duplicar catálogos do Fabricador.
- Pequenas melhorias de Inspector: campo editável de duração por frames/segundos, agrupamento de ajustes, indicação clara de autossalvamento/erro, "desfazer" previsível.
- Histórico de jobs e relatórios exportados com **somente metadados locais e sanitizados**, sem telemetria externa.
- Projeto portátil/importação/exportação, guardas de assets faltantes e revisão de compatibilidade como proposta futura, não migração agora.
- Resolução/qualidade de YouTube maior, 60 FPS, proxies, render em segundo plano independente do app e múltiplos encoders são **projetos separados** que precisam de design, orçamento e aceitação, não extras escondidos em um prompt.

## 9. Ordem recomendada de execução

| Ciclo | Dependência | Objetivo | Saída mensurável |
| --- | --- | --- | --- |
| **E0 — CI e aceite** | Imediato | Confirmar ajuste Linux de nomes de arquivo; restaurar FFmpeg pinado; passar mp4/hair/export hospedado; revisar clipe de cabelo real | Run verde no HEAD, checklist real de cabelo |
| **E1 — boca isolada e RAM** | E0 | Prototipar boca como camada própria com cobertura alpha/oclusão; auditar pico/platô de memória e corrigir retenções remanescentes | RGBA sem moldura, quadros faciais preservados, curva de memória por processo |
| **E2 — sincronismo A/V** | E0; pode seguir em paralelo ao estudo da boca | Instrumentar video frames apresentados e drift áudio/vídeo, medir e corrigir apenas causas provadas | Fixture de longo prazo + relatório de p95/p99 + regressões |
| **E3 — produtividade da timeline** | E2 pode ser paralelo no design | Waveforms/miniaturas, depois seleção múltipla se for útil | Protótipo/teste real de usabilidade + undo/snap correto |
| **E4 — exportação profissional** | E0 e resultados E1/E2 | Preflight, mensagens recuperáveis, progresso e compatibilidade mídia | Erro antecipado com ação corretiva; PNG/MP4/FFprobe válidos |
| **E5 — fluidez e produto** | E1–E4 | Benchmark real, caches/proxies condicionais, templates/presets aprovados | Comparações sob cenário idêntico e menos passos para produzir uma cena |

**Próximos tickets:** (1) recuperar o FFmpeg LGPL pinado/validado e confirmar a CI completa; (2) fazer aceite artístico do cabelo em MP4; (3) medir RAM numa exportação longa e conferir a correção de retenção por quadro; (4) construir fixture e protótipo isolado da boca — sem moldura de pele/cabelo; (5) iniciar sincronismo A/V depois das prioridades visuais e de memória.

## 10. Contratos, referências e aceite

- O cabelo continua **somente no MP4 exportado**; não colocar animação no playback interativo.
- Preservar 30 FPS, 720p/1080p, boca automática em fala, blink, pose/expressão, paletas, roupas, assets legados, áudio, vídeo, Turbo e modo seguro.
- Preservar origem de arquivos e IDs: Base é dona da mídia compartilhada, Customizador das instâncias, Fabricador dos catálogos e Editor V6 dos documentos.
- Preservar dados privados, backup, transações, cancelamento e destino de MP4 em falha.
- Priorizar testes em Electron/Windows e perfis sintéticos isolados. Não chamar CI de verde até executar no commit publicado.
- Não fazer reescrita tecnológica, migração destrutiva, alteração de branch ou publicação por um Codex local sem autorização explícita posterior.

**Fontes técnicas (verifique compatibilidade da versão instalada):**
- [Electron — offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [capturePage](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts) e [performance](https://www.electronjs.org/docs/latest/tutorial/performance).
- [MDN — requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback): `mediaTime` / `presentedFrames`, mas **sem garantia rígida** de sincronismo físico.
- [React — startTransition](https://react.dev/reference/react/startTransition), [Profiler](https://react.dev/reference/react/Profiler): usar apenas quando medições confirmarem benefício; input controlado não pode ser uma Transition.
- [FFmpeg — concat demuxer](https://ffmpeg.org/ffmpeg-formats.html#concat-1), [FFprobe](https://ffmpeg.org/ffprobe.html) e [FFmpeg FAQ](https://ffmpeg.org/faq.html): streams compatíveis, timestamps e contagem de frames.
- [MDN — Media Capabilities](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API): capacidade/suavidade de decode como sinal, não garantia absoluta.

Este documento contém **propostas priorizadas**. A implementação deve ser incremental, rastreada em commits pequenos e validada com testes de regressão, capturas visuais e uso real antes de declarar sucesso.
