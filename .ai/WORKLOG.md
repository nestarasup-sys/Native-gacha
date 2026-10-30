# Registro de trabalho

## 2026-10-30 — Saneamento documental, etapa inicial

**Inspeção:** árvore da branch \`Dev-V2\` (\`b1f728a\`), \`AGENTS.md\`, README, índice de docs, ADRs, arquivos de dados, guias do Editor V6 e workflow de CI. Foram encontrados dois links do README para arquivos inexistentes.

**Ação proposta neste PR:** mover documentos inequivocamente históricos para \`docs/archive\`, corrigir o link relativo interno do relatório de evolução, criar índices de navegação e \`.ai\` para estado, decisões e backlog. Não excluir conteúdo de histórico nem modificar runtime.

**Validação disponível:** inventário de caminhos via árvore Git e revisão de links relativos nos documentos movimentados/ampliados. **Não executado:** npm, suite Node, TypeScript, build, Electron Windows ou testes com perfil real.

**Risco remanescente:** links em texto livre e referências de commits antigos podem continuar apontando para caminhos anteriores; o histórico no Git permanece acessível. Automatizar checagem de links na próxima etapa.
