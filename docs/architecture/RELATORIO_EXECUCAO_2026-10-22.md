# G-V5 — primeira rodada de reorganização real

**Origem:** `G-V5-Legado-codigo-fonte-2026-10-22.zip`.  
**Escopo:** arquitetura, Base de Vídeos e validação de Roteiros. **Sem mudanças no Video Studio.**

## Alterações realmente aplicadas

1. `electron/domains/baseVideos/validation.ts`: regras de UUID, nomes, detalhamento e escolha de cores extraídas da camada IPC.
2. `electron/domains/baseVideos/repository.ts`: SQL e transações encapsulados, sem alterar tabelas nem conteúdo persistido.
3. `electron/domains/baseVideos/service.ts`: casos de uso e dependências injetadas (catálogo, fila, biblioteca de vídeo e acesso a mídia).
4. `electron/domains/baseVideos/ipc.ts`: registro dos **nove mesmos canais** e verificação da origem em **todos** os handlers.
5. `electron/main.ts`: substituição do bloco anterior de Base de Vídeos por uma composição das camadas, mantendo a **mesma fila `roteirosSaveQueue`** dos Roteiros.
6. `electron/domains/roteiros/validation.ts`: extração sem mudança de regras do validador de documentos de Roteiros.
7. `scripts/architecture/check-boundaries.cjs`: bloqueio a novas dependências runtime entre features, e proibição de importações nativas no renderer e de dependência do backend em telas.
8. `scripts/architecture/boundaries-baseline.json`: tetos auditáveis existentes, não uma aprovação de dívidas arquiteturais antigas.
9. `scripts/architecture/check-syntax.cjs`: auditoria sintática de TS/TSX com parser do TypeScript.
10. Testes sintéticos novos para as operações de Base de Vídeos, segurança IPC e validação de Roteiros. Scripts npm documentados.

## Garantias preservadas por desenho

- Os nomes e parâmetros da API `window.desktop` não mudaram.
- Nenhum esquema SQLite, caminho de projeto ou formato serializado foi atualizado.
- Exclusão de vídeo continua conferindo referências de Roteiros e marcando a biblioteca como excluída **antes** de apagar detalhes (proteção contra crash intermediário).
- Publicação permanece transacional e idempotente; numeração sequencial preservada.
- Atribuição opcional de categoria se mantém: ausente = não muda; `null` = remove a relação.
- Validação da origem IPC permanece obrigatória.
- O projeto continua com a lógica e implementação da engine do Video Studio intactas.

## Validação realmente executada

| Verificação | Resultado |
|---|---|
| `npm run audit:architecture` | 143 fontes TS/TSX analisados; 0 erros de sintaxe; nenhuma nova fronteira proibida |
| `npm run test:refactor` | 7 testes novos aprovados; SQLite em memória (adaptador `node:sqlite`) |
| `node --test tests/video-cas-shadow.test.cjs tests/video-timeline-index.test.cjs tests/video-stage-geometry.test.cjs` | 13 testes legados aprovados |
| `npm run typecheck` | **Não executado integralmente:** dependências npm não disponíveis neste ambiente |
| `npm run build` | **Não executado** pelo mesmo motivo |
| App Electron e pacote Windows real | **Não executados**; exige ambiente de desenvolvimento completo |

**Importante:** os testes de Base de Vídeos validam SQL real sobre SQLite em memória, mas **não executam** o driver de produção `better-sqlite3`. O adapter replica apenas a API de transação necessária para esses testes. Repetir o teste no ambiente de produção e validar perfil sintético antes de distribuir um build.

## Comandos de validação

```bash
npm ci
npm run audit:architecture
npm run test:refactor           # Node 22.16+ (node:sqlite / strip-types)
npm test                       # suíte preexistente (Node 20/22 com dependências)
npm run typecheck
npm run build
```

O `npm ci` real executa o pós-install do Electron; os testes de regressão dos domínios novos só devem ser executados sobre dados **sintéticos**, não sobre um perfil pessoal. `npm test` antigo não foi alterado para preservar suporte preexistente a Node 20; `test:refactor` é separado porque usa APIs experimentais do Node 22 para testar arquivos `.ts` diretamente.

## Dívida arquitetural inventariada (baseline)

Há **22 ocorrências** de importação runtime entre features do renderer, distribuídas em:

| Origem → destino | Ocorrências |
|---|---:|
| Customizador → Fabricador | 5 |
| Fabricador → Customizador | 1 |
| Studio → Customizador | 6 |
| Video Studio → Customizador | 9 |
| Video Studio → Studio | 1 |

O gate impede aumentar esses números; a meta é reduzi-los à medida que contratos independentes substituam imports cruzados. A simples ausência de violations estritas não comprova arquitetura sem dívidas ou ausência de ciclos.

## Próxima sequência sugerida (ainda NÃO implementada)

1. Testar `typecheck`/build/Electron IPC e fluxos reais da Base de Vídeos em uma cópia sintética do perfil. Corrigir diferenças, sem tocar no perfil pessoal.
2. Extrair persistência e exportações de Roteiros, mantendo transações, fila e formatos existentes.
3. Definir contratos para *modelo publicado*, *personagem customizado* e *asset com referência*, verificando fixtures do Fabricador e Customizador antes de reorganizá-los.
4. Reduzir gradualmente imports cruzados entre funcionalidades com o gate de arquitetura.
5. Refatorar Studio normal depois que contratos de personagens estiverem estáveis; deixar Video Studio para um ciclo específico posterior.

## Restrições e observações

O README original aponta para documentos e scripts de `docs/refactor` / `audit:*` que **não aparecem neste ZIP**. Esta entrega não cria implementações fictícias desses comandos; introduz apenas `audit:architecture` e suas respectivas fontes. Não afirmar equivalência funcional completa sem build e smoke Electron no Windows.
