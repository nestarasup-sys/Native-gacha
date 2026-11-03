# CODEX — REFATORAÇÃO GERAL V3 · QUALIDADE VISUAL, CONTINUIDADE E CONSOLIDAÇÃO

> **Documento executável para Codex.** Revisão de 2026-11-03. Trata-se da continuação incremental da V1/V2 e das mudanças de produto posteriores, não de uma reescrita. **Prioridade imediata: corrigir visualmente o motor experimental de cabelo do Editor V6 e restaurar a CI.**

## 1. Contexto e escopo

Repositório: **nestarasup-sys/Native-gacha**. Única branch autorizada: **Dev-V2**.

Referência inicial da auditoria do orquestrador: **491a4ea6cb7bf816bf6b421a4342862b56afb3f3**. Esse SHA é uma fotografia: confirme o HEAD local antes de trabalhar e não descarte commits posteriores. O estado da execução hospedada de referência é [GitHub Actions #41623161063](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41623161063).

Leia obrigatoriamente, antes de editar:
- **AGENTS.md**.
- **docs/architecture/AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md**.
- **docs/architecture/PROGRAMA_REFATORACAO_GERAL_NATIVE_GACHA.md**.
- **docs/architecture/PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md**.
- **docs/architecture/ADR-001-modular-electron.md**, **ADR-002-fluxo-personagens.md** e **CHARACTER_PRODUCTION_CONTRACT.md**.
- **docs/editor-v6/EXPORTACAO.md**, incluindo a seção sobre defeitos experimentais de cabelo.
- Contratos, testes, código e documentação dos outros módulos afetados.

Desde a baseline V2 houve **71 commits** publicados até o SHA de referência: V2 de Logs Dev, extrações de Fabricador, sistemas de juntas/corpo, roupas, chroma, espelhamento, sapatos, ajustes de rosto no V6 e o novo motor de animação de cabelo. Não confunda as verificações executadas *antes* dessas mudanças com aprovação de tudo que veio depois.

**Objetivo geral:** corrigir os defeitos de qualidade e regressões, conferir a integridade das alterações posteriores à V2, refatorar somente onde ainda houver problemas demonstráveis e consolidar a aplicação inteira. Autonomia técnica para executar as tarefas e decisões rotineiras, sem esperar um prompt por cada módulo.

### RESTRIÇÃO DE PRODUTO — ANIMAÇÃO DE CABELO EXCLUSIVA DO EXPORT

**Decisão expressa do usuário: NÃO implementar, ativar, simular ou mostrar animação de cabelo na prévia normal/interativa do Editor V6. O movimento de cabelo deve existir SOMENTE nos quadros do MP4 durante a exportação, quando o usuário ativar a opção experimental.**

- O viewport, timeline, reprodução, seek e cenas em edição no Editor V6 devem continuar exibindo o personagem sem animação dinâmica de cabelo. Não adicionar toggle de preview, loop de física no playback nem camada dinâmica ao `SceneSurface` interativo.
- É permitido usar o renderizador offscreen oculto do EXPORTADOR e seus testes/capturas para validar a geometria e os pixels do vídeo. Essas capturas **não são** a prévia normal do editor.
- É permitido reutilizar a malha WebGL e a física da prévia de **Fabricador DEV → Animação cabelo DEV** como referência ou código de renderização para o worker de exportação. Preserve a prévia de desenvolvimento do Fabricador; não a transporte para o viewport do Editor V6.
- A exigência de continuidade de cabelo *durante trocas de pose* refere-se exclusivamente aos quadros exportados, não à reprodução interativa no Editor V6.
- Não transformar a correção de cabelo em uma tarefa de paridade visual do cabelo entre a prévia interativa do Editor V6 e a exportação. **Somente o MP4 deve receber o efeito.** Qualquer mudança futura nesse requisito depende de autorização explícita do usuário.

## 2. Regras de Git, segurança e dados

- Trabalhe somente **localmente na Dev-V2**, sem criar outra branch, checkout de outra branch, push, PR, merge, rebase ou force-push.
- Verifique root, branch, HEAD e git status antes de qualquer alteração. Preserve modificações locais e commits preexistentes; nunca execute reset/clean destrutivos.
- Faça commits locais pequenos e temáticos depois das validações pertinentes. **Publicação remota precisa de autorização posterior explícita do usuário.**
- Preserve projetos, personagens, catálogos, IDs, nomes de canais IPC, esquemas, backups, assets, mídia e formatos antigos. O Fabricador é dono da fonte; o Customizador, das instâncias; Studios, de seus documentos e timelines.
- Use perfis, diretórios e mídias **sintéticos/temporários**; não analise ou modifique o perfil ou os projetos pessoais sem autorização explícita. Nunca rode testes destrutivos em app-data real.
- Mudanças de persistência exigem testes de falha, atomicidade, undo/redo, reabertura, recuperação e compatibilidade.
- Priorize decisões documentadas e reversíveis. Mantenha experimental/desligado por padrão o recurso de cabelo até a aprovação visual.

## 3. Primeiro: reconciliação curta do estado atual

Faça auditoria diferencial orientada por evidências, não outra varredura genérica de quatro horas sem entregas:
1. Confira os commits desde a V2, o mapa de mudanças e os contratos afetados.
2. Separe o que já está corretamente modularizado, o que ficou parcial e o que ganhou riscos com as mudanças recentes.
3. Execute os gates relevantes e classifique falhas **anteriores**, **novas** e **não reproduzidas**.
4. Verifique o estado da CI hospedada da referência e de qualquer commit mais novo; não marque uma run histórica como prova do HEAD atual.
5. Registre uma lista de prioridades P0/P1/P2 e comece a corrigir P0, em vez de parar após a auditoria.

**Baseline específica conhecida:** na run 41623161063, os jobs de Editor V6 Ubuntu/Windows e de MP4/FFmpeg Windows passaram, mas o job **Dev-V2 / architecture, shared contracts and typecheck** falhou em **tests/renderer-pending-persistence.test.mjs**, subteste **Studio and Editor V6 flush debounced documents and wait for renderer IPC writes**: **678 de 679** testes da primeira suíte passaram. A assertion em torno da linha 178 busca literalmente a regex **trackOperation(async () => { planEditorV6Export**, mas o painel agora executa passos de preparação no meio. É uma hipótese forte de **teste estrutural desatualizado**, não evidência de falha funcional no salvamento.

**Corrija a causa do gate** mantendo ou aumentando a cobertura do caminho real de importação, preparação, rastreamento de operações, flush de IPC e saída/cancelamento. Prefira testes comportamentais a regex frágil. Não mexa em validações do produto apenas para satisfazer o teste. Rode a suíte completa e capture o resultado.

## 4. P0 — Motor experimental de cabelo no Editor V6: defeitos reais

O usuário observou em exportação com personagem real:
1. O cabelo descola da cabeça, vai em direção ao centro da tela e volta.
2. Surgem **listras brancas** ou lacunas ao longo do cabelo, semelhantes a emendas da malha.
3. No início e no fim das transições de pose, o cabelo volta, desaparece ou reaparece deslocado.

Esses defeitos **não foram corrigidos** no commit de implementação **5853ca324c**, e devem ser tratados como bloqueadores de qualidade, não como ajuste de vento.

### 4.1 Arquitetura existente: preserve o que funciona

- **Fabricador DEV → Animação cabelo DEV** salva até cinco presets em localStorage na chave **gacha-nymi:hair-animation-presets:v1**.
- **EditorV6ExportPanel.tsx** permite opt-in e escolha do preset; a prévia comum do Editor V6 não deve animar cabelo por decisão expressa do usuário.
- **editorV6HairMotionPreparation.ts** consulta fontes Fabricador e Customizador e cria superfícies temporárias de corpo/rosto/cabelo, com cores e transforms.
- **src/shared/editorV6HairMotion.ts** valida IDs, limites e os vínculos do bundle antes do worker; nada é salvo no projeto nem na personalização do usuário.
- **src/shared/hairMotionEngine.ts** define a física fixa **120 Hz**, quatro subpassos por quadro **30 FPS**, com estado determinístico a partir do quadro absoluto.
- **exportWorker.tsx** compõe por quadro e registra **hairCompositionMs**. O caminho atual de exportação usa até **96 faixas horizontais** com drawImage.
- A prévia do Fabricador usa **HairMotionMesh.tsx**, uma malha texturizada contínua em WebGL; o exportador e a prévia usam técnicas diferentes.
- A exportação desativa a deformação do cabelo quando o elemento está representado por **motionSprite** rasterizado. Um salto nessa troca de caminhos é possível.
- O gerador de inércia atual usa a posição **element.x / element.width** (com espelhamento), não a posição local da cabeça na pose. Avalie como isso afeta âncoras, mas não o considere prova única do bug.

A física de fase absoluta, o isolamento do bundle, os presets e a qualidade de rosto/boca existentes devem ser preservados.

### 4.2 Reproduzir antes de remendar

Crie um **fixture sintético representativo**, sem recorrer ao personagem pessoal do usuário, que possua:
- Cabeça/cabelo com bordas suaves e semitransparentes, fios finos e regiões totalmente transparentes.
- Cabelo atrás, à frente e franja, com cores e transforms diferentes.
- Corpo/pose personalizada, escala, recorte não centralizado e bordas transparentes.
- Pelo menos duas poses com **centro local da cabeça diferente**, mantendo o mesmo personagem.
- Rotação e espelhamento de cena; opcionalmente transições faciais e fala vinculada.
- Uma troca de pose com atlas em quadros intermediários; exportação que começa no meio; emenda Turbo.

Capture e salve, em diretório sintético isolado, quadros **antes**, **durante** e **depois** da transição, incluindo primeiro/último quadro e emenda Turbo. Gere vídeo curto e imagens compostas; salve também um JSON diagnóstico de geometria.

Colete, para cada quadro e personagem, os valores de:
- Arte-fonte, canvas final, tamanho renderizado e **sourceCrop**.
- Rect e pivô reais da cabeça na pose atual; transforms de cabeça, cabelo e personagem.
- Posição no espaço local do asset, espaço pós-crop e coordenadas no palco.
- Rotação, espelhamento, escala, quadro absoluto, estado de motion e modo facial.
- Bounds/centroide da camada de cabelo e ponto de fixação da raiz.

**Não inclua esses diagnósticos completos em logs normais com dados privados**; os fixtures são sintéticos. Marque hipóteses vs causas confirmadas.

### 4.3 Corrigir o espaço de coordenadas

Investigue o pipeline:

**Fabricador fonte → Customizador/overrides → renderizador de camadas → geometria da cabeça → recorte transparente → faceRenderGeometry → elemento/SceneSurface → worker → MP4.**

Arquivos principais:
- **src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts**
- **src/renderer/src/features/editorV6/exportWorker.tsx**
- **src/renderer/src/features/fabricator/hair-animation/HairAnimationCharacter.tsx**
- **src/renderer/src/features/fabricator/hair-animation/hairAnimationGeometry.ts**
- **src/renderer/src/characters/characterGeometry.ts**
- **src/renderer/src/features/editorV6/faceModeAssets.ts**
- **src/shared/editorV6TimelineScene.ts**, módulos de motion e composição facial.

Faça cada conversão de espaço **uma única vez**, com convenções nomeadas e testes. Não esconda erro de unidades usando multiplicadores mágicos, clamp arbitrário ou reposicionamento forçado na tela.

Distinga a deformação desejada dos fios do deslocamento indevido da **raiz**: o cabelo pode balançar, mas sua âncora na cabeça deve continuar correta em todo quadro. Considere geometria distinta por pose/snapshot, referência da cabeça por frame de transição e correção de crop.

Se faltarem metadados para resolver uma pose corretamente, falhe com diagnóstico útil ou estabeleça um fallback seguro com teste; não renderize o cabelo em lugar aleatório.

### 4.4 Eliminar as listras de alpha/reamostragem

Reproduza a falha no caminho de rasterização atual de faixas (subpixel, alpha e fundos distintos).

Compare, com testes de pixels:
- Técnica raster contínua em uma passagem, caso seja viável.
- Malha WebGL texturizada no contexto offscreen de exportação com leitura/composição apropriadas.
- Outras abordagens equivalentes, **somente** se conseguirem resultado sem costuras e mantiverem resolução, custo e cancelamento aceitáveis.

**Não escolha solução apenas pelo nome da tecnologia.** WebGL já é usado na prévia, mas introduz desafios de integração, readback, contexto perdido, alpha premultiplicado e liberação de GPU. Canvas com faixas pode demandar amostragem/overlap sem gerar duplicações de transparência. Verifique os resultados com imagens RGBA, transparência real, rotação e escala.

Teste fundos transparente, branco, preto, colorido e quadriculado; compare output **RGBA sem compressão** para diagnosticar e MP4 H.264 com tolerância fundamentada apenas para perdas do codec. Não aceite esconder listras apagando pixels, reduzindo nitidez ou diminuindo resolução.

### 4.5 Continuidade da animação durante trocas de pose

O efeito deve ser temporalmente contínuo e ancorado corretamente na cabeça, inclusive nos frames do **motionSprite** e nas fronteiras antes/depois do atlas. Estude se a deformação precisa ser incorporada ao atlas de transição, recomposta sobre ele ou receber outra estratégia coerente. Preserve a renderização da pose e não trate o corpo inteiro como textura de cabelo.

Garanta que:
- Render do mesmo quadro absoluto seja determinístico, independentemente da ordem das solicitações.
- Turbo em partes e exportação sequencial produzam a mesma fase e geometria visual nos quadros comparáveis.
- Início de exportação após zero e seek não mudem o resultado.
- Pausa/resume, transição de pose, rotação, espelhamento e alterações faciais não causem teletransporte da raiz.
- Boca obrigatória durante a fala e composição facial RGBA não sejam perdidas pela camada experimental.

Se uma limitação impedir continuidade sem comprometer a imagem, documente-a e mantenha a função explicitamente experimental, com fallback seguro; não anuncie o recurso como corrigido.

### 4.6 Critérios P0 de aceite

O recurso só pode ser considerado visualmente corrigido quando:
- O usuário consiga reconhecer o cabelo ancorado no personagem, sem deslocamento indevido para centro da cena.
- Não ocorram listras ou buracos internos nas imagens RGBA de referência para fixtures detalhados.
- Não ocorram saltos espúrios na raiz nos quadros de entrada/saída das transições; mudanças intencionais de pose são permitidas.
- O conjunto de testes cubra 720p/1080p, 30 FPS, transparência, clipping, variáveis de cabelo/corpo, Turbo, seguro e início tardio.
- A exportação sem opção de cabelo permaneça idêntica ou dentro de contrato visual explicitamente testado.
- Estabilidade, cancelamento, uso de memória, renderizador/FFmpeg e proteção de arquivo de destino permaneçam corretos.

**Escopo fechado por decisão do usuário: não implementar cabelo animado na prévia normal do Editor V6.** A física, os testes de imagens e as transições de cabelo devem ser tratados apenas pelo renderizador offscreen da exportação e pelo MP4 final. Preserve a prévia estática/interativa atual, sem adicionar camada dinâmica, toggle de prévia ou efeito de cabelo no playback do editor. A prévia do Fabricador DEV pode continuar mostrando a simulação para ajuste de presets.

## 5. P0 independente — falha de continuidade do exportador geral

O handoff do desenvolvedor relatou falha em **npm run test:editor-v6:export**, no teste de continuidade da emenda, pixel **(240, 90)**, antes do cenário de cabelo. Isso não está resolvido nem causalmente atribuído.

Reproduza a falha **com a opção de cabelo desligada** e depois com ela ligada. Investigue frame pré/pós-emenda, camada de fundo/foreground, recorte, movimento, render, SVG, FFmpeg, caches e comparação do harness. Classifique se o teste é frágil, se é diferença normal de codec ou regressão real de composição.

Não altere o pixel esperado, limiar ou detector sem demonstrar a causa. Acrescente regressão com quadros/artefatos sintéticos para o cenário corrigido.

## 6. P1 — Fortalecer os gates da Dev-V2 para o novo motor

A CI de referência executava Editor V6 Ubuntu/Windows e MP4 Windows com sobreposição e face 720p/1080p. **Não executava** o novo **scripts/editor-v6/check-hair-motion-export.cjs**, nem a suíte ampla **npm run test:editor-v6:export** como gate hospedado.

Após P0:
- Adicione teste Electron/FFmpeg **real** com cabelo semitransparente, recortes de pose e emenda Turbo ao workflow Windows de forma proporcional ao custo, reusando bundle/FFmpeg verificado e preservando permissões mínimas.
- Publique apenas artefatos sintéticos, relatórios, hashes e capturas de aceitação no GitHub Actions. Não inclua dados pessoais, app-data ou caminhos privados.
- Preserve gates gerais: testes de refatoração, geometria, typecheck, auditoria, Editor V6 e checks de MP4.
- Corrija o gate de persistência por comportamento; não abandone regressões de flush porque a linha de código mudou.
- Limite tempo/recursos de CI com critérios técnicos, sem enfraquecer cobertura. Modifique arquivos de workflow **localmente**, sem disparar runs hospedadas por iniciativa própria.
- Informe explicitamente o que somente pode ser confirmado após publicação autorizada.

## 7. P1 — Auditoria pós-V2 do aplicativo inteiro

A V2 já concluiu os ciclos A–G em 2026-11-02 e criou contratos/testes específicos. Não recomece por contagem de linhas nem refatore áreas sólidas apenas para gerar commits. Revise profundamente as **mudanças feitas depois da V2**, com foco nos seguintes riscos:

### 7.1 Fabricador DEV — modelos e junções
- Importação/nomeação de imagens, fragmentos de cabeça e orelhas, divisão de membros unidos, substituição de membros, normalização de contorno, pinceis de deformação, espelhamento, histórico e zoom do ModelSourceEditor.
- Mesma geometria/pixel de modelo entre edição, pose, preview, Customizador e Studios; conferir diferentes tons de pele, contornos, gênero e escala.
- Cobrir o mecanismo **bodyJointBridge** e sua limpeza raster; evitar triângulos, serrilhado, vazamentos de cor, cobertura indevida de camadas ou costuras após rotação/deformação.
- Testar reabertura de catálogos, revisões de assets, operações repetidas e compatibilidade legado.

### 7.2 Roupas DEV e sapatos
- Regras de conjunto, roupas em juntas, peças pareadas, espelhamento, processamento de chroma verde, bordas claras, deformação, grade e ordem de camadas.
- Verificar interações entre roupas, parte inferior do membro, sapato, tronco, cabelo, sombra e contorno. **Não remover buracos substituindo-os por halos ou pintando regiões corretas.**
- Testes por pixel e golden representativo no Fabricador, Customizador, Studio e Editor V6.
- Preservar preferências de camadas e formatos salvos, inclusive personagens legados.

### 7.3 Customizador / personagens
- Catálogos de fontes, revisão e invalidação dos snapshots, corpo, cabelo, expressão, roupas pareadas, alterações concorrentes e salvamento serializado.
- Garantir que mudanças de Fabricador se propaguem aos consumidores corretos sem reverter estado local ou sobescrever outros personagens.
- Reabertura, rollback, backups e integridade de referências.

### 7.4 Studio Principal, Editor V6, Roteiros, Base de Vídeos
- Testes de documentos, histórico, assets, mídia, timeline, cenas, render/export, áudio e consistência entre UI e arquivos.
- Verificar fluxo completo de criação/salvamento/reabertura/duplicação/exclusão e cancelamento.
- Revisar os componentes ainda extensos **somente quando uma responsabilidade extraível for demonstrada**. CSS global e folhas de feature devem preservar a cascata e captura visual.
- Não reconstruir o Studio nem substituir a engine de vídeo sem prova de necessidade.

### 7.5 Electron, Logs Dev e dados
- A V2 já implementou Logs Dev, rotas compatíveis, filtros, logs sanitizados, métricas sob demanda e ferramentas seguras. **Não refaça.**
- Verifique que novas exceções do motor de cabelo e falhas de export geram códigos e mensagens curtas úteis em Logs Dev sem IDs pessoais, caminhos, preset bruto, mídia ou conteúdo dos projetos.
- Refaça testes dos guardas de sender IPC, preload/context isolation, políticas de janelas, filas e encerramento seguro.
- Preserve SQLite/CAS, journals, backups, migração legada e recuperação; não apagar dados para “resolver” inconsistências.

Para cada módulo, registre estado **bem refatorado / parcialmente refatorado / precisa de correção**, com evidência, testes e riscos. Evite relatórios excessivamente longos ou duplicados.

## 8. P2 — Desempenho e manutenção com métricas verdadeiras

O usuário está **jogando no PC durante os testes** e autoriza expressamente que o Codex use toda a CPU, GPU, RAM, núcleos, workers e paralelismo necessários, mesmo com o jogo aberto. **Não economize artificialmente recursos por causa do jogo e não adie testes pesados.** Respeite segurança de dados, estabilidade e limites técnicos do runtime.

O jogo provoca carga concorrente variável:
- Registre ambiente, versões, resolução, tamanho dos fixtures e o fato de haver jogo em execução.
- Faça repetições, preferencialmente ordem alternada A/B, e analise dispersão.
- **Não** chame benchmarks sob carga de “medições controladas” nem afirme ganhos definitivos a partir deles.
- Se um controle sem concorrência for necessário, registre-o como pendência sem interromper a implementação.
- Benchmarks de física devem medir build, tempo de preparação, deformação/quadros, readback, composição, FFmpeg, memória Main/renderer/auxiliares e buffers de textura; diferencie CPU e GPU conforme APIs disponibilizarem.
- Não reduza resolução, taxa de quadros, qualidade facial, animação de boca ou detalhe de cabelo para mostrar números favoráveis.
- Compare 1/2 workers e Turbo/seguro com atenção a overhead e memória, sem assumir automaticamente que mais workers são melhores.

Faça profiling onde há evidência: Editor V6 com cabelo, ModelSourceEditor, Roupas DEV, abertura/cadastro de personagens e Logs Dev. Limpe vazamentos de recursos e listeners comprovados. Reutilize caches e workers quando for vantajoso, mas não introduza deduplicação que passe a compartilhar estado mutable entre personagens/frames.

## 9. Pesquisa técnica obrigatória e critérios de engenharia

Pesquise documentação atual **das versões instaladas**, compare alternativas e cite as fontes relevantes na justificativa. Não conclua a solução a partir de uma única postagem, nem introduza bibliotecas apenas pela popularidade.

Fontes primárias:
- [Electron – processos](https://www.electronjs.org/docs/latest/tutorial/process-model), [segurança](https://www.electronjs.org/docs/latest/tutorial/security), [performance](https://www.electronjs.org/docs/latest/tutorial/performance), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).
- [MDN Canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [Canvas compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation), [WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API), [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas), [ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap), [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
- [Khronos WebGL Registry](https://registry.khronos.org/webgl/specs/latest/1.0/) para precisão de textura, coord. UV, alpha e blending.
- [FFmpeg documentação](https://ffmpeg.org/documentation.html), filtros e [FFprobe](https://ffmpeg.org/ffprobe.html).
- [React](https://react.dev/), [React Router](https://reactrouter.com/), [TypeScript](https://www.typescriptlang.org/docs/), [Node.js](https://nodejs.org/api/).
- [Vite](https://vite.dev/), [electron-vite](https://electron-vite.org/), [Vitest](https://vitest.dev/), [Zustand](https://zustand.docs.pmnd.rs/), [Immer](https://immerjs.github.io/immer/), [Zod](https://zod.dev/), [Sharp](https://sharp.pixelplumbing.com/), [SQLite](https://sqlite.org/docs.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) e [GitHub Actions](https://docs.github.com/en/actions).
- Issues/discussões/wikis de mantenedores somente quando forem pertinentes; validar datas e compatibilidade. Não confiar em respostas genéricas de IA como evidência técnica.

Antes de adotar WebGL no export, investigue o comportamento real em Electron offscreen, criação/limpeza de contextos, fallback, alpha premultiplicado e readback, além da paridade com SceneSurface/FFmpeg. Antes de adotar Canvas 2D contínuo, comprove inexistência de costuras e taxa de trabalho por quadro.

Sem acesso à internet, registre a limitação e não invente pesquisas. Não atualize Electron, React, FFmpeg ou toolchain durante este ciclo sem análise explícita de migração e aceitação.

## 10. Testes mínimos e critérios de entrega

Comece com scripts verificados do package.json, executando os pertinentes. Em particular:
- **npm run audit:architecture**
- **npm run test:refactor**
- **npm run test:geometry**
- **npm run test:editor-v6**
- **npm run typecheck**
- **npm run build**
- **npm run test:editor-v6:export** (reproduzir a falha de emenda e validar correção)
- **node scripts/editor-v6/check-hair-motion-export.cjs** (Windows/Electron/FFmpeg)
- **node scripts/fabricator/check-hair-motion.cjs** e testes de geometria/presets.
- Testes específicos de roupas, modelo, bodyJointBridge, chroma, pose e Logs Dev de acordo com mudanças.

**Não substitua** testes de pixels reais por asserts que apenas verificam presença de uma função, payload ou frame mudando. O fixture vermelho sólido existente é insuficiente para aferir as listras e a geometria real.

Critérios por fatia:
1. Falha/risco comprovado e reproduzido.
2. Contratos e consumidores identificados.
3. Tests antes/depois apropriados.
4. Código alterado minimamente e por responsabilidade.
5. Typecheck, auditoria e builds pertinentes.
6. Capturas sintéticas/goldens e métricas quando houver mudança visual ou de performance.
7. Diff revisado e **commit local** descritivo.
8. Documentação atualizada com estado real e limitações.
9. Próximo trabalho iniciado autonomamente, se o ambiente permitir.

Não marcar “concluído” se a CI hospedada ainda não foi executada, se imagens detalhadas não foram comparadas ou se o usuário relatou bug visual ainda sem correção.

## 11. Documentação e acompanhamento

Preserve o histórico de:
- **docs/architecture/PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md**
- **docs/editor-v6/EXPORTACAO.md**

Crie um **único** relatório conciso de progresso da V3 em **docs/architecture/PROGRAMA_REFATORACAO_GERAL_V3_NATIVE_GACHA.md**, sem copiar a V1/V2 inteira.

Inclua:
- Matriz pós-V2 com módulos já bons, parcialmente bons e pendentes.
- P0 do cabelo: evidência, causa demonstrada, testes de alpha/âncora/transição, correções e limitações.
- Falha de CI e falha independente de emenda: causas e resultados.
- Decisões e links de pesquisa técnica.
- Testes e benchmarks executados (hardware concorrendo com jogo).
- Commits locais, pendências e itens que requerem revisão visual do usuário.

## 12. Instrução final

**Atue com autonomia, em ciclos pequenos e contínuos, na Dev-V2 local.**

Primeira ação executável: verificar Git/AGENTS/docs; reproduzir o gate geral e a emenda; capturar defeitos do cabelo com fixture semitransparente e troca de pose. Corrigir causas confirmadas, integrar regressões reais na CI e depois analisar as demais mudanças do aplicativo.

Não se limite a escrever outro plano. **Implemente melhorias testáveis e documente o que realmente alcançou.**

Sem outras branches. Sem push, PR, merge ou rebase. Sem dados pessoais destrutivos. Presets continuam privados e persistidos no localStorage; o efeito permanece opt-in até aceitação.

**A meta da V3 é qualidade visual verdadeira, integração segura e refatoração orientada por evidência — não volume de código modificado.**
