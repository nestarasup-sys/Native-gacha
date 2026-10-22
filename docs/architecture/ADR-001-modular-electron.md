# ADR-001 — Modularizar antes de substituir a plataforma

**Data:** 2026-10-22  
**Situação:** decisão inicial, reversível. 

## Contexto

O aplicativo funciona, mas o processo Electron principal concentra handlers e regras de aplicação, e a interface apresenta dependências entre funcionalidades. O Video Studio não é prioridade neste ciclo.

## Decisão

Manter Electron, React e TypeScript nesta etapa. Introduzir **módulos por domínio**, avançando de fora para dentro, com estas responsabilidades:

1. `ipc.ts`: adaptação de transporte e autenticação; sem SQL ou regras de produto.
2. `service.ts`: casos de uso e ordem das operações, dependências explícitas injetadas.
3. `repository.ts`: queries e transações; não conhece Electron ou renderer.
4. `validation.ts`: invariantes de entrada, preferencialmente puros e testados.
5. `src/shared`: formatos persistidos, DTOs e tipos consumidos entre processos.

Não mover os formatos persistidos de uma só vez. Não alterar caminhos, nomes dos canais IPC, esquema SQLite, fila de gravação nem formatos do usuário sem testes de compatibilidade prévios. Permitir que regras puras migrem para `core/` posteriormente, quando as fronteiras ficarem claras, em vez de introduzir abstrações genéricas prematuras.

## Razões

- O backend local já existe no processo principal Electron; um servidor HTTP separado não é requisito para organização.
- O risco principal é a regressão nas integrações e formatos; troca de framework não elimina esse risco.
- O uso de injeção de dependências por interfaces pequenas permite testar regras com SQLite sintético sem carregar o Electron.
- Mudanças pequenas e reversíveis são mais seguras do que mover centenas de arquivos simultaneamente.

## Compromissos explícitos

- **Video Studio:** sem refatoração de engine/exportação nesta etapa.
- **Armazenamento:** preservar bancos e dados; sem migrações automáticas.
- **React:** manter telas e interfaces de `window.desktop` existentes.
- **Segurança:** toda entrada IPC continua verificando a origem do sender no primeiro passo.
- **Fila:** Base de Vídeos mantém sincronização com a fila `roteirosSaveQueue`.

## Consequências e próximos passos

Avançar por domínio, sempre com testes e possibilidade de voltar ao módulo anterior. Depois de Base de Vídeos e validação dos Roteiros, os próximos candidatos são rotas de exportação de Roteiros, persistência do Customizador, bibliotecas de assets do Fabricador e Studio. Trocar Electron só deve ser reconsiderado diante de necessidades e medições concretas.
