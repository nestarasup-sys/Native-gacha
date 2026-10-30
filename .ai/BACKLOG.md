# Backlog de melhorias (levantamento inicial)

Este é um **roteiro de investigação**, não uma declaração de defeitos confirmados. A ordem deve ser reavaliada após rodar testes no mesmo SHA do PR.

| Prioridade | Frente | Próxima ação e critério verificável |
| --- | --- | --- |
| P0 | Segurança dos dados | Auditar operações de escrita, backup/restore e fechamento; cenários de crash com fixtures, hashes preservados, sem tocar perfis reais |
| P0 | Superfície Electron/IPC | Inventariar todos os canais, validar origem e payload, caminhos e isolamento de renderer; testes negativos por canal crítico |
| P1 | Documentação confiável | Automatizar checagem de links relativos e evitar referências a arquivos movidos; zero links internos quebrados |
| P1 | CI para `Dev-V2` | Garantir que PRs contra a branch executem auditoria, TypeScript, testes relevantes e build; não confundir CI com aceite visual Windows |
| P1 | Fronteiras de domínio | Medir dependências entre Fabricador/Customizador/Studio/Editor e extrair responsabilidades onde a auditoria e testes justificarem |
| P1 | Contratos e persistência | Comparar código real com ADR-002, caminhos legados e comportamento de referências/snapshots; testes de ida/volta e regressão |
| P2 | Performance | Definir baseline reproduzível de uso de memória, inicialização, previews e exportação; medir p50/p95 no mesmo ambiente antes/depois |
| P2 | Higiene documental | Dividir ou condensar `INVESTIGACAO_REFATORACAO_APP_2026-10-27.md` sem perder proveniência; criar resumo verificável por commit |
| P2 | Qualidade de UX | Executar cenários reais Electron no Windows com mídia sintética; capturas revisadas, sem declarar equivalência por testes headless |

**Regra de execução:** uma mudança por vez, rastreando causa, risco de dados, validações e diff no [worklog](WORKLOG.md). Sem migração/exclusão de dados de usuário.
