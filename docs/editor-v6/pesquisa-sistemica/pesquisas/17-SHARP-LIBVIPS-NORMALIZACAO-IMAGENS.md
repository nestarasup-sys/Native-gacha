# Pesquisa 17 — Sharp/libvips: normalização de imagem, composição e custos reais de preparação

**Status:** PESQUISADA EM CÓDIGO + FONTES OFICIAIS; EXPERIMENTOS RUNTIME PENDENTES.  
**Revisão estática:** `Dev-V2@5166de7`; **data:** 06/11/2026. Revalidar versões e HEAD antes de implementar. Este documento não declara benchmark realizado.

## Questão técnica e escopo

**Qual papel o Sharp efetivamente desempenha no Native Gacha e quais operações de libvips poderiam reduzir preparação de materiais sem converter uma rotina nativa de ingestão em um renderizador inteiro de animações?**

## Mapa de integrações efetivamente observadas no Native Gacha

1. **[CÓDIGO]** `package.json` declara `sharp:^0.35.5` em dependencies. Isso é componente nativo de produção, não alternativa hipotética.

2. **[CÓDIGO]** `electron/imageIngestion.cjs:3–45` recebe Buffer de imagem, limita tamanho (50 MiB) e pixels (32 milhões), aceita PNG/JPEG/WebP, consulta metadata, aplica `.rotate()` para orientação e gera PNG sem metadados; valida dimensões do resultado.

3. **[CÓDIGO]** `electron/domains/images/imageNormalizationIpc.ts:19–31` oferece `app:image:normalize`, valida remetente e bytes antes da normalização; renderer não acessa Sharp diretamente em janela sandbox.

4. **[CÓDIGO]** `electron/main.ts` registra serviço de normalização de imagens e injeta domínio de armazenamento. Custo de Sharp acontece na **importação/preparação**, não necessariamente no loop de exportação dos 300 frames.

5. **[CÓDIGO]** `electron/domains/fabricator/modelSource.ts` valida assets PNG publicados pelo Fabricador; imagens de cabelo/roupa têm writer/reader e manifesto próprio. Um cache libvips na importação depende do conteúdo canônico e da revisão.

6. **[CÓDIGO]** `src/renderer/src/characters/editorV6CharacterRenderer.ts:100–165` usa Canvas e fontes de Fabricador para compor materiais; portanto o hot path de personagem do V6 está no renderer Chromium, não em Sharp por definição.

7. **[CÓDIGO]** `src/renderer/src/features/editorV6/sceneFaceComposition.ts:120–131` cria patch PNG no Canvas; possível transferência ao Main para Sharp acrescentaria IPC e conversão, que precisariam ser medidos.

8. **[CÓDIGO]** `electron/domains/storage/contentAddressedStore.cjs:108–160` possui lógica de miniatura/caching SHA-256; processamento de imagens é integrado à persistência, não só ao render.

9. **[CÓDIGO]** `electron/domains/editorV6/documentPersistence.ts` publica assets validados e snapshots; alterar formato/cor do PNG canônico impacta Studio e Customizador.

## Documentação oficial consultada e limites da API

1. **[FONTE OFICIAL] [Sharp Input metadata](https://sharp.pixelplumbing.com/api-input/)** — `.metadata()` lê cabeçalho sem decodificar todas as amostras. Orientação EXIF exige interpretação adequada antes de usar dimensões finais.

2. **[FONTE OFICIAL] [Sharp Composite](https://sharp.pixelplumbing.com/api-composite/)** — `composite` suporta modos de blend e offsets, mas a imagem base é processada antes da sobreposição. Crop/alpha/order são parte da semântica.

3. **[FONTE OFICIAL] [Sharp Performance](https://sharp.pixelplumbing.com/performance/)** — Sharp/libvips usa thread pool e UV_THREADPOOL_SIZE com concorrência; mais threads nem sempre favorecem dois renderizadores Turbo.

4. **[FONTE OFICIAL] [Sharp Utility](https://sharp.pixelplumbing.com/api-utility/)** — `sharp.cache()` e `sharp.concurrency()` expõem controles e estatísticas; cache libvips ≠ cache versionado de personagens.

5. **[FONTE OFICIAL] [Node.js streams](https://nodejs.org/api/stream.html)** — Streams e backpressure permitem lidar com arquivos grandes sem reter todos os PNGs na memória.

**Limitação:** fontes consultadas cobrem a API pública atual, não o build Electron/Node instalado nem as milhões de linhas do motor upstream. Disponibilidade, licenças e formatos precisam de prova na versão empacotada.

## Hipóteses e conclusões fundamentadas

### 1. Não tratar Sharp como substituto instantâneo de SVG/WebGL

[CÓDIGO] O Sharp está em ingestão e processamento estático; não anima meshes do cabelo, implementa mascara SVG/foreignObject dinâmica ou sincroniza vídeo `<video>` sozinho. Vale para atlas estático, thumbnails e composição sem DOM bem delimitada.

### 2. Cópias de dados podem superar o ganho

[HIPÓTESE] Mover patches faciais ou cabelo da janela Chromium ao Main Sharp exige extrair Canvas→Buffer→IPC→Sharp→PNG→Renderer; benchmarking deve incluir todas as passagens e o tempo de primeira exportação.

### 3. Concorrência de imagens e encode disputa CPU

[FONTE] libuv/libvips concorrem com FFmpeg CPU. Como o Native Gacha utiliza `libopenh264` em modo padrão, elevar threads Sharp pode aumentar contenção em vez de acelerar job.

### 4. Normalização é etapa de segurança e compatibilidade

[CÓDIGO] Limite de imagem, verificação de formato/dimensões, canal IPC e strip de metadados são essenciais; não afrouxar para medir desempenho.

### 5. Cache imutável por identidade de imagem

[HIPÓTESE] Compilações de materiais comuns podem ser reusadas se a identidade incluir origem/revisões e cor, mantendo CAS canônico separado de cache derivado com budget/eviction.

## Protocolo experimental que falta executar

1. **IMG-SH-01:** Fixture PNG/JPEG/WebP canônica + imagens extremas nos limites; medir metadata/rotate/png e verificar mesmo pixel/alpha e campos de metadados.

2. **IMG-SH-02:** PoC de atlas estático de roupa/pose em Sharp vs Canvas existente; tempo de criação, bytes IPC, RAM, anti-alias, cor, crop e resultado 32-bit.

3. **IMG-SH-03:** A/B 1/2 lanes Turbo com ingestão em paralelo para identificar contenção libvips/FFmpeg; não fazer na máquina pessoal sem fixture.

4. **IMG-SH-04:** Validar mudanças de source/cor/pose/wardrobe e cache invalidation; os dados canônicos não devem ser alterados.

## Riscos, compatibilidade e gates obrigatórios

- Manter imagem normalizada sem metadados, PNG e restrições de pixels/tamanho do app.
- Não transpor Sharp para main-thread renderer sandbox com APIs Node.
- Paridade de alpha, sampling, tom de pele, hair tint, roupas, sprites, textos e cor.
- Não alterar armazenamento canônico, IDs ou migrações para implementar cache.
- Comparar custo total em cenas sem e com animação, e documentar quando Sharp não resolve.

## Próxima decisão

**Recomendação:** pesquisar Sharp como acelerador de **preparação estática e assets reutilizáveis**, após medir quanto preparo de cabelo/corpo/face se repete. Não promovê-lo a renderizador de vídeo sem prova de paridade; o pipeline atual de Canvas/WebGL permanece referência.

**Verificações runtime deste documento:** **NÃO EXECUTADAS**. Ver [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md) e [Progresso](../PROGRESSO_E_RESULTADOS.md).
