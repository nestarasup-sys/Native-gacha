# Editor V6 — Rodada 04 · Exportação rápida sem perda visual

**Registro inicial:** 2026-11-03, após `RODADA_03_V4_CABELO_ESPELHAMENTO_FASE.md`.  
**Branch:** `Dev-V2`. **Base pré-rodada:** `2ababf3670198dcc300f1a025849ba38012610ac`.  
**Escopo desta rodada:** revisão da arquitetura de exportação, correção da CI e uma otimização de leitura de quadro; metas e instrumentação para o teste seguinte no PC do usuário. Esta rodada foi editada **diretamente no GitHub**, sem execução local do Electron pelo orquestrador.

## 1. Problema real e meta

O usuário relatou que o projeto **Editor V6 06** exportou aproximadamente **10 s de vídeo em 65 s de relógio** com **dois personagens, poucas ações e Animação de Cabelo DEV / preset 2 ativado**.

- Duração a 30 FPS: **300 quadros**.
- Ritmo ponta a ponta relatado: **~4,6 quadros/s** (300/65), incluindo preparação e finalização.
- **Meta ambiciosa:** 10 segundos de vídeo exportados em **10–15 s** no mesmo computador, resolução, preset, projeto, encoder e qualidade, sem rebaixamento visual. Isso exige **4,3×–6,5×** de redução de tempo total. **Não está comprovado que o motor ou hardware atuais conseguem atingir a meta.**
- Não extrapolar automaticamente a duração de 10 s para projetos de 60 s: preparação fixa, caches, cortes/ações e tempo de encode podem ter custos não lineares.
- **Condição obrigatória:** comparar o mesmo trecho, frames, resolução, preset 2, hair ligado, modo seguro/Turbo, cache frio/quente, encoder realmente selecionado, áudio/mídia e software/driver. Não confundir a estimativa do usuário com um baseline instrumental.

**Acesso ao projeto:** o repositório GitHub não contém necessariamente os dados pessoais do `Editor V6 06` ou os presets guardados em `localStorage`. Somente o Codex no computador do usuário, com o aplicativo/arquivos disponíveis, poderá medir essa cena. Criar primeiro **cópia verificável em sandbox**, incluindo documentos, mídia da Base, personagens, catálogos e preset 2; manter a fonte **imutável**, sem executar stress test no perfil real. Não publicar vídeo, personagem, dados privados nem relatório contendo caminhos absolutos.

## 2. Achados do pipeline atual

O código usa `runEditorV6Export` (`electron/domains/editorV6/exportRunner.ts`):
1. Carrega personagens e prepara transições com cache (domínios Fabricador/Customizador/Editor V6).
2. Prepara atlas de boca e bundle temporário de cabelo, conforme intervalos.
3. Inicia 1 ou 2 `BrowserWindow` offscreen, cada qual desenha quadro absoluto.
4. No Main, `webContents.executeJavaScript` aguarda desenho, `capturePage` gera `NativeImage`, a marca de 24 bits confirma que não é frame antigo.
5. Entrega BGRA por pipe com **backpressure correto** ao FFmpeg (hardware H.264 quando disponível; CPU segura quando necessário).
6. Junta vídeo/áudio, verifica quadros, FPS, codecs, duração e emendas, e publica o MP4 após validação.

`exportWorker.tsx` já cacheia assets estáticos e reutiliza imagens/frames quando o visual não muda, mas a animação de cabelo pode fazer o foreground mudar todo quadro. Com mídias sobrepostas, a exportação usa capturas separadas de background e foreground para permitir composição pelo FFmpeg. Não reduzir as capturas sem testar occlusão/alpha.

Os relatórios já contêm `phaseMilliseconds`, `frameTiming` (incluindo `ipcDrawMs`, `rafWaitMs`, `captureMs`, `ffmpegWriteMs`, `hairCompositionMs`, `hairPngEncodeMs`) e métricas por parte. Usar **tempo de parede do caminho crítico**, não a soma de subprocessos concorrentes, para dizer onde economizar.

### Achado seguro: bitmap convertido duas vezes

Antes desta rodada, `exportWorkers.ts` fazia:
- `capturePage` → `NativeImage.toBitmap({ scaleFactor: 1 })` para verificar o token fora da cena;
- `NativeImage.crop(...)` → `exportBitmap` → outra `toBitmap({ scaleFactor: 1 })`, para entregar BGRA ao FFmpeg.

Isso pode alocar/atravessar **duas representações nativas grandes por quadro**, além de recortar a imagem. Uma imagem 1920×1080 em BGRA ocupa aproximadamente **7,91 MiB**; a captura com margem do token é ligeiramente maior.

## 3. Mudanças efetivamente feitas na Rodada 04

### 3.1 CI: fixture de contrato facial atualizada

`tests/editor-v6/exportIpcLifecycle.test.ts` tinha um rig sintético sem `poseSlot`, campo agora **obrigatório e anulável** em `src/shared/editorV6HairMotion.ts`. A run anterior [41745337370](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41745337370) falhou em Windows e Ubuntu exatamente por `rigs[0].poseSlot` ausente; o job de MP4 foi pulado. O teste agora passa `poseSlot: null` na fixture. **O schema de produção não foi enfraquecido.** Confirmar nova CI após a publicação final do trabalho.

### 3.2 Captura de quadro: uma só leitura BGRA

Arquivos:
- `electron/domains/editorV6/exportCaptureBitmap.ts`: novo helper que lê o `NativeImage` **uma vez**, confere os 24 bits do token no mesmo BGRA e copia as linhas da região de cena para um buffer próprio, sem refazer `NativeImage.crop().toBitmap()`.
- `electron/domains/editorV6/exportWorkers.ts`: usa o helper apenas depois de `capturePage`; **mantém** invalidação/retry de frames atrasados, token, timeouts, geometria e backpressure; não muda resolução ou formato do pipe para FFmpeg.
- `tests/editor-v6/exportCaptureBitmap.test.ts`: caso de BGRA/padding com comparação exata byte a byte, uma chamada `toBitmap`, proteção contra buffer reutilizado, token stale/alpha inválido e stride incorreto.

**Hipótese de benefício:** menor custo de conversão/cópia do Main e menos pressão de alocação para os 300 frames do vídeo real. Isso pode melhorar o caminho de captura, mas **não** promete economia equivalente aos 50 s necessários para a meta, nem altera o custo do desenho, GPU, cabelo ou encode.

**Atenção à paridade:** pixel tests sintéticos verificam os bytes da operação direta; ainda é necessário comparar capturas **reais** de Electron/Chromium/FFmpeg no mesmo projeto. Se houver alteração de bytes, perfil de cor, channel order ou geometria por conta da implementação nativa de `crop`, corrigir ou reverter a otimização.

### 3.3 Opção de CPU H.264: corrigir contrato entre painel e Main

O seletor do `EditorV6ExportPanel.tsx` oferecia `value="libx264"`, mas `planEditorV6Export` só aceita `encoder: 'auto' | 'cpu'`. Selecionar CPU podia impedir a exportação **antes de iniciar a renderização**. O painel agora usa `EDITOR_V6_ENCODER_CHOICES` do contrato compartilhado, com `cpu` como valor aceito e label `CPU · H.264`. `tests/editor-v6/editorV6Export.test.ts` verifica a lista e a validação. Não trocar o encoder do usuário automaticamente para acelerar; a opção de CPU continua explícita.

### 3.4 Cronometragem: preparação de cabelo antes do job

Em `EditorV6ExportPanel.tsx`, o clique chama `runEditorV6ExportCommand`, que aguarda `prepareEditorV6HairMotionBundle` **antes** de iniciar o job via IPC. A interface inicia `exportStartedAt` no clique, mas o relatório de `runEditorV6Export` no Main começa posteriormente. Portanto, benchmarks que usam apenas `report.milliseconds` **podem subestimar** a espera real percebida pelo usuário. A Rodada 05 deve reportar `click-to-MP4` e `preparoHairAntesDoJobMs` separadamente, sem incluir espera humana pelo diálogo de salvar como custo de CPU.

## 4. O que NÃO foi feito

- Não foi executada exportação real do projeto **Editor V6 06**. O GitHub não permite acessar automaticamente o perfil local e o preset 2 do usuário.
- Não foi executado `npm run build`, `npm run test:editor-v6` ou MP4 real **localmente** pelo orquestrador; a CI nova deverá validar os commits publicados.
- Não foi provada redução de 65 para 10–15 s, nem foi medida aceleração porcentual da cópia única.
- Não foram reduzidos FPS (30), resolução (720p/1080p), bitrate, nitidez, boca, transparência, transições, movimento capilar, áudio ou verificações de integridade.
- Não foi mudado schema de projeto, preset, personagem, Fabricador ou Customizador.

## 5. Estratégias para atacar o salto maior de desempenho

Executar **em ordem de custo recuperável medido**:

| Possível gargalo | Próxima intervenção condicionada à medição | Risco |
| --- | --- | --- |
| Preparo de transições, rosto, corpo e cabelo | Cache por fingerprint de fonte/pose/roupa/paleta/cabelo; reuso entre renders; evitar repetir rasterizações já válidas | Invalidação e assets desatualizados |
| `sceneResolutionMs`, React/DOM/face/mouth por quadro | Render de camadas estáticas uma vez por estado e atualizar só mouth/hair por quadro; trabalho de malha e composição em superfície reutilizada | Camadas, transparência, contorno e transições |
| `hairCompositionMs`, PNG/Blob/decode por quadro | Evitar PNG/compressão e roundtrip de imagem temporária **se** WebGL/Canvas/renderer suportar apresentar a mesma superfície diretamente | Readback, `ImageBitmap` lifecycle, alpha, formato de pixel |
| `rafWaitMs`, `ipcDrawMs`, `captureMs` | Prototipar alternativa de entrega do quadro sem capturas repetidas/React completo; comparar tokens e pixels em frame zero, fala e emendas | Frame antigo, fundo vazio, WebGL e crop |
| `ffmpegWriteMs` e encode | Verificar se o FFmpeg espera frames ou CPU/GPU; encoder, threads, pipe BGRA e backpressure por cenário | Qualidade H.264, memória, fila e áudio |
| Preparação/finalização fixa | Reutilizar ferramentas/instância de forma segura e cachear provas de encoder quando válido; não pular validação final | Segurança, mudanças de driver, saída inválida |

**Cuidado:** o [plano de aceleração histórico](PLANO_ACELERACAO_EXPORT.md) já documenta testes **rejeitados**: usar `paint` diretamente produziu quadro inicial vazio; remover indiscriminadamente RAF gerou divergência visual; aumentar workers reduziu tempo, mas elevou RAM e mudou atlas/saída em cenários reais. **Não repetir cegamente** essas experiências. A Rodada 02 V4 removeu um RAF redundante em outro estado do compositor, com testes RGBA; isso não autoriza remover qualquer outra espera sem comparar imagens.

A documentação oficial do [Electron offscreen](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) diferencia bitmap em RAM e compartilhamento de textura GPU. **Shared texture requer módulo nativo/integração específica**, não uma flag que automaticamente torna FFmpeg zero-copy. Consulte também [webContents.capturePage](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts), [FFmpeg](https://ffmpeg.org/ffmpeg.html), [FFprobe](https://ffmpeg.org/ffprobe.html), [MDN Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) e [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API); comparar versões reais antes de adoção.

## 6. Próxima fase executável

**[Codex — Rodada 05: otimização medida no Editor V6 06](CODEX_RODADA_05_V4_EXPORT_10_15S.md)**.

1. Fixar baseline com **cópia isolada real** de 10 s, preset 2, cabelo ligado e mesma opção de saída. Guardar hashes dos arquivos de entrada sem divulgar mídia.
2. Comparar fria/quente e Turbo/seguro; decompor o tempo dos 65 s, verificar encoders e validação; relatório por quadro e por processo.
3. Validar/pontuar o helper single-readback em MP4 real; A/B com branch **não** criada (toggle diagnóstico local ou compilação de comparação controlada) e testes BGRA/alpha.
4. Prototipar a menor alteração arquitetural que elimine o maior gargalo; repetir export no mesmo fixture e manter apenas mudanças com equivalência ou ganho visual.
5. Avançar iterativamente até atingir **10–15 s**, ou documentar com dados um limite técnico e a próxima arquitetura necessária. **Não afirmar sucesso** sem obter MP4 final com verificações completas.

**Git do Codex:** somente `Dev-V2`, commits locais, sem branch nova, push, PR ou merge até autorização explícita do usuário. O orquestrador desta Rodada 04 operou no GitHub a pedido do usuário.
