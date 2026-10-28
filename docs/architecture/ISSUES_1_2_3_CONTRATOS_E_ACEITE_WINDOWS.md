# Issues #1, #2, #3 — inventário, origem dos personagens e critérios Windows

Branch: `feature/model-source-editor` · PR #5 draft sobre `refactor/shared-character-core`.
Nenhum merge ou alteração à `main`; nenhum backup, PNG, SQLite, usuário ou projeto pessoal deve ser modificado por estas verificações.

## #1 — Importação da base G-V5

O código-fonte foi importado como **arquivos Git**, não como um ZIP: Electron, React/TypeScript, testes, scripts e `package-lock.json`. A auditoria automática `npm run audit:gv5-import` usa apenas `git ls-files`, verifica arquivos básicos e rejeita paths rastreados de `node_modules`, perfis, bancos, `.env`, credenciais e ZIP de origem.

**Bloqueios externos que a auditoria não pode dispensar:**
- O ZIP original `G-V5-evolucao-estrutural-2026-10-22.zip` não está anexado ao repositório. O SHA-256 esperado é `e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd`. Sem os bytes originais, o resultado `fullyVerified` é **false**. O audit pode confirmar `passed: true` para o *inventário Git*, mas isso **não** valida proveniência/ZIP.
- Direito de redistribuir os arquivos num repositório público, credenciais já presentes no histórico e a inspeção humana de assets não podem ser atestados por scripts.
- **Não fechar #1 como 100% verificada** até obter o arquivo original confiável e confirmar a revisão humana/compare do import. Ver o guia atualizado `docs/IMPORTAR_ZIP.md`. Jamais enviar diretamente para `main` sem autorização.

## #2 — Contrato de autoria e persistência entre áreas

| Origem | Tipos | Manifesto em `userData` | Autoridade |
|---|---|---|---|
| Modelos DEV — folha **original desmontada** | `FabricatorProject`, `ModelPart` | `fabricator/models/slot-{n}/project.json` e PNGs de partes | PNGs e geometria original: Fabricador |
| Poses DEV — modelo montado e **snapshot da pose** | `FabricatorPose` | `fabricator/poses/model-{n}/slot-{pose}/pose.json` + `parts/*.png` | Fabricador/Poses DEV; Customizador apenas referencia |
| Roupas DEV — encaixe sobre original desmontado | `WardrobeSet`, `WardrobeComponent` | `fabricator/wardrobe/model-{n}/set-{id}/wardrobe.json` + `parts/*.png` | Geometria/PNG do conjunto: Fabricador |
| Cabelos DEV | `HairWorkspace`, `HairStyle` | `fabricator/hair/model-{n}/hair.json` ou `styles/style-{id}/hair-style.json`, `images/*.png` | Catálogo do Fabricador |
| Olhos e Rosto DEV | `FaceSet`, `FaceCatalogItem`, `FaceComponentAsset` | `fabricator/faces/model-{n}/set-{id}/face.json`, `catalog/item-{id}/*`, `fabricator/face-components/model-{n}/item-{id}/*` | Catálogos do Fabricador |
| Expressões DEV | `FaceExpressionPreset` | `fabricator/expression-presets/model-{n}/preset-{id}.json` | Presets de atuação: Fabricador, sem substituir assets de personagens |
| Customizador | `CustomizerCharacter`, `CharacterCustomization` | `customizer/characters/characters.json` | Posição de roupa por personagem, escala, cor, rosto-base, cabelo e escolhas de pose; **não salva PNGs de origem** |
| Studio Principal | `StudioDocument`, `StudioElement` | `studios/Studio Principal/studio-{uuid}/studio.json` + assets de cena | Overrides do ator e composição da cena; não modifica Customizador |

**Regras:** 
1. O **Roupas DEV** edita o modelo original desmontado; **Poses DEV** usa o modelo montado; o **Customizador usa a primeira pose disponível por padrão**, mas preserva referências distintas. Mudanças na fonte não reescrevem instantâneos já salvos.
2. `selectCharacterArtwork` e `isPoseSnapshotForModel` rejeitam poses incompatíveis. `auditCharacterContinuity` detecta anexos órfãos mas nunca apaga recursos.
3. Cor/offsets/expressão-base do personagem pertencem ao Customizador. A atuação e os overrides específicos pertencem à cena Studio; não regravar a biblioteca.
4. Mantemos `schemaVersion:1`, aliases legados e chaves opcionais: qualquer conversão compatível acontece em memória. Não existe migração destrutiva em tempo de leitura.
5. `CustomizerCharacterRepository` grava o manifesto mediante arquivo `.tmp` e `.backup`; `documentPersistence.ts`, `catalogPersistence.ts` e jornais específicos cuidam de seus respectivos domínios. Nenhuma promessa de transação distribuída global entre arquivos e SQLite.
6. `catalogListings.ts` expõe o cabelo legado como **entrada virtual** sem copiar imagens nem escrever na consulta. O primeiro salvamento no catálogo registra `hair-legacy-catalog-state-v1=active`; excluir o legado registra `dismissed`, estado que não é desfeito por salvamentos posteriores. Isso oculta o fallback duplicado sem alterar `hair.json` ou os PNGs. O marcador histórico `hair-style-migration-v1` continua sendo respeitado para compatibilidade.

**Provas de contrato:** `tests/character-contract-acceptance.test.mjs` abre biblioteca antiga e atual, altera apenas personagem, salva/reabre com `CustomizerCharacterRepository` e compara hashes dos manifestos/PNGs do Fabricador, pose, roupa, cabelo e rosto; `tests/fabricator-customizer-studio-continuity.test.mjs`, `tests/fabricator-source-pose-studio-e2e.test.mjs`, `tests/model-source-process-crash.test.mjs` cobrem snapshots, restart e falhas. O workflow Windows Electron cria/reabre personagem e Studio com perfil isolado. **Os testes de continuidade não provam que assets pessoais anteriores já estejam íntegros.**

## #3 — Isolamento de domínios, IPC e persistência

- `scripts/architecture/check-boundaries.cjs`: auditoria AST, baseline de imports runtime cruzados de features, e bloqueio de renderer→Electron, shared→infraestrutura, backend→UI. A meta é manter **zero** imports de runtime cruzando features sem relaxar o gate.
- `modelCatalog.ts`, `modelIpc.ts`, `modelWriter.ts`: catálogo e publicação do modelo.
- `posePersistence.ts`, `poseIpc.ts`, `animatorPersistence.ts`: pose/animador por contrato de dependência.
- `wardrobeCatalog.ts`, `wardrobeCatalogIpc.ts`: listagem isolada com diagnóstico por conjunto.
- `catalogListings.ts`: listagem de rostos e cabelos fora do `electron/main.ts`, por filesystem injetado; o legado pode ser virtual ou já estar fisicamente migrado, mas deixa de ser listado ao ativar o catálogo ou excluí-lo. Referências diretas continuam carregando enquanto o legado não for excluído.
- `catalogPersistence.ts` + `catalogImageTransaction.ts`, `modelSourceJournal.ts`, `studioAssetTransaction.ts`, `expressionBatchTransaction.ts`: backups, validação e recuperação; dados de origem não são apagados em falhas sem provas.
- `CustomizerCharacterRepository`: gravação e compatibilidade de biblioteca por personagem.
- Os handlers `fabricator:face:list`, `fabricator:listHairStyles` (via canal tipado original), poses, roupas e catálogos não foram renomeados. O `main.ts` só delega as listagens. O restante da persistência de domínios já extraída mantém compatibilidade JSON/SQLite/IPC.

**Regressões adicionadas:** `tests/fabricator-catalog-listings.test.mjs` prova que consultar cabelo legado não escreve nem migra o diretório, preserva marcador de migração existente, suporta cabelo convertido explicitamente e bloqueia recuperação de journal inválido; `tests/character-contract-acceptance.test.mjs` prova isolamento entre personagem e catálogos de origem.

## Aceite

Rodar **no mesmo commit**: `npm run audit:gv5-import`, `npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck`, `npm run build`, e workflow **Electron GUI Windows**. CI não substitui aprovação estética no Windows instalado com as próprias bibliotecas.

É aceitável fechar #2 e #3 como **implementadas na branch/PR**, mantendo o PR em draft e sem merge. A issue #1 exige o ZIP original e auditoria humana de licença/publicação para fechamento completo: **não declarar esses dois requisitos cumpridos sem evidência**.
