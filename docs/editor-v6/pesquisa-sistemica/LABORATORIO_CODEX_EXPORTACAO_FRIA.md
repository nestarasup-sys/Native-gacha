# Protocolo Codex — laboratório isolado e exportação fria

**Atualizado em 06/11/2026.** O usuário autorizou **pesquisa + implementação + refatoração + teste** em cópia local independente, com branch e BAT novos; **não** autorizou modificar o aplicativo original ou fazer push sem pedido explícito.

## Projeto e baseline atual

- Projeto real: **Teste de Importação — Personagens do Pacote**. Já é o projeto autorizado nos scripts `scripts/editor-v6/backup-authorized-project.cjs` e `benchmark-project-export.cjs`.
- **[RELATO] Exportação com cabelo ON: 1min31s (91s)**. Sem tempo atual OFF informado. Medir comprimento e frames reais; não presumir 10s/300 frames.
- **Histórico não comparável:** 50s ON/9s OFF foi outro projeto/experimento. Não subtrair esses números de 91s nem afirmar que seu OFF atual é 9s.
- Meta: reduzir **tempo total do clique até MP4 validado**, mantendo fidelidade, boca, cabelo, poses, vídeo, áudio, 1080p/Turbo (conforme baseline real) e estabilidade do app inteiro.

## Primeiro: clonar e isolar

1. Antes de mexer em arquivos: confirmar `git status`, commit, branch, caminhos canônicos e espaço livre. Proteger quaisquer mudanças locais. Usar **clone local independente**, preferencialmente em pasta irmã livre como `C:\TRABALHO 2\OUTROS\GACHA EM C++-V6-LAB`; criar **nova branch local** `refactor/editor-v6-cold-lab` somente na cópia. Não usar links, junctions ou hardlinks para dados mutáveis, nem alterar a branch original.
2. Inventariar e copiar **apenas os dados canônicos necessários ao projeto e aos módulos conectados**: `app-data/runtime/profile` (projeto V6, Fabricador, Customizador, Studio e bibliotecas referenciadas), `app-data/database`, `app-data/manifests`, `app-data/media/objects/sha256` e mídias/arquivos vinculados por IDs. Preservar caminhos relativos, catálogos, SQLite, CAS, hashes e referências. Verificar integridade e abertura do projeto na cópia. Se o volume necessário for muito grande ou faltar disco, interromper a cópia e explicar, sem descartar referências.
3. **Não** duplicar cache de movimento/export, session cache Electron, PNG/MP4 gerados, logs, temporários, backups antigos, `out` ou `node_modules`. Recriar dependências na cópia e manter **um único inventário/backup verificado** dos dados canônicos — não clonar todo app-data a cada benchmark.
4. Em desenvolvimento o app usa `app.getAppPath()/app-data`, configurado por `electron/application/appDataBootstrap.ts`. **Comprovar em runtime** que a cópia escreve somente em `<lab>/app-data`; nunca compartilhar SQLite, arquivos de projeto, cache ou mídia mutável com a pasta original.

## BAT e porta exclusivos

- Criar **`ABRIR_REFATORACAO_V6_LAB.bat` somente na cópia**, sem invocar o BAT original. `ABRIR_DESENVOLVIMENTO.bat` original **força Dev-V2** e usa porta **5188**; o LAB deve permanecer na branch nova e usar porta **5199** (ou outra porta livre), `127.0.0.1` e `strictPort:true`.
- Seguir o modelo de config temporária de electron-vite do BAT existente; não executar `npm run dev` sem avaliar seu `predev`, que migra perfil legado. Usar o executável electron-vite no LAB com configuração do LAB.
- Garantir Electron, FFmpeg e ffprobe dentro da cópia ou caminhos de ferramentas de leitura seguros; não modificar porta, BAT ou binários da instalação original.
- Se criar BAT de atualização, não forçar troca para Dev-V2, reset, limpeza ou pull que descarte alterações. Nunca versionar caminhos privados nem dados pessoais.

## Apenas exportação fria — SEM armazenamento pesado

- **Fria significa processo/sessão novos e nenhum cache persistente reutilizado de export anterior**: novos movimentos, rigs, textura/bake, imagens geradas e MP4. Para cada corrida, limpar só caches **derivados** dentro de pastas temporárias do próprio LAB, preservando assets e dados canônicos.
- **Reuso e memoização DURANTE a mesma exportação são desejáveis**, pois evitam trabalho sem "aquecer" exportações futuras. Não desativá-los artificialmente. Não adicionar cache persistente de vídeos, frames, atlas de cabelo, personagens preparados ou gigabytes de proxies para ganhar velocidade.
- Cada teste escreve em diretório temporário isolado/identificado no LAB, com **limite de espaço**, e depois de validar ffprobe/pixels apaga **somente MP4s/frames/temporários criados pelo teste**, preservando um resumo leve com métricas e hashes. Nunca executar limpeza genérica sobre `app-data` original, fontes ou cópia canônica.
- Para poupar tempo: iniciar com testes rápidos de unidade e micro-cenas, medir um A/B frio inicial, fazer implementações pequenas e só repetir **3+ corridas frias completas** nos candidatos finais.

## Ciclo de trabalho

1. Ler `AGENTS.md`, [README](README.md), [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md), pesquisas 02/03, [Plano](PLANO_EXECUTAVEL.md), matriz e estudos das funções afetadas.
2. Medir baseline real: **91s ON [relato, a reproduzir]**, OFF ainda desconhecido, ambos em sessão fria igual. Separar preparo de cabelo antes do Main, composição de personagem/cabelo/face, React, Canvas/WebGL/SVG, captura BGRA, FFmpeg e validação, sem somar lanes paralelas como parede.
3. Investigar uma causa comprovada, consultar documentação oficial, **implementar e testar no LAB**, refutar/aceitar por evidências. Priorizar composição incremental do cabelo posterior e reuso de corpo/face **dentro do job**; só trocar capturePage/FFmpeg/Chromium se o perfil justificar. Abranger melhorias de UI, timeline, personagens, bibliotecas e estabilidade, respeitando contratos entre módulos.
4. A cada etapa atualizar a pesquisa correspondente, `MATRIZ_DE_OPORTUNIDADES.md`, `PLANO_EXECUTAVEL.md` e `PROGRESSO_E_RESULTADOS.md` com antes/depois frio, testes, bugs, rollback e próximo passo. Commits **locais pequenos**; sem push, sem arquivos pesados, sem dados pessoais.
5. Preservar visual RGBA pré-encode, MP4, 30fps do app quando aplicável, mouth/face/roupa/áudio/vídeo, IPC/sandbox e projetos salvos. Não chamar ganho de desempenho sem tempo total reproduzido no LAB.

**Limite de autorização:** pode editar/testar/refatorar **somente na cópia local isolada**. Se arquivos referenciados estiverem ausentes, houver risco de perda de dados ou espaço insuficiente, interromper a operação arriscada e registrar o bloqueio.
