# Registro de trabalho

## 2026-10-30 — Saneamento documental, etapa inicial

**Inspeção:** árvore da branch `Dev-V2` (`b1f728a`), `AGENTS.md`, README, índice de docs, ADRs, arquivos de dados, guias do Editor V6 e workflow de CI. Foram encontrados dois links do README para arquivos inexistentes.

**Ação proposta neste PR:** mover documentos inequivocamente históricos para `docs/archive`, corrigir o link relativo interno do relatório de evolução, criar índices de navegação e `.ai` para estado, decisões e backlog. Não excluir conteúdo de histórico nem modificar runtime.

**Validação disponível:** inventário de caminhos via árvore Git e revisão de links relativos nos documentos movimentados/ampliados. **Não executado:** npm, suite Node, TypeScript, build, Electron Windows ou testes com perfil real.

**Risco remanescente:** links em texto livre e referências de commits antigos podem continuar apontando para caminhos anteriores; o histórico no Git permanece acessível. Automatizar checagem de links na próxima etapa.

### CI observada no PR #7

- A checagem de links internos passou na etapa inicial do workflow Quality; auditoria independente dos 57 documentos Markdown não encontrou links relativos quebrados.
- Linux Quality e Ubuntu Core executaram 607 testes de refatoração: 605 aprovados, 2 falharam por asserções estruturais desatualizadas sobre `WardrobeWorkspace.tsx`, que não correspondem mais ao código atual.
- As duas asserções foram adaptadas para o caminho atual (lista opcional e publicação de imagens) e foi adicionado teste comportamental do `wardrobeSaveAssets`, sem alterar runtime. A CI do commit corrigido ainda precisa ser observada.

### Ajuste de pipeline Windows

- Core Ubuntu: passou integralmente no SHA `f55a097d`. Quality Linux: 608 testes principais e checagem de docs passaram, mas falha de limite de 630 linhas em Roupas DEV; [issue #8](https://github.com/nestarasup-sys/Native-gacha/issues/8) criada com critérios de extração estrutural.
- Core Windows: os 608 testes e os 4 de geometria passaram; etapa seguinte chamava script inexistente `test:video:next`. Confirmação via inventário Git: também faltavam `test:export:synthetic`, `windows-memory-probe.ps1` e `windows-sceneir-stress.cjs`. Pipeline trocada para testar o Editor V6 vigente com `npm run test:editor-v6`, mantendo testes de domínio, typecheck, build e verificação do BAT.
- Resultado da nova CI ainda não observado neste registro.

## 2026-10-30 — Refatoração de Roupas DEV e segurança de callbacks

- `WardrobeWorkspace.tsx` reduzido de 726 para 587 linhas sem alterar orçamento de 630. Operações extraídas para importação, recorte, prévia de pose e utilitários de modelo.
- Primeira CI do SHA `d8f57cfc`: workflow Linux Quality passou por inteiro, incluindo auditoria, refatoração, orçamento, typecheck e build. Ubuntu Core também passou; Windows ainda em andamento no momento desta anotação.
- Corrigidos callbacks tardios do worker de importação para recusar respostas de outra seleção/worker; recursos `ImageBitmap` são liberados após processar importações de grades; falhas no parse da resposta agora chegam à interface como erro. Criados testes de regressão do guard.
- Nenhum perfil real foi acessado e nenhum dado persistido foi alterado por esta rodada. Testes Windows visuais ainda pendentes.

- Protegido adicionalmente o retorno assíncrono de arquivos em grids de tronco/mangas/calças: importações canceladas não publicam dados nem limpam o estado de outra operação, e erros tardios não encerram o novo worker.

- Importações diretas de grades agora aplicam limites de 50 MB e 32 milhões de pixels, alinhados ao normalizador e ao worker de folha; testes de fronteira verificam arquivos inválidos e decodificações grandes. O limite de pixels é pós-decodificação, portanto não elimina por completo picos de memória.
