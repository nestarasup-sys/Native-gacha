# CODEX — EDITOR V6 · RODADA 05 / ACELERAÇÃO AGRESSIVA E COMPROVADA
## Meta do usuário: exportar 10 segundos do projeto "Editor V6 06" em 10–15 segundos, cabelo Preset 2 ativo

**Status:** prompt de implementação contínua para Codex, após a [Rodada 04](RODADA_04_V4_ACELERACAO_EXPORT.md).  
**Repositório:** `nestarasup-sys/Native-gacha`. **Única branch local:** `Dev-V2`.

## 1. Missão e autonomia

Você é o engenheiro principal responsável pelo desempenho **ponta a ponta** da exportação do Editor V6, incluindo a origem dos personagens no Fabricador/Customizador, geração de snapshots/atlas, preparação facial e de cabelo, captura, composição de vídeo, codificação, áudio, validação e publicação.

**Dado observado pelo usuário:** `Editor V6 06`, dois personagens, poucas ações, animação experimental de cabelo **ligada no Preset 2**, aproximadamente **65 s para um MP4 de 10 s**. A meta é **10 s**, aceitando **até 15 s** inicialmente, no **mesmo computador e nas mesmas configurações de vídeo**. Os 300 quadros a 30 FPS devem continuar presentes. A meta demanda cerca de **4,3×–6,5×** de redução total, mas não há garantia de viabilidade com a arquitetura/hardware atual. Você deve **perseguir essa meta com autonomia, investigar alternativas arquiteturais e testar iterativamente**, nunca afirmar que ela foi alcançada sem o MP4 real completo e validado.

**Não pare depois da primeira otimização**, nem finalize apenas com plano ou benchmark sintético. Faça uma sequência de experimentos relevantes, preserve somente alterações comprovadas e seguras, continue até atingir a meta ou encontrar um bloqueio técnico demonstrável que precise de decisão explícita do usuário. Documente ganhos parciais e a próxima opção arquitetural se o limite persistir. Se houver limite de sessão/contexto, deixe um checkpoint reproduzível e retome quando possível; não declare falsamente que trabalhou em segundo plano.

Você pode pesquisar internet, documentação oficial, issues dos mantenedores, bibliotecas e codecs, baixar ferramentas confiáveis e utilizar intensamente CPU/GPU/RAM. **Nunca baixar/rodar binário desconhecido ou sem conferência de procedência e integridade**, substituir instalações pessoais silenciosamente nem enviar projetos particulares para serviços externos. Preserve backup, licença e compatibilidade.

## 2. Regras absolutas de Git e de dados

- Confirme `git branch --show-current`, HEAD, `git status` e `AGENTS.md` antes de tocar no código.
- **Só a branch local `Dev-V2`**; não criar branch nova, não mexer em outra branch, não fazer push, PR, merge, rebase, reset destrutivo ou clean. Commits locais pequenos com diff/testes revisados.
- O trabalho da Rodada 04 já foi publicado no GitHub pelo usuário/orquestrador; **não reimplementar nem descartar** alterações existentes.
- O projeto **Editor V6 06** é do usuário. Você está autorizado a usá-lo **para medir exportação**, mas não a editá-lo como fonte de teste. Localize o documento pelo título/ID e faça uma **cópia completa, verificada e imutável** em pasta de testes isolada, com referências de mídia, personagens, Fabricador e presets locais necessários. Não use o perfil/app-data vivo durante stress; não apague nem substitua MP4, assets, backups ou cache pessoal.
- Use pastas de saída separadas com nomes de experimentos. Preserve hashes/manifest de entrada e nunca publique mídias, nomes, caminhos absolutos, log de conteúdo privado ou frames reais no GitHub/CI. A CI pode receber apenas fixtures e relatórios sintéticos sanitizados.
- Preservar projetos antigos, IDs, IPC, SQLite/arquivos, falas, poses, corpos, cabelo, cores, mouth-only, transições, áudio e recuperações.
- **A animação de cabelo continua exclusivamente no MP4 exportado**, quando ligada no modal; **proibido ativá-la na prévia/playback/viewport normal do Editor V6**. A prévia do Fabricador DEV permanece para editar presets.

## 3. Leia o histórico e não repita experiências rejeitadas

Antes de executar:
- `docs/editor-v6/RODADA_04_V4_ACELERACAO_EXPORT.md`.
- `docs/editor-v6/PLANO_ACELERACAO_EXPORT.md` (histórico de A/B, caches, preparação de boca e riscos).
- `docs/editor-v6/RODADA_02_V4_BOCA_CABELO_RAM.md`.
- `docs/editor-v6/RODADA_03_V4_CABELO_ESPELHAMENTO_FASE.md`.
- `docs/editor-v6/EXPORTACAO.md`, `PREPARACAO_TRANSICOES.md`, `ROADMAP_V4_EXCELENCIA.md`, `DESEMPENHO_E_FLUIDEZ.md`, `ARQUITETURA_E_INTEGRACAO.md`.
- Código e testes em `electron/domains/editorV6/`, `src/renderer/src/features/editorV6/`, `src/renderer/src/characters/`, `src/shared/`, contratos Fabricador/Customizador e scripts/harnesses `scripts/editor-v6/`.

O plano histórico documenta casos que **não podem ser repetidos cegamente**:
- Substituir `capturePage()` diretamente pelo evento `paint` produziu frame zero vazio, mesmo com vídeo formalmente válido.
- Remover esperas do compositor sem protocolo de imagem pronta produziu fundo preto, blink divergente ou frames antigos. A Rodada 02 removeu **uma espera especificamente redundante** com teste RGBA; isso não legitima retirar outra.
- Aumentar de 1 para 2 workers ajudou certas cenas, mas em projetos grandes elevou RAM e gerou mudanças no tamanho dos atlas e diferenças com encoders de hardware. Não forçar mais workers como solução universal.
- Usar `-quality speed` no AMF não trouxe ganho comprovado no teste citado.

**Rodada 04 já aplicada:**
- `electron/domains/editorV6/exportCaptureBitmap.ts` lê o bitmap BGRA uma única vez e valida o token + copia a cena, evitando `NativeImage.crop().toBitmap()` por quadro; `exportWorkers.ts` usa esse caminho. `tests/editor-v6/exportCaptureBitmap.test.ts` compara bytes e rejeita frames antigos. **Meça custo real, cor/nitidez e paridade Electron antes de alegar ganho.**
- `tests/editor-v6/exportIpcLifecycle.test.ts` corrige fixture `poseSlot: null` após a CI anterior falhar em Windows/Linux sem atingir MP4.
- `src/shared/editorV6Export.ts` fornece `EDITOR_V6_ENCODER_CHOICES` tipado, consumido por `EditorV6ExportPanel.tsx`; CPU envia `cpu` (não `libx264`, antes inválido). Testes impedem regressão.

## 4. Baseline obrigatória — exatamente o projeto Editor V6 06

**Não pule esta etapa e não use apenas projeto sintético**. Se a cópia do projeto pessoal não puder ser localizada por meios seguros, não invente tempos; trabalhe com fixture sintético representativo e registre explicitamente que o alvo real permanece pendente. Peça acesso somente se indispensável e depois de explorar o perfil local autorizado.

- Confirme um trecho de **10 s / 300 quadros** com **dois personagens, cabelo ativado, Preset 2 lido do localStorage verdadeiro**. Salve o fingerprint do preset (hash sanitizado), sem expor valores/identificadores pessoais.
- Use **a mesma resolução, encoder, Turbo/seguro, início/fim, áudio/vídeos e condições** do export que levou ~65 s. Não converter silenciosamente 1080p para 720p, desativar cabelos nem usar outra compressão.
- Meça **do clique Exportar ao MP4 final publicado e validado**. O preparo de cabelo em `editorV6HairMotionPreparation.ts` acontece **antes de `startEditorV6Export`** e pode ficar fora do `report.milliseconds` do Main; instrumente o tempo separado `preparoHairAntesDoJobMs` sem acrescentar dados privados ou modificar schema persistido. Inclua escolha de arquivo quando comparável, ou isole esse custo humano de modo claramente identificado.
- Faça ao menos **3 repetições por configuração**, em ordem alternada quando possível; diferencie **cache frio/aquecido**. Não destrua cache pessoal para fabricar frio: use cópias controladas de cache dentro do sandbox.
- Registre: versão do Electron/Node/FFmpeg, GPU/driver, CPU, RAM livre, resolução, opções, encoder **realmente selecionado**, FPS do vídeo, quantidade de quadros, blend de áudio, número de workers, hits/misses de cache, transições e assets.
- Extraia do relatório `phaseMilliseconds` (`temporarySetup`, `characterLoading`, `motionPreparation`, `encoderProbe`, `rendering`, `finalization`, `publication`) e, por parte, `frameTiming` (`workerStartupMs`, `sceneResolutionMs`, `faceCompositionMs`, `hairCompositionMs`, `hairMotionPrewarmMs`, `hairPngEncodeMs`, `hairPngDecodeMs`, `assetPreparationMs`, `reactCommitMs`, `rafWaitMs`, `ipcDrawMs`, `captureMs`, `ffmpegWriteMs`, `ffmpegFinalizeMs`). Descreva p50/p95 e amostras.
- Meça RSS/privado Main, renderizador(es), GPU, FFmpeg e eventuais subprocessos quando permitido. Some tempos concorrentes somente com interpretação de sobreposição; **o tempo total real é relógio de parede**, não soma de fases por worker.
- Registre **FPS efetivo ponta a ponta** (300 dividido pelo tempo total), FPS de desenho e tempo de preparo, encoding e validação. A meta exige **20 a 30 FPS ponta a ponta** no projeto fixo.
- O usuário informou anteriormente que não estava jogando, mas verifique carga concorrente no momento do teste; pode usar plenamente os recursos do computador. Não inventar condição controlada de laboratório.

## 5. Ciclo de experimentos — autonomia orientada pelo gargalo

Após classificar as três maiores parcelas de **tempo de parede recuperável**, execute **um experimento pequeno por vez**. Para cada: hipótese, mudança, teste de pixels/MP4, medição A/B fria/quente, consumo por processo, conclusão de manter ou reverter. Não empilhe alterações cegamente.

### A. Preparação e dados vindos de outras áreas

Investigue de Fabricador → Customizador → Editor V6:
- Re-renderizações de corpo/roupa/face/pose/cabelo sem mudanças.
- Reconstrução de snapshots, tintas, recortes, textura WebGL, decomposição de cabelo e atlas.
- Geração redundante de base, face, sombra, mouth-only, frente/trás, thumbnail e dados auxiliares.
- Releitura de catálogos, imagens e mídias; conversões PNG/dataURL/Blob ao atravessar IPC.
- O `prepareHair` anterior ao job e as transições faciais/corporais.
- Caches por fingerprint **com invalidação rigorosa**, reaproveitamento de bases/poses sem persistir dados pessoais num cache global indevido e sem ampliar carga do Main.
- Cálculos por frame que poderiam ser resolvidos **por personagem, pose ou mudança de estado**, com key contendo pose, flips, escala, cores, corpo/roupa/cabelo, ativos e versão.

**Proibido** congelar cabelo de um quadro para outro ou remover boca/piscadas, apenas para reutilizar bitmap. Prefira cache de camadas estáticas e composição de camadas dinâmicas.

### B. Renderização e composição quadro a quadro

Perfil detalhado do `exportWorker.tsx`, `SceneSurface`, `sceneFaceComposition` e malha de cabelo.
- Evitar commit React completo ou reparse de cena e imagens se apenas cabelo/boca mudou.
- Prototipar composição parcial no mesmo canvas/superfície, mantendo z-index, cabelo atrás/frente, transparência e `motionSprite`.
- Reduzir PNG temporário, `toBlob`, encode/decode de cabelo e roundtrip para `Image` **se** houver caminho de superfície direto com lifetime seguro.
- Reutilizar texturas, buffers, atlas e contextos WebGL com limites, sem travar a GPU ou produzir listras brancas.
- Reaproveitar frame/área de **fundo** estática e evitar captura dupla de camada, quando a composição de mídias realmente permitir.
- Não sacrificar 30 FPS, resolução nativa, tempo absoluto do cabelo, boca obrigatória ou suavidade das transições.
- Manter limites de memória e descarte correto em sucesso/erro/cancelamento.

### C. Captura Chromium/Electron → BGRA

O frame passa por `executeJavaScript`, token de compositor, `capturePage`, bitmap, cópia de linhas e pipe BGRA.
- Meça se a Rodada 04 reduziu `captureMs`/alocações.
- Compare output **RGBA/BGRA** e MP4 real em **primeiro quadro**, quadro de boca, movimento de cabelo, emenda, troca de pose e último quadro. Nunca aceitar frame vazio ou atrasado.
- Avalie arquitetura de renderização sem DOM/React por quadro, `OffscreenCanvas` e `ImageBitmap` quando compatíveis.
- Pesquise `webPreferences.offscreen.useSharedTexture` apenas como hipótese: **a documentação do Electron exige integração nativa para importar a textura**, não é um switch que faz FFmpeg aceitar GPU zero-copy. A implantação precisa de ciclo de vida, readback, Windows driver, formato BGRA/RGBA, alpha, falhas de contexto e validação. Prototipar em fixture isolado antes de trocar pipeline.
- Não remover o token, timeout, cancelamento ou fence para “acelerar” com frames errados.

### D. FFmpeg e fluxos de áudio/vídeo

- Descubra se o FFmpeg **fica esperando quadros** ou se encoding limita a vazão; `ffmpegWriteMs` sozinho não mostra todos os custos de GPU/CPU.
- Compare encoder de hardware/CPU com mesmos parâmetros e **qualidade equivalente**; validar imagens, SSIM/PSNR/VMAF se aplicáveis e artefatos visuais em cabelo fino/contornos.
- Não aumentar B-frames, mudar bitrate ou preset silenciosamente: isso pode alterar paridade, concatenação, compatibilidade ou nitidez.
- Verifique por que o projeto usa `layeredVideo`, se codifica 2 camadas empilhadas e os filtros de overlay, e se ocorre work adicional quando não há mídia sobreposta.
- Preserve áudio, mix, concat, validação final, destino anterior em falha e backpressure.
- Compare 1/2 workers e reuso de workers **conforme RAM e GPU**, não apenas throughput sintético.

### E. Arquiteturas maiores, se necessário

Se o caminho de Chromium por frame tiver limite comprovado e melhorias incrementais não chegarem perto de 15 s, prepare um **spike pequeno e reversível**:
1. Renderização de camadas estáticas uma vez + atualização dedicada apenas dos componentes dinâmicos, com compositor offscreen otimizado.
2. Rasterização direta de cena para BGRA em worker de render próprio, sem roundtrip pelo DOM, mantendo preview e export separados.
3. Pipeline GPU/textura compartilhada com adaptador nativo, apenas se for tecnicamente compatível com Electron/Windows e demonstrar benefício significativo.
4. Cache de quadros/composição com fingerprint incluindo o estado físico absoluto de cabelo, se houver frames realmente idênticos.

Não reescreva o app inteiro nem introduza engine nova sem um benchmark curto mostrando **paridade visual e redução real do tempo total**. Se a próxima arquitetura exigir alteração irreversível/stack fundamental, documente alternativa e peça aprovação, em vez de assumir risco desnecessário.

## 6. Testes e critérios de aceitação

Execute os scripts realmente existentes no `package.json` quando pertinentes:
- `npm run audit:architecture`, `npm run typecheck`, `npm run test:editor-v6`, `npm run build`.
- `npm run test:editor-v6:hair-motion` e `npm run test:editor-v6:hair-motion-export`.
- `npm run test:editor-v6:combined-hair-mouth-memory`.
- `npm run test:editor-v6:face-export-silent`, `npm run test:editor-v6:export` e `npm run test:editor-v6:export-overlay`.
- Suites de Customizador/Fabricador que atendem produção de assets para V6, conforme código modificado.

**Preserve a CI em Windows/Linux**, inclusive o teste de `poseSlot` atualizado pela Rodada 04. Não enfraqueça schemas para passar tests.

Critérios obrigatórios por mudança:
- Documento de entrada, assets e bytes originais imutáveis; output em sandbox.
- 300 frames a **30 FPS** no MP4; mesmas dimensões, música/áudio, fala, blink, cabelo preset 2, fase/flip/pose/transição, vídeo/foreground, sem quadrados/halos/listras.
- PNG RGBA/BGRA idêntico quando a mudança deveria preservar pixels exatamente; para H.264, tolerância fundamentada devido à compressão, com atenção a amostras difíceis e baseline antes/depois.
- Cancelamento, fallback Turbo→seguro, reabertura, isolamento IPC, safe publication e memória limitada.
- Export de projeto real **em ≤15 s** somente se comprovado por relógio de parede, **incluindo preparação anterior ao job, encoding, áudio, verificação e publicação**. Meta ideal ≤10 s. Reportar mediana/melhor/pior, não apenas a melhor execução isolada.
- Se a meta falhar, registrar qual etapa ainda consome os segundos e quanto poderia ser recuperado em arquitetura alternativa; não reduzir qualidade ou mascarar tempo de preparação.

## 7. Acompanhamento e documentação

Crie/atualize:
- `docs/editor-v6/RODADA_05_V4_ACELERACAO_EDITOR_V6_06.md` (resultados verdadeiros, sem conteúdo privado).
- `docs/editor-v6/PLANO_ACELERACAO_EXPORT.md` e `ROADMAP_V4_EXCELENCIA.md` somente onde houver evidências novas.
- `docs/editor-v6/EXPORTACAO.md` se o pipeline/conveniências do usuário mudarem.
- Testes, scripts e fixtures sintéticas para qualquer bug ou otimização integrada.

Registre por rodada local: HEAD, opção, condições, `cache frio/quente`, `preparoHairAntesDoJobMs`, fases, mediana/p95 de frames, encoder, total/300 quadros, picos de memória, hash do baseline, vídeo/áudio/frames de teste, ganhos, regressões, commits e pendências. Não expor no GitHub IDs ou informações do projeto pessoal.

**Início imediato:** atualize a `Dev-V2` local, leia o histórico, execute a baseline do projeto real autorizado, identifique o gargalo principal e implemente o primeiro experimento validado. Continue autonomamente de acordo com evidências.

**Não criar outra branch. Não fazer push/PR/merge. Não apagar dados. Não animar cabelo na prévia normal. Não alegar 10–15 s sem o vídeo final validado.**
