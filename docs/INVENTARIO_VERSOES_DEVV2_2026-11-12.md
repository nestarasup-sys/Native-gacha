# Inventário de versões e atualizações — Dev-V2

| Campo | Valor |
|---|---|
| Levantamento | 12/11/2026 |
| Raiz | `C:\TRABALHO 2\OUTROS\GACHA EM C++` |
| Branch/commit no início desta revisão | `Dev-V2` / `8128ba7d` |

Este inventário cobre o Native Gacha e as ferramentas usadas para desenvolver, empacotar e exportar o app. Não varre nem cataloga programas pessoais instalados no Windows. A seção “Execução das atualizações” registra as mudanças feitas depois do levantamento inicial.

## Resumo

| Área | Situação | Prioridade sugerida |
|---|---|---|
| Node.js global | Atualizado de `24.18.0` para `24.22.3` (LTS) | Atualizado |
| FFmpeg local | Atualizado para `n8.1.3-27-g8dca1586f4`, conforme manifesto, com hash, licença, encoders e smoke MP4 verificados | Atualizado |
| Dependências npm diretas e transitivas | `npm update` avançou dependências compatíveis; não há versões diretas `wanted` pendentes no snapshot atual | Atualizado; majors transitivas incompatíveis continuam sob controle dos pacotes-pai |
| Dependências opcionais | `npm outdated --all` ainda lista itens ausentes/opcionais de outras plataformas; não são necessários nesta instalação Windows | Esperado |
| Auditoria npm | 6 entradas moderadas na cadeia de empacotamento; produção continua com 0 vulnerabilidades | Média; investigar sem downgrade automático |
| npm global | Atualizado de `11.16.0` para `12.2.2`; executou os scripts e verificações após a troca | Atualizado |
| GitHub (`origin/Dev-V2`) | Local tinha 150 commits a mais no início desta etapa e nenhum atrás | Sincronização pendente; não é código local desatualizado |

## Runtimes e ferramentas

### Node.js e npm

- **Node local atual:** `v24.22.3` (MSI oficial validado por SHA-256 e assinatura Authenticode). O engine do projeto aceita `>=22.22.0` (`package.json`). [Notas oficiais do Node.js 24.22.3](https://nodejs.org/en/blog/release/v24.22.3).
- **npm global atual:** `12.2.2`; compatibilidade do engine conferida para Node `24.22.3`. [Pacote npm](https://www.npmjs.com/package/npm).
- **CI:** os workflows agora fixam Node `22.23.5`, patch da linha 22. [Notas oficiais do Node.js 22.23.5](https://nodejs.org/en/blog/release/v22.23.5).

### Electron e Chromium embarcado

- **Electron no levantamento inicial:** `45.1.0`; `npm outdated` reportou `45.3.1` como versão desejada/latest disponível dentro de `^45.1.0`.
- **Runtime inicial medido no executável (`process.versions`):** Chromium `156.0.8078.49`, V8 `15.6.75.19-electron.0` e Node embutido `24.22.1`. O Node do Electron é independente do Node global do terminal.
- **Referência upstream no levantamento:** Electron `45.3.1`, publicado em 11/11, já embute Chromium `156.0.8078.96` e Node `24.22.2`. Portanto, mesmo antes de mudar de major, a instalação local está atrás em patches do Electron/Chromium. [Releases oficiais do Electron](https://releases.electronjs.org/).
- O Chrome estável já está na linha `157` (publicação em 03/11); isso não significa que se possa trocar o Chromium interno isoladamente: o runtime é fornecido e testado como parte do Electron. A decisão compatível é atualizar o Electron para seu patch correspondente e validar o app. [Chrome Stable para Desktop](https://chromereleases.googleblog.com/2026/11/stable-channel-update-for-desktop.html).
- O comando `ELECTRON_RUN_AS_NODE=1 electron.exe -p "JSON.stringify(process.versions)"` mediu o binário realmente instalado; não foi inferido apenas pelo número do pacote.
- Recomenda-se atualizar o Electron em mudança própria e verificar preload/sandbox, captura, renderização e módulo nativo `better-sqlite3`.

### Programas externos chamados pelo app

O rastreio de `spawn`/`execFile` e dos caminhos dos executáveis encontrou estes runtimes/ferramentas de produto:

| Programa/runtime | Uso | Situação observada |
|---|---|---|
| Electron (inclui Chromium, V8 e Node) | Aplicação desktop, renderer e tarefas isoladas | Atualizado para `45.3.1`; Chromium `156.0.8078.96` |
| FFmpeg e FFprobe | Exportação e inspeção de vídeo | Binários locais atrás da versão fixada no manifesto; detalhes acima |
| Node.js global | Scripts npm, build e ferramentas de desenvolvimento | `24.22.3` |
| npm global | Instalação e scripts de dependências | `12.2.2` |
| PowerShell e `taskkill.exe` | Auxiliares Windows de diagnóstico/teste | Componentes do Windows chamados por scripts; não são bibliotecas incluídas no pacote do app |

Não encontrei invocação de outro navegador Chromium/Chrome independente, Python, Git ou outro encoder externo no caminho de execução do produto. Os testes e scripts também usam `node`, `electron` e ferramentas locais listadas acima. Isso é um inventário do software usado pelo projeto, não uma varredura de todos os programas instalados no computador.

### Bibliotecas principais sem atualização direta indicada

Estas dependências diretas foram verificadas no `package.json`, `package-lock.json` e `node_modules`; não apareceram entre os pacotes diretos com `wanted` maior no levantamento. Os números abaixo são os instalados localmente:

| Biblioteca | Instalada | Observação |
|---|---:|---|
| `react` / `react-dom` | 19.3.1 | Interface do renderer |
| `react-router` | 8.5.1 | Rotas |
| `sharp` | 0.35.5 | Imagens; libvips embarcada `8.18.7` |
| `zod` | 4.6.7 | Validação |
| `electron-builder` | 26.18.0 | Empacotamento; a advisory transitiva de `minimatch` é detalhada na seção de auditoria |
| `electron-vite` | 6.0.0 | Build/dev Electron |
| TypeScript principal (`@typescript/native`) | 7.0.2 | Compilador nativo configurado no projeto |
| TypeScript de compatibilidade (`typescript`) | 6.0.2 | Alias legado ainda declarado no projeto |
| `esbuild` | 0.28.2 | Declarado em versão fixa |

O runtime Electron mediu SQLite `3.53.4`; o acesso do app é feito via `better-sqlite3@13.0.3`, cuja atualização `13.1.1` aparece na tabela direta. `sharp` também reportou bibliotecas nativas compiladas como libvips, WebP, PNG, JPEG e TIFF; não são programas autônomos para atualizar separadamente, e sim parte do pacote nativo do `sharp`.

### FFmpeg e FFprobe

- **Versões iniciais antes da atualização:** FFmpeg/FFprobe `n8.1.3-18-g46d899d7a0`, build de 20/10/2026, licença `LGPL-2.1-or-later`.
- **Versão fixada pelo app:** `resources/video-tools.manifest.json` aponta para `n8.1.3-27-g8dca1586f4`, release de 31/10/2026, licença `LGPL-3.0-or-later`.
- O binário agora instalado corresponde ao manifesto, e o teste sintético confirmou `libopenh264` e AAC. A preparação oficial também validou a licença e o SHA-256.
- `resources/video-tools/` é ignorado pelo Git; por isso a atualização local foi feita com o instalador verificado, sem mudar só o manifesto ou o histórico do Git.

## Dependências npm com versões novas — baseline do levantamento

`npm outdated --json` comparou dependências diretas de `package.json` em 12/11/2026. As sete abaixo têm versão `wanted` igual a `latest`, sem exigir mudança do range declarado.

| Pacote | Atual | Disponível | Uso |
|---|---:|---:|---|
| `better-sqlite3` | 13.0.3 | 13.1.1 | Produção; módulo nativo |
| `immer` | 11.2.9 | 11.2.10 | Produção |
| `zustand` | 5.0.16 | 5.1.0 | Produção |
| `electron` | 45.1.0 | 45.3.1 | Runtime do app e Chromium |
| `@vitejs/plugin-react` | 6.1.2 | 6.3.0 | Build |
| `vite` | 8.3.5 | 8.3.8 | Build |
| `vitest` | 5.0.5 | 5.1.0 | Testes |

`npm outdated --omit=dev` retornou especificamente os três pacotes de produção acima. Os outros quatro são dependências de desenvolvimento/build. No momento daquele levantamento ainda não havia atualização do lockfile ou de `node_modules`.

Esta tabela preserva as versões encontradas no começo do levantamento; o estado depois da atualização está registrado em “Execução das atualizações”.

### Árvore transitiva completa — baseline antes da atualização

`npm outdated --all --json` encontrou **285 nomes** com versão mais nova publicada. A saída foi desduplicada por nome de pacote e os registros com `current` foram separados dos que representam dependências opcionais, peers ou binários de outras plataformas:

- **167 nomes têm pacote instalado** nesta árvore. Isso inclui dependências indiretas de Electron Builder, Vite/Rolldown, Babel, Vitest, Browserslist e módulos nativos; não são 167 dependências diretas do app.
- **118 nomes não estão instalados** nesta máquina/árvore. A listagem inclui bindings opcionais para Linux/macOS/arquiteturas não usadas e peers; não devem ser tratados como software local desatualizado.
- Em **39 nomes instalados**, há versão `wanted` diferente da instalada dentro dos ranges já declarados. Em **129 nomes**, a versão mais nova no registry é de major superior à instalada; esse dado pode se sobrepor à lista anterior e não recomenda migrar para a major mais nova.
- Há também mudanças transitivas recentes de patch/minor, como `postcss`, `rolldown`, `node-abi`, `tar`, `undici` e `tslib`. Elas devem ser atualizadas pelo dono direto da cadeia e lockfile, sem forçar versões transitivas por overrides antes de avaliar compatibilidade.
- A visão de prioridade para manutenção é: dependências diretas e avisos de segurança primeiro; dependências transitivas com `wanted` avançado em seguida; majors transitivas apenas quando o pacote pai adotar suporte. `npm outdated --all` compara o registry, não prova que cada versão latest seja compatível com esta aplicação.

### Lista completa de pacotes instalados com atualização

A tabela registra cada nome instalado que `npm outdated --all` marcou como desatualizado; `wanted` é a atualização dentro do range da cadeia e `latest` é a versão mais nova publicada, que pode exigir major incompatível. Os itens opcionais ausentes foram excluídos daqui e contabilizados acima.

| Pacote | Instalado | Wanted | Latest |
|---|---:|---:|---:|
| `@babel/code-frame` | 7.29.7 | 7.29.7 | 8.0.6 |
| `@babel/compat-data` | 7.29.7 | 7.29.7 | 8.1.2 |
| `@babel/core` | 7.29.7 | 7.29.13 | 8.1.2 |
| `@babel/generator` | 7.29.8 | 7.29.14 | 8.1.2 |
| `@babel/helper-compilation-targets` | 7.29.7 | 7.29.13 | 8.0.7 |
| `@babel/helper-globals` | 7.29.7 | 7.29.7 | 8.0.6 |
| `@babel/helper-module-imports` | 7.29.7 | 7.29.7 | 8.0.0 |
| `@babel/helper-module-transforms` | 7.29.7 | 7.29.14 | 8.1.2 |
| `@babel/helper-plugin-utils` | 7.29.7 | 7.29.7 | 8.0.1 |
| `@babel/helper-string-parser` | 7.29.7 | 7.29.14 | 8.1.2 |
| `@babel/helper-validator-identifier` | 7.29.7 | 7.29.7 | 8.0.6 |
| `@babel/helper-validator-option` | 7.29.7 | 7.29.7 | 8.0.0 |
| `@babel/helpers` | 7.29.10 | 7.29.14 | 8.1.2 |
| `@babel/parser` | 7.29.9 | 7.29.14 | 8.1.2 |
| `@babel/plugin-transform-arrow-functions` | 7.29.7 | 7.29.7 | 8.0.1 |
| `@babel/template` | 7.29.7 | 7.29.7 | 8.1.2 |
| `@babel/traverse` | 7.29.10 | 7.29.14 | 8.1.2 |
| `@babel/types` | 7.29.8 | 7.29.14 | 8.1.2 |
| `@electron-internal/extract-zip` | 1.0.5 | 1.0.8 | 1.0.8 |
| `@electron/asar` | 3.4.1 | 3.4.1 | 4.3.1 |
| `@electron/fuses` | 1.8.0 | 1.8.0 | 2.1.3 |
| `@electron/get` | 3.1.0 | 3.1.0 | 5.1.0 |
| `@electron/notarize` | 2.5.0 | 2.5.0 | 3.1.2 |
| `@electron/osx-sign` | 1.3.3 | 1.3.3 | 2.7.2 |
| `@electron/universal` | 2.0.3 | 2.0.3 | 3.0.6 |
| `@electron/windows-sign` | 1.2.2 | 1.2.2 | 2.1.0 |
| `@noble/hashes` | 1.8.0 | 1.8.0 | 2.4.0 |
| `@oxc-project/types` | 0.156.0 | 0.156.0 | 0.158.0 |
| `@peculiar/asn1-schema` | 2.11.1 | 2.11.1 | 3.0.0 |
| `@peculiar/json-schema` | 1.1.12 | 1.1.12 | 3.0.0 |
| `@peculiar/utils` | 2.0.3 | 2.0.3 | 4.1.0 |
| `@peculiar/webcrypto` | 1.7.1 | 1.7.2 | 2.0.0 |
| `@remix-run/route-pattern` | 0.22.1 | 0.22.1 | 1.0.0 |
| `@rolldown/binding-win32-x64-msvc` | 1.2.16 | 1.2.16 | 1.3.2 |
| `@rolldown/pluginutils` | 1.0.1 | 1.1.0 | 1.1.0 |
| `@sindresorhus/is` | 4.6.0 | 4.6.0 | 8.1.0 |
| `@szmarczak/http-timer` | 4.0.6 | 4.0.6 | 5.0.1 |
| `@types/estree` | 1.0.9 | 1.0.10 | 1.0.10 |
| `@types/fs-extra` | 9.0.13 | 9.0.13 | 11.0.4 |
| `@types/node` | 24.19.2 | 26.6.6 | 26.6.6 |
| `@typescript/old:typescript@^6` | 6.0.3 | 6.0.3 | 7.0.2 |
| `@vitejs/plugin-react` | 6.1.2 | 6.3.0 | 6.3.0 |
| `@vitest/mocker` | 5.0.5 | 5.0.5 | 5.1.0 |
| `@vitest/spy` | 5.0.5 | 5.0.5 | 5.1.0 |
| `@xmldom/xmldom` | 0.8.15 | 0.8.15 | 0.9.12 |
| `abbrev` | 4.0.0 | 4.0.0 | 5.0.0 |
| `agent-base` | 7.1.4 | 7.1.4 | 9.0.0 |
| `ansi-regex` | 5.0.1 | 5.0.1 | 6.6.0 |
| `ansi-styles` | 4.3.0 | 4.3.0 | 7.0.0 |
| `argparse` | 2.0.1 | 2.0.1 | 3.0.4 |
| `asn1js` | 3.1.0 | 3.1.0 | 4.0.0 |
| `asynckit` | 0.4.0 | 0.4.0 | 0.5.0 |
| `balanced-match` | 1.0.2 | 1.0.2 | 5.0.0 |
| `baseline-browser-mapping` | 2.11.28 | 2.11.36 | 2.11.36 |
| `better-sqlite3` | 13.0.3 | 13.1.1 | 13.1.1 |
| `brace-expansion` | 1.1.21 | 1.1.22 | 5.0.13 |
| `browserslist` | 4.29.3 | 4.29.5 | 4.29.5 |
| `bytestreamjs` | 2.0.1 | 2.0.1 | 3.0.0 |
| `cacheable-lookup` | 5.0.4 | 5.0.4 | 7.0.0 |
| `cacheable-request` | 7.0.4 | 7.0.4 | 13.0.19 |
| `caniuse-lite` | 1.0.30001816 | 1.0.30001826 | 1.0.30001826 |
| `chalk` | 4.1.2 | 4.1.2 | 6.0.1 |
| `ci-info` | 4.3.1 | 4.3.1 | 4.5.0 |
| `cliui` | 8.0.1 | 8.0.1 | 9.0.1 |
| `clone-response` | 1.0.3 | 1.0.3 | 2.0.0 |
| `color-convert` | 2.0.1 | 2.0.1 | 3.1.3 |
| `color-name` | 1.1.4 | 1.1.4 | 2.1.1 |
| `commander` | 5.1.0 | 5.1.0 | 15.1.0 |
| `concat-map` | 0.0.1 | 0.0.1 | 0.0.2 |
| `decompress-response` | 6.0.0 | 6.0.0 | 10.0.0 |
| `dir-compare` | 4.2.0 | 4.2.0 | 5.0.0 |
| `dotenv-expand` | 11.0.7 | 11.0.7 | 1000.0.0 |
| `dotenv` | 16.6.1 | 16.6.1 | 18.0.10 |
| `ejs` | 3.1.10 | 3.1.10 | 7.0.2 |
| `electron-to-chromium` | 1.5.454 | 1.5.483 | 1.5.483 |
| `electron-winstaller` | 5.4.0 | 5.4.0 | 5.4.4 |
| `electron` | 45.1.0 | 45.3.1 | 45.3.1 |
| `emoji-regex` | 8.0.0 | 8.0.0 | 11.0.0 |
| `env-paths` | 3.0.0 | 3.0.0 | 4.0.0 |
| `err-code` | 2.0.3 | 2.0.3 | 3.0.1 |
| `es-module-lexer` | 2.3.2 | 2.3.2 | 3.0.4 |
| `escape-string-regexp` | 4.0.0 | 4.0.0 | 5.0.0 |
| `fast-uri` | 3.1.9 | 3.1.9 | 4.2.3 |
| `filelist` | 1.0.6 | 1.0.6 | 2.0.2 |
| `fs-extra` | 9.1.0 | 9.1.0 | 11.4.1 |
| `get-stream` | 5.2.0 | 5.2.0 | 9.0.1 |
| `glob` | 7.2.3 | 7.2.3 | 14.0.6 |
| `global-agent` | 3.0.0 | 3.0.0 | 4.1.7 |
| `got` | 11.8.6 | 11.8.6 | 16.2.0 |
| `graceful-fs` | 4.2.11 | 4.2.12 | 4.2.12 |
| `has-flag` | 4.0.0 | 4.0.0 | 5.0.1 |
| `hosted-git-info` | 4.1.0 | 4.1.0 | 10.1.1 |
| `http-proxy-agent` | 7.0.2 | 7.0.2 | 9.1.0 |
| `http2-wrapper` | 1.0.3 | 1.0.3 | 2.2.4 |
| `https-proxy-agent` | 7.0.6 | 7.0.6 | 9.1.0 |
| `immer` | 11.2.9 | 11.2.10 | 11.2.10 |
| `is-fullwidth-code-point` | 3.0.0 | 3.0.0 | 5.1.0 |
| `isarray` | 1.0.0 | 1.0.0 | 2.0.5 |
| `isbinaryfile` | 4.0.10 | 4.0.10 | 6.0.0 |
| `isexe` | 3.1.5 | 3.1.5 | 4.0.0 |
| `jake` | 10.9.4 | 10.9.4 | 13.0.3 |
| `js-tokens` | 4.0.0 | 4.0.0 | 10.0.0 |
| `js-yaml` | 4.3.2 | 4.3.2 | 5.5.0 |
| `jsonfile` | 4.0.0 | 4.0.0 | 6.2.1 |
| `keyv` | 4.5.4 | 4.5.4 | 6.1.0 |
| `lowercase-keys` | 2.0.0 | 2.0.0 | 4.0.1 |
| `lru-cache` | 5.1.1 | 5.1.1 | 11.5.3 |
| `matcher` | 3.0.0 | 3.0.0 | 7.0.0 |
| `mime-db` | 1.52.0 | 1.52.0 | 1.54.0 |
| `mime-types` | 2.1.35 | 2.1.35 | 3.0.2 |
| `mime` | 2.6.0 | 2.6.0 | 4.1.2 |
| `mimic-response` | 1.0.1 | 1.0.1 | 4.0.0 |
| `minimatch` | 3.1.5 | 3.1.5 | 11.0.8 |
| `mkdirp` | 0.5.6 | 0.5.6 | 3.0.1 |
| `nanoid` | 3.3.20 | 3.3.20 | 6.0.2 |
| `node-abi` | 4.38.0 | 4.40.0 | 4.40.0 |
| `node-gyp` | 12.4.0 | 12.4.0 | 13.1.0 |
| `node-releases` | 2.0.58 | 2.0.63 | 2.0.63 |
| `nopt` | 9.0.0 | 9.0.0 | 10.0.1 |
| `normalize-url` | 6.1.0 | 6.1.0 | 10.0.0 |
| `p-cancelable` | 2.1.1 | 2.1.1 | 5.0.0 |
| `p-limit` | 3.1.0 | 3.1.0 | 7.3.3 |
| `path-key` | 3.1.1 | 3.1.1 | 4.0.0 |
| `pe-library` | 0.4.1 | 0.4.1 | 2.0.1 |
| `pkijs` | 3.4.3 | 3.4.3 | 4.0.1 |
| `plist` | 3.1.0 | 3.1.1 | 5.1.1 |
| `postcss` | 8.5.30 | 8.5.32 | 8.5.32 |
| `proc-log` | 6.1.0 | 6.1.0 | 7.0.0 |
| `pvutils` | 1.2.0 | 1.2.0 | 2.0.0 |
| `quick-lru` | 5.1.1 | 5.1.1 | 7.3.0 |
| `readable-stream` | 2.3.8 | 2.3.8 | 4.8.0 |
| `resedit` | 1.7.2 | 1.7.2 | 3.1.0 |
| `responselike` | 2.0.1 | 2.0.1 | 4.0.2 |
| `retry` | 0.12.0 | 0.12.0 | 0.13.1 |
| `rimraf` | 2.6.3 | 2.6.3 | 6.1.4 |
| `roarr` | 2.15.4 | 2.15.4 | 7.21.7 |
| `rolldown` | 1.2.16 | 1.2.19 | 1.3.2 |
| `safe-buffer` | 5.1.2 | 5.1.2 | 5.2.1 |
| `sanitize-filename` | 1.6.4 | 1.6.5 | 1.6.5 |
| `semver` | 6.3.1 | 6.3.2 | 7.8.6 |
| `serialize-error` | 7.0.1 | 7.0.1 | 13.1.0 |
| `shebang-regex` | 3.0.0 | 3.0.0 | 4.0.0 |
| `signal-exit` | 3.0.7 | 3.0.7 | 4.1.0 |
| `source-map` | 0.6.1 | 0.6.1 | 0.8.0 |
| `string_decoder` | 1.1.1 | 1.1.1 | 1.3.0 |
| `string-width` | 4.2.3 | 4.2.3 | 9.0.0 |
| `strip-ansi` | 6.0.1 | 6.0.1 | 7.2.0 |
| `supports-color` | 7.2.0 | 7.2.0 | 11.0.0 |
| `tar` | 7.5.22 | 7.5.23 | 7.5.23 |
| `tiny-async-pool` | 1.3.0 | 1.3.0 | 2.1.0 |
| `tinybench` | 6.2.2 | 6.2.3 | 6.2.3 |
| `tslib` | 2.8.1 | 2.9.1 | 2.9.1 |
| `type-fest` | 0.13.1 | 0.13.1 | 5.10.0 |
| `undici-types` | 7.24.6 | 7.24.6 | 8.12.4 |
| `undici` | 7.30.1 | 7.30.2 | 8.12.4 |
| `universalify` | 0.1.2 | 0.1.2 | 2.0.1 |
| `vite` | 8.3.5 | 8.3.8 | 8.3.8 |
| `vitest` | 5.0.5 | 5.1.0 | 5.1.0 |
| `webcrypto-core` | 1.9.2 | 1.9.2 | 2.0.0 |
| `which` | 5.0.0 | 5.0.0 | 7.0.0 |
| `why-is-node-running` | 3.2.1 | 3.2.1 | 3.2.3 |
| `wrap-ansi` | 7.0.0 | 7.0.0 | 10.0.2 |
| `yallist` | 4.0.0 | 4.0.0 | 5.0.0 |
| `yargs-parser` | 21.1.1 | 21.1.1 | 22.0.0 |
| `yargs` | 17.7.3 | 17.7.3 | 18.2.0 |
| `yocto-queue` | 0.1.0 | 0.1.0 | 1.2.2 |
| `zustand` | 5.0.16 | 5.1.0 | 5.1.0 |

## Auditoria de vulnerabilidades

- `npm audit --omit=dev`: **0** vulnerabilidades de produção.
- `npm audit` completo: **6 entradas moderadas**, 0 altas e 0 críticas. As entradas pertencem à cadeia de build `electron-builder`/`app-builder-lib` e repetem a advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) de negação de serviço em `minimatch`.
- A árvore instalada contém `minimatch@10.2.6`, dentro do intervalo afetado `>=7.0.0 <11.0.1`. A advisory chega como dependência de `electron-builder@26.18.0`; o audit sugere `electron-builder@25.1.0`, que seria downgrade de major. Não aplicar `npm audit fix --force` sem confirmar compatibilidade e estratégia de correção.

## Sincronização Git

- `Dev-V2` na abertura desta etapa estava **149 commits à frente** de `origin/Dev-V2` e **0 commits atrás** (`git rev-list --left-right --count origin/Dev-V2...Dev-V2` retornou `0 149`). As atualizações ficam locais; nenhum commit foi enviado.
- O diff local comparado ao tracking remoto cobre 319 arquivos. Isso indica que o GitHub está atrasado em relação a esta pasta local; não indica que a branch principal local esteja atrasada.
- O levantamento não publicou nem alterou histórico remoto. Push deve ser tratado separadamente, depois de revisar o conteúdo desses commits.

## Ordem sugerida para atualizar depois

1. Analisar a advisory de `minimatch` no Electron Builder; `npm audit fix --dry-run` ainda recomenda downgrade major para `electron-builder@25.1.0`, então não foi aplicado.
2. Tratar os 150+ commits locais não publicados como sincronização Git independente; não confundir isso com atualização de dependências.

## Comandos e evidências locais

- `git status --short --branch`, `git rev-list --left-right --count origin/Dev-V2...Dev-V2`
- `npm outdated --json`, `npm outdated --omit=dev --json`
- `npm outdated --all --json` (285 nomes; avaliação de pacotes transitivos e opcionais)
- `npm audit --json`, `npm audit --omit=dev --json`, `npm ls minimatch --all`
- `node --version`, `npm --version`
- `ELECTRON_RUN_AS_NODE=1 electron.exe -p "JSON.stringify(process.versions)"` (Electron/Chromium/V8/Node embutidos)
- `resources/video-tools/BUILD_INFO.json`, `resources/video-tools.manifest.json`, `ffmpeg.exe -version`, `ffmpeg.exe -encoders`
- SHA-256 e assinatura Authenticode do MSI oficial do Node; SHA-256 do ZIP FFmpeg conforme manifesto

## Execução das atualizações — 12/11/2026

Foram aplicadas atualizações npm em etapas. A primeira atualizou sete dependências diretas e 13 pacotes na árvore; depois `npm update` avançou o restante compatível, com mais 36 pacotes alterados, quatro adicionados e sete removidos. Por fim, `electron-builder` foi atualizado de `26.18.0` para `26.18.1` por ser o patch da linha v26 indicado pelo dry run da auditoria. O lockfile ficou atualizado; os ranges só mudaram para `electron-builder` (`^26.18.1`).

| Pacote | Antes | Depois |
|---|---:|---:|
| `better-sqlite3` | 13.0.3 | 13.1.1 |
| `immer` | 11.2.9 | 11.2.10 |
| `zustand` | 5.0.16 | 5.1.0 |
| `electron` | 45.1.0 | 45.3.1 |
| `@vitejs/plugin-react` | 6.1.2 | 6.3.0 |
| `vite` | 8.3.5 | 8.3.8 |
| `vitest` | 5.0.5 | 5.1.0 |
| `electron-builder` | 26.18.0 | 26.18.1 |

O Electron foi instalado pelo script do projeto e `better-sqlite3` recompilado para o ABI dele. O runtime atualizado confirmou Chromium `156.0.8078.96`, Node embutido `24.22.2`, V8 `15.6.75.50-electron.0` e SQLite `3.54.1` pelo módulo nativo.

O Node global foi atualizado para `24.22.3` com o MSI oficial, cujo hash e assinatura Authenticode foram verificados; o npm global foi atualizado para `12.2.2`. Os sete pins de Node nos workflows GitHub Actions passaram de `22.22.0` para `22.23.5`. O manifesto do FFmpeg não precisou ser alterado: o binário local agora corresponde ao pacote e hash que já estavam fixados.

### Verificações executadas

- `npm run typecheck` — passou.
- `npm run build` — passou (main, preload e renderer).
- `npm run test:editor-v6:quick` — passou; 13 arquivos Vitest/62 testes, além das verificações do gate.
- `npm run test:application:window` — 9 testes passaram.
- `npm run test:application:persistence-shutdown` — 11 testes passaram.
- `npm run test:customizer:hair-palette` — 6 testes passaram.
- `npm run test:fabricator:palette-normalizer` — 12 testes passaram.
- `npm run test:customizer:face-appearance` — 4 testes passaram.
- `npm run test:customizer:character-save` — 6 testes passaram.
- `npm test` — 29 testes passaram após corrigir uma falha real na migração de app-data: `fs.mkdirSync(staging)` criava o destino antes de `fs.cpSync(... errorOnExist: true)`. A cópia agora cria o staging, preservando o caminho de verificação e limpeza.
- `npm run test:editor-v6` — 20 testes de perfil mais 744 testes passaram; 1 teste foi ignorado pela própria suíte.
- Smoke isolado do `better-sqlite3` carregado no Node do Electron — passou; consulta retornou SQLite `3.54.1`.
- `npm audit --omit=dev` — 0 vulnerabilidades de produção. `npm audit` completo ainda informa 6 entradas moderadas na cadeia de empacotamento Electron Builder/`minimatch`; nenhuma correção automática com downgrade de major foi aplicada.
- `npm ls --all` — sem dependências ausentes ou inválidas após a atualização.
- `npm outdated --json` — nenhuma dependência direta com versão `wanted` acima da instalada; o patch atual do Electron Builder é `26.18.1` mesmo que o dist-tag `latest` ainda reporte `26.18.0`.
- `npm audit fix --dry-run` — investigado. A correção automática completa ainda pede downgrade para `electron-builder@25.1.0`; não aplicado por ser downgrade major. O patch `26.18.1` foi aplicado, mas não removeu a advisory de `minimatch`.
- `npm` final usado nos testes — `12.2.2`; Node global — `24.22.3`.
- Após as atualizações, `npm outdated --all` ainda encontrou pacotes transitivos com versão major mais nova, geralmente presos a ranges dos pacotes-pai: no snapshot, 269 nomes, 150 instalados, 119 opcionais/ausentes e 129 majors novas. Um item instalado ainda tem `wanted` maior: `plist` 3.1.0 → 3.1.1 nas cadeias de `@electron/osx-sign` e `@electron/universal`; o `app-builder-lib` fixa outra cópia em 3.1.0. Deixei os ranges dos pais intactos, sem override transitivo.

### FFmpeg/FFprobe

A primeira tentativa de download via `Invoke-WebRequest` ficou em 0 bytes e foi interrompida; os binários antigos foram restaurados e verificados. Em seguida, o ZIP oficial foi baixado por `curl`, seu SHA-256 bateu com o manifesto (`d4c2a426…c6c613d`), e o instalador do projeto validou licença LGPL 3, hash, FFmpeg/FFprobe e encoders requeridos. O app agora usa `n8.1.3-27-g8dca1586f4`.

Foi criado um smoke MP4 sintético de 1 segundo em `%TEMP%`, codificado com H.264 `libopenh264` e áudio AAC; FFprobe confirmou duração, resolução e codecs. O backup verificável dos binários anteriores foi preservado em `C:\Users\luiz\AppData\Local\Temp\gacha-video-tools-previous-20261112` até nova confirmação de estabilidade. Nenhum projeto do usuário, `app-data`, exportação real ou perfil local foi usado nos testes.
