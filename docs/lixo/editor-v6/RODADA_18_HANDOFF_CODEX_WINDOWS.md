# Rodada 18 — Kit de execução rápida e transferência técnica para Codex

**Data:** 04/11/2026. **Branch:** Dev-V2. **Tipo:** infraestrutura de experimentos e scaffold puro; **não altera a exportação de produção**.

## Entrega pronta para o Codex

1. `scripts/editor-v6/rapid-gates-windows.cjs` — executor Windows x64 **sequencial**, com fail-fast, tempos por passo, timeout, encerramento **do processo criado por ele** e resumo local JSON sanitizado em `out/editor-v6-rapid/runs/`. Não abre janelas visíveis; o gate offscreen usa os fixtures Electron `show:false/offscreen:true` existentes. **Não** apaga dados/cache/projetos, nem roda benchmark real automaticamente.
2. Comandos npm:
   - `npm run test:editor-v6:doctor` — pré-verificação local de branch, estado e dependências, sem testes nem mídia.
   - `npm run test:editor-v6:quick -- --scope=render` — alguns testes direcionados, nenhum build ou Electron.
   - `npm run test:editor-v6:quick-offscreen -- --scope=render` — testes rápidos seguidos da fixture de cena **invisível**.
   - `npm run test:editor-v6:integration -- --scope=render` — validação de typecheck, arquitetura, Vitest completo, build e offscreen após candidato promissor.
   - `npm run test:editor-v6:integration -- --scope=render --with-mp4` — **explicitamente lento**; valida MP4 sintético com áudio/cabelo onde há fixture, não mede o projeto pessoal.
   - `--scope=hair|character|render|all`. Default `hair`. Timeout de passos curtos/longos e avanço somente após sucesso do passo anterior.
3. `src/shared/editorV6ExportDrawPlan.ts` — **scaffold experimental** de plano de desenho puro para sprites simples (sem React/DOM). Converte coordenadas de stage do `SceneSurface` para comandos do frame, com ordem, escala, flip, rotação e ID de asset. **NÃO renderiza pixels e NÃO está plugado ao Editor.** Se houver cabelo dinâmico, vídeos, fundos com imagem, texto, boca, atlas de movimento, geometria inválida ou imagem ausente, declara `unsupported`. Qualquer `unsupported` **proíbe** tentar backend nativo sem fallback.
4. `tests/editor-v6/exportDrawPlan.test.ts` — verifica geometria, ordem, 30 frames diferentes e rejeição das funções não suportadas; `rapidWindowsGates.test.cjs` verifica gates e proibição Linux/Windows ARM. As verificações passam pela CI Windows x64 normal.
5. Documentação, roteiro e prompt prontos para a próxima execução. O código altera **apenas ferramentas de teste e plano experimental**, sem mexer na renderização da interface, Fabricador, cache, assets ou contratos persistidos.

## Estado que o Codex deve reconhecer antes de começar

A Rodada 17 já foi publicada após a pesquisa da R16 (não repetir investigação):
- **X00** preparação real bloqueada porque o **Preset 2 não existe na cópia isolada atual**. Não criar preset fictício para fingir medida de projeto real nem buscar/gravar perfil ativo. Um snapshot verificado que inclua o preset é pré-requisito para comparar 18,23 s.
- **X02** renderer único original/hairless rejeitado **com API atual**. Reabrir só após separar materiais e camadas no contrato.
- **X07** compositor Canvas2D sintético mais rápido que sharp, porém **0/30 RGBA exatamente iguais**, diferença máxima 2 por canal; não integrá-lo no exportador real.
- Última linha de base completa medida no PC: **34,33 s** quente, 18,23 s preparo cabelo, 16,10 s export (antes de R13–R15). Nenhum tempo de R18 prova aceleração.

## Missão única sugerida — X05, planificador independente do navegador

O Codex recebe `editorV6ExportDrawPlan.ts` como início de um experimento **não integrado** de draw-list. **Não** reescrever React nem trocar renderer atual.

**G0:** rodar `doctor`, `quick -- --scope=render`, conferir resultado. Caso branch desatualizada, primeiro fazer `git fetch origin` e fast-forward seguro sem perder commits/arquivos locais.

**G1:** estender somente o plano para modelar **um subconjunto concreto adicional** da cena, começando por *atlas de transição* OU *boca facial*, mas **não os dois de uma vez**. A geometria deve ser derivada do próprio `SceneSurface.tsx`, não inferida. Criar 7 amostras e testes que confrontem todos os números de geometria com os valores SVG existentes. Manter bloqueio explícito de todo recurso ainda incompatível.

**G2:** se os testes numéricos passarem, fazer 30 frames **distintos** fora da produção e comparar saída **RGBA exata** com fixture Electron invisível. Não gastar tempo instalando Skia/Rust/GPU nem fazer 300 MP4s. Se alpha/antialias diferirem, registrar o primeiro caso, parar e voltar ao contrato de blend; **não** reduzir tolerância.

**G3:** só com paridade RGBA e benefício de tempo, executar `quick-offscreen -- --scope=render`, typecheck e build. Se a arquitetura exigir modificação de contrato público, verificar Fabricador/Customizador também; senão não disparar suítes desnecessárias.

**G4:** **não realizar** benchmark real de 300 frames na primeira tentativa. Esse gate dependerá de demonstrar a viabilidade de um renderer de 30 quadros e de obter fixture Preset 2 válida, com permissão e backup.

## Não fazer

- Não executar Linux, não abrir janela visível, não alterar projeto, registro, usuário ou atalho, não chamar shell com `taskkill /IM electron.exe`; o executor mata somente descendentes do processo iniciado por ele se exceder o timeout.
- Não recriar cache entre reexportações; nem reduzir qualidade, bitrates, resolução, FPS, cabelo, áudio ou transparência.
- Não rodar todos os gates a cada alteração, não voltar a X02/X07 sem hipótese diferente.
- Não fazer push remoto sem autorização. Commits **locais** pequenos após passar teste apropriado.
- Não fingir que `geometryOnlyCandidate: true` significa compatibilidade visual: exige teste de pixels antes de ligar qualquer backend ao produto.

## Critério de boa entrega

Uma única mudança pequena e comprovada no planificador, logs de testes rápidos, contrato de features suportadas/unsupported, o primeiro RGBA de divergência se existir, uma decisão clara (manter o spike / rejeitar) e commit local. **Qualidade total para produto; velocidade e erro rápido para pesquisa.**
