# Ciclo estrutural 07 — composição visual, cache dedicado, journal e continuidade

Data: 2026-10-22
Branch isolada: `feature/model-source-editor`, PR #5. Sem merge em `main`.

## 1. Composição completa e referência dourada estável

`tests/fabricator-complete-character-golden.test.mjs` monta PNGs reais gerados
pela fixture sintética do Fabricador, na ordem:
corpo, casaco, cabelo traseiro, cabeça, olhos, sobrancelha/expressão, cabelo dianteiro.
Verifica um SHA-256 fixo do buffer RGBA de 256×384 e amostras que confirmam
as sobreposições e a transparência. A fixture também salva um preset de expressão.

A referência dourada sintética é automatizada e executada na CI. Ela **não**
é uma baseline visual de screenshot da interface real do Customizador/Studio
nem valida ajustes feitos em perfis privados. O runner de screenshots
`npm run test:fabricator:real-ui -- --synthetic-complete` continua opt-in:
precisa de Electron instalado com GUI, e a aprovação de baselines reais depende
de conferir as imagens capturadas no Windows.

## 2. Serviço de cache isolado + números

`electron/domains/fabricator/catalogAssetService.ts` assume o controle do
`VersionedAssetResolver`, fora de `electron/main.ts`. Oferece
`read(namespace, identity, version, path)`, `invalidate(...)` e `stats()`.

O serviço mantém 32 MiB como limite padrão, cópias defensivas dos buffers,
LRU e leitura single-flight. Namespace + identidade + revisão segregam roupas,
cabelos, rosto e outras bibliotecas. O processo principal só injeta `readAssetImage`.

`tests/fabricator-catalog-assets.test.mjs` garante acertos, perdas de cache,
isolamento entre catálogos e métricas. `npm run bench:fabricator:cache`
executa microbenchmark opt-in e informa tempo de leitura com/sem cache e
quantidade de chamadas de leitura. **Não mede FPS, memória total do Electron
nem promete ganhos de desempenho fixos**, que variam por dispositivo.

## 3. Journal de Model Source e verificações de commit

`electron/domains/fabricator/modelSourceJournal.ts` cria e valida journal
pré-swap com UUID, backup e fonte esperada; é compatível com nomes legados de
fontes PNG, JPEG e WebP. Um staging só pode promover depois de validar
manifesto, PNG de fonte e todos os PNGs das peças.

Após promoção, uma segunda validação evita remover o marcador antes de
confirmar os arquivos. Em reinício pós-commit, `modelSourceRecovery.ts`
encerra o marcador somente quando o novo conteúdo está íntegro e corresponde à
transação. Não sobrescreve modelo existente nem escolhe backup arbitrário.

`tests/model-source-multi-publication-journal.test.mjs` abrange três versões,
reinícios repetidos, journal remanescente e staging incompleto, além da suíte
de queda abrupta SQLite. **Não se afirma atomicidade física sob perda de energia**.

## 4. Continuidade Fabricador → Customizador → Studio

Novo contrato em `src/shared/characterSourceContinuity.ts`:
- uma pose antiga continua snapshot da montagem, mesmo se a fonte for editada;
- referências a poses de outro modelo/slot são rejeitadas;
- auditoria encontra roupas anexadas a peças ausentes, sem modificar a biblioteca;
- origem visual editada e personagem montado permanecem separados.

O Customizador passa a selecionar seu artwork pelo contrato compartilhado;
a geração de thumbnails de poses do Studio verifica slot e modelo.

`tests/fabricator-customizer-studio-continuity.test.mjs` cobre fonte revisada,
preservação de PNGs/poses antigas, vínculos válidos e anexos órfãos.

## Restrições e validação

- **Poses DEV usa o modelo montado**, não a folha original.
- Model Source é a fonte definitiva para os outros editores DEV aplicáveis.
- Video Studio pode ser trabalhado, mas não é prioridade deste ciclo.
- Nenhuma migração de dados ou alteração dos formatos de `project.json`,
  `pose.json` ou `wardrobe.json`.
- CI executa testes, auditoria, TypeScript e build Linux/Windows.
- Testes de Electron com sessões gráficas e modelos do usuário ainda dependem
  de revisão visual fora da CI.

## Próximas quatro prioridades possíveis

1. Rodar o teste de captura de interface no Electron Windows com fixture completa
   e aprovar um conjunto de baselines revisadas por seção.
2. Extrair as demais funções de leitura/escrita de roupas, cabelos e rosto do
   `electron/main.ts` para serviços de domínio tipados.
3. Ampliar transações de recuperação para histórico de poses/roupas e checar
   consistência em múltiplos perfis sem migração automática.
4. Testes E2E de customização e renderização no Studio com uma pose guardada,
   edição posterior do Model Source e restauração dos dados após reinício.
