# Plano de continuidade no GitHub — 22/10/2026

## Situação de entrada

O programa funciona, mas os domínios foram desenvolvidos com dependências cruzadas e responsabilidades concentradas. O desenvolvimento deve continuar por **extração progressiva**, sem migrar armazenamento, trocar framework ou reescrever telas nesta fase. Video Studio permanece **congelado**.

## Regras de arquitetura para revisão

1. **Fabricador DEV = acervo autoral**: modelos, poses, rig, roupas, cabelo, rosto e acessórios; publica bibliotecas, não ajustes por personagem.
2. **Customizador = instância de personagem**: recebe referências aos materiais, mantém variações e ajustes individuais sem sobrescrever bibliotecas do Fabricador.
3. **Studio = consumidor**: recebe personagens resolvidos e a composição de cena; não grava silenciosamente em bibliotecas de autor.
4. **Application / services = casos de uso**: validação, transações, leitura/gravação, compatibilidade e invariantes isolados das telas.
5. **IPC = entrada de dados confiável somente após validação**: preservar canais existentes, validar origem, payload e erros; não permitir acesso direto do renderer a arquivos ou DB.
6. **Persistência = versionamento compatível**: backup/restore antes de migrações; evitar migração irreversível ou mudança de caminhos neste ciclo.

## Backlog recomendado, em ordem

| Ordem | Escopo | Critério de aceite |
| --- | --- | --- |
| P0 | Importar código-fonte completo versionado no `main`; não subir ZIP como substituto do código | GitHub lista `electron/`, `src/`, `tests/` e `package.json` |
| P0 | Preparar Node 22.22.0+, npm ci, auditorias, typecheck e build em Windows | Logs/artifacts CI e smoke em perfil sintético |
| P0 | Teste E2E mínimo Fabricador DEV → Customizador → Studio | Autoria, salvamento, reinício, escolha de roupas/poses e composição sem perdas |
| P1 | Unificar contratos de modelos/assets e identificadores | Sem import de UI entre features; compatibilidade dos dados preservada |
| P1 | Separar mais handlers do `electron/main.ts` (fabricator save/edit, wardrobe, faces) | Serviços/repositórios testáveis com mesmos canais IPC |
| P1 | Refinar Customizador: hooks, estado, regras puras e UI | Extração de componentes sem mudar resultado visual nem arquivos |
| P1 | Studio: consumir personagem resolvido via serviço/contrato | Sem dependência do estado interno do Customizador |
| P2 | Roteiros: persistência e serviços, validação de documentos | Casos de uso isolados, recuperação e testes de regressão |
| P2 | Segurança Electron (CSP, window.open, navegação, protocolo) | Smoke tests do app empacotado e política explícita |
| P3 | Video Studio | **Congelado por solicitação do proprietário** |

## Estratégia de branches

- `main`: código compilável e revisado, sem refatoração não validada.
- `refactor/fabricador-catalogo`, `refactor/customizador-core`, `refactor/studio-consumo`: branches curtas.
- CI deve verificar sintaxe, imports, limites arquiteturais, refactor tests, typecheck e build. Não ativar workflows pesados de vídeo como bloqueio de PRs de arquitetura.

## Pendências explícitas

O pacote foi testado estaticamente no ambiente Linux com Node 22.16.0. `react-router@8.4.0` exige >=22.22.0; portanto, a validação de typecheck/build está pendente até instalação de dependências completas e Node adequado. Não presumir equivalência funcional ou integridade de perfis reais apenas a partir de testes unitários.

Os workflows legados em `.github/workflows/` apontam, em alguns casos, para branches antigas. Revisar antes de reativar, sem alterar Video Studio nesta rodada.
