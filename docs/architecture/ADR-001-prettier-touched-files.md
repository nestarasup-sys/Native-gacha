# ADR-001 — Prettier para arquivos alterados

- **Status:** aceito em 21/11/2026.
- **Contexto:** o repositório não tinha formatador e misturava linhas longas em arquivos ativos. Reformatar a árvore inteira criaria diffs sem relação com tarefas.
- **Decisão:** adotar Prettier, largura 120, dois espaços, sem ponto e vírgula, aspas simples e vírgula final `none`. `npm run format:changed` usa `git diff --name-only` e formata somente arquivos alterados que o Prettier entende.
- **Consequência:** mudanças futuras devem executar o script antes da revisão. Arquivos sem diff e documentos históricos não são reformatados.
