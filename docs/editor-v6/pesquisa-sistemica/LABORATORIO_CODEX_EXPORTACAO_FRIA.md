# Protocolo Codex — laboratório isolado e exportação fria

**Atualizado em 06/11/2026.** O usuário autorizou **pesquisa + implementação + refatoração + teste** em cópia local independente, com branch e BAT novos; **não** autorizou modificar o aplicativo original ou fazer push sem pedido explícito.

## Projeto e baseline atual

- Projeto real: **Teste de Importação — Personagens do Pacote**. Já é o projeto autorizado nos scripts `scripts/editor-v6/backup-authorized-project.cjs` e `benchmark-project-export.cjs`.
- **[RELATO] Exportação com cabelo ON: 1min31s (91s)**. Sem tempo atual OFF informado. Medir comprimento e frames reais; não presumir 10s/300 frames.
- **Histórico não comparável:** 50s ON/9s OFF foi outro projeto/experimento. Não subtrair esses números de 91s nem afirmar que seu OFF atual é 9s.
- Meta: reduzir **tempo total do clique até MP4 validado**, mantendo fidelidade, boca, cabelo, poses, vídeo, áudio, 1080p/Turbo (conforme baseline real) e estabilidade do app inteiro.

## Primeiro: clonar e isolar

1. **Concluído em 06/11/2026:** conferidos Git/status/espaço antes da cópia; criado clone local independente em pasta irmã e branch `refactor/editor-v6-cold-lab`. Sem hardlinks. O estado Git original foi preservado; a cópia também contém as alterações locais preexistentes, que não pertencem ao commit da refatoração.
2. **Concluído em 06/11/2026:** inventário e cópia dos dados canônicos necessários: projeto V6, Fabricador, Customizador, Studio, bibliotecas, SQLite/CAS, manifests e perfil relacionado. Os 3.044 arquivos copiados (~0,722 GB) foram verificados por SHA-256; referências de vídeos da timeline resolvidas. Nova conferência comparou o snapshot original com a origem após os experimentos: 3.044/3.044 iguais. O projeto abriu no renderer do LAB.
3. **Não** duplicar cache de movimento/export, session cache Electron, PNG/MP4 gerados, logs, temporários, backups antigos, `out` ou `node_modules`. Recriar dependências na cópia e manter **um único inventário/backup verificado** dos dados canônicos — não clonar todo app-data a cada benchmark.
4. Em desenvolvimento o app usa `app.getAppPath()/app-data`, configurado por `electron/application/appDataBootstrap.ts`. **Comprovar em runtime** que a cópia escreve somente em `<lab>/app-data`; nunca compartilhar SQLite, arquivos de projeto, cache ou mídia mutável com a pasta original.

## BAT e porta exclusivos

- **Concluído:** `ABRIR_REFATORACAO_V6_LAB.bat` somente na cópia. Renderer validado HTTP 200 em `127.0.0.1:5199`; branch permaneceu na branch nova; sem alterar para Dev-V2.
- Seguir o modelo de config temporária de electron-vite do BAT existente; não executar `npm run dev` sem avaliar seu `predev`, que migra perfil legado. Usar o executável electron-vite no LAB com configuração do LAB.
- Garantir Electron, FFmpeg e ffprobe dentro da cópia ou caminhos de ferramentas de leitura seguros; não modificar porta, BAT ou binários da instalação original.
- Se criar BAT de atualização, não forçar troca para Dev-V2, reset, limpeza ou pull que descarte alterações. Nunca versionar caminhos privados nem dados pessoais.

## Apenas exportação fria — SEM armazenamento pesado

- **Fria significa processo/sessão novos e nenhum cache persistente reutilizado de export anterior**: cada execução cria app-data temporário isolado; cache-fonte de movimentos deve estar vazio; script recusa `--session-data` e verifica `diskHits=0`. Para cada corrida, preservar assets e dados canônicos.
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

## Resultado inicial registrado

Ver A/B completo, métricas, limitações e próximo passo em [PROGRESSO_E_RESULTADOS.md](PROGRESSO_E_RESULTADOS.md), [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md) e [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md). A baseline de 91s não foi reproduzida; o primeiro candidato `paint-event` reduziu a mediana de parede ~5%, com dispersão material. Manter a próxima etapa focada em medir preparo/composição de personagem/cabelo e ampliar paridade.
