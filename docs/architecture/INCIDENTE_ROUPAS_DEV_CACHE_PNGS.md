# Incidente de PNGs repetidos no Customizador — manga domina o conjunto

Data da análise: 2026-10-22.
Contexto: Native Gacha, `feature/model-source-editor`, PR #5 em draft. O usuário observou, **antes do Ciclo 12**, que após upload e salvamento em Roupas Dev, equipar um conjunto no Customizador apresentava a manga esquerda ou direita repetida onde deveriam aparecer as demais peças.

## Causa rastreada

`electron/main.ts:readWardrobeSet` reconstitui `set.components` lendo cada `parts/<component.id>.png` via `readCatalogPng`. Antes desta correção `FabricatorCatalogAssetService.read(namespace, identity, version, path)` ignorava `path` ao chamar `VersionedAssetResolver.resolve`. Sua chave incluía apenas `namespace, identity, version`; **todos os PNGs do mesmo conjunto compartilham identidade**. O `Promise.all` paralelo dos componentes então podia deduplicar indevidamente várias leituras distintas como se fossem a mesma, retornando a imagem de uma manga em todas as peças. A duplicação visual não depende de haver corrupção no disco.

O mesmo mecanismo alimentava a leitura de **sheets e peças faciais**, e **front/back/fringe/source** de cabelos. Os loaders de pose/modelo externos que não passam por `readCatalogPng` não foram apontados como causa; o isolamento de namespace continua testado.

## Correções

1. `versionedAssetResolver.ts`: chave agora inclui `assetPath` e a família de namespace/identity/version. Mesmo conjunto e versão com caminhos diferentes não podem deduplicar bytes/pending promises. `invalidate`/ `clear` invalidam também resultados de leituras em andamento, evitando repopular cache com dados antigos.
2. `catalogAssetService.ts`: passa o caminho real da imagem ao consultar/resolver cache. O prefixo de invalidação continua por identidade do conjunto e abrange **todos** seus PNGs.
3. `WardrobeWorkspace.tsx`: em um conjunto **já salvo** (`activeSetId === set.id`), o botão Salvar publica mudanças de metadados/encaixe sem regravar o conteúdo de cada PNG recuperado do cache. Novos uploads (`activeSetId === null`) continuam enviando todos os recortes originais. O backend checa que todos os IDs do manifesto têm arquivo correspondente e remove obsoletos somente depois de promover o JSON.
4. A própria persistência já tinha verificação de IDs duplicados no manifesto; não foram renomeados os arquivos nem mudadas as regras de importação.

## Evidência automatizada

- `tests/fabricator-catalog-assets.test.mjs`: quatro arquivos de roupa (mangas L/R, camisa, gola) em mesmo set/revisão, leituras simultâneas com delays diferentes, buffers imutáveis, reread e invalidation; mais pares independentes para cabelos/face/modelo/pose.
- `tests/fabricator-versioned-assets.test.mjs`: caminhos geram chaves distintas e leitura pendente antiga não pode voltar ao cache após `invalidate`.
- `tests/wardrobe-png-identity.test.mjs`: grava **quatro PNGs reais distintos** como nova roupa, relê pelo cache e verifica hashes por ID; salva só metadados e comprova que os PNGs não mudaram no disco.
- `tests/wardrobe-integrity-audit.test.mjs`: diagnóstico read-only encontra hashes repetidos e arquivos ausentes sem alterar a origem.

## Verificar possível corrupção histórica

**Atenção:** a falha de cache produzia cópias na memória. Caso o usuário tenha clicado em Salvar Roupas Dev depois de abrir um conjunto já afetado, o fluxo anterior enviava todos os `dataUrl` carregados de volta ao backend e **podia sobrescrever os PNGs físicos**. Não é possível deduzir se aconteceu com os arquivos do usuário sem acesso a uma cópia ou aos hashes dos diretórios.

Para diagnosticar SEM modificar o conjunto:

```powershell
node scripts/diagnostics/audit-wardrobe-images.cjs "CAMINHO_DO_CONJUNTO_set-ID"
```

Ele lê somente `wardrobe.json` e `parts/*.png`, reporta IDs, SHA-256 e agrupamentos de bytes idênticos. Mangas idênticas podem ser legítimas: NÃO substituí-las automaticamente. Se os arquivos no disco já foram sobrescritos, é preciso recuperar imagens originais de um backup, uma versão exportada ou do PNG-fonte; limpar o cache não recupera pixels perdidos. **Não executar restauração de dados pessoais automaticamente**, não apagar pastas, e salvar cópia antes de experimentar reparo.

## Escopo e salvaguardas

O Fabricador DEV continua sendo a fonte permanente de roupas. Customizador altera apenas `wardrobeGroups` e deltas; Studio usa snapshots por cena. Não editar `main`, não mesclar PR #5, não tocar em BATs, userData de pessoas, SQLite, exportação do Video Studio ou caminhos legados. Testar separadamente se screenshots e personagens existentes voltaram a compor corretamente no Electron Windows; os testes unitários não substituem inspeção visual real.

## Critério de aceite

- `npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck`, `npm run build` verdes em Linux/Windows.
- Conjunto sintético com >=4 PNGs distintos lido por `readWardrobeSet` sem colisão; mudar metadados não altera hashes dos PNGs.
- Fluxo GUI Windows: equipar uma roupa com mangas e corpo, registrar hashes antes e depois de equipar; verificar aparência com capturas e revisão humana. Este subcaso visual específico requer execução/aceite próprio quando viável.
