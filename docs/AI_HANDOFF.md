# Handoff técnico para IA — Native Gacha

**Atualizado:** 2026-11-05

**Repositório:** https://github.com/nestarasup-sys/Native-gacha

**Branch de referência:** `Dev-V2`

**Commit de referência do código:** `2b559233` (`feat(editor-v7): export text and media overlays`)

Este guia acompanha o código-fonte para que outra IA possa entender o aplicativo, continuar o trabalho com segurança e distinguir comportamento comprovado de trabalho ainda aberto. Leia primeiro `AGENTS.md`, `README.md` e este documento. O repositório GitHub é a fonte completa do código e do histórico; o ZIP de handoff é uma cópia sem `.git` e sem dados locais.

## O produto

Native Gacha é um aplicativo desktop para criação de personagens, customização, composição e edição/exportação audiovisual. A aplicação usa Electron, React e TypeScript, com persistência local e módulos de domínio. V6 continua sendo o editor existente e proprietário de seus documentos; V7 é uma área paralela em evolução e ainda não substitui V6.

O `README.md` pode descrever outra branch como oficial. Para este handoff, a branch pedida e publicada pelo usuário é `Dev-V2`; confirme `git remote -v`, `git status -sb` e o commit antes de alterar ou publicar.

## Como começar

Requisito de runtime: Node.js 22.22.0 ou mais recente (`.nvmrc`) e npm. No Windows é possível validar a integração desktop completa.

```bash
npm ci
npm run audit:architecture
npm run typecheck
npm run build
npm run dev
```

Verificações úteis por área:

```bash
npm run test:editor-v6:quick
npm run test:editor-v7:core
npm run test:editor-v7:renderer
```

Consulte os scripts efetivamente disponíveis em `package.json`; escolha testes relacionados à mudança. Alguns testes de integração/export dependem de Windows, Electron, FFmpeg e do backup sintético/verificado autorizado.

## Mapa da arquitetura

- `electron/`: processo principal, domínios, coordenação, persistência e IPC.
- `electron/preload/` e preloads de domínio: APIs estreitas para renderer; manter `contextIsolation`, sandbox e validação de origem/dados.
- `src/renderer/src/features/`: páginas, componentes, hooks e interfaces organizados por área.
- `src/shared/`: contratos e regras de domínio compartilhadas; não deve importar páginas React nem detalhes de persistência.
- `tests/`: testes de domínio, contratos, regressão e verificações de render/export.
- `scripts/`: gates de arquitetura, diagnósticos, benchmarks e harnesses autorizados.
- `docs/architecture/`: ADRs e histórico de decisões arquiteturais.
- `docs/editor-v6/`, `docs/EDITOR V6 MES 11/texto.md`: arquitetura, evolução, medições e plano vivo do V6.
- `docs/editor-v7/EDITOR_V7.md`: pesquisa, estado, critérios e decisões provisórias do V7.

Propriedade de dados: Fabricador é dono do catálogo-fonte; Customizador é dono da instância/personagem e personalizações; Studio é dono da cena/documento próprio; Editor V6 é dono do projeto/timeline V6. Consumidores devem ligar dados por IDs e contratos estáveis, sem copiar catálogos ou importar detalhes internos de outra feature.

## Editor V6 — estado e problemas

### Exportação e desempenho

- Projeto autorizado de referência: **“Teste de Importação — Personagens do Pacote”**, ID `2d6fb9ec-cfea-45ea-91ff-366fbc1abd59`, 2.394 quadros, 79,8 s, 30 FPS. O único backup verificável registrado está em `out/editor-v6-stress/backups/authorized-import-package-2026-11-05T09-54-16-913Z-20828/`.
- Baseline completo anterior à otimização grow-only: cabelo Preset 1, export aquecido mediano de 228,527 s (melhor 206,735 s); controle aquecido sem cabelo, 54,662 s. A meta de export integral ≤30 s permanece não cumprida.
- Na janela 0–599 (20 s), o buffer WebGL grow-only reduziu o tempo de export medido de 50,37 s para 33,41 s (-33,7%); ponta a ponta, de 59,76 s para 42,64 s (-28,6%). Resolução/FPS, áudio/vídeo e os 600 quadros foram validados. SSIM contra os baselines foi 1,000000. Esta otimização tem commit `1854a62b`, mas ainda carece de validação numa janela mais ampla e numa exportação integral atualizada.
- Causa confirmada do custo antigo: o canvas WebGL compartilhado mudava de dimensão ao compor texturas de cabelo; configuração de estado e redimensionamento custavam ~20 s somados por worker na janela. A solução grow-only reduziu `hairCompositionMs` para ~0,76–0,88 s por worker.
- Captura/renderização via Chromium é um gargalo restante provável; medições internas por worker se sobrepõem, portanto não somar esses tempos como parede. Medir as fases e validar outra janela antes de redesenhar o pipeline.

### Animação e defeitos visuais reportados

- Em 2026-11-05 foram exportados trechos focados reais, 30 quadros cada, com Preset 1:
  - `test`, pose 1→6, janela 443–472: 1/1 transição preparada; quadros intermediários observados; MP4 1920×1080/30 FPS com áudio/vídeo válido; parede 12,81 s.
  - `hino`, pose 3→1, janela 1343–1372: 1/1 transição preparada; MP4 válido; parede 14,30 s. O ator está em x=-43% da cena, quase fora do quadro.
- O agendador usa 250 ms e sete amostras a 30 FPS. A transição de `test` existe e parece gradual nos quadros extraídos, mas sua curta duração pode ser percebida como abrupta. Não foi confirmada uma falha geral do scheduler.
- Aumento vertical rápido durante algumas animações: causa **não reproduzida/confirmada**. Nos cinco pares de pose do documento, altura salva varia no máximo ~0,53% entre endpoints; escala do personagem e escala vertical explícita permanecem iguais. O bake usa recortes alfa dos endpoints e recortes das amostras intermediárias. Variação da silhueta é uma hipótese, ainda não evidência causal.
- Defeitos A/B/C de animação dinâmica de cabelo: inspeção anterior é limitada, mas esta frente está suspensa pelo usuário. A aparência estática do cabelo continua parte da qualidade visual básica e deve permanecer preservada.
- Notas e logs: `docs/EDITOR V6 MES 11/texto.md`, especialmente as seções finais sobre protocolo de benchmark e a investigação visual de 05/11/2026.

### Prioridade atual do usuário (05/11/2026)

A prioridade antiga de desenvolver/otimizar **animação dinâmica de cabelo** está suspensa: o usuário considera que a arquitetura atual não justifica esse investimento agora. Não remover código, presets, dados ou formatos legados; manter a aparência estática normal do cabelo dos personagens. Não preparar cabelo dinâmico em novos exports de validação.

Focar somente nestes fundamentos do V6:

1. Transição contínua entre poses do mesmo personagem, sem cortes nem crescimento/encolhimento vertical abrupto.
2. Transição de expressão facial coerente durante a pose.
3. Boca abrindo/fechando em sincronia com a fala, preservando pose e expressão simultâneas.

Validar com fixtures sintéticas e, para export real, somente com o projeto autorizado deste handoff. Inspecionar frames anterior/intermediários/endpoint em resolução original; cobrir uma sobreposição de fala + pose + expressão. Após estabilidade funcional, perseguir export integral ≤30 s sem animação dinâmica de cabelo; o controle sem cabelo dinâmico histórico foi 54,662 s e ainda precisa de baseline atual comparável. Não deixar a missão antiga de cabelo sobrescrever essa orientação mais recente.

Primeira validação básica sem cabelo dinâmico: quadros 443–922 (480 quadros/16 s), 1920×1080/30 FPS, 11 transições de pose, 2 vídeos, 2 áudios, 1 estado de boca; todos os quadros e o MP4 passaram, export em 22,75 s. Os contatos das trocas `test` (450) e `oooul` (900) mostram interpolações graduais e sem salto vertical evidente nesses eventos. `oooul` troca o preset facial no quadro 765 e fala a partir do 780; há sobreposição temporal, mas a caixa de diálogo cobre a boca no quadro ampliado, impedindo aprovação visual do ciclo. Amostra parcial: o salto em outros eventos não foi descartado. Relatório: `out/editor-v6-stress/runs/actual-project-2026-11-05T13-14-44-476Z-10648/stress-export-validation.json`; recorte ampliado: `out/editor-v6-stress/runs/oooul-speech-face-780.png`.

**Balões do V6:** fundo branco; contorno e nome compartilham a cor escolhida na paleta do personagem. Ao selecionar fala ou pensamento, o Inspector oferece `Escala dos balões` (100%–250%) e `Posição vertical` (-100% a +100%), configuradas uma vez no documento e aplicadas globalmente a fala/pensamento. Valor vertical negativo sobe e positivo desce. Os campos persistidos opcionais `balloonScalePercent` e `balloonOffsetY` mantêm projetos anteriores em 100% e 0%; a cena resolvida transporta os valores aos renderizadores compartilhados de preview e exportação. O texto é medido numa coluna interna com margem e clip arredondado; quando excede o espaço vertical, a última linha recebe reticências para não atravessar o contorno.

## Editor V7 — estado e limites

- V7 foi iniciado como arquitetura paralela, com core determinístico em TypeScript, tempo em ticks inteiros, avaliação da cena independente de Electron/React e backend inicial de renderização Sharp/libvips + FFmpeg.
- Módulos principais: `src/shared/editorV7.ts`, `src/shared/editorV7Svg.ts`, `electron/domains/editorV7/renderFrame.ts` e `electron/domains/editorV7/exportRunner.ts`.
- O código atual já contempla camadas de texto no renderer nativo e overlays de vídeo/áudio no exportador. Testes sintéticos exercitam schema/texto/renderização.
- Validação real mais recente: exportação dos primeiros 30 quadros do projeto autorizado, 1920×1080/30 FPS, com 1 clipe de vídeo/áudio, MP4 H.264 validado; 2,456 s ponta a ponta (`2b559233`). Isso comprova somente o trecho testado, não a paridade visual/funcional completa com V6 nem a timeline inteira.
- V7 não migra, substitui ou altera os projetos V6. Consulte `docs/editor-v7/EDITOR_V7.md` para critérios e pendências.

## Restrições para qualquer IA que continue o projeto

1. Antes de editar, leia `AGENTS.md`, confira raiz, branch, commit, `git status` e alterações locais. Preserve qualquer mudança existente e faça commit local pequeno por tarefa concluída.
2. Investigue os consumidores, contratos, persistência, importadores e exportadores afetados. Corrija no domínio dono da regra.
3. Para export funcional, use somente o projeto autorizado nomeado neste documento e o backup verificado. Não teste destrutivamente dados reais; não mexa no perfil do usuário. Prefira fixtures sintéticas nos testes unitários.
4. Não apague, resete ou sobrescreva `app-data`, perfis locais, mídia do usuário, backups ou resultados sem necessidade e autorização. Em pacote para outra IA, não inclua `app-data/`, `out/`, `node_modules/`, mídia pessoal, caches, credenciais ou segredos.
5. Não reduza resolução, FPS, duração ou qualidade para declarar benchmark mais rápido. Diferencie benchmark de segmento da exportação integral e informe resultados não medidos como pendentes.
6. Para V6, evitar exports integrais repetidos por hipótese: usar uma janela de 20 s; ao atingir ≤10 s, ampliar para 40 s e mirar ≤15 s; fazer export integral como gate de marcos. Preservar preset, áudio, vídeo e qualidade.
7. Antes de finalizar: revise diff, procure chamadas/imports não migrados, execute verificações adequadas, atualize este estado/documentação quando necessário e registre o commit. Não faça push/publicação sem autorização explícita.

## Histórico/links para continuar

- Código e histórico completo: https://github.com/nestarasup-sys/Native-gacha/tree/Dev-V2
- Commit de referência deste pacote: https://github.com/nestarasup-sys/Native-gacha/commit/2b559233
- Protocolo V6 e métricas: `docs/EDITOR V6 MES 11/texto.md`
- Arquitetura V6: `docs/editor-v6/ARQUITETURA_E_INTEGRACAO.md`
- Exportação V6: `docs/editor-v6/EXPORTACAO.md`
- Pesquisa/estado V7: `docs/editor-v7/EDITOR_V7.md`
