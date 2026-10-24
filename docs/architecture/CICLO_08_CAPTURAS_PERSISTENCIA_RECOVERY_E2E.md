# Ciclo estrutural 08 — screenshots Windows, persistência, recuperação e E2E

Data: 2026-10-22
Branch de trabalho: `feature/model-source-editor`, PR #5 → `refactor/shared-character-core`.
**Sem merge em `main`.** Os BATs de desenvolvimento continuam inalterados.

## 1. Screenshots REAIS do Fabricador no Electron

- `visualUiCapture.ts` confirma que a seção correta está ativa antes da captura; cada PNG recebe SHA-256 no manifesto.
- `scripts/fabricator/review-real-ui-captures.cjs` exige 8 capturas completas, verifica dimensões e hashes, e compara opcionalmente com uma baseline revisada (tolerância RGB/alpha 8 por canal, no máximo 1% de pixels diferentes).
- `.github/workflows/fabricator-real-ui-windows.yml` executa instalação completa do Electron, build, capturas em perfil sintético isolado e publica os PNGs como artifact por 14 dias. O workflow também aceita execução manual. Não consome imagens de usuários.
- `tests/fabricator-real-ui-review.test.mjs` valida o verificador usando PNGs sintéticos. **Esse teste não é uma screenshot da interface.**

Comandos locais no Windows, depois de atualizar a branch:
```bat
npm run build
npm run test:fabricator:real-ui -- --synthetic-complete
npm run test:fabricator:real-ui:review -- --captures=out/dev-ai/runs/ID/sandbox/fabricator-real-ui-captures
```
Após alguém revisar e aprovar visualmente uma pasta de referência, repetir as capturas com `--baseline=CAMINHO` ou executar o verificador com `--baseline=CAMINHO`. **Aprovação humana é necessária**; integridade técnica de PNG e diferenças toleradas não garantem montagem visual correta.

## 2. Persistência modularizada

`electron/domains/fabricator/catalogPersistence.ts` centraliza a gravação de PNGs e manifestos de Roupas, Cabelos e Rosto, com sistema de arquivos e gravador de imagens injetados. `electron/main.ts` conserva validação de schemas/IDs, caminhos dos catálogos, cache e registros IPC e passa a delegar a escrita.

Inclui rosto completo, catálogo de peças faciais, componente facial, workspace de cabelo, estilo de cabelo e conjunto de roupas. A nova ordem garante que uma imagem obsoleta só seja apagada depois de promover o manifesto. Mantém a recuperação e o protocolo de backup existente de `wardrobe.json`, sem alterar nomes dos arquivos, contratos IPC ou esquemas do G-V5.

Teste: `tests/fabricator-catalog-persistence.test.mjs` — rollback simulado do manifesto de roupa, reabertura, persistência de PNGs e falha de imagem esperada. **Não é uma migração automática do armazenamento.**

## 3. Recuperação de snapshots e SQLite

`tests/model-source-process-crash.test.mjs` foi ampliado: nas quedas abruptas `after-backup` e `after-commit`, grava uma pose, seus PNGs, um conjunto de roupa e um perfil independente. Após reinicializar o DataPlatform/DomainFileSystem, confere preservação dos bytes e repete a recuperação para detectar reversões indevidas.

Os testes SQLite são condicionais à presença do `better-sqlite3` nativo, conforme suíte existente. Nenhuma ferramenta reescreve ou escolhe entre backups legados de maneira automática.

## 4. Continuidade E2E entre bibliotecas

`tests/fabricator-source-pose-studio-e2e.test.mjs` cria dois perfis sintéticos completos com corpo, cabeça, casaco, cabelo dianteiro/traseiro, olho, sobrancelha e expressão. Publica duas versões de Model Source real em PNG e, após três recuperações por versão, compara SHA-256 de todos os snapshots de pose/roupa/cabelo/rosto e do segundo perfil. Também testa `selectOriginalModelSource`, `selectCharacterArtwork` e `auditCharacterContinuity`.

**Escopo exato:** é E2E de persistência, seleção de artwork e contratos compartilhados, não automação das interações da GUI do Customizador e do Studio. A revisão real com Electron e um personagem salvo pela GUI ainda é uma etapa de aceite separada.

## Validação

`npm run test:refactor` inclui os novos testes de catálogo, continuidade e revisão de screenshots; os workflows existentes verificam Linux e Windows, TypeScript e bundles. O workflow dedicado a screenshots reais depende do Electron gráfico e da execução no ambiente Windows. Resultados devem ser consultados no SHA mais recente do PR: não assumir sucesso da CI antes do encerramento dos jobs.

Sem modificação intencional no Video Studio, `main`, BATs, JSONs legados ou caminhos existentes.
