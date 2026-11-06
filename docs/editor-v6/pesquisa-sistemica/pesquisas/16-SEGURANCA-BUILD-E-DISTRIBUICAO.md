# Pesquisa 16 — Segurança, Electron main/preloads, Vite, empacotamento e contratos

**Estado:** PESQUISADA EM CÓDIGO E DOCUMENTAÇÃO PRIMÁRIA · RUNTIME/TESTES NÃO EXECUTADOS.
**Data:** 06/11/2026. **Base estática:** Dev-V2 (commit `5166de7`, antes dos documentos deste Grupo A). Revalidar HEAD e working tree local antes de implementar.

## Questão e critério de saída

Quais regras de segurança, build e compatibilidade garantem que um novo motor gráfico, codec ou cache rode no Native Gacha sem expor dados e sem quebrar o EXE portátil Windows?

## Evidências verificadas no código do aplicativo

1. **[CÓDIGO]** `electron/application/mainWindow.ts:35–37` usa `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`; `:54–69` coordena flush das gravações antes de fechamento.

2. **[CÓDIGO]** `electron/windowNavigation.ts:4–7` bloqueia navegação arbitrária e criação de janelas; `windowPermissions.ts:10–28` restringe permission request/check.

3. **[CÓDIGO]** `electron/windowResourcePolicy.ts:12–35` controla recursos autorizados para páginas de trabalho; `electron/mediaProtocols.ts:38–98` oferece protocolos internos `gacha-video`, `gacha-editor-media`, `gacha-background`, `gacha-gif` com resolução limitada.

4. **[CÓDIGO]** `electron/application/rendererContentSecurityPolicy.ts:31–58` define CSP restritiva (`script-src 'self'`, img/media-src específicos) e origem localhost para HMR em dev; plugin injeta meta CSP no build.

5. **[CÓDIGO]** `electron/preload.ts:109–126` expõe invocadores tipados do EditorV6, e `electron/editorV6ExportPreload.ts`/`editorV6MotionPreload.ts` têm bridges distintas para workers.

6. **[CÓDIGO]** `electron/domains/editorV6/primaryIpc.ts:23–54` valida `assertTrustedSender`, dados e IDs; `exportIpc.ts:158–219` valida payload, sender e job de exportação.

7. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:60–86` cria sessões/partições isoladas para cada worker, limita mídia a assets do projeto e mantém sandbox.

8. **[CÓDIGO]** `electron.vite.config.ts:22–55` cria builds separados main/preload/renderer e entradas de HTML normal/export; define SHA e dirty state compilados no main bundle.

9. **[CÓDIGO]** `package.json` possui `build=electron-vite build`, `package:win:portable` com `electron-builder --win portable --x64`, typecheck, `audit:architecture` e suites de V6, Studio, Fabricador, Roteiros e Base de Vídeos.

10. **[CÓDIGO]** `electron/dataPlatform.cjs:80–85` verifica schema; `pendingPersistenceIpc.ts:18–21` aguarda flush de renderer antes de Main. Build novo deve preservar recuperação/compatibilidade de storage e shutdown.

## Pesquisa nas fontes oficiais

1. **[FONTE OFICIAL] [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)** — Recomenda context isolation/sandbox, sender validation, CSP, controle de navegação, custom protocols, nunca habilitar Node para conteúdo remoto.

2. **[FONTE OFICIAL] [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)** — Main/renderer/preload são trust boundaries; APIs nativas devem passar por bridge com contrato mínimo.

3. **[FONTE OFICIAL] [electron-vite Build](https://electron-vite.org/guide/build)** — Builds main, preload e renderer em diretórios separados por padrão; splits/chunks exigem configuração e caminhos corretos.

4. **[FONTE OFICIAL] [electron-vite Development](https://electron-vite.org/guide/dev)** — Preloads conectam contextBridge e IPC, com builds de entradas distintas; dev HMR não equivale ao comportamento offline empacotado.

5. **[FONTE OFICIAL] [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing)** — Instrumentação Chromium pode capturar informações técnicas sensíveis; fazer opt-in e sanitização.

**Limite de proveniência:** informações de documentação oficial foram confrontadas conceitualmente com as APIs usadas no código, mas o EXE e as versões efetivas instaladas não foram executados. Não existe medição própria neste estudo.

## Análise causal e possibilidades de mudança

### 1. Duas superfícies de execução

[CÓDIGO] UI React e exportWorker usam bundles, protocolos e preloads diferentes. Novo import de recurso nativo pode funcionar em dev e falhar no `portable.exe` por packaging, node ABI, DLL ou caminho de arquivo.

### 2. Sandbox impede atalhos perigosos

[FONTE + CÓDIGO] Não habilitar `nodeIntegration:true` no renderer só para acessar FFmpeg direto ou textura D3D; integração deve ficar no Main/addon nativo com bridge mínima e payloads validados.

### 3. CSP integra superfície de mídia

[CÓDIGO] URLs de mídia internas estão explicitamente autorizadas e limitadas por schema. Trocar por `file://` ou desabilitar CSP para simplificar teste altera superfície de ataque e integridade de paths.

### 4. O timestamp do build importa para benchmark

[CÓDIGO] `electron.vite.config.ts` inclui SHA/dirty do código no binário; usar isso para relacionar relatório de export a revisão. Render de dev e portable não são baselines equivalentes.

### 5. Cadeia de testes deve acompanhar módulo alterado

[CÓDIGO] `audit:architecture`, `test:application:window`, `test:editor-v6:export`, `test:editor-v6:export-overlay`, testes de character/roteiros/biblioteca se mudanças compartilhadas. Executar conforme dependências de Windows e artefatos.

### 6. Licenças e codecs

[HIPÓTESE] FFmpeg build externo/Sharp/libvips/addons nativos e novos motores têm distribuição/licenciamento próprios; registrar SBOM/licença de binário efetivo antes de distribuir. Não supor licença apenas por pacote npm.

## Experimentos propostos (ainda não rodados)

1. **SEC-01:** Suite IPC com remetente não autorizado, frame filho, esquema externo, path traversal e mime não permitido; deve ser negado sem side effects.

2. **SEC-02:** Abrir UI e export worker no `portable.exe` offline, com HMR ausente e CSP funcional, protocol/media Range funcionando.

3. **SEC-03:** Simular cancelamento/exceção e fechar com gravações pendentes, garantido flush e nenhum arquivo parcialmente publicado.

4. **SEC-04:** Inspecionar dependências nativas e FFmpeg empacotados; comparar features/ABI e dlls no Windows alvo.

5. **SEC-05:** Rodar `npm run typecheck`, `npm run audit:architecture`, `npm run build`, suites específicas e smoke do portable Windows; reportar comandos não rodados com motivo.

## Gates de segurança, qualidade e integração

- Nunca abrir `nodeIntegration`, desabilitar sandbox ou CSP só para benchmark.
- IPC sender, dados e permissões não podem ter regressão.
- Nenhum upgrade de Electron/FFmpeg só por documentação 'latest' sem compatibilidade verificada.
- Tratar profiles pessoais, bibliotecas e mídia como dados privados; testes com fixture isolada.
- Publicação de binários requer testes offline, recuperação, áudio/vídeo e licença do build empacotado.

## Veredito da pesquisa

**O grupo A inclui segurança/build como requisitos estruturais, não como otimização secundária.** A aplicação já possui CSP, bridges restritas, versionamento de build e testes. Próximo passo é teste do EXE Windows após qualquer experimento nativo ou de renderer, antes de promover para produção.

**[A CONFIRMAR]** Versões runtime e compatibilidade do executável empacotado do usuário, packaging de novos addons e desempenho real do startup/worker.

**Rastreabilidade:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Fontes oficiais](../evidencias/FONTES-OFICIAIS.md).
