# Pesquisa 21 — Vite/electron-vite, TypeScript, Zod, Vitest e contratos de build

**Status:** PESQUISADA EM CÓDIGO + FONTES OFICIAIS; EXPERIMENTOS RUNTIME PENDENTES.  
**Revisão estática:** `Dev-V2@5166de7`; **data:** 06/11/2026. Revalidar versões e HEAD antes de implementar. Este documento não declara benchmark realizado.

## Questão técnica e escopo

**Como os bundles separados e contratos tipados protegem os módulos quando trocarmos composição gráfica, cache ou FFmpeg? Quais otimizações de build realmente afetam startup e quais não mudam export?**

## Mapa de integrações efetivamente observadas no Native Gacha

1. **[CÓDIGO]** `package.json` declara electron-vite, Vite 8, @vitejs/plugin-react, electron-builder, esbuild, TypeScript aliases e Vitest; `npm run build=electron-vite build`.

2. **[CÓDIGO]** `electron.vite.config.ts:22–56` produz entradas separadas `out/main`, `out/preload`, `out/renderer`, incluindo `index.html` e `editor-v6-export.html`, com preload separado para export e movimento.

3. **[CÓDIGO]** `electron.vite.config.ts:10–26` obtém commit SHA e dirty state, embutidos no Main para relatórios reproduzíveis; experimentos devem mencionar essa identidade.

4. **[CÓDIGO]** `electron/application/rendererContentSecurityPolicy.ts:31–70` adiciona CSP também na fase do Vite para dev/HMR, com exceção limitada localhost.

5. **[CÓDIGO]** `src/renderer/src/ui/App.tsx:8–19` faz imports lazy das páginas de recursos; mudar chunking pode afetar carregamento de Fabricador, Customizador, Studio e V6, não raster quente por frame automaticamente.

6. **[CÓDIGO]** `src/shared/editorV6Schema.ts:12–309` define schemas Zod, valida IDs, limites e estrutura de mídia, assets, timeline, tracks, atlas de movimento e audio. `fps: z.literal(30)` assegura o contrato do documento.

7. **[CÓDIGO]** `electron/domains/editorV6/primaryIpc.ts` valida remetente e projeto; `exportIpc.ts` usa Zod e parse de export, evitando confiar nos tipos TypeScript do renderer como validação runtime.

8. **[CÓDIGO]** `src/shared/editorV6IpcChannels.ts` centraliza nomes e tipos dos canais; `electron/preload.ts` usa invokers tipados e expõe contrato ao renderer sandbox.

9. **[CÓDIGO]** `package.json` declara `npm run typecheck`, `audit:architecture`, `test:editor-v6:quick`, hair, overlay/export, `test:data-runtime`, Roteiros/Base de Vídeos e `package:win:portable`.

10. **[CÓDIGO]** `electron/domains/storage/catalogSchema.cjs` possui migration/schema versão; TypeScript/Zod não substituem testes de compatibilidade de dados binários/JSON salvos em versões anteriores.

## Documentação oficial consultada e limites da API

1. **[FONTE OFICIAL] [electron-vite Build](https://electron-vite.org/guide/build)** — Bundles separados main/preload/renderer, estratégia de chunks e diretórios out.

2. **[FONTE OFICIAL] [electron-vite Dependency Handling](https://electron-vite.org/guide/dependency-handling)** — Dependências nativas/Node têm externalização, bundling e packaging específicos; addon não pode ser tratado como JS genérico.

3. **[FONTE OFICIAL] [Vite Build](https://vite.dev/guide/build)** — Targets, code splitting e assets precisam respeitar as entradas de HTML e o comportamento de imports dinâmicos.

4. **[FONTE OFICIAL] [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing)** — Tipos e type guards são verificação estática; não validam automaticamente JSON/IPC vindo de fora.

5. **[FONTE OFICIAL] [Zod Basics](https://zod.dev/basics)** — Parse/safeParse verificam input runtime, refinements têm custo e precisam de limites claros; atenção a versões da API.

6. **[FONTE OFICIAL] [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)** — CSP, IPC sender, sandbox e custom protocols continuam obrigatórios no build.

7. **[FONTE OFICIAL] [Electron Builder targets](https://www.electron.build/docs/targets/)** — Portable é target Windows sem instalação; confirmar documentação na versão v26, já que latest pode cobrir v27.

**Limitação:** fontes consultadas cobrem a API pública atual, não o build Electron/Node instalado nem as milhões de linhas do motor upstream. Disponibilidade, licenças e formatos precisam de prova na versão empacotada.

## Hipóteses e conclusões fundamentadas

### 1. Bundle de export não é a UI geral

[CÓDIGO] A UI é lazy, o export usa um HTML próprio. Otimizar chunk de rota pode melhorar abertura do editor, mas não garante render/encode de 300 frames mais rápido; medir startup separado.

### 2. Native addon muda ABI/distribuição

[FONTE] Dependências externas/nativas e preloads sandbox exigem planejamento de packaging. Um spike de shared texture ou novo renderer nativo necessita rebuild e teste no portable.

### 3. Zod é fronteira de confiança, não burocracia descartável

[CÓDIGO] Schemas de `EditorV6Document` e IPC impedem dados inválidos causar perda de projeto ou corrupção de exportação. Mesmo que parse grande custe CPU, medir antes de remover e preservar checks.

### 4. Fingerprint do build é fundamental

[CÓDIGO] SHA/dirty embutidos permitem comparar benchmarks; não misturar Dev server com EXE empacotado; alinhar FFmpeg e assets com commit.

### 5. Testes por contrato e owner

[CÓDIGO] O pacote tem gates e scripts específicos para várias áreas. Qualquer alteração no `src/shared/` requer a suite de consumidores, não somente typecheck.

### 6. Versionamento em docs não equivale a runtime

[FONTE] WebCodecs, WebGL2 e outras APIs podem mudar entre versões do Chromium; um range `electron:^45.1.0` precisa ser reconciliado com lockfile e `process.versions` do EXE.

## Protocolo experimental que falta executar

1. **BUILD-01:** Comparar mapa de output/chunks main/preload/renderer entre antes/depois, incluindo export.html, sem ativar source maps privados no release.

2. **BUILD-02:** Rodar typecheck, audit:architecture, build e testes de export/DOM/IPC em fixture, registrar commit e dirty state.

3. **BUILD-03:** Empacotar portable Windows x64 com FFmpeg/Sharp e verificar sessão offline e importações lazy de todas páginas.

4. **BUILD-04:** Testar IPC com payload inválido/limites Zod e referências desatualizadas, rejeitando com segurança.

5. **BUILD-05:** Para add-on nativo novo, validar ABI/rebuild, dlls, permissões de leitura e funcionamento offline Windows.

6. **BUILD-06:** Se otimizar startup/chunk, medir tempo até `ready` do worker de export, separadamente de render por quadro.

## Riscos, compatibilidade e gates obrigatórios

- Não remover validação Zod/IPC ou reduzir limites de dados só para fazer protótipo passar.
- Revisar aliases TypeScript e imports do Main em bundle real após mudança.
- Evitar `file://` direto para mídia como alternativa à sessão com protocolos limitados.
- Documentação de electron-builder latest pode ser v27; projeto declara 26.
- Não declarar teste verde sem execução efetiva; os estudos desta rodada são estáticos.
- Preservar compatibilidade e recuperação de arquivos, previews e app portátil.

## Próxima decisão

**Recomendação:** usar o build existente como infraestrutura confiável para experimentos isolados. Investigar boot/chunks/validação como problemas próprios, sem atribuir 41s de diferença de cabelo ao Vite ou ao TypeScript sem perfil.

**Verificações runtime deste documento:** **NÃO EXECUTADAS**. Ver [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md) e [Progresso](../PROGRESSO_E_RESULTADOS.md).
