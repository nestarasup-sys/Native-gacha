# Decisões de manutenção

## D-001 — Arquivar registros históricos sem apagar evidências (2026-10-30)

**Contexto:** `docs/architecture` misturava ADRs e contrato atual com relatórios de dezenas de ciclos. **Decisão:** mover relatórios de ciclos/incidentais para `docs/archive/` preservando seus blobs e um índice, atualizar referências ativas. **Consequência:** caminhos antigos deixam de existir na nova branch; links relativos precisam ser revisados. Histórico permanece recuperável em Git.

## D-002 — Isolar o trabalho na branch de proposta (2026-10-30)

**Contexto:** o pedido tem alvo `Dev-V2`, enquanto BATs e README descrevem `Main-desenvolvimento`. **Decisão:** preparar PR contra `Dev-V2` e não modificar scripts de atualização nem `main`. A escolha da branch canônica requer decisão explícita de produto.

## D-003 — Registro operacional não é fonte de verdade nem armazenamento privado (2026-10-30)

**Decisão:** manter `.ai` apenas com estado, backlog, evidências e decisões editáveis. Investigações antigas não se tornam requisitos automaticamente. Raciocínio privado, perfis, dados pessoais e segredos nunca devem ser versionados.

## D-004 — Refatoração com limite de tamanho preservado (2026-10-30)

**Decisão:** manter o budget de 630 linhas de Roupas DEV e extrair importação, recorte de pares, prévia de pose e utilitários do modelo para módulos da feature. **Motivo:** responsabilização clara sem silenciar dívida arquitetural. A primeira CI da extração validou orçamento, TypeScript e build.

## D-005 — Importação de imagens assíncronas falha fechada (2026-10-30)

**Decisão:** descartar callbacks de workers antigos, impedir que decodificações concluídas depois de uma troca publiquem dados em outro rascunho e aplicar limites coerentes com o normalizador e o worker. **Consequência:** imagens grandes são recusadas com erro explicativo; teste visual ainda necessário. Bitmaps são explicitamente liberados após o processamento.
