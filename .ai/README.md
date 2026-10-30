# Registro de engenharia para agentes

Espaço de **continuidade técnica verificável**: não é depósito de raciocínio privado, nem fonte de verdade acima do código. Ajuda a retomar o trabalho sem confundir achados, hipóteses e resultados executados.

- [STATE.md](STATE.md): snapshot de escopo, branch, validações e limitações.
- [BACKLOG.md](BACKLOG.md): investigações e melhorias priorizadas com critérios de aceite.
- [DECISIONS.md](DECISIONS.md): decisões de processo e motivos rastreáveis.
- [WORKLOG.md](WORKLOG.md): marcos curtos com evidências e pendências.

**Regras:** jamais guardar tokens, senhas, segredos, perfis \`app-data\`, imagens, mídia de usuários, bancos reais, dumps privados ou informações pessoais. Registre fatos confirmados com caminho/commit; marque claramente hipóteses, avaliações não executadas e testes pendentes. Atualize ou feche registros quando a situação mudar. O histórico detalhado de arquitetura vive em [docs/archive](../docs/archive/README.md).

**Início de sessão:** confirmar branch, SHA e alterações locais; ler [AGENTS.md](../AGENTS.md), [índice de docs](../docs/README.md) e este registro; escolher a menor mudança segura; validar; atualizar o worklog e PR.
