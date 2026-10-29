# ADR-002 — Fluxo do personagem e propriedade dos dados

**Data:** 2026-10-22  
**Estado:** adotada incrementalmente; sem mudança de formato em disco.

## O modelo mental correto do produto

```text
Fabricador DEV (catálogo-fonte)
  ├─ modelos e peças (modelSlot 1..10)
  ├─ poses (poseSlot 1..12 por modelo)
  ├─ roupas/conjuntos e bindings de ossos
  ├─ cabelos e peças
  ├─ rosto: componentes, folhas, catálogos, expressões
  └─ animações e presets
               │ referência a IDs/slots, sem editar o catálogo
               ▼
Customizador (instâncias por personagem)
  ├─ personagem com ID estável
  ├─ seleção de modelo e pose
  ├─ ajustes individuais: corpo, cabelo, rosto, roupas, cores
  └─ arquivo characters.json, fila de gravações e backup
               │ referência a characterId + renderização/snapshot
               ▼
Studio Principal (cenas/composição)
  ├─ personagens selecionados e seus estados de cena
  ├─ posições, expressões e poses de cena
  └─ documentos Studio; não deve sobrescrever o Fabricador

Video Studio: fora do escopo desta etapa.
```

## Regras de propriedade

1. **Fabricador é a fonte do catálogo**: importar e editar modelo, pose, roupa, cabelo ou rosto modifica somente o respectivo catálogo de desenvolvimento. Qualquer nova API deve preservar as referências `modelSlot`, `setId`, `componentId` e demais IDs já serializados.
2. **Customizador é proprietário das diferenças de cada personagem**: seus `partOverrides`, `wardrobeGroups`, cores e aparência são por personagem. Mudanças visuais não alteram automaticamente o Fabricador. O contrato atual permanece `CustomizerCharacter` em `src/shared/customizer.ts`.
3. **Studio é proprietário das diferenças de cada cena**: um elemento `kind: 'character'` guarda `characterId`, transformação/posição, estado de expressão e outros overrides de cena. O Studio não é autor do catálogo nem da customização global.
4. **Referências e snapshots devem conviver**: a origem pode ser atualizada depois de um personagem/cena ter sido salvo. A estratégia de revalidação de referências precisa ser definida e testada antes de migrar qualquer formato. Não fazer cascatas de exclusão automáticas entre módulos.
5. **O armazenamento permanece local**: Electron Main é o backend local; um servidor separado não é pré-requisito. APIs de arquivos/SQLite não pertencem às páginas React.

## Decisões aplicadas nesta rodada

- `electron/domains/customizer/validation.ts`: regras do formato persistido e compatibilidade legada, sem filesystem.
- `electron/domains/customizer/compatibility.ts`: normalização **em leitura**, sem gravar o catálogo do Fabricador ou reescrever o arquivo automaticamente.
- `electron/domains/customizer/repository.ts`: leitura e gravação de `customizer/characters/characters.json`; publicação com `.tmp`/`.backup` preservada.
- `electron/domains/customizer/service.ts`: casos de uso, fila única de gravação e fonte de tempo/ID injetáveis.
- `electron/domains/customizer/ipc.ts`: quatro canais existentes, verificação de origem em todos.
- `electron/domains/fabricator/modelCatalog.ts` e `modelIpc.ts`: leitura isolada de modelos e dois canais públicos existentes.
- `src/shared/modelRig.ts` e `wardrobePose.ts`: regras de geometria/roupa comuns a Fabricador e Customizador; reexports legados mantidos temporariamente.
- `src/renderer/src/ui/hooks/usePreviewBackground.ts` e `ui/image/eyeInteriorMask.ts`: utilidades de interface fora da tela do Fabricador, sem alterar seus algoritmos.
- `src/renderer/src/ui/components/DesignBanner.tsx`: componente compartilhado por Fabricador e Customizador; não depende de uma página do Fabricador.
- `src/renderer/src/characters/characterRenderer.ts`: renderizador compartilhado consumido por Customizador, Studio e previews; Studio o carrega dinamicamente nos fluxos que precisam renderizar personagens.
- `src/renderer/src/characters/sceneFaceActions.ts`, `sceneFaceMode.ts`, `sceneFaceSelection.ts` e `SceneFaceCatalogPanel.tsx`: ações, resolução de modo, escolha de folha e controles faciais compartilhados por Studio e Editor V6. Cada área injeta seu carregador/cache e mantém seu caminho de aplicação, renderização, histórico, persistência e assets. Nenhum contrato persistido ou canal IPC mudou.
- `electron/domains/fabricator/wardrobeReferences.ts`: exclusão de conjunto e remoção de peças agora verificam os personagens que as referenciam; as operações são serializadas com gravações do Customizador para evitar corrida. Novas roupas também são validadas antes de salvar o personagem.
- `src/shared/fabricatorPoseReferences.ts` mapeia as referências `modelSlot + poseSlot` guardadas por personagens, elementos do Studio e elementos/blocos da timeline do Editor V6. `electron/domains/fabricator/poseReferences.ts` serializa mudanças nesses vínculos e impede excluir uma pose ainda usada. A verificação inclui snapshots de cenas, falha fechada quando o modelo da referência não pode ser identificado e mantém referências legadas já quebradas editáveis; ao trocar o modelo de um personagem, também valida as poses explícitas das cenas ligadas a ele.
- `src/shared/fabricator.ts` define os limites de slots de modelo e pose usados pelas validações compartilhadas e do processo Electron, evitando que o inventário de referências e o Customizador aceitem limites diferentes.
- Studio e Editor V6 verificam somente os vínculos novos antes de salvar, e suas gravações/remoções compartilham a coordenação da exclusão de poses. A leitura leve dos documentos para inventário não carrega os PNGs. Depois de uma exclusão confirmada, Poses DEV emite `fabricator:assets-updated` para atualizar as prévias dessas áreas.
- Referências órfãs de versões anteriores são preservadas, não apagadas automaticamente. O Customizador mostra um aviso local com ação explícita para desvinculá-las; não transforma a condição em erro global repetitivo. A origem precisa ser restaurada para voltar a renderizar a peça.

## Fronteiras atuais

```text
features/fabricator ──> src/shared + capacidades compartilhadas de ui/characters
features/customizer ──> src/shared + ui/components + characters/characterRenderer
features/studio ──────> contratos compartilhados + characters/characterRenderer
```

O Customizador e o Studio não importam páginas do Fabricador ou do Customizador para reutilizar lógica. `DesignBanner` pertence a `ui/components`, e o renderer de personagens pertence a `characters`. A varredura AST de 2026-10-28 encontrou zero imports runtime entre diretórios `features/*` e zero imports relativos não resolvidos. Imports dinâmicos do Studio apontam diretamente para `characters/characterRenderer.ts`.

## Proteção contra regressões

- A baseline AST de imports runtime entre funcionalidades está em **zero**; `scripts/architecture/check-boundaries.cjs` reprova novas ligações entre features.
- Testes de Customizador exercitam migração em memória, seed original, CRUD, concorrência, recuperação de backup, rollback em falha e autenticação IPC.
- `tests/expression-portable-gaze.test.mjs`, `tests/editor-v6/editorV6FaceSelection.test.ts` e `tests/editor-v6/SceneFaceCatalogPanel.test.ts` cobrem as ações, mapeamento de folha, compatibilidade de modo e variantes faciais comuns com dados sintéticos.
- Testes do catálogo do Fabricador exercitam slots, reidratação de assets, caminhos inseguros e autenticação IPC.
- `scripts/audit-wardrobe-flow.mjs` cobre encaixes de roupas, vínculo de ossos e ajustes isolados por personagem.
- Os fontes de Video Studio e exportação **não foram alterados**. Nenhum esquema/migração de banco foi alterado.

## Próximas extrações recomendadas

1. Separar persistência de **roupas e rostos do Fabricador**, mantendo o formato e o backup existentes; testar referências usadas por Customizador.
2. Validar paridade visual do `characterRenderer` compartilhado entre Customizador e Studio com fixtures reproduzíveis antes de alterar sua composição.
3. Modularizar **persistência do Studio Principal**, independente dos handlers compartilhados do Video Studio.
